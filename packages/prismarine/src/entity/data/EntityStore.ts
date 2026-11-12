/**
 * The entity store: one world's data-driven entities and the change log that records what
 * happens to them.
 *
 * The store owns membership. An entity enters it once, after its construction and its spawn
 * event or its restore, and leaves it once, and each is one membership entry carrying the
 * entity's saved form. Every change to a member's authoritative state in between reaches the
 * store through {@link EntityStore.written} and becomes one field entry with the value before and
 * after it ([ADR 0012](../../../../../docs/adr/0012-the-change-log-is-the-history.md)). A write
 * made while the entity was being built is part of the saved form its entering entry carries,
 * so it is not logged on its own.
 *
 * A unit of work, such as one entity's update or one applied input, runs through
 * {@link EntityStore.unit} or {@link EntityStore.unitAsync}. When it throws, the store reverts
 * the unit's span: it writes the inverse of each entry the unit appended, newest first, through
 * the writers the runtime registers, and ignores the reports those writes
 * cause. When an inverse throws, the store can no longer be trusted, so it records the failure
 * in {@link EntityStore.broken} and the world stops ticking
 * ([ADR 0015](../../../../../docs/adr/0015-a-tick-is-a-fixed-sequence-of-synchronous-phases.md)).
 *
 * The log is the world's: its block and block entity writes reach it through
 * {@link EntityStore.writtenBlock} and {@link EntityStore.writtenBlockEntity}, and the world
 * registers the writer that undoes them. A tick of the log is one world tick, numbered by the
 * store from 1 and not by the level clock, because `/time set` moves the clock backwards and the
 * log only goes forward.
 *
 * A state entry made between ticks, such as a block a command a tick function runs places or a
 * mob it summons, is held and appended when the next tick opens, ahead of that tick's own
 * entries. Replication reads blocks and entities only from the log, so an entity that entered
 * between ticks would otherwise never reach a client, and the next tick is when such a write
 * reached clients before it did. An occurrence replication sends, such as a sound, is held the
 * same way. Other entries between ticks, a chunk or a vetoed action, are still counted as
 * unlogged.
 */
import type {
    ChangeEntry,
    FieldKinds,
    OccurrenceEntry,
    OccurrenceKinds,
    StateEntry
} from '../../world/changelog/ChangeEntry';
import { isCarriedEntry } from '../../world/changelog/ChangeEntry';
import type { SealedTick, Span } from '../../world/changelog/ChangeLog';
import { ChangeLog } from '../../world/changelog/ChangeLog';
import type { PlainData, PlainRecord } from '../../world/changelog/PlainData';
import { plainOf, samePlain } from '../../world/changelog/PlainData';
import type { DataEntity } from './DataEntity';

/**
 * How many updates in a row an entity may fail before the store removes it. One failure can
 * be a bad neighbor or a bad block; a run of them is the entity itself.
 */
export const ENTITY_FAILURE_LIMIT = 3;

/**
 * Writes one inverse entry back to the state it describes, without logging it.
 *
 * @returns Whether the writer knew the entity the entry addresses. The store asks each writer in
 *   the order it was registered.
 */
export type InverseWriter = (inverse: StateEntry) => boolean;

/** How a unit of work ended. */
export type UnitOutcome = { readonly failed: false } | { readonly failed: true; readonly error: unknown };

const SUCCEEDED: UnitOutcome = { failed: false };

/** What the store reports about itself, by count. */
export interface EntityStoreCounts {
    /**
     * Entries the log could not hold because no tick was open, such as a chunk between ticks.
     * State entries and the occurrences replication sends are held for the next tick instead.
     */
    readonly unlogged: number;
    /** Units that threw and were reverted. */
    readonly reverted: number;
    /** Units that threw and kept their writes, because a chunk entered inside them. */
    readonly kept: number;
}

/** One world's data-driven entities, by runtime id, and the change log of their state. */
export class EntityStore {
    private readonly members = new Map<number, DataEntity>();
    /** Members whose entering entry is in the log, so their writes are logged. */
    private readonly entered = new WeakSet<DataEntity>();
    private readonly log = new ChangeLog();
    private readonly writers: InverseWriter[] = [];
    private ticks = 0;
    private open = false;
    private reverting = false;
    private failure: unknown;
    private unlogged = 0;
    private reverted = 0;
    private readonly failures = new Map<number, number>();
    private readonly skipped = new Set<number>();
    /** The open units, innermost last, each pinned once a chunk entered inside it. */
    private readonly units: OpenUnit[] = [];
    private kept = 0;
    private readonly sealListeners = new Set<(sealed: SealedTick) => void>();
    /** State entries and sent occurrences made between ticks, for the next tick to open with. */
    private readonly carried: ChangeEntry[] = [];

    /**
     * @param report - Receives a line for each inverse that failed.
     */
    public constructor(private readonly report: (message: string) => void = () => undefined) {}

    /** The member with this runtime id, or undefined when the store holds none. */
    public get(id: number): DataEntity | undefined {
        return this.members.get(id);
    }

    /** Whether the store holds an entity with this runtime id. */
    public has(id: number): boolean {
        return this.members.has(id);
    }

    /** Every member, in the order they were admitted. */
    public values(): IterableIterator<DataEntity> {
        return this.members.values();
    }

    /** How many members the store holds. */
    public get size(): number {
        return this.members.size;
    }

    /**
     * Takes in an entity that is still being built. Queries find it from now on, and its
     * writes are not logged until {@link EntityStore.enter} records it.
     */
    public admit(entity: DataEntity): void {
        this.members.set(entity.id, entity);
    }

    /**
     * Records that an admitted entity has entered the world, with the saved form it entered
     * with. Its writes are logged from now on.
     */
    public enter(entity: DataEntity, saved: PlainRecord): void {
        this.entered.add(entity);
        this.append({ kind: 'membership', change: 'enter', entity: BigInt(entity.id), saved });
    }

    /** Whether a member's entering entry has been recorded, so its writes are logged. */
    public hasEntered(entity: DataEntity): boolean {
        return this.entered.has(entity);
    }

    /**
     * Takes an entity out of the store. Its own writes stop being logged; call
     * {@link EntityStore.recordLeave} once its removal has finished.
     */
    public detach(entity: DataEntity): void {
        this.members.delete(entity.id);
        this.entered.delete(entity);
        this.failures.delete(entity.id);
    }

    /**
     * Records that an entity left, with the saved form it had before its removal began. Called
     * last, so that undoing the removal adds the entity back before the changes its removal made
     * to other entities are undone.
     */
    public recordLeave(id: number, saved: PlainRecord): void {
        this.append({ kind: 'membership', change: 'leave', entity: BigInt(id), saved });
    }

    /**
     * Logs one change to a member's state, with its value before and after.
     *
     * A write by an entity that has not entered, or that is leaving, is part of a saved form
     * and is dropped. Values are copied into plain data here, so a caller may pass the live
     * value it just stored.
     * @param field - The field's name in the entry's address, such as `position` or `component:minecraft:breathable`.
     */
    public written(entity: DataEntity, field: string, before: unknown, after: unknown): void {
        if (!this.entered.has(entity)) return;
        this.writtenField(entity.id, field, before, after);
    }

    /**
     * Logs one change to an entity the store does not hold, addressed by its runtime id: a rider
     * whose ride changed after its entity left the store.
     */
    public writtenLegacy(id: bigint | number, field: string, before: unknown, after: unknown): void {
        this.writtenField(id, field, before, after);
    }

    /**
     * Logs one change to one slot of an entity's container, addressed by its runtime id.
     * @param container - Which of the entity's containers, such as `inventory` or `armor`.
     */
    public writtenSlot(
        id: bigint | number,
        container: string,
        slot: number,
        before: PlainRecord | null,
        after: PlainRecord | null
    ): void {
        if (this.reverting) return;
        if (before === after || (before !== null && after !== null && samePlain(before, after))) return;
        this.append({
            kind: 'field',
            field: 'inventory-slot',
            address: { entity: BigInt(id), container, slot },
            before,
            after
        });
    }

    /**
     * Logs one change to the block at a position, as block runtime ids.
     * @param layer - The storage layer, 0 for the block and 1 for what is waterlogged into it.
     */
    public writtenBlock(x: number, y: number, z: number, layer: number, before: number, after: number): void {
        if (before === after) return;
        this.append({ kind: 'field', field: 'block', address: { x, y, z, layer }, before, after });
    }

    /**
     * Logs one change to one field of the block entity at a position
     * (`blockentity/blockEntityLog.ts` names the fields), with its value before and after.
     */
    public writtenBlockEntity(
        x: number,
        y: number,
        z: number,
        field: string,
        before: PlainData,
        after: PlainData
    ): void {
        if (samePlain(before, after)) return;
        this.append({ kind: 'field', field: 'block-entity', address: { x, y, z, field }, before, after });
    }

    /**
     * Logs one change to the block update queue: a position queued, moved to an earlier tick or
     * taken off, as the tick it comes due before and after, or null for none.
     */
    public writtenBlockUpdate(x: number, y: number, z: number, before: number | null, after: number | null): void {
        if (before === after) return;
        this.append({ kind: 'field', field: 'block-update', address: { x, y, z }, before, after });
    }

    /**
     * Logs one scheduled block or fluid tick queued or taken off, with its timing before and
     * after, or null for none.
     */
    public writtenScheduledTick(
        address: FieldKinds['scheduled-tick']['address'],
        before: FieldKinds['scheduled-tick']['value'],
        after: FieldKinds['scheduled-tick']['value']
    ): void {
        this.append({ kind: 'field', field: 'scheduled-tick', address, before, after });
    }

    /**
     * Appends an occurrence, which changes no state: something replication sends, or the
     * record of an action a guard vetoed.
     */
    public occurred(entry: OccurrenceEntry): void {
        this.append(entry);
    }

    /**
     * Appends a chunk entry, which names a chunk that entered or left the world.
     *
     * A chunk admitted at the input step enters outside every unit. One that code inside a unit
     * loaded inline (`IN_TICK_CHUNK_LOADS`) enters inside it, and a chunk entry has no inverse,
     * so every open unit is pinned: if it throws, its writes stay and the failure is reported,
     * as before the store existed. Slices 3 to 9 remove the inline loads.
     */
    public chunk(change: 'enter' | 'leave', x: number, z: number): void {
        for (const unit of this.units) unit.pinned = true;
        this.append({ kind: 'chunk', change, x, z });
    }

    /**
     * Writes the state each entry leads to, forward, through the registered writers and without
     * logging: a field takes its after-value, an entering entity is added from its saved form
     * and a leaving one is removed. A store built from a snapshot reaches the live store's state
     * this way, which is what makes a snapshot plus the log a replay.
     * @throws {Error} When no writer knows an entry's entity.
     */
    public replay(entries: Iterable<ChangeEntry>): void {
        this.reverting = true;
        try {
            for (const entry of entries) {
                if (entry.kind !== 'field' && entry.kind !== 'membership') continue;
                if (!this.writers.some((write) => write(entry))) throw new Error(`No writer knows ${addressed(entry)}`);
            }
        } finally {
            this.reverting = false;
        }
    }

    /** Registers a writer for inverse entries; the first one that knows the entity writes it. */
    public addInverseWriter(writer: InverseWriter): void {
        this.writers.push(writer);
    }

    /** Opens the next tick of the log, or does nothing when one is already open. */
    public beginTick(): void {
        if (this.open) return;
        this.ticks += 1;
        this.log.begin(this.ticks);
        this.open = true;
        this.skipped.clear();
        for (const entry of this.carried) this.log.append(entry);
        this.carried.length = 0;
    }

    /**
     * Seals the open tick, which is what the tick's close phase does.
     * @returns The sealed tick, or undefined when no tick was open.
     */
    public sealTick(): SealedTick | undefined {
        if (!this.open) return undefined;
        this.open = false;
        const sealed = this.log.seal();
        for (const listener of this.sealListeners) listener(sealed);
        return sealed;
    }

    /**
     * Hears every tick as it seals. Replication will be the reader; until then the replay
     * scenarios count entries and bytes per tick through this.
     * @returns A function that removes the listener.
     */
    public onSealed(listener: (sealed: SealedTick) => void): () => void {
        this.sealListeners.add(listener);
        return () => this.sealListeners.delete(listener);
    }

    /**
     * The number of the open tick, or of the last one sealed, counted from 1 by the store; 0
     * before the first. A clock that only goes forward, which a meal is counted out on.
     */
    public get tick(): number {
        return this.ticks;
    }

    /** Whether a tick is open, so writes are logged. */
    public get tickOpen(): boolean {
        return this.open;
    }

    /** The last sealed tick, until the next tick begins, or undefined when there is none. */
    public lastSealed(): SealedTick | undefined {
        return this.open ? undefined : this.log.read(this.ticks);
    }

    /** What the store counted, for reports. */
    public counts(): EntityStoreCounts {
        return { unlogged: this.unlogged, reverted: this.reverted, kept: this.kept };
    }

    /**
     * The first inverse that failed to write, or undefined while the store can be trusted.
     * A world whose store is broken stops ticking.
     */
    public get broken(): unknown {
        return this.failure;
    }

    /**
     * Runs one unit of work in a span of its own. When it throws, the span is reverted and the
     * error is returned instead of thrown.
     *
     * With no tick open there is nothing to revert from, so the work runs as it is and a throw
     * passes through, as it did before the store existed.
     */
    public unit(work: () => void): UnitOutcome {
        if (!this.open || this.reverting) {
            work();
            return SUCCEEDED;
        }
        const unit = this.startUnit();
        try {
            work();
        } catch (error: unknown) {
            this.endUnit(unit, true);
            return { failed: true, error };
        }
        this.endUnit(unit, false);
        return SUCCEEDED;
    }

    /**
     * {@link EntityStore.unit} for asynchronous work, which an input handler still is.
     *
     * The span stays open across the work's awaits, so a write that something else makes while
     * the work waits lands in it. The input step runs one input at a time, which keeps that to
     * code the step does not run.
     */
    public async unitAsync(work: () => Promise<void>): Promise<UnitOutcome> {
        if (!this.open || this.reverting) {
            await work();
            return SUCCEEDED;
        }
        const unit = this.startUnit();
        try {
            await work();
        } catch (error: unknown) {
            this.endUnit(unit, true);
            return { failed: true, error };
        }
        this.endUnit(unit, false);
        return SUCCEEDED;
    }

    /**
     * Counts one more failed update for an entity and marks it skipped for the rest of the tick.
     * @returns Whether the entity has now failed {@link ENTITY_FAILURE_LIMIT} updates in a row.
     */
    public failed(id: number): boolean {
        const count = (this.failures.get(id) ?? 0) + 1;
        this.failures.set(id, count);
        this.skipped.add(id);
        return count >= ENTITY_FAILURE_LIMIT;
    }

    /** Clears an entity's run of failures after an update that finished. */
    public succeeded(id: number): void {
        this.failures.delete(id);
    }

    /** Whether an entity failed earlier in this tick and is skipped until the next. */
    public isSkipped(id: number): boolean {
        return this.skipped.has(id);
    }

    private startUnit(): OpenUnit {
        const unit: OpenUnit = { span: this.log.startSpan(), pinned: false };
        this.units.push(unit);
        return unit;
    }

    private endUnit(unit: OpenUnit, threw: boolean): void {
        const depth = this.units.lastIndexOf(unit);
        if (depth !== -1) this.units.length = depth;
        if (threw && !unit.pinned) this.revert(unit.span);
        else {
            if (threw) {
                this.kept += 1;
                this.report('A unit that threw keeps its writes: a chunk entered inside it, and that cannot be undone');
            }
            this.log.closeSpan(unit.span);
        }
    }

    private writtenField(id: bigint | number, field: string, before: unknown, after: unknown): void {
        if (this.reverting) return;
        const plainBefore = plainValue(before);
        const plainAfter = plainValue(after);
        if (samePlain(plainBefore, plainAfter)) return;
        this.append({
            kind: 'field',
            field: 'entity',
            address: { entity: BigInt(id), field },
            before: plainBefore,
            after: plainAfter
        });
    }

    private append(entry: ChangeEntry): void {
        if (this.reverting) return;
        if (!this.open) {
            if (isCarriedEntry(entry)) this.carried.push(entry);
            else this.unlogged += 1;
            return;
        }
        this.log.append(entry);
    }

    private revert(span: Span): void {
        this.reverting = true;
        this.reverted += 1;
        let removed: readonly ChangeEntry[];
        try {
            removed = this.log.revertSpan(span, (inverse) => {
                if (!this.writers.some((write) => write(inverse)))
                    throw new Error(`No writer knows ${addressed(inverse)}`);
            });
        } catch (error: unknown) {
            this.failure ??= error;
            this.report(`An inverse entry failed to write, so the store stops: ${String(error)}`);
            return;
        } finally {
            this.reverting = false;
        }
        // Logged after the undo, in the span around this one if there is one, so an undo of that
        // span shows the slots again too.
        for (const shown of slotsShownAgain(removed)) this.append(shown);
    }
}

/** A unit of work that is still running. */
type OpenUnit = {
    readonly span: Span;
    /** Set once a chunk entered inside the unit, which keeps its writes if it throws. */
    pinned: boolean;
};

/**
 * The slots an undone span wrote, or showed again after an undo inside it, each once and in the
 * order the span first named it. A slot written back holds a stack with a new network id, so its
 * owner's client is shown it again.
 */
const slotsShownAgain = (removed: readonly ChangeEntry[]): OccurrenceEntry<'slot-shown'>[] => {
    const shown = new Map<string, OccurrenceEntry<'slot-shown'>>();
    for (const entry of removed) {
        let at: OccurrenceKinds['slot-shown'] | undefined;
        if (entry.kind === 'field' && entry.field === 'inventory-slot') at = entry.address;
        else if (entry.kind === 'occurrence' && entry.occurrence === 'slot-shown') at = entry.data;
        if (at === undefined) continue;
        const key = `${at.entity}:${at.container}:${at.slot}`;
        if (!shown.has(key)) shown.set(key, { kind: 'occurrence', occurrence: 'slot-shown', data: { ...at } });
    }
    return [...shown.values()];
};

/** What an inverse entry addresses, for the line that reports no writer knew it. */
const addressed = (entry: StateEntry): string => {
    if (entry.kind === 'membership') return `entity ${entry.entity}`;
    if (entry.field === 'entity' || entry.field === 'inventory-slot') return `entity ${entry.address.entity}`;
    const { x, y, z } = entry.address;
    return `the ${entry.field} at ${x}, ${y}, ${z}`;
};

/** A logged value as plain data, with `undefined` standing for "nothing" as `null`. */
const plainValue = (value: unknown): PlainData => {
    if (value === undefined) return null;
    const plain = plainOf(value);
    if (plain === undefined) throw new TypeError(`A logged value has no plain form: ${String(value)}`);
    return plain;
};
