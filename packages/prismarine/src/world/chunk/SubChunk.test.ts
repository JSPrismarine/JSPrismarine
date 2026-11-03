import { describe, expect, it } from 'vitest';

import BinaryStream from '@jsprismarine/binaryutils';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import BlockStorage from './BlockStorage';
import SubChunk from './SubChunk';

describe('SubChunk', () => {
    it('reads a missing storage layer as air without changing the sub chunk', () => {
        const subChunk = new SubChunk();
        const before = new BinaryStream();
        subChunk.networkSerialize(before);

        expect(subChunk.getBlock(0, 0, 0, 1).name).toBe('minecraft:air');
        expect(subChunk.getBlockRuntimeId(0, 0, 0, 1)).toBe(BlockRuntimeIds.getByName('minecraft:air'));
        expect(subChunk.getStorages()).toHaveLength(0);
        expect(subChunk.getRevision()).toBe(0);

        const after = new BinaryStream();
        subChunk.networkSerialize(after);
        expect(after.getBuffer()).toEqual(before.getBuffer());
    });

    it('creates lower storage layers when a write targets a higher layer', () => {
        const subChunk = new SubChunk();
        const stone = BlockRuntimeIds.getByName('minecraft:stone');

        subChunk.setBlock(0, 0, 0, stone, 1);

        expect(subChunk.getStorages()).toHaveLength(2);
        expect(subChunk.getBlockRuntimeId(0, 0, 0, 0)).toBe(BlockRuntimeIds.getByName('minecraft:air'));
        expect(subChunk.getBlockRuntimeId(0, 0, 0, 1)).toBe(stone);
        expect(subChunk.getRevision()).toBe(1);
    });

    it('keeps storage iteration in the order supplied by the decoder', () => {
        const lower = new BlockStorage({});
        const upper = new BlockStorage({});
        const subChunk = new SubChunk(
            new Map([
                [1, upper],
                [0, lower]
            ])
        );

        expect(subChunk.getStorages()).toEqual([upper, lower]);
    });
});
