import { describe, expect, expectTypeOf, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type { ReadonlyBlockStorage } from './BlockStorage';
import Chunk from './Chunk';
import type { ReadonlyChunkBiomes } from './ChunkBiomes';
import type { ReadonlySubChunk } from './SubChunk';

/**
 * What a chunk hands out is read-only, so every write goes through a method of the chunk and a
 * save cut hears of it before it lands (ADR 0018). The checks are the compiler's: these views are
 * the real objects, not copies.
 */
describe('what a chunk hands out', () => {
    it('types its sub chunks, their storages and its biomes with no mutators', () => {
        expectTypeOf<ReturnType<Chunk['getSubChunk']>>().toEqualTypeOf<ReadonlySubChunk | null>();
        expectTypeOf<ReturnType<Chunk['getOrCreateSubChunk']>>().toEqualTypeOf<ReadonlySubChunk>();
        expectTypeOf<ReturnType<Chunk['getSubChunks']>>().toEqualTypeOf<Map<number, ReadonlySubChunk>>();
        expectTypeOf<ReturnType<Chunk['getBiomes']>>().toEqualTypeOf<ReadonlyChunkBiomes>();

        expectTypeOf<ReadonlySubChunk>().not.toHaveProperty('setBlock');
        expectTypeOf<ReturnType<ReadonlySubChunk['getStorages']>>().toEqualTypeOf<readonly ReadonlyBlockStorage[]>();
        expectTypeOf<ReadonlyBlockStorage>().not.toHaveProperty('setBlock');
        expectTypeOf<ReadonlyBlockStorage>().not.toHaveProperty('pack');
        expectTypeOf<ReadonlyChunkBiomes>().not.toHaveProperty('set');
        expectTypeOf<ReadonlyChunkBiomes>().not.toHaveProperty('fillSection');
        expectTypeOf<ReadonlyChunkBiomes>().not.toHaveProperty('setSection');
        expectTypeOf<ReadonlyChunkBiomes>().not.toHaveProperty('fillColumn');
    });

    it('refuses to compile a write through any of them', () => {
        // Never called: what matters is that the body does not compile, and running it would write.
        const writesAroundTheChunk = (chunk: Chunk, block: number): void => {
            // @ts-expect-error a sub chunk from getSubChunk has no setBlock
            chunk.getSubChunk(0)?.setBlock(0, 0, 0, block, 0);
            // @ts-expect-error nor does one from getOrCreateSubChunk
            chunk.getOrCreateSubChunk(0).setBlock(0, 0, 0, block, 0);
            // @ts-expect-error nor one from getSubChunks
            chunk.getSubChunks().get(0)?.setBlock(0, 0, 0, block, 0);
            for (const [, subChunk] of chunk.getSubChunkEntries()) {
                // @ts-expect-error nor one from getSubChunkEntries
                subChunk.setBlock(0, 0, 0, block, 0);
                // @ts-expect-error its storages have no setBlock
                subChunk.getStorages()[0]?.setBlock(0, 0, 0, block);
                // @ts-expect-error and no pack
                subChunk.getStorages()[0]?.pack();
                // @ts-expect-error the version it is written back in is the chunk's to keep
                subChunk.sourceVersion = 8;
            }
            for (const { subChunk } of chunk.getPersistenceChanges().subChunks) {
                // @ts-expect-error a save's write plan hands out the same view
                subChunk?.setBlock(0, 0, 0, block, 0);
            }
            for (const { subChunk } of chunk.networkSerializeBlobs().subChunks) {
                // @ts-expect-error and so do the network blobs
                subChunk.setBlock(0, 0, 0, block, 0);
            }
            const biomes = chunk.getBiomes();
            // @ts-expect-error the biome column has no set
            biomes.set(0, 0, 0, 1);
            // @ts-expect-error no fillSection
            biomes.fillSection(0, 1);
            // @ts-expect-error no setSection
            biomes.setSection(0, 1);
            // @ts-expect-error no fillColumn
            biomes.fillColumn(0, 0, 1);
        };

        expect(writesAroundTheChunk).toBeTypeOf('function');
    });

    it('returns the sub chunk that is there from getOrCreateSubChunk, and keeps its blocks', () => {
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        const chunk = new Chunk(0, 0);
        chunk.setBlockRuntimeId(1, 2, 3, stone);
        const existing = chunk.getSubChunk(0);

        expect(chunk.getOrCreateSubChunk(0)).toBe(existing);
        expect(chunk.getBlockRuntimeId(1, 2, 3)).toBe(stone);
    });
});
