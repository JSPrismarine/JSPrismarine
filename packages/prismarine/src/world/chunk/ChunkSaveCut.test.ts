import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { Dimensions } from '../DimensionType';
import { ChunkBiomes } from './ChunkBiomes';
import Chunk from './Chunk';
import type { ChunkSaveCutHook } from './Chunk';

/** A hook that records what it was told, in order. */
const recordingHook = (): ChunkSaveCutHook & { calls: string[] } => {
    const calls: string[] = [];
    return {
        calls,
        beforeSubChunkWrite: (index) => calls.push(`sub chunk ${index}`),
        beforeBiomeWrite: () => calls.push('biomes'),
        finish: () => calls.push('finish')
    };
};

const stone = () => BlockRuntimeIds.getByName('minecraft:stone');

describe('a chunk held by a save cut', () => {
    it('runs the hook before every write reaches a sub chunk, with that sub chunk', () => {
        const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
        const hook = recordingHook();
        chunk.setSaveCut(hook);

        chunk.setBlockRuntimeId(0, 70, 0, stone());
        chunk.restoreBlockRuntimeId(0, -10, 0, stone());
        chunk.fillColumn(1, 1, 14, 17, stone());
        chunk.setBiomes(new ChunkBiomes(Dimensions.Overworld));

        // Twice for each section the write creates, since creating it is a write to it too.
        expect(hook.calls).toEqual([
            'sub chunk 4',
            'sub chunk 4',
            'sub chunk -1',
            'sub chunk -1',
            'sub chunk 0',
            'sub chunk 0',
            'sub chunk 1',
            'sub chunk 1',
            'biomes'
        ]);
    });

    it('runs no hook once the cut has let go', () => {
        const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
        const hook = recordingHook();
        chunk.setSaveCut(hook);
        chunk.setSaveCut(null);

        chunk.setBlockRuntimeId(0, 70, 0, stone());
        expect(hook.calls).toEqual([]);
    });

    it('stays dirty when marked saved as it was before a later write', () => {
        const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
        chunk.setBlockRuntimeId(0, 70, 0, stone());
        const atCut = chunk.persistedStateNow();
        chunk.setBlockRuntimeId(0, 20, 0, stone());

        chunk.markSavedAs(atCut);

        expect(chunk.getHasChanged()).toBe(true);
        // The write after the cut is what the next save finds to write: one sub chunk.
        expect(chunk.getPersistenceChanges().subChunks.map(({ index }) => index)).toEqual([1]);
    });

    it('keeps the newer saved state when a pass that cut it earlier commits after it', () => {
        const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
        chunk.setBlockRuntimeId(0, 70, 0, stone());
        const atCut = chunk.persistedStateNow();
        chunk.setBlockRuntimeId(0, 20, 0, stone());
        // A write of the chunk as it is now, held after the cut, such as the unload pass's.
        chunk.markSavedAs(chunk.persistedStateNow());

        chunk.markSavedAs(atCut);

        expect(chunk.getHasChanged()).toBe(false);
        expect(chunk.getPersistenceChanges().subChunks).toEqual([]);
    });

    it('asks the cut holding it to finish, and nothing once none does', () => {
        const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
        const hook = recordingHook();
        chunk.setSaveCut(hook);
        chunk.finishSaveCut();
        chunk.setSaveCut(null);
        chunk.finishSaveCut();

        expect(hook.calls).toEqual(['finish']);
    });

    it('is clean when marked saved as it is', () => {
        const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
        chunk.setBlockRuntimeId(0, 70, 0, stone());
        chunk.markSavedAs(chunk.persistedStateNow());

        expect(chunk.getHasChanged()).toBe(false);
        expect(chunk.getPersistenceChanges().subChunks).toEqual([]);
    });
});
