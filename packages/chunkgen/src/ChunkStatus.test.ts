import { describe, expect, it } from 'vitest';

import type { ChunkStatus } from './ChunkStatus';
import {
    CHUNK_STATUSES,
    indexOfStatus,
    isChunkStatus,
    isOrAfter,
    isOrBefore,
    maxStatus,
    parentOfStatus,
    statusAtIndex,
    storageKindOf,
    UnknownChunkStatusError
} from './ChunkStatus';

describe('the ten statuses', () => {
    it('is the list ChunkStatus registers in 26.3, in registration order', () => {
        expect([...CHUNK_STATUSES]).toEqual([
            'empty',
            'structure_starts',
            'structure_references',
            'biomes',
            'terrain',
            'features',
            'initialize_light',
            'light',
            'spawn',
            'full'
        ]);
    });

    it('keeps initialize_light, light and spawn even though no body runs in them yet', () => {
        // Collapsing the three would shift every accumulated radius by one and turn the step
        // table from a transcription into a derivation nobody can check against the jar.
        expect(CHUNK_STATUSES).toHaveLength(10);
        expect(indexOfStatus('full') - indexOfStatus('features')).toBe(4);
    });

    it('indexes empty at 0 and full at 9', () => {
        expect(indexOfStatus('empty')).toBe(0);
        expect(indexOfStatus('full')).toBe(9);
    });

    it('is a chain, so every status but empty has the status below it as its parent', () => {
        expect(parentOfStatus('empty')).toBeUndefined();
        for (let index = 1; index < CHUNK_STATUSES.length; index++) {
            expect(parentOfStatus(statusAtIndex(index))).toBe(statusAtIndex(index - 1));
        }
    });

    it('compares as integers in both directions', () => {
        expect(isOrAfter('terrain', 'biomes')).toBe(true);
        expect(isOrAfter('terrain', 'terrain')).toBe(true);
        expect(isOrAfter('biomes', 'terrain')).toBe(false);
        expect(isOrBefore('biomes', 'terrain')).toBe(true);
        expect(isOrBefore('terrain', 'terrain')).toBe(true);
        expect(isOrBefore('features', 'terrain')).toBe(false);
    });

    it('takes the higher of two statuses, which is how overlapping requirements merge', () => {
        expect(maxStatus('structure_starts', 'biomes')).toBe('biomes');
        expect(maxStatus('biomes', 'structure_starts')).toBe('biomes');
        expect(maxStatus('light', 'light')).toBe('light');
    });

    it('is a proto chunk at every status below full and a level chunk at full', () => {
        for (const status of CHUNK_STATUSES) {
            expect(storageKindOf(status)).toBe(status === 'full' ? 'level_chunk' : 'proto_chunk');
        }
    });

    it('narrows a persisted value and rejects anything else', () => {
        expect(isChunkStatus('terrain')).toBe(true);
        expect(isChunkStatus('noise')).toBe(false);
        expect(isChunkStatus(4)).toBe(false);
        expect(isChunkStatus(undefined)).toBe(false);
    });

    it('names the rejected value rather than returning a fallback status', () => {
        // The only values that reach here come from disk or from a worker message, where a
        // fallback would turn a format change into a wrong chunk.
        const notAStatus = 'noise';
        expect(() => indexOfStatus(notAStatus as ChunkStatus)).toThrow(UnknownChunkStatusError);
        expect(() => indexOfStatus(notAStatus as ChunkStatus)).toThrow(/"noise" is not a chunk status/);
        expect(() => statusAtIndex(10)).toThrow(UnknownChunkStatusError);
    });
});
