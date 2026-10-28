import { describe, expect, it } from 'vitest';

import { FAMILIES } from '../families.ts';
import { reportParityProgress } from '../progress.ts';
import { CORPUS_CHUNKS, CORPUS_SEEDS, STRUCTURE_SCAN_CHUNKS, STRUCTURE_SCAN_RADIUS, WHOLE_CHUNKS } from './plan.ts';

// The corpus is only worth its runtime if it is varied, so the variety is asserted rather than
// described. Each check here is a property of the plan, not a count somebody typed twice.
describe('the generation corpus plan', () => {
    it('gives every chunk a unique id built from its seed, position and tier', () => {
        const ids = CORPUS_CHUNKS.map((entry) => entry.id);

        expect(new Set(ids).size).toBe(ids.length);
        for (const entry of CORPUS_CHUNKS) {
            expect(entry.id).toBe(`${entry.seed}/${entry.chunkX},${entry.chunkZ}/${entry.tier}`);
        }
    });

    it('says what each chunk is in the corpus for', () => {
        for (const entry of CORPUS_CHUNKS) expect(entry.why.length, entry.id).toBeGreaterThan(20);
    });

    it('runs both tiers at every seed group and keeps a few chunks whole', () => {
        const seeds = new Set(CORPUS_CHUNKS.map((entry) => entry.seed));

        expect(seeds).toEqual(new Set(Object.values(CORPUS_SEEDS)));
        expect(WHOLE_CHUNKS.length).toBeLessThan(CORPUS_CHUNKS.length / 4);
        for (const seed of seeds) {
            const tiers = new Set(CORPUS_CHUNKS.filter((entry) => entry.seed === seed).map((entry) => entry.tier));
            expect(tiers).toEqual(new Set(['terrain', 'full']));
        }

        reportParityProgress(FAMILIES.worldgenCorpus, {
            terrainChunks: CORPUS_CHUNKS.filter((entry) => entry.tier === 'terrain').length,
            fullChunks: CORPUS_CHUNKS.filter((entry) => entry.tier === 'full').length,
            wholeChunks: WHOLE_CHUNKS.length
        });
    });

    it('keeps a whole chunk of each tier, so a failure in either can be read', () => {
        expect(new Set(WHOLE_CHUNKS.map((entry) => entry.tier))).toEqual(new Set(['terrain', 'full']));
    });

    it('covers coordinates far from the origin and on both sides of each axis', () => {
        const xs = CORPUS_CHUNKS.map((entry) => entry.chunkX);
        const zs = CORPUS_CHUNKS.map((entry) => entry.chunkZ);

        expect(Math.min(...xs)).toBeLessThan(0);
        expect(Math.max(...xs)).toBeGreaterThan(0);
        expect(Math.min(...zs)).toBeLessThan(0);
        expect(Math.max(...zs)).toBeGreaterThan(0);
    });

    it('derives the structure scan size from its radius rather than restating it', () => {
        expect(STRUCTURE_SCAN_CHUNKS).toBe(
            new Set(Object.values(CORPUS_SEEDS)).size * (2 * STRUCTURE_SCAN_RADIUS) ** 2
        );
    });
});
