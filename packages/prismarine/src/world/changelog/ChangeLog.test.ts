import { describe, expect, it } from 'vitest';

import type { FieldEntry } from './ChangeEntry';
import { ChangeLog, ChangeLogError } from './ChangeLog';

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
