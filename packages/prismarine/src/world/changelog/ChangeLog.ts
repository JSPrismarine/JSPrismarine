import type { ChangeEntry, StateEntry } from './ChangeEntry';
import { inverseOf } from './ChangeEntry';

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

/**
 * The entries one unit of work appended, from `startSpan` until `closeSpan` or `revertSpan`.
 * A handle only: the log compares spans by identity.
 */
export type Span = {
    /** The tick the span belongs to. A span never outlives its tick. */
    readonly tick: number;
    /** The sequence number of the span's first entry. */
    readonly start: number;
};

/**
 * Writes one inverse entry to the caller's store, without appending it to the log.
 *
 * A field entry sets `address` to `after`. A membership entry adds the entity from `saved` when
 * it enters and removes it when it leaves.
 */
export type InverseApplier = (inverse: StateEntry) => void;

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
 * A unit of work (one entity's update, one applied input, one committed action) runs inside a
 * span. When the unit finishes, the caller closes the span. When it throws, the caller reverts
 * the span: the log removes the span's entries and hands their inverses, newest first, to an
 * applier the caller supplies, so the store returns to where it was before the unit began.
 *
 * Spans nest, and the innermost open span is the only one that can be closed. Closing an inner
 * span makes its entries part of the enclosing span, so an action committed inside an entity's
 * update is undone with the update if the update throws later. Reverting an inner span undoes
 * only its own entries, and the enclosing span goes on. Reverting a span also discards the
 * spans still open inside it, because the throw that is being handled skipped their close.
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
    private readonly spans: Span[] = [];
    private reverting = false;

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
     * @throws {ChangeLogError} When no tick is open, including after the tick was sealed, or
     * while a span is being reverted.
     */
    public append(entry: ChangeEntry): ChangeAddress {
        const current = this.open('append to');
        this.refuseWhileReverting('append');
        current.entries.push(entry);
        return { tick: current.tick, sequence: current.entries.length - 1 };
    }

    /**
     * Closes the open tick. No entry can be appended to it afterwards.
     * @returns {SealedTick} The tick's entries, for its consumers.
     * @throws {ChangeLogError} When no tick is open or a span is still open.
     */
    public seal(): SealedTick {
        const current = this.open('seal');
        if (this.spans.length > 0)
            throw new ChangeLogError(`Cannot seal tick ${current.tick}: ${this.spans.length} span(s) still open`);
        this.current = null;
        this.retained = current;
        return current;
    }

    /**
     * Marks the start of a unit of work in the open tick.
     * @returns {Span} The span, to close or revert when the unit ends.
     * @throws {ChangeLogError} When no tick is open or a span is being reverted.
     */
    public startSpan(): Span {
        const current = this.open('start a span in');
        this.refuseWhileReverting('start a span');
        const span: Span = { tick: current.tick, start: current.entries.length };
        this.spans.push(span);
        return span;
    }

    /**
     * Ends a unit of work that finished. Its entries stay in the log and become part of the
     * enclosing span, if there is one.
     * @param {Span} span - The innermost open span.
     * @throws {ChangeLogError} When `span` is not the innermost open span.
     */
    public closeSpan(span: Span): void {
        this.refuseWhileReverting('close a span');
        if (this.spans.at(-1) !== span) throw new ChangeLogError('Only the innermost open span can be closed');
        this.spans.pop();
    }

    /**
     * Undoes a unit of work. The span's entries, including those of spans opened inside it, are
     * removed from the log, and the inverse of each entry that changed state is passed to
     * `apply`, newest first. Occurrences changed nothing, so they are removed and not inverted.
     * The next entry appended takes the sequence number of the span's first entry.
     *
     * A chunk entry has no inverse, so a span that holds one is refused and nothing changes.
     *
     * The entries are removed before `apply` runs. If `apply` throws, the store is left
     * partly reverted and the caller has to abandon the phase.
     * @param {Span} span - An open span.
     * @param {InverseApplier} apply - Writes an inverse to the store without logging it.
     * @throws {ChangeLogError} When `span` is not open, the span holds a chunk entry, or `apply`
     * tries to append to the log or open a span.
     */
    public revertSpan(span: Span, apply: InverseApplier): void {
        this.refuseWhileReverting('revert a span');
        const depth = this.spans.lastIndexOf(span);
        if (depth === -1) throw new ChangeLogError('Only an open span can be reverted');
        const current = this.open('revert a span in');
        for (let sequence = span.start; sequence < current.entries.length; sequence++) {
            if (current.entries[sequence]?.kind === 'chunk')
                throw new ChangeLogError(
                    `Cannot revert a span past the chunk entry at tick ${current.tick}, sequence ${sequence}`
                );
        }

        const removed = current.entries.splice(span.start);
        this.spans.length = depth;
        this.reverting = true;
        try {
            for (let index = removed.length - 1; index >= 0; index--) {
                const entry = removed[index];
                if (entry && (entry.kind === 'field' || entry.kind === 'membership')) apply(inverseOf(entry));
            }
        } finally {
            this.reverting = false;
        }
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

    private refuseWhileReverting(action: string): void {
        if (this.reverting) throw new ChangeLogError(`Cannot ${action} while a span is being reverted`);
    }

    private retire(): void {
        this.retained = null;
    }
}
