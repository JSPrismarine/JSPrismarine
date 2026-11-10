import type { ChangeEntry } from './ChangeEntry';

/**
 * Where an entry sits in the history: the tick that appended it and its position in that tick.
 * Sequence numbers start at zero in every tick and have no gaps.
 */
export type ChangeAddress = {
    /** The tick that appended the entry. */
    readonly tick: number;
    /** The entry's position among the tick's entries. */
    readonly sequence: number;
};

/**
 * One tick's entries after the tick closed. It is plain data, so a consumer can hand it to
 * another thread as it is. An entry's sequence number is its index in `entries`.
 */
export type SealedTick = {
    /** The tick these entries belong to. */
    readonly tick: number;
    /** The tick's entries in append order. */
    readonly entries: readonly ChangeEntry[];
};

/** A change log was used out of order, such as appending to a tick that is already sealed. */
export class ChangeLogError extends Error {
    public override readonly name = 'ChangeLogError';
}

type OpenTick = { readonly tick: number; readonly entries: ChangeEntry[] };

/**
 * One world's change log: the ordered record of every change to its authoritative state
 * ([ADR 0012](../../../../../docs/adr/0012-the-change-log-is-the-history.md)).
 *
 * A tick's life is `begin`, any number of `append` calls, then `seal` when the tick closes
 * ([ADR 0015](../../../../../docs/adr/0015-a-tick-is-a-fixed-sequence-of-synchronous-phases.md)).
 * Consumers such as replication read the sealed tick, and the log drops it when the next tick
 * begins. The log holds entries only. It owns no world state and never reads any.
 *
 * It sits beside `WorldChange` and does not replace it yet. `WorldChange` is a push stream to a
 * `WorldChangeSink`: it carries after-values only, holds class instances (`Vector3`,
 * `NBTTagCompound`) and mixes durable changes with transient facts that replication sends at
 * once. This log is pulled after the tick, carries before-values and holds plain data. Block
 * writes move onto it with their logged setters, and replication then reads it instead of the
 * sink, at which point `WorldChange` is deleted (slice 7 of the entity and tick re-architecture).
 * @example
 * ```typescript
 * const log = new ChangeLog();
 * log.begin(1);
 * log.append({ kind: 'chunk', change: 'enter', x: 0, z: 0 });
 * const sealed = log.seal(); // replication reads `sealed.entries`
 * ```
 */
export class ChangeLog {
    private current: OpenTick | null = null;
    private lastBegun = Number.NEGATIVE_INFINITY;

    // The lifetime rule lives here and in `retire`: the newest sealed tick stays readable until
    // the next tick begins. Retention (a ring of recent ticks) replaces these two members.
    private retained: SealedTick | null = null;

    /**
     * Opens `tick` for appending.
     * @param {number} tick - The tick to open. It must be later than every tick begun before.
     * @throws {ChangeLogError} When a tick is still open or `tick` is not later than the last.
     */
    public begin(tick: number): void {
        if (this.current) throw new ChangeLogError(`Tick ${this.current.tick} is still open`);
        if (tick <= this.lastBegun) throw new ChangeLogError(`Tick ${tick} does not follow tick ${this.lastBegun}`);
        this.retire();
        this.lastBegun = tick;
        this.current = { tick, entries: [] };
    }

    /**
     * Appends one entry to the open tick.
     * @param {ChangeEntry} entry - The entry. The log keeps it as given, so it must not change later.
     * @returns {ChangeAddress} Where the entry now sits.
     * @throws {ChangeLogError} When no tick is open, including after the tick was sealed.
     */
    public append(entry: ChangeEntry): ChangeAddress {
        const current = this.open('append to');
        current.entries.push(entry);
        return { tick: current.tick, sequence: current.entries.length - 1 };
    }

    /**
     * Closes the open tick. No entry can be appended to it afterwards.
     * @returns {SealedTick} The tick's entries, for its consumers.
     * @throws {ChangeLogError} When no tick is open.
     */
    public seal(): SealedTick {
        const current = this.open('seal');
        this.current = null;
        this.retained = current;
        return current;
    }

    /**
     * Returns a sealed tick the log still holds.
     * @param {number} tick - The tick.
     * @returns {SealedTick | undefined} The sealed tick, or undefined when it is open, was never
     * begun or has been dropped.
     */
    public read(tick: number): SealedTick | undefined {
        return this.retained?.tick === tick ? this.retained : undefined;
    }

    private open(action: string): OpenTick {
        if (this.current) return this.current;
        if (this.retained?.tick === this.lastBegun)
            throw new ChangeLogError(`Cannot ${action} tick ${this.lastBegun}: it is sealed`);
        throw new ChangeLogError(`Cannot ${action} a tick: none is open`);
    }

    private retire(): void {
        this.retained = null;
    }
}
