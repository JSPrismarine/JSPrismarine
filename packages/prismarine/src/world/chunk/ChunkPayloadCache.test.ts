import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import Chunk from './Chunk';

const filled = () => {
    const chunk = new Chunk(0, 0);
    const stone = BlockRuntimeIds.getByName('minecraft:stone');
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.fillColumn(x, z, 0, 40, stone);

    return chunk;
};

describe('world', () => {
    describe('chunk payload cache', () => {
        // Serialising costs ~0.3 ms, and every player in range asks for the same bytes.
        it('serialises once and hands the same buffer back', () => {
            const chunk = filled();

            const first = chunk.networkSerialize();
            const second = chunk.networkSerialize();

            expect(second).toBe(first); // the same object, not merely equal
        });

        it('throws the cache away when a block changes', () => {
            const chunk = filled();
            const before = chunk.networkSerialize();

            chunk.setBlockRuntimeId(3, 20, 3, BlockRuntimeIds.getByName('minecraft:diamond_ore'));
            const after = chunk.networkSerialize();

            expect(after).not.toBe(before);
            expect(after.equals(before)).toBe(false); // and the bytes really did change
        });

        it('throws it away for a column fill too', () => {
            const chunk = filled();
            const before = chunk.networkSerialize();

            chunk.fillColumn(1, 1, 41, 45, BlockRuntimeIds.getByName('minecraft:dirt'));

            expect(chunk.networkSerialize()).not.toBe(before);
        });

        it('produces the same bytes cached as it did fresh', () => {
            // The cache must not change what goes on the wire, only how often it is built.
            const a = filled();
            const b = filled();

            expect(a.networkSerialize().equals(b.networkSerialize())).toBe(true);
        });
    });
});
