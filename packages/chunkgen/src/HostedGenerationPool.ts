/**
 * A generation pool that runs in a child process.
 *
 * The server forks the generation host, lowers its operating system priority and sends it tasks
 * over an IPC channel. See [ADR 0005](../../../docs/adr/0005-generation-host-process.md) for why
 * the pool lives in a process and what that costs.
 *
 * The server keeps a record of every outstanding task. That is what makes the three awkward
 * operations work: a predicate cannot cross the channel, so `cancel` and `promote` run it here
 * and send ids; a host that dies is replaced and sent the outstanding tasks again, which returns
 * the same bytes because a task is a pure function of its inputs; and a host that cannot be
 * started, or keeps dying, hands its tasks to an in-process pool built from the same options.
 */
import type { ChildProcess, StdioOptions } from 'node:child_process';
import { fork, spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import type { GenerationPoolOptions, GenerationPriority, GenerationResult, GenerationTask } from './GenerationPool';
import {
    GenerationCanceledError,
    GenerationPool,
    GenerationPoolClosedError,
    inBunExecutable,
    inCompiledBinary,
    workerExecArgv
} from './GenerationPool';
import type { GenerationStatsSnapshot } from './GenerationStats';
import { GenerationStatsRecorder } from './GenerationStats';
import type { GenerationTransport } from './GenerationTransport';
import type { HostCommand, HostEvent } from './hostProtocol';
import { encodeShared } from './hostProtocol';
import { GENERATION_HOST_ROLE } from './hostRole';

/**
 * Defined by an executable build whose entry hands {@link GENERATION_HOST_ROLE} to
 * `generationHost`. Without it, running the executable again would start the whole program again.
 */
declare const JSP_EMBEDDED_GENERATION_HOST: boolean | undefined;

/** How a {@link HostedGenerationPool} is built. */
export interface HostedGenerationPoolOptions extends GenerationPoolOptions {
    /**
     * The operating system priority to give the host, as `os.setPriority` takes it. Defaults to
     * `os.constants.priority.PRIORITY_LOW`. Failing to set it is not an error: the host runs at
     * the priority it started with.
     */
    readonly hostPriority?: number;
    /** How many times a host that exits is replaced before the pool gives up on hosts. Defaults to 3. */
    readonly maxRestarts?: number;
    /** The module the host runs. Defaults to this package's `generationHost`. */
    readonly hostEntry?: string;
    /** Told when the pool runs its tasks in process instead, and why. */
    readonly onFallback?: (reason: string) => void;
}

/** A task the server has sent and not yet heard back about. */
interface Outstanding {
    readonly id: number;
    readonly task: GenerationTask;
    priority: GenerationPriority;
    /** The host process this task was last sent to, so a replacement is sent it once and not twice. */
    sentTo?: ChildProcess;
    readonly startedAt: number;
    readonly resolve: (result: GenerationResult) => void;
    readonly reject: (error: Error) => void;
}

/** This package's host entry, beside this file. */
export const defaultGenerationHost = (): string => {
    const beside = import.meta.url.endsWith('.ts') ? './generationHost.ts' : './generationHost.js';
    return fileURLToPath(new URL(beside, import.meta.url));
};

/**
 * The command that starts the generation host from a Bun-compiled executable.
 *
 * The executable is the program, so the host is the executable run again with
 * {@link GENERATION_HOST_ROLE}. Its entry has to hand that role to `generationHost`.
 */
export const compiledHostCommand = (): { readonly command: string; readonly args: readonly string[] } => ({
    command: process.execPath,
    args: ['--role', GENERATION_HOST_ROLE]
});

/** Runs generation tasks in a child process, with the in-process pool as its fallback. */
export class HostedGenerationPool implements GenerationTransport {
    private child: ChildProcess | undefined;
    private ready: Promise<void> | undefined;
    private readonly outstanding = new Map<number, Outstanding>();
    private readonly stats = new GenerationStatsRecorder();
    private nextId = 0;
    private restarts = 0;
    private closed = false;
    private fallback: GenerationPool | undefined;
    private lowered = false;
    /** The last background limit, sent again to a replacement host. */
    private limit: number | undefined;

    /**
     * Why a host cannot be started here, or undefined when one can.
     *
     * A Bun-compiled executable starts the host by running itself again, so it needs no file,
     * only an entry that answers the host role. Node's single executable cannot yet, and the host
     * entry has to be on disk for anything else.
     */
    public static unavailable(options: GenerationPoolOptions): string | undefined {
        if (inBunExecutable()) {
            if (typeof JSP_EMBEDDED_GENERATION_HOST === 'undefined' || !JSP_EMBEDDED_GENERATION_HOST) {
                return 'this executable was compiled without a generation host role';
            }
        } else if (inCompiledBinary()) {
            return 'a single executable cannot start the generation host role yet';
        }

        return GenerationPool.unavailable(options);
    }

    public constructor(public readonly options: HostedGenerationPoolOptions) {}

    /** The host's process id, or undefined before it starts and while running in process. */
    public get hostPid(): number | undefined {
        return this.fallback === undefined ? this.child?.pid : undefined;
    }

    /** Whether lowering the host's priority succeeded. */
    public get priorityLowered(): boolean {
        return this.lowered;
    }

    /** Whether tasks run in this process because no host could be kept alive. */
    public get usingFallback(): boolean {
        return this.fallback !== undefined;
    }

    public get workers(): number {
        return this.fallback?.workers ?? (this.child === undefined ? 0 : this.options.workers);
    }

    public get inFlight(): number {
        return this.fallback?.inFlight ?? Math.min(this.outstanding.size, this.capacity());
    }

    public get queued(): number {
        return this.fallback?.queued ?? Math.max(0, this.outstanding.size - this.capacity());
    }

    /** Runs one task in the host, or in process after a fallback. */
    public run(task: GenerationTask, priority: GenerationPriority = 'immediate'): Promise<GenerationResult> {
        if (this.closed) return Promise.reject(new GenerationPoolClosedError(task.chunkX, task.chunkZ));
        if (this.fallback !== undefined) return this.fallback.run(task, priority);

        return new Promise<GenerationResult>((resolve, reject) => {
            const entry: Outstanding = {
                id: this.nextId++,
                task,
                priority,
                startedAt: performance.now(),
                resolve,
                reject
            };
            this.outstanding.set(entry.id, entry);
            this.start().then(
                () => this.send(entry),
                () => {
                    // `start` has already fallen back and re-sent what was outstanding.
                }
            );
        });
    }

    /** Asks the host to drop the waiting tasks a predicate rejects. */
    public cancel(wanted: (task: GenerationTask) => boolean): number {
        if (this.fallback !== undefined) return this.fallback.cancel(wanted);

        const ids: number[] = [];
        for (const entry of [...this.outstanding.values()]) {
            if (!wanted(entry.task)) ids.push(entry.id);
        }
        if (ids.length === 0) return 0;

        // The host drops only what it has not started, so the count is what was asked for and a
        // task a worker already has still answers.
        this.post({ type: 'cancel', ids });

        return ids.length;
    }

    /** Moves waiting tasks up into a band, here and at the host. */
    public promote(wanted: (task: GenerationTask) => boolean, to: GenerationPriority): number {
        if (this.fallback !== undefined) return this.fallback.promote(wanted, to);

        const order = ['immediate', 'soon', 'idle'] as const;
        const ids: number[] = [];
        for (const entry of this.outstanding.values()) {
            if (order.indexOf(entry.priority) <= order.indexOf(to) || !wanted(entry.task)) continue;
            entry.priority = to;
            ids.push(entry.id);
        }
        if (ids.length > 0) this.post({ type: 'promote', ids, to });

        return ids.length;
    }

    /** What this side recorded: round-trip turnaround and the worker times the host reported. */
    public statsSnapshot(): GenerationStatsSnapshot {
        return this.fallback?.statsSnapshot() ?? this.stats.snapshot();
    }

    /** Forgets the recorded stats. */
    public resetStats(): void {
        this.stats.reset();
        this.fallback?.resetStats();
    }

    /** Limits how many background tasks the host's workers run at once. */
    public setBackgroundLimit(limit: number | undefined): void {
        this.limit = limit;
        if (this.fallback !== undefined) this.fallback.setBackgroundLimit(limit);
        else this.post({ type: 'limit', limit });
    }

    /** Stops the host, refusing everything outstanding, and waits for it to exit. */
    public async destroy(): Promise<void> {
        if (this.closed) return;
        this.closed = true;

        for (const entry of this.outstanding.values()) {
            entry.reject(new GenerationPoolClosedError(entry.task.chunkX, entry.task.chunkZ));
        }
        this.outstanding.clear();
        await this.fallback?.destroy();

        const child = this.child;
        this.child = undefined;
        if (child === undefined || child.exitCode !== null) return;

        await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
                child.kill('SIGKILL');
            }, 2000);
            child.once('exit', () => {
                clearTimeout(timer);
                resolve();
            });
            if (child.connected) child.send({ type: 'destroy' } satisfies HostCommand);
            else child.kill('SIGKILL');
        });
    }

    private capacity(): number {
        return Math.max(1, Math.trunc(this.options.inFlight ?? this.options.workers + 1));
    }

    /** Sends a task to the current host unless it already has it. */
    private send(entry: Outstanding): void {
        const child = this.child;
        if (child === undefined || entry.sentTo === child || !this.outstanding.has(entry.id)) return;

        entry.sentTo = child;
        this.post({ type: 'run', id: entry.id, task: entry.task, priority: entry.priority });
    }

    private post(command: HostCommand): void {
        const child = this.child;
        if (child === undefined || !child.connected) return;
        try {
            child.send(command);
        } catch {
            // The channel is closing; the exit handler restarts or falls back and re-sends.
        }
    }

    /** Starts the host once, and again after it exits. */
    private start(): Promise<void> {
        if (this.ready !== undefined) return this.ready;

        this.ready = new Promise<void>((resolve, reject) => {
            let child: ChildProcess;
            try {
                const stdio: StdioOptions = ['ignore', 'inherit', 'inherit', 'ipc'];
                if (inBunExecutable() && this.options.hostEntry === undefined) {
                    const { command, args } = compiledHostCommand();
                    child = spawn(command, [...args], { serialization: 'advanced', stdio });
                } else {
                    const entry = this.options.hostEntry ?? defaultGenerationHost();
                    const execArgv = workerExecArgv({ pipeline: this.options.pipeline, worker: entry });
                    child = fork(entry, [], {
                        serialization: 'advanced',
                        stdio,
                        ...(execArgv === undefined ? {} : { execArgv })
                    });
                }
            } catch (error) {
                this.giveUp(`the generation host could not be started: ${String(error)}`);
                reject(error instanceof Error ? error : new Error(String(error)));
                return;
            }

            this.child = child;
            this.lowerPriority(child);
            let settled = false;
            child.on('message', (event: HostEvent) => {
                if (event.type === 'ready') {
                    settled = true;
                    if (this.limit !== undefined) this.post({ type: 'limit', limit: this.limit });
                    resolve();
                } else this.settle(event);
            });
            child.once('error', (error) => {
                if (settled) return;
                settled = true;
                this.giveUp(`the generation host could not be started: ${error.message}`);
                reject(error);
            });
            child.once('exit', (code, signal) => {
                if (this.closed || this.child !== child) return;
                this.child = undefined;
                this.ready = undefined;
                if (!settled) {
                    settled = true;
                    this.giveUp(`the generation host exited during startup (code ${code}, signal ${signal})`);
                    reject(new Error('The generation host exited during startup'));
                    return;
                }
                this.restartAfterExit(`code ${code}, signal ${signal}`);
            });

            const { pipeline, worker, workers, inFlight, setup } = this.options;
            this.post({
                type: 'init',
                options: {
                    pipeline,
                    workers,
                    ...(worker === undefined ? {} : { worker }),
                    ...(inFlight === undefined ? {} : { inFlight }),
                    ...(setup === undefined ? {} : { setup: encodeShared(setup) })
                }
            });
        });

        return this.ready;
    }

    private lowerPriority(child: ChildProcess): void {
        if (child.pid === undefined) return;
        try {
            os.setPriority(child.pid, this.options.hostPriority ?? os.constants.priority.PRIORITY_LOW);
            this.lowered = true;
        } catch {
            this.lowered = false;
        }
    }

    private settle(event: Extract<HostEvent, { type: 'result' }>): void {
        const entry = this.outstanding.get(event.id);
        if (entry === undefined) return;
        this.outstanding.delete(event.id);
        // A host that answers is a healthy one; the restart budget is for hosts that keep dying.
        this.restarts = 0;
        const turnaroundMs = performance.now() - entry.startedAt;

        if (event.ok) {
            this.stats.record({
                status: entry.task.status,
                priority: entry.priority,
                failed: false,
                // The host's own backlog is inside the turnaround; the host does not report it.
                backlogWaitMs: 0,
                turnaroundMs,
                ...(event.result.workerStats === undefined
                    ? {}
                    : {
                          workerWallMs: event.result.workerStats.wallUs / 1000,
                          workerCpuMs: event.result.workerStats.cpuUs / 1000
                      })
            });
            entry.resolve(event.result);
            return;
        }

        this.stats.record({
            status: entry.task.status,
            priority: entry.priority,
            failed: true,
            backlogWaitMs: 0,
            turnaroundMs
        });
        // The two refusals the pool owes its callers keep their classes across the channel.
        const error =
            event.error.name === 'GenerationCanceledError'
                ? new GenerationCanceledError(entry.task.chunkX, entry.task.chunkZ)
                : event.error.name === 'GenerationPoolClosedError'
                  ? new GenerationPoolClosedError(entry.task.chunkX, entry.task.chunkZ)
                  : new Error(event.error.message);
        error.name = event.error.name;
        if (event.error.stack !== undefined) error.stack = event.error.stack;
        entry.reject(error);
    }

    private restartAfterExit(how: string): void {
        const limit = this.options.maxRestarts ?? 3;
        if (this.restarts >= limit) {
            this.giveUp(`the generation host exited ${this.restarts + 1} times, the last with ${how}`);
            return;
        }

        this.restarts++;
        // Resent in arrival order, so the retried backlog keeps the order it had.
        void this.start().then(
            () => {
                for (const entry of this.outstanding.values()) this.send(entry);
            },
            () => {}
        );
    }

    /** Runs everything outstanding, and everything after it, in this process. */
    private giveUp(reason: string): void {
        if (this.fallback !== undefined || this.closed) return;

        this.options.onFallback?.(reason);
        const {
            hostPriority: _hostPriority,
            maxRestarts: _maxRestarts,
            hostEntry: _hostEntry,
            onFallback: _onFallback,
            ...pool
        } = this.options;
        const fallback = new GenerationPool(pool);
        fallback.setBackgroundLimit(this.limit);
        this.fallback = fallback;
        for (const entry of [...this.outstanding.values()]) {
            this.outstanding.delete(entry.id);
            fallback.run(entry.task, entry.priority).then(entry.resolve, entry.reject);
        }
    }
}
