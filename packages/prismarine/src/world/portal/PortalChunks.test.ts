import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import Chunk from '../chunk/Chunk';
import { Dimensions } from '../DimensionType';
import { PortalChunks } from './PortalChunks';

/** A chunk holding one block of `name` at local (3, 70, 3), or only air when `name` is undefined. */
const chunkWith = (x: number, z: number, name?: string): Chunk => {
    const chunk = new Chunk(x, z, new Map(), Dimensions.Overworld);
    if (name === undefined) return chunk;
    const runtimeId = BlockRuntimeIds.tryGetByName(name);
    if (runtimeId === null) throw new Error(`the palette has no ${name}`);
    chunk.setBlockRuntimeId(3, 70, 3, runtimeId);
    return chunk;
};

describe('PortalChunks', () => {
    it.each(['minecraft:portal', 'minecraft:end_portal'])(
        'holds a chunk that loads with a %s block in it',
        (portal) => {
            const chunks = new PortalChunks();
            chunks.chunkLoaded(chunkWith(2, -3, portal));

            expect(chunks.mayHoldAny(2, 2, -3, -3)).toBe(true);
            expect(chunks.mayHoldAny(1, 1, -3, -3)).toBe(false);
        }
    );

    it('holds no chunk that loads without a portal block', () => {
        const chunks = new PortalChunks();
        chunks.chunkLoaded(chunkWith(0, 0));
        chunks.chunkLoaded(chunkWith(1, 0, 'minecraft:stone'));

        expect(chunks.mayHoldAny(-1, 1, -1, 1)).toBe(false);
    });

    it('holds a chunk once a portal block is written into it, by the block’s world position', () => {
        const chunks = new PortalChunks();
        chunks.chunkLoaded(chunkWith(-1, 0));

        chunks.blockChanged(-5, 7, 'minecraft:stone');
        expect(chunks.mayHoldAny(-1, -1, 0, 0)).toBe(false);

        chunks.blockChanged(-5, 7, 'minecraft:end_portal');
        expect(chunks.mayHoldAny(-1, -1, 0, 0)).toBe(true);
    });

    it('forgets a chunk that unloads', () => {
        const chunks = new PortalChunks();
        const chunk = chunkWith(4, 4, 'minecraft:portal');
        chunks.chunkLoaded(chunk);

        chunks.chunkUnloaded(chunk);

        expect(chunks.mayHoldAny(4, 4, 4, 4)).toBe(false);
    });

    it('answers for a span reaching over several chunks', () => {
        const chunks = new PortalChunks();
        chunks.chunkLoaded(chunkWith(1, 1, 'minecraft:portal'));

        expect(chunks.mayHoldAny(0, 1, 0, 1)).toBe(true);
        expect(chunks.mayHoldAny(0, 0, 0, 1)).toBe(false);
    });
});
