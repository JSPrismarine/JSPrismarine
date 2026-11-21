/**
 * One running server: its process, its console and its log.
 *
 * All three servers read console commands from standard input and print to standard output, so
 * the harness drives them the same way: it waits for a line saying the server listens, types
 * commands such as `tp` and `stop`, and stops the process group if `stop` is not enough.
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';

import type { ChildProcess } from 'node:child_process';

/** How to start one server: the executable, its arguments, where and with what, and when it is ready. */
export interface LaunchSpec {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly env?: Readonly<Record<string, string>>;
    /** A line the server prints once it accepts players. */
    readonly ready: RegExp;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A started server. It owns the child process, the process group the child leads, the log file
 * its output goes to, and the tail of that output that {@link ServerProcess.waitReady} searches.
 *
 * Starting never throws here: an executable that cannot start shows up as an exit with the spawn
 * error as its code, which {@link ServerProcess.waitReady} reports.
 */
export class ServerProcess {
    private readonly spec: LaunchSpec;
    private readonly child: ChildProcess;
    private output = '';
    private exited: { code: number | string } | undefined;
    public readonly startedAt = performance.now();

    public constructor(spec: LaunchSpec, logFile: string) {
        this.spec = spec;
        const log = createWriteStream(logFile);
        // A log that fails to write must not end the benchmark; the run's own result still records it.
        log.on('error', () => {});
        // A process group of its own, so a stop that has to kill reaches the server's children too.
        this.child = spawn(spec.command, [...spec.args], {
            cwd: spec.cwd,
            env: { ...process.env, ...spec.env },
            detached: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const append = (chunk: Buffer) => {
            log.write(chunk);
            // Only the tail is searched; a long run must not hold its whole log in memory.
            this.output = (this.output + chunk.toString('utf8')).slice(-64 * 1024);
        };
        this.child.stdout?.on('data', append);
        this.child.stderr?.on('data', append);
        this.child.once('exit', (code, signal) => {
            this.exited ??= { code: code ?? signal ?? 'unknown' };
        });
        // A spawn that fails, such as a missing or non-executable binary, emits `error` and no `exit`.
        this.child.once('error', (error) => {
            this.exited ??= { code: `could not start: ${error.message}` };
            log.end();
        });
        // `exit` can come before the last output; the log ends once the output streams have closed.
        this.child.once('close', () => log.end());
        this.child.stdin?.on('error', () => {});
    }

    /** The server's process id, which also names its process group. Throws when the process never started. */
    public get pid(): number {
        if (this.child.pid === undefined) throw new Error(`${this.spec.command} did not start`);
        return this.child.pid;
    }

    /** Undefined while the process runs; then its exit code, the signal that ended it, or why it could not start. */
    public get exitCode(): number | string | undefined {
        return this.exited?.code;
    }

    /** Waits for the ready line. Throws when the server exits or the timeout passes first. */
    public async waitReady(timeoutMs: number): Promise<void> {
        const deadline = performance.now() + timeoutMs;
        while (!this.spec.ready.test(this.output)) {
            if (this.exited) throw new Error(`the server exited with ${this.exited.code} before it was ready`);
            if (performance.now() > deadline) throw new Error(`the server was not ready after ${timeoutMs / 1000} s`);
            await sleep(100);
        }
    }

    /** Types one console command. */
    public command(line: string): void {
        this.child.stdin?.write(`${line}\n`);
    }

    /**
     * Types `stop` and waits for the process to exit, then signals the process group: SIGTERM, and
     * SIGKILL once `graceMs` passes again. Nothing the server started outlives this.
     */
    public async stop(graceMs: number): Promise<void> {
        if (this.child.pid === undefined) return;
        if (!this.exited) {
            this.command('stop');
            await this.waitExit(graceMs);
        }
        for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
            if (!this.groupAlive()) return;
            try {
                process.kill(-this.pid, signal);
            } catch {
                return;
            }
            await this.waitGroupGone(signal === 'SIGTERM' ? graceMs : 10_000);
        }
    }

    private async waitExit(timeoutMs: number): Promise<void> {
        const deadline = performance.now() + timeoutMs;
        while (!this.exited && performance.now() < deadline) await sleep(100);
    }

    private groupAlive(): boolean {
        try {
            process.kill(-this.pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    private async waitGroupGone(timeoutMs: number): Promise<void> {
        const deadline = performance.now() + timeoutMs;
        while (this.groupAlive() && performance.now() < deadline) await sleep(100);
    }
}
