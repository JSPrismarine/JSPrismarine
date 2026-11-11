import { describe, expect, it } from 'vitest';

import type { ChangeEntry, FieldEntry } from './ChangeEntry';
import { ChangeLog } from './ChangeLog';
import type { SealedTick } from './ChangeLog';
import { changeLogCost, estimatePlainBytes } from './changeLogCost';

const block: FieldEntry<'block'> = {
    kind: 'field',
    field: 'block',
    address: { x: 1, y: -60, z: 2, layer: 0 },
    before: 0,
    after: 12
};

const sealedWith = (entries: readonly ChangeEntry[]): SealedTick => {
    const log = new ChangeLog();
    log.begin(1);
    for (const entry of entries) log.append(entry);
    return log.seal();
};

describe('changeLogCost', () => {
    it('costs nothing for an idle tick', () => {
        expect(changeLogCost(sealedWith([]))).toEqual({ entries: 0, bytes: 0, blockEntries: 0, blockBytes: 0 });
    });

    it('estimates a block entry from its names and numbers', () => {
        // Property names kind, field, address, before, after: 27 characters, 54 bytes.
        // Values 'field' and 'block': 20 bytes. Address names x, y, z, layer: 16 bytes, and
        // four numbers: 32 bytes. Before and after: 16 bytes.
        expect(changeLogCost(sealedWith([block]))).toEqual({
            entries: 1,
            bytes: 138,
            blockEntries: 1,
            blockBytes: 138
        });
    });

    it('grows with the number of entries', () => {
        const ten = changeLogCost(sealedWith(Array.from({ length: 10 }, () => block)));
        expect(ten).toEqual({ entries: 10, bytes: 1380, blockEntries: 10, blockBytes: 1380 });
    });

    it('counts block and block entity entries apart from the rest', () => {
        const chunk: ChangeEntry = { kind: 'chunk', change: 'enter', x: 0, z: 0 };
        const cost = changeLogCost(sealedWith([chunk, block]));
        expect(cost).toMatchObject({ entries: 2, blockEntries: 1, blockBytes: 138 });
        expect(cost.bytes).toBeGreaterThan(cost.blockBytes);
    });

    it('counts a typed array by its byte length', () => {
        expect(estimatePlainBytes(new Float64Array(3))).toBe(24);
        expect(estimatePlainBytes([true, null, 'ab', 5n])).toBe(13);
    });
});
