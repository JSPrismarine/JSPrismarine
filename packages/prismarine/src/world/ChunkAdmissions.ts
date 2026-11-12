import { createHash } from 'node:crypto';

import type { GenerationPriority } from '@jsprismarine/chunkgen';

import type { ChunkEntry } from './changelog/ChangeEntry';

/**
 * The most chunk completions one input step admits. A count, so a backlog costs a slow host the
 * same ticks it costs a fast one; whatever is left waits for the next step.
 *
 * It holds every delivery the chunk scheduler can have in flight (twice the chunk workers) on a
 * host with up to 32 workers, so a chunk a player waits for is admitted at the next input step
 * after it is ready, and the lane rotation still gives background chunks a share of each step.
 */
export const CHUNK_ADMISSION_BUDGET_PER_TICK = 64;

/**
 * A chunk entering or leaving one world, in the shape of the change log's chunk entry
 * ([ADR 0012](../../../../docs/adr/0012-the-change-log-is-the-history.md)) plus the world it
 * happens in, so the entry can be appended where the admission is applied.
 */
export type ChunkAdmission = Omit<ChunkEntry, 'kind'> & {
    /** The world the chunk enters or leaves, as {@link chunkAdmissionWorld} names it. */
    readonly world: string;
};

/**
 * Where a completion was admitted. `input` is the input step, the only place the rule allows.
 * `inline` is everywhere else: no tick loop runs, or code inside a tick waits for the chunk and
 * cannot let the tick end without it, which is a path that still breaks the rule.
 */
export type ChunkAdmissionStep = 'input' | 'inline';

/**
 * One admitted chunk completion as the replay trace records it.
 *
 * It names the chunk and carries a digest of its content rather than the content. Generation is
 * deterministic from the seed and a replay starts from the provider snapshot its manifest
 * restores, so a replay produces the same content itself; the digest proves it did.
 */
export interface ChunkAdmissionRecord extends ChunkAdmission {
    /** The position of this admission among all the admissions the queue applied. */
    readonly order: number;
    /** The tick that admitted it. */
    readonly tick: number;
    readonly step: ChunkAdmissionStep;
    /**
     * SHA-256 of the chunk's network serialization as it was admitted, for a chunk that enters,
     * when a recorder or a replay asked for digests. Null for a chunk that leaves, or when nothing
     * asked.
     */
    readonly digest: string | null;
}

/** Receives each admitted completion, in admission order. */
export interface ChunkAdmissionRecorder {
    record(record: ChunkAdmissionRecord): void;
}

/** Work that makes one chunk completion visible to the simulation. */
export interface ChunkCompletion extends ChunkAdmission {
    /** The completion's lane, which decides its turn in the input step. */
    readonly priority: GenerationPriority;
    /** The chunk's network serialization, for the digest of a chunk that enters. */
    readonly content?: () => Uint8Array;
    /**
     * Applies the completion: puts the chunk into the world, lights it, scans its fluids and
     * creates its entities, or takes it out.
     *
     * @returns Whether the chunk entered or left. False when the world has decided otherwise
     *   meanwhile, such as a chunk a player came back for before it could leave.
     */
    readonly apply: () => boolean;
}

/** The part of {@link ChunkAdmissions} a world uses. */
export interface ChunkAdmissionScheduler {
    /** Whether completions wait for an input step. When false, a completion is applied at once. */
    readonly isActive: boolean;

    /**
     * Holds a completion for the next input step, or applies it now.
     *
     * @param completion - The completion.
     * @param now - Apply it now, because code inside the running tick waits for it.
     * @returns Settles once the completion has been applied, with what its `apply` returned.
     */
    hold(completion: ChunkCompletion, now?: boolean): Promise<boolean>;

    /** Applies a held completion now, for code inside the running tick that waits for it. */
    admitNow(admission: ChunkAdmission): boolean;

    /** Moves a held completion to a more urgent lane. */
    promote(admission: ChunkAdmission, priority: GenerationPriority): boolean;
}

/** Counts of what the queue admitted, for an operator or a test. */
export interface ChunkAdmissionSnapshot {
    /** Completions waiting for an input step. */
    readonly pending: number;
    /** Completions applied by an input step. */
    readonly admitted: number;
    /** Completions applied while a tick ran, because code inside it waited for them. */
    readonly admittedInTick: number;
    /** Completions applied while no tick loop ran. */
    readonly admittedIdle: number;
    /** Where a replay could not admit what its trace recorded, in the order found. */
    readonly divergences: readonly string[];
}

/** A replay's trace: the recorded admissions it applies instead of choosing its own. */
export interface ChunkAdmissionReplay {
    /** The captured admissions, in capture order. Only input-step ones are applied from it. */
    readonly records: readonly ChunkAdmissionRecord[];
    /** Added to each record's tick, for a replay that starts at another tick than its capture. */
    readonly tickOffset?: number;
    /** The first replay tick the trace decides. Before it the queue chooses as live play does. */
    readonly fromTick?: number;
}

interface HeldCompletion {
    readonly completion: ChunkCompletion;
    readonly key: string;
    priority: GenerationPriority;
    readonly resolve: (applied: boolean) => void;
    readonly reject: (error: unknown) => void;
}

/**
 * Names a world for {@link ChunkAdmission.world}: its level name and dimension, which are the
 * same in a capture and its replay, unlike the world's identifier.
 */
export const chunkAdmissionWorld = (levelName: string, dimension: string): string => `${levelName}/${dimension}`;

const keyOf = ({ world, change, x, z }: ChunkAdmission): string => `${world}:${change}:${x},${z}`;

/**
 * Chunk completions held for the input step, the second kind of input after packets
 * ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)).
 *
 * A chunk that has been read or generated, or one whose unload has been saved, waits here until an
 * input step applies it, so a tick never sees the loaded set change in its middle. The step admits
 * up to a count, rotating three turns of player-visible work to one each of background and idle
 * work, and records each admission with its tick. A replay installs the trace with
 * {@link replay}, and from then on each step admits exactly the recorded completions of its
 * tick, in recorded order, whatever is ready and whatever the count would allow.
 */
export class ChunkAdmissions implements ChunkAdmissionScheduler {
    // Three of every five turns serve player-visible work, as the completion queue rotates.
    private static readonly lanes: readonly GenerationPriority[] = [
        'immediate',
        'immediate',
        'soon',
        'immediate',
        'idle'
    ];

    private readonly waiting = new Map<GenerationPriority, HeldCompletion[]>([
        ['immediate', []],
        ['soon', []],
        ['idle', []]
    ]);

    private readonly keyed = new Map<string, HeldCompletion>();
    private active = false;
    private laneCursor = 0;
    private nextOrder = 0;
    private admitted = 0;
    private admittedInTick = 0;
    private admittedIdle = 0;
    private recorder: ChunkAdmissionRecorder | undefined;
    private trace:
        | { readonly byTick: ReadonlyMap<number, readonly ChunkAdmissionRecord[]>; readonly fromTick: number }
        | undefined;
    private readonly divergences: string[] = [];

    /**
     * @param tick - The tick the server is running, read for an admission made outside an input
     *   step.
     * @param budget - The most completions one input step admits while no trace decides.
     */
    public constructor(
        private readonly tick: () => number = () => 0,
        private readonly budget: number = CHUNK_ADMISSION_BUDGET_PER_TICK
    ) {}

    public get isActive(): boolean {
        return this.active;
    }

    /** How many completions wait for an input step. */
    public get pending(): number {
        return this.keyed.size;
    }

    /** Starts holding completions for the input step. */
    public activate(): void {
        this.active = true;
    }

    /** Stops holding completions and applies every held one, in lane order, one after another. */
    public deactivate(): void {
        this.active = false;
        for (let held = this.takeNext(); held !== undefined; held = this.takeNext()) {
            this.apply(held, this.tick(), 'inline');
        }
    }

    /** Sends every admission from now on to `recorder`, with a digest of each entering chunk. */
    public setRecorder(recorder: ChunkAdmissionRecorder | undefined): void {
        this.recorder = recorder;
    }

    /**
     * Makes a captured trace decide what each input step admits from `fromTick` on.
     *
     * @param replay - The trace, and where it starts in this run.
     */
    public replay({ records, tickOffset = 0, fromTick = Number.NEGATIVE_INFINITY }: ChunkAdmissionReplay): void {
        const byTick = new Map<number, ChunkAdmissionRecord[]>();
        for (const record of records) {
            const tick = record.tick + tickOffset;
            if (record.step !== 'input' || tick < fromTick) continue;
            const atTick = byTick.get(tick) ?? [];
            atTick.push(record);
            byTick.set(tick, atTick);
        }
        for (const atTick of byTick.values()) atTick.sort((left, right) => left.order - right.order);
        this.trace = { byTick, fromTick };
    }

    /**
     * Holds a completion for the next input step, or applies it now when no tick loop runs or
     * `now` says the running tick waits for it. A second completion for the same chunk and
     * direction replaces the first, which rejects.
     *
     * @param completion - The completion.
     * @param now - Apply it now, because code inside the running tick waits for it.
     * @returns Settles as the completion's `apply` settles, once it has been applied.
     */
    public hold(completion: ChunkCompletion, now = false): Promise<boolean> {
        const key = keyOf(completion);
        if (!this.active || now) {
            return new Promise<boolean>((resolve, reject) => {
                this.apply({ completion, key, priority: completion.priority, resolve, reject }, this.tick(), 'inline');
            });
        }

        return new Promise<boolean>((resolve, reject) => {
            const held: HeldCompletion = { completion, key, priority: completion.priority, resolve, reject };
            const previous = this.keyed.get(key);
            if (previous !== undefined) {
                // A world holds one completion per chunk and direction; a second means the first
                // is stale, and applying it would undo what the second is for.
                this.remove(previous);
                previous.reject(new Error(`A newer completion replaced ${key} before it was admitted`));
            }
            this.waiting.get(held.priority)!.push(held);
            this.keyed.set(key, held);
        });
    }

    /**
     * Applies a held completion now, for code inside the running tick that waits for it. The
     * admission is recorded as `inline` and counted in {@link ChunkAdmissionSnapshot.admittedInTick}.
     *
     * @returns Whether a completion was held for that chunk and direction.
     */
    public admitNow(admission: ChunkAdmission): boolean {
        const held = this.keyed.get(keyOf(admission));
        if (held === undefined) return false;

        this.remove(held);
        this.apply(held, this.tick(), 'inline');
        return true;
    }

    /**
     * Applies every held completion now, for a tick that has stalled with them held: something
     * the tick awaits may wait for one of them, and the next input step cannot come until the
     * tick ends. Each is recorded as `inline` and counted in
     * {@link ChunkAdmissionSnapshot.admittedInTick}.
     *
     * @returns What was held, in the order it was applied.
     */
    public admitParked(): readonly ChunkAdmission[] {
        const parked: ChunkAdmission[] = [];
        for (let held = this.takeNext(); held !== undefined; held = this.takeNext()) {
            const { world, change, x, z } = held.completion;
            parked.push({ world, change, x, z });
            this.apply(held, this.tick(), 'inline');
        }
        return parked;
    }

    /**
     * Moves a held completion to a more urgent lane, such as a background chunk a player now
     * stands in.
     *
     * @returns Whether it moved; false when nothing is held or the lane is not more urgent.
     */
    public promote(admission: ChunkAdmission, priority: GenerationPriority): boolean {
        const held = this.keyed.get(keyOf(admission));
        if (held === undefined) return false;

        const order = ['immediate', 'soon', 'idle'] as const;
        if (order.indexOf(priority) >= order.indexOf(held.priority)) return false;

        const lane = this.waiting.get(held.priority)!;
        lane.splice(lane.indexOf(held), 1);
        held.priority = priority;
        this.waiting.get(priority)!.push(held);
        return true;
    }

    /**
     * The chunk half of the input step: applies the completions this tick admits, one after
     * another, each to its end before the next, in one call.
     *
     * Without a trace, the step takes up to the budget of the completions held when it begins.
     * Under a trace, it takes the recorded completions of `tick` in recorded order, and a recorded
     * one that is not held is reported as a divergence and skipped.
     *
     * @param tick - The tick whose input step this is.
     * @returns How many completions the step applied.
     */
    public admit(tick: number): number {
        const step = this.takeStep(tick);
        for (const [held, expected] of step) this.apply(held, tick, 'input', expected);
        return step.length;
    }

    /** What the queue holds and has admitted so far. */
    public snapshot(): ChunkAdmissionSnapshot {
        return {
            pending: this.keyed.size,
            admitted: this.admitted,
            admittedInTick: this.admittedInTick,
            admittedIdle: this.admittedIdle,
            divergences: [...this.divergences]
        };
    }

    private takeStep(tick: number): (readonly [HeldCompletion, ChunkAdmissionRecord | undefined])[] {
        const trace = this.trace;
        if (trace === undefined || tick < trace.fromTick) {
            const step: (readonly [HeldCompletion, undefined])[] = [];
            for (let held = this.takeNext(); held !== undefined; held = this.takeNext()) {
                step.push([held, undefined]);
                if (step.length >= this.budget) break;
            }
            return step;
        }

        const step: (readonly [HeldCompletion, ChunkAdmissionRecord])[] = [];
        for (const record of trace.byTick.get(tick) ?? []) {
            const held = this.keyed.get(keyOf(record));
            if (held === undefined) {
                this.divergences.push(
                    `tick ${tick}: recorded ${record.change} of ${record.world} chunk ${record.x},${record.z} was not ready`
                );
                continue;
            }
            this.remove(held);
            step.push([held, record]);
        }
        return step;
    }

    private apply(held: HeldCompletion, tick: number, step: ChunkAdmissionStep, expected?: ChunkAdmissionRecord): void {
        const { completion } = held;
        const wantsDigest = this.recorder !== undefined || this.trace !== undefined;
        const digest =
            wantsDigest && completion.content !== undefined
                ? createHash('sha256').update(completion.content()).digest('hex')
                : null;
        if (expected !== undefined && expected.digest !== null && digest !== null && expected.digest !== digest) {
            this.divergences.push(
                `tick ${tick}: ${completion.world} chunk ${completion.x},${completion.z} has digest ${digest}, recorded ${expected.digest}`
            );
        }

        if (step === 'input') this.admitted++;
        else if (this.active) this.admittedInTick++;
        else this.admittedIdle++;

        const { world, change, x, z } = completion;
        this.recorder?.record({ order: this.nextOrder++, tick, world, change, x, z, step, digest });

        try {
            held.resolve(completion.apply());
        } catch (error: unknown) {
            held.reject(error);
        }
    }

    private remove(held: HeldCompletion): void {
        const lane = this.waiting.get(held.priority)!;
        const index = lane.indexOf(held);
        if (index !== -1) lane.splice(index, 1);
        if (this.keyed.get(held.key) === held) this.keyed.delete(held.key);
    }

    private takeNext(): HeldCompletion | undefined {
        for (let offset = 0; offset < ChunkAdmissions.lanes.length; offset++) {
            const laneIndex = (this.laneCursor + offset) % ChunkAdmissions.lanes.length;
            const held = this.waiting.get(ChunkAdmissions.lanes[laneIndex]!)!.shift();
            if (held === undefined) continue;

            this.laneCursor = (laneIndex + 1) % ChunkAdmissions.lanes.length;
            if (this.keyed.get(held.key) === held) this.keyed.delete(held.key);
            return held;
        }

        return undefined;
    }
}
