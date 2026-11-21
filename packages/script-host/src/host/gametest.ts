/**
 * The GameTest runner of one world: the tests packs register with `@minecraft/server-gametest`,
 * the `/gametest` commands that run them, and each test's life from its start to its cleanup.
 *
 * The order is the pinned Bedrock Dedicated Server's, as the `gametest` scenario of the
 * `scripting.gametest` parity family recorded it:
 *
 * - `/gametest run` and `runset` queue batches: the tests that name a batch first, a batch per
 *   name, then every other test in one batch. A batch starts in the next script flush, and the
 *   next batch starts {@link BATCH_GAP_TICKS} ticks after the last test of the one before ends.
 * - Starting a batch places each test's structure and calls each test function, in the order the
 *   tests were registered. A test whose structure file is missing fails without running.
 * - In each later flush, before any system task, each running test's due `runAfterDelay` callbacks
 *   and `idle` promises run, then its `succeedWhen` callbacks: the first that returns without
 *   throwing passes the test.
 * - `succeed` and `fail` end a test at once, and a test still running `maxTicks` ticks after it
 *   started fails then. Nothing of an ended test runs again.
 * - An ended test is cleaned up at the start of the next flush: its simulated players leave and
 *   its `Test` object stops working. A test that times out is cleaned up as it fails.
 */
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type { ScriptLog } from './WorldScripts';
import type { ScriptVector3, ScriptWorld } from './world';

/** The module the runner's classes belong to. */
export const GAMETEST = '@minecraft/server-gametest';

/** The ticks BDS leaves between the end of one batch and the start of the next. */
export const BATCH_GAP_TICKS = 4;

/** The ticks a test may run before it fails, when its registration names none. */
export const DEFAULT_MAX_TICKS = 100;

/** The tag `/gametest runset` runs when it names none. */
export const DEFAULT_TAG = 'suite:default';

/** Where a test's structure goes: a location, and the dimension when the registration names one. */
export interface StructurePlacement {
    readonly location: ScriptVector3;
    readonly dimension?: string;
}

/** What a `RegistrationBuilder` sets on a test. */
export interface GameTestOptions {
    /** The structure, as `<namespace>:<name>`, which is the file `structures/<namespace>/<name>.mcstructure`. */
    structureName: string;
    structureLocation?: StructurePlacement;
    maxTicks: number;
    /** Ticks between placing the structure and calling the test function. */
    setupTicks: number;
    tags: string[];
    batch?: string;
    required: boolean;
}

/** One registered test. */
export interface GameTestRegistration<Owner> {
    readonly owner: Owner;
    /** `<testClassName>:<testName>`, which `/gametest run` takes. */
    readonly name: string;
    readonly fn: ScriptHandle;
    /** Whether the function returns a promise whose rejection fails the test, as `registerAsync` registers. */
    readonly async: boolean;
    readonly options: GameTestOptions;
}

/** Where a running test is: waiting for its batch, running, ended, or cleaned up. */
export type GameTestState = 'waiting' | 'running' | 'done' | 'cleaned';

/** Something due on a later tick of a running test. */
export type Timer =
    | { readonly due: number; readonly kind: 'callback'; readonly callback: ScriptHandle }
    | { readonly due: number; readonly kind: 'idle'; readonly resolve: ScriptHandle };

/** One run of a test. */
export interface GameTestRun<Owner> {
    readonly id: number;
    readonly registration: GameTestRegistration<Owner>;
    readonly dimension: string;
    /** The structure's lowest corner, which the test's relative locations count from. */
    readonly origin: ScriptVector3;
    state: GameTestState;
    startTick: number;
    /** The `Test` object the test function got. */
    test?: ScriptHandle;
    timers: Timer[];
    conditions: ScriptHandle[];
    /** The simulated players the test spawned and has not removed. */
    players: string[];
}

/** What calling a pack's callback did. */
export type GameTestCall =
    { readonly ok: true; readonly value: ScriptValue } | { readonly ok: false; readonly message: string };

/** What the runner reaches of the runtime that owns it. */
export interface GameTestHost<Owner> {
    readonly world: ScriptWorld;
    readonly log: ScriptLog;
    /**
     * Calls a pack's callback with the default privilege, as a system task is called. A value it
     * returns that is a handle belongs to the caller.
     * @returns What it returned, or the text of what it threw, which the runtime has logged
     *   unless it is a `GameTestError`.
     */
    call(owner: Owner, callback: ScriptHandle, args: readonly ScriptValue[]): GameTestCall;
    /** Makes the `Test` object a run's test function gets, in its pack. */
    createTest(owner: Owner, run: number): ScriptHandle;
    /**
     * Calls `rejected` with the text of the error a promise of the pack rejects with, in the
     * flush its promise jobs run in.
     */
    onRejected(owner: Owner, promise: ScriptHandle, rejected: (message: string) => void): void;
    /** A structure file of the owner's pack, or of another pack of the world when it has none. */
    structure(owner: Owner, path: string): Uint8Array | undefined;
    free(handle: ScriptHandle): void;
}

/** What `/gametest` answers: a line of feedback or an error. */
export interface GameTestReply {
    readonly ok: boolean;
    readonly message: string;
}

/** The file of a structure name, as BDS looks it up in a behavior pack. */
export const structurePath = (structureName: string): string =>
    `structures/${structureName.split(':').join('/')}.mcstructure`;

/** The runner of one world's GameTests. */
export class GameTests<Owner> {
    private readonly host: GameTestHost<Owner>;
    private readonly registrations: GameTestRegistration<Owner>[] = [];
    private readonly runs = new Map<number, GameTestRun<Owner>>();
    /** The batches still to start, each a list of runs. */
    private readonly batches: GameTestRun<Owner>[][] = [];
    /** The batch that started last, until all of its runs have ended. */
    private current: GameTestRun<Owner>[] = [];
    /** The first tick the next batch may start on. */
    private nextBatchAt = 0;
    private nextRun = 1;
    private tick = 0;

    public constructor(host: GameTestHost<Owner>) {
        this.host = host;
    }

    /** The tick of the runner's last step, which a test's delays count from. */
    public get currentTick(): number {
        return this.tick;
    }

    /**
     * Registers a test, as `register` and `registerAsync` do. A test registered twice under one
     * name replaces the first.
     * @returns The registration, which its `RegistrationBuilder` changes.
     */
    public register(owner: Owner, className: string, testName: string, fn: ScriptHandle, async: boolean): number {
        const name = `${className}:${testName}`;
        const index = this.registrations.length;
        this.registrations.push({
            owner,
            name,
            fn,
            async,
            options: { structureName: name, maxTicks: DEFAULT_MAX_TICKS, setupTicks: 0, tags: [], required: true }
        });
        return index;
    }

    /** The options of a registration, which its `RegistrationBuilder` sets. */
    public options(registration: number): GameTestOptions | undefined {
        return this.registrations[registration]?.options;
    }

    /** A run, by the id its `Test` object carries. */
    public run(id: number): GameTestRun<Owner> | undefined {
        return this.runs.get(id);
    }

    /** The run that spawned a simulated player, whose structure its test-relative locations count from. */
    public runOfPlayer(player: string): GameTestRun<Owner> | undefined {
        for (const run of this.runs.values()) if (run.players.includes(player)) return run;
        return undefined;
    }

    /** `/gametest run <name>`: queues one test in a batch of its own. */
    public runTest(name: string): GameTestReply {
        const registration = this.latest().find((each) => each.name === name);
        if (registration === undefined) return { ok: false, message: `Couldn't find test '${name}'` };
        this.queue([registration]);
        return { ok: true, message: `Running test '${name}'` };
    }

    /**
     * `/gametest runset [tag]`: queues every test that has the tag, or whose class is named by
     * it, as BDS's `runset jsp` ran every test of class `jsp`.
     */
    public runSet(tag = DEFAULT_TAG): GameTestReply {
        const matched = this.latest().filter(
            (each) => each.options.tags.includes(tag) || each.name.slice(0, each.name.indexOf(':')) === tag
        );
        if (matched.length === 0) return { ok: false, message: `No tests found for tag '${tag}'` };
        this.queue(matched);
        return { ok: true, message: `Running ${matched.length} tests for tag '${tag}'` };
    }

    /** `/gametest stopall` and `clearall`: ends every test that has not ended, and drops the queued ones. */
    public stopAll(): GameTestReply {
        const stopped = [...this.runs.values()].filter((run) => run.state === 'waiting' || run.state === 'running');
        for (const batch of this.batches.splice(0)) for (const run of batch) this.runs.delete(run.id);
        for (const run of stopped) if (run.state === 'running') this.cleanUp(run);
        this.current = [];
        return { ok: true, message: `Stopped ${stopped.length} tests` };
    }

    /**
     * One step of the runner, at the start of a script flush: cleans up the tests that ended
     * before it, fails the ones out of ticks, runs what is due, and starts the next batch.
     * @param tick - `system.currentTick` of the flush.
     */
    public step(tick: number): void {
        this.tick = tick;
        for (const run of this.runs.values()) {
            if (run.state === 'done') this.cleanUp(run);
        }
        for (const run of [...this.runs.values()]) {
            if (run.state !== 'running') continue;
            if (tick - run.startTick >= run.registration.options.maxTicks) {
                this.end(run, `Didn't succeed or fail within ${run.registration.options.maxTicks} ticks`);
                this.cleanUp(run);
                continue;
            }
            this.runDue(run);
        }
        if (this.current.length > 0 && this.current.every((run) => run.state === 'done' || run.state === 'cleaned')) {
            this.current = [];
        }
        const next = this.batches[0];
        if (this.current.length === 0 && next !== undefined && tick >= this.nextBatchAt) {
            this.batches.shift();
            this.startBatch(next);
        }
    }

    /** Ends a test as passed. */
    public succeed(run: GameTestRun<Owner>): void {
        this.end(run, undefined);
    }

    /** Ends a test as failed, with the reason the log gives. */
    public fail(run: GameTestRun<Owner>, message: string): void {
        this.end(run, message);
    }

    /** Runs a callback once a number of ticks of the test have passed. */
    public runAfterDelay(run: GameTestRun<Owner>, delay: number, callback: ScriptHandle): void {
        run.timers.push({ due: this.tick + Math.max(0, Math.trunc(delay)), kind: 'callback', callback });
    }

    /** Resolves a promise once a number of ticks of the test have passed. */
    public idle(run: GameTestRun<Owner>, delay: number, resolve: ScriptHandle): void {
        run.timers.push({ due: this.tick + Math.max(0, Math.trunc(delay)), kind: 'idle', resolve });
    }

    /**
     * Checks a condition now and once each tick after: the first time it returns without
     * throwing, the test passes.
     */
    public succeedWhen(run: GameTestRun<Owner>, condition: ScriptHandle): void {
        run.conditions.push(condition);
        this.check(run, condition);
    }

    /** Frees every handle a pack gave the runner, for a reload or a shutdown. */
    public clear(): void {
        for (const run of this.runs.values()) this.release(run);
        this.runs.clear();
        this.batches.length = 0;
        this.current = [];
        for (const registration of this.registrations.splice(0)) this.host.free(registration.fn);
    }

    /** The registrations a name finds, the last one registered under each name winning. */
    private latest(): GameTestRegistration<Owner>[] {
        const byName = new Map<string, GameTestRegistration<Owner>>();
        for (const registration of this.registrations) {
            byName.delete(registration.name);
            byName.set(registration.name, registration);
        }
        return [...byName.values()];
    }

    /** Groups tests into batches: each named batch, in the order of its first test, then the rest. */
    private queue(registrations: readonly GameTestRegistration<Owner>[]): void {
        const named = new Map<string, GameTestRegistration<Owner>[]>();
        const rest: GameTestRegistration<Owner>[] = [];
        for (const registration of registrations) {
            const { batch } = registration.options;
            if (batch === undefined) rest.push(registration);
            else named.set(batch, [...(named.get(batch) ?? []), registration]);
        }
        for (const batch of [...named.values(), rest]) {
            if (batch.length === 0) continue;
            this.batches.push(batch.map((registration) => this.prepare(registration)));
        }
    }

    private prepare(registration: GameTestRegistration<Owner>): GameTestRun<Owner> {
        const placement = registration.options.structureLocation;
        const run: GameTestRun<Owner> = {
            id: this.nextRun++,
            registration,
            dimension: placement?.dimension ?? this.host.world.dimensions()[0] ?? 'minecraft:overworld',
            origin: placement?.location ?? this.defaultOrigin(),
            state: 'waiting',
            startTick: 0,
            timers: [],
            conditions: [],
            players: []
        };
        this.runs.set(run.id, run);
        return run;
    }

    /** Where a test with no structure location goes: under the first player, or at the origin. */
    private defaultOrigin(): ScriptVector3 {
        const [first] = this.host.world.players();
        const location = first === undefined ? undefined : this.host.world.entity(first)?.location;
        return location === undefined
            ? { x: 0, y: 0, z: 0 }
            : { x: Math.floor(location.x), y: Math.floor(location.y), z: Math.floor(location.z) };
    }

    private startBatch(batch: GameTestRun<Owner>[]): void {
        this.current = batch;
        const { log, world } = this.host;
        for (const run of batch) {
            const path = structurePath(run.registration.options.structureName);
            const structure = this.host.structure(run.registration.owner, path);
            if (structure === undefined) {
                run.startTick = this.tick;
                run.state = 'running';
                this.end(run, `Failed to spawn test structure with path '${path}' `);
                continue;
            }
            world.placeStructure?.(run.dimension, run.origin, structure);
            log.info(`onTestStructureLoaded: ${run.registration.name}`);
        }
        log.info(`Running test batch (${batch.length} tests)...`);
        for (const run of batch) {
            if (run.state !== 'waiting') continue;
            run.state = 'running';
            run.startTick = this.tick;
            const test = this.host.createTest(run.registration.owner, run.id);
            run.test = test;
            const outcome = this.host.call(run.registration.owner, run.registration.fn, [test]);
            if (!outcome.ok) {
                if (run.state === 'running') this.fail(run, outcome.message);
                continue;
            }
            if (outcome.value instanceof ScriptHandle) {
                if (run.registration.async) {
                    this.host.onRejected(run.registration.owner, outcome.value, (message) => {
                        if (run.state === 'running') this.fail(run, message);
                    });
                }
                this.host.free(outcome.value);
            }
        }
    }

    /** Runs a running test's due timers, then its conditions. */
    private runDue(run: GameTestRun<Owner>): void {
        const due = run.timers.filter((timer) => timer.due <= this.tick);
        run.timers = run.timers.filter((timer) => timer.due > this.tick);
        for (const timer of due) {
            if (run.state !== 'running') {
                this.freeTimer(timer);
                continue;
            }
            const handle = timer.kind === 'callback' ? timer.callback : timer.resolve;
            const outcome = this.host.call(run.registration.owner, handle, []);
            this.freeTimer(timer);
            if (outcome.ok && outcome.value instanceof ScriptHandle) this.host.free(outcome.value);
            if (!outcome.ok && run.state === 'running') this.fail(run, outcome.message);
        }
        for (const condition of [...run.conditions]) {
            if (run.state !== 'running') break;
            this.check(run, condition);
        }
    }

    private check(run: GameTestRun<Owner>, condition: ScriptHandle): void {
        const outcome = this.host.call(run.registration.owner, condition, []);
        if (!outcome.ok) return;
        if (outcome.value instanceof ScriptHandle) this.host.free(outcome.value);
        if (run.state === 'running') this.succeed(run);
    }

    /** Ends a running test, as passed when `failure` is undefined, and logs it as BDS does. */
    private end(run: GameTestRun<Owner>, failure: string | undefined): void {
        if (run.state !== 'running') return;
        run.state = 'done';
        for (const timer of run.timers.splice(0)) this.freeTimer(timer);
        const { name } = run.registration;
        if (failure === undefined) this.host.log.info(`onTestPassed: ${name}`);
        else this.host.log.info(`onTestFailed: ${name} - ${failure}`);
        if (this.current.includes(run) && this.current.every((each) => each.state !== 'running')) {
            this.nextBatchAt = this.tick + BATCH_GAP_TICKS;
        }
    }

    /** Takes an ended test's simulated players out of the world and lets go of its handles. */
    private cleanUp(run: GameTestRun<Owner>): void {
        if (run.state === 'running') run.state = 'done';
        for (const player of run.players.splice(0)) this.host.world.simulatedPlayers?.remove(player);
        this.release(run);
        run.state = 'cleaned';
        this.runs.delete(run.id);
    }

    private release(run: GameTestRun<Owner>): void {
        for (const timer of run.timers.splice(0)) this.freeTimer(timer);
        for (const condition of run.conditions.splice(0)) this.host.free(condition);
        if (run.test !== undefined) this.host.free(run.test);
        run.test = undefined;
    }

    private freeTimer(timer: Timer): void {
        this.host.free(timer.kind === 'callback' ? timer.callback : timer.resolve);
    }
}
