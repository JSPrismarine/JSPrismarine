import { describe, expect, it } from 'vitest';

import type { ChangeEntry, EntityId, FieldEntry, StateEntry } from './ChangeEntry';
import { fieldKey, inverseOf } from './ChangeEntry';
import type { Span } from './ChangeLog';
import { ChangeLog, ChangeLogError } from './ChangeLog';
import type { PlainData, PlainRecord } from './PlainData';

/**
 * A minimal store over the log, standing in for the entity store: its writes append entries,
 * and `apply` is the raw write a revert hands inverses to.
 */
class TestStore {
    public readonly fields = new Map<string, PlainData>();
    public readonly entities = new Map<EntityId, PlainRecord>();

    public constructor(private readonly log: ChangeLog) {}

    /** A logged write: change the state, then record the change. */
    public write(entry: ChangeEntry): void {
        if (entry.kind === 'field' || entry.kind === 'membership') this.apply(entry);
        this.log.append(entry);
    }

    public readonly apply = (entry: StateEntry): void => {
        if (entry.kind === 'membership') {
            if (entry.change === 'enter') this.entities.set(entry.entity, entry.saved);
            else this.entities.delete(entry.entity);
            return;
        }
        this.fields.set(`${entry.field}|${String(fieldKey(entry))}`, entry.after);
    };

    public snapshot(): { fields: Map<string, PlainData>; entities: Map<EntityId, PlainRecord> } {
        return structuredClone({ fields: this.fields, entities: this.entities });
    }
}

const moved = (entity: bigint, x: number): FieldEntry<'entity'> => ({
    kind: 'field',
    field: 'entity',
    address: { entity, field: 'position' },
    before: [x - 1, 64, 0],
    after: [x, 64, 0]
});

describe('ChangeLog', () => {
    describe('addressing', () => {
        it('appends nothing in an idle tick', () => {
            const log = new ChangeLog();
            log.begin(1);
            expect(log.seal()).toEqual({ tick: 1, entries: [] });
        });

        it('addresses entries by tick and sequence number in append order', () => {
            const log = new ChangeLog();
            log.begin(5);
            const addresses = [1n, 2n, 3n].map((entity) => log.append(moved(entity, 1)));
            expect(addresses).toEqual([
                { tick: 5, sequence: 0 },
                { tick: 5, sequence: 1 },
                { tick: 5, sequence: 2 }
            ]);

            const sealed = log.seal();
            expect(sealed.entries).toEqual([moved(1n, 1), moved(2n, 1), moved(3n, 1)]);
            expect(log.read(5)).toBe(sealed);
        });

        it('appends one entry per position write, for N entities', () => {
            const log = new ChangeLog();
            log.begin(1);
            for (let entity = 0n; entity < 50n; entity++) log.append(moved(entity, 2));
            expect(log.seal().entries).toHaveLength(50);
        });

        it('starts sequence numbers at zero in every tick', () => {
            const log = new ChangeLog();
            log.begin(1);
            log.append(moved(1n, 1));
            log.append(moved(1n, 2));
            log.seal();
            log.begin(2);
            expect(log.append(moved(1n, 3))).toEqual({ tick: 2, sequence: 0 });
        });

        it('seals plain data that survives a structured clone', () => {
            const log = new ChangeLog();
            log.begin(1);
            log.append(moved(1n, 1));
            log.append({ kind: 'occurrence', occurrence: 'animate', data: { entity: 1n, action: 1 } });
            const sealed = log.seal();
            expect(structuredClone(sealed)).toEqual(sealed);
        });
    });

    describe('spans', () => {
        const zombie = { type: 'minecraft:zombie', health: 20 };
        const stateEntries: readonly StateEntry[] = [
            moved(1n, 1),
            moved(1n, 2),
            { kind: 'field', field: 'block', address: { x: 0, y: 1, z: 0, layer: 0 }, before: 0, after: 5 },
            { kind: 'field', field: 'block', address: { x: 0, y: 1, z: 0, layer: 0 }, before: 5, after: 9 },
            {
                kind: 'field',
                field: 'inventory-slot',
                address: { entity: 1n, container: 'inventory', slot: 0 },
                before: { id: 'minecraft:dirt', count: 1 },
                after: null
            },
            {
                kind: 'field',
                field: 'block-entity',
                address: { x: 0, y: 2, z: 0, field: 'text' },
                before: 'old',
                after: 'new'
            },
            { kind: 'membership', change: 'leave', entity: 2n, saved: zombie },
            { kind: 'membership', change: 'enter', entity: 3n, saved: { ...zombie, health: 4 } }
        ];

        /** A store holding what `entries`, run in order, expect to find before they run. */
        const seeded = (entries: readonly StateEntry[] = stateEntries): { log: ChangeLog; store: TestStore } => {
            const log = new ChangeLog();
            const store = new TestStore(log);
            for (const entry of [...entries].reverse()) store.apply(inverseOf(entry));
            log.begin(1);
            return { log, store };
        };

        it('restores the state when a span of every kind is reverted', () => {
            const { log, store } = seeded();
            const before = store.snapshot();
            const span = log.startSpan();
            for (const entry of stateEntries) store.write(entry);
            store.write({ kind: 'occurrence', occurrence: 'animate', data: { entity: 1n, action: 1 } });
            expect(store.snapshot()).not.toEqual(before);

            log.revertSpan(span, store.apply);

            expect(store.snapshot()).toEqual(before);
            expect(log.seal().entries).toEqual([]);
        });

        it('restores the state for each kind on its own', () => {
            for (const entry of stateEntries) {
                const { log, store } = seeded([entry]);
                const before = store.snapshot();
                const span = log.startSpan();
                store.write(entry);
                log.revertSpan(span, store.apply);
                expect(store.snapshot()).toEqual(before);
            }
        });

        it('hands the applier the inverses newest first and nothing for an occurrence', () => {
            const { log, store } = seeded();
            const span = log.startSpan();
            const [first, second] = stateEntries;
            if (!first || !second) throw new Error('fixture');
            store.write(first);
            store.write({ kind: 'occurrence', occurrence: 'emote', data: { entity: 1n, emote: 'wave' } });
            store.write(second);

            const applied: StateEntry[] = [];
            log.revertSpan(span, (inverse) => applied.push(inverse));
            expect(applied).toEqual([inverseOf(second), inverseOf(first)]);
        });

        it('keeps entries before the span and numbers the next entry after them', () => {
            const { log, store } = seeded();
            store.write(moved(9n, 1));
            const span = log.startSpan();
            store.write(moved(1n, 1));
            store.write(moved(1n, 2));
            log.revertSpan(span, store.apply);

            expect(log.append(moved(9n, 2))).toEqual({ tick: 1, sequence: 1 });
            expect(log.seal().entries).toEqual([moved(9n, 1), moved(9n, 2)]);
        });

        it('keeps a closed span in the log', () => {
            const { log, store } = seeded();
            const span = log.startSpan();
            store.write(moved(1n, 1));
            log.closeSpan(span);
            expect(log.seal().entries).toEqual([moved(1n, 1)]);
        });

        describe('nesting', () => {
            it('undoes a closed inner span with its enclosing span', () => {
                const { log, store } = seeded();
                const before = store.snapshot();
                const update = log.startSpan();
                store.write(moved(1n, 1));
                const action = log.startSpan();
                store.write(moved(1n, 2));
                log.closeSpan(action);

                log.revertSpan(update, store.apply);
                expect(store.snapshot()).toEqual(before);
                expect(log.seal().entries).toEqual([]);
            });

            it('undoes only a reverted inner span and lets the enclosing span go on', () => {
                const { log, store } = seeded();
                const update = log.startSpan();
                store.write(moved(1n, 1));
                const afterFirst = store.snapshot();
                const action = log.startSpan();
                store.write(moved(1n, 2));
                log.revertSpan(action, store.apply);
                expect(store.snapshot()).toEqual(afterFirst);

                store.write(moved(2n, 1));
                log.closeSpan(update);
                const entries = log.seal().entries;
                expect(entries).toEqual([moved(1n, 1), moved(2n, 1)]);
            });

            it('discards inner spans still open when the enclosing span is reverted', () => {
                const { log, store } = seeded();
                const before = store.snapshot();
                const update = log.startSpan();
                const action = log.startSpan();
                store.write(moved(1n, 1));
                log.revertSpan(update, store.apply);

                expect(store.snapshot()).toEqual(before);
                expect(() => log.closeSpan(action)).toThrow(ChangeLogError);
                expect(log.seal().entries).toEqual([]);
            });

            it('closes only the innermost open span', () => {
                const { log } = seeded();
                const update = log.startSpan();
                log.startSpan();
                expect(() => log.closeSpan(update)).toThrow(ChangeLogError);
            });
        });

        it('refuses to revert past a chunk entry and changes nothing', () => {
            const { log, store } = seeded();
            const span = log.startSpan();
            store.write(moved(1n, 1));
            store.write({ kind: 'chunk', change: 'enter', x: 0, z: 0 });
            const state = store.snapshot();

            expect(() => log.revertSpan(span, store.apply)).toThrow(ChangeLogError);
            expect(store.snapshot()).toEqual(state);
            log.closeSpan(span);
            expect(log.seal().entries).toHaveLength(2);
        });

        it('refuses to append from the applier', () => {
            const { log, store } = seeded();
            const span = log.startSpan();
            store.write(moved(1n, 1));
            expect(() => log.revertSpan(span, (inverse) => store.write(inverse))).toThrow(ChangeLogError);
        });

        it('refuses to revert a span that is not open', () => {
            const { log } = seeded();
            const span = log.startSpan();
            log.closeSpan(span);
            const stranger: Span = { tick: 1, start: 0 };
            expect(() => log.revertSpan(span, () => {})).toThrow(ChangeLogError);
            expect(() => log.revertSpan(stranger, () => {})).toThrow(ChangeLogError);
        });

        it('refuses to seal a tick with a span still open', () => {
            const { log } = seeded();
            log.startSpan();
            expect(() => log.seal()).toThrow(ChangeLogError);
        });
    });

    describe('lifetime', () => {
        it('refuses an append after the tick is sealed', () => {
            const log = new ChangeLog();
            log.begin(1);
            log.seal();
            expect(() => log.append(moved(1n, 1))).toThrow(ChangeLogError);
            expect(() => log.append(moved(1n, 1))).toThrow('sealed');
            expect(log.read(1)?.entries).toEqual([]);
        });

        it('refuses an append and a seal before any tick begins', () => {
            const log = new ChangeLog();
            expect(() => log.append(moved(1n, 1))).toThrow(ChangeLogError);
            expect(() => log.seal()).toThrow(ChangeLogError);
        });

        it('drops a sealed tick when the next tick begins', () => {
            const log = new ChangeLog();
            log.begin(1);
            log.append(moved(1n, 1));
            const sealed = log.seal();
            log.begin(2);

            expect(log.read(1)).toBeUndefined();
            expect(log.read(2)).toBeUndefined();
            // A consumer that took the sealed tick keeps it.
            expect(sealed.entries).toHaveLength(1);
        });

        it('refuses to begin a tick while one is open or out of order', () => {
            const log = new ChangeLog();
            log.begin(3);
            expect(() => log.begin(4)).toThrow(ChangeLogError);
            log.seal();
            expect(() => log.begin(3)).toThrow(ChangeLogError);
            expect(() => log.begin(2)).toThrow(ChangeLogError);
            log.begin(4);
        });
    });
});
