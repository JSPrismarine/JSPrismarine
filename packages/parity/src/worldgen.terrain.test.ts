import { ChunkSampler, RandomState, WorldgenData } from '@jsprismarine/worldgen';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import type { JavaColumnRun } from './goldens.ts';
import { loadJavaColumns, loadJavaWorldgenRegistries } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * Phase 4's terrain half, as far as the repository's reference data reaches.
 *
 * The exit criterion names a reference region. No capture job generates one yet, so the
 * reference here is the nine whole overworld columns the worldgen oracle dumped out of Java
 * 26.3 at seed 1234, aquifers applied. Each column gives three rows the criterion names: the
 * block at every one of the 384 heights, the heightmap value, and the set of block types the
 * column holds, which is its terrain class.
 *
 * Gap ids: `blocks:<x>,<z>` where any height disagrees, `heightmap:<x>,<z>` where the highest
 * non-air block sits elsewhere, and `terrain-class:<x>,<z>` where the column holds a different
 * set of block types.
 */

/** The highest y holding anything but air, or the column floor when the column is empty. */
const heightmapOf = (blocks: readonly string[], minY: number): number => {
    for (let index = blocks.length - 1; index >= 0; index--) {
        if (blocks[index] !== 'minecraft:air') return minY + index;
    }
    return minY;
};

/** Expands the dumped runs back into one block identifier per height. */
const expand = (runs: readonly JavaColumnRun[]): string[] =>
    runs.flatMap((run) => Array.from({ length: run.count }, () => run.block));

const compareTerrain = (): { gaps: string[]; columns: number; heights: number; detail: string[] } => {
    const vectors = loadJavaColumns();
    const registries = loadJavaWorldgenRegistries();
    const parse = (documents: Record<string, string>): Map<string, unknown> =>
        // The oracle writes each registry document as one line of JSON.
        new Map(Object.entries(documents).map(([id, document]) => [id, JSON.parse(document) as unknown]));

    const data = new WorldgenData({
        densityFunctions: parse(registries.densityFunctions),
        noises: parse(registries.noises),
        noiseSettings: parse(registries.noiseSettings)
    });
    const settings = data.settings(vectors.settings);
    const state = new RandomState(data, BigInt(vectors.seed), settings);
    const sampler = new ChunkSampler(state, { chunkX: vectors.chunkX, chunkZ: vectors.chunkZ });

    const gaps: string[] = [];
    const detail: string[] = [];
    let heights = 0;

    for (const column of vectors.columns) {
        const expected = expand(column.runs);
        const found = sampler.column(column.x, column.z).map((entry) => entry.state);
        heights += expected.length;
        const at = `${column.x},${column.z}`;

        if (found.join('\u0000') !== expected.join('\u0000')) {
            gaps.push(`blocks:${at}`);
            const first = found.findIndex((block, index) => block !== expected[index]);
            detail.push(
                `column ${at} first differs at y ${vectors.minY + first}: server ${found[first]}, Java ${expected[first]}`
            );
        }

        const foundHeight = heightmapOf(found, vectors.minY);
        const expectedHeight = heightmapOf(expected, vectors.minY);
        if (foundHeight !== expectedHeight) {
            gaps.push(`heightmap:${at}`);
            detail.push(`column ${at} heightmap: server ${foundHeight}, Java ${expectedHeight}`);
        }

        const foundClasses = [...new Set(found)].sort().join(' ');
        const expectedClasses = [...new Set(expected)].sort().join(' ');
        if (foundClasses !== expectedClasses) {
            gaps.push(`terrain-class:${at}`);
            detail.push(`column ${at} terrain class: server [${foundClasses}], Java [${expectedClasses}]`);
        }
    }

    return { gaps, columns: vectors.columns.length, heights, detail };
};

describeFamily(FAMILIES.worldgenTerrain, [REFERENCES.worldgenRegistries, REFERENCES.worldgenColumns], () => {
    const { gaps, columns, heights, detail } = compareTerrain();
    const verdict = checkAllowList(FAMILIES.worldgenTerrain, gaps);

    it('generates the blocks, heightmap and terrain class Java generates', () => {
        expect(verdict.unexpected, detail.join('\n')).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('covers whole columns of the reference chunk, floor to sky', () => {
        expect(columns).toBe(9);
        expect(heights).toBe(columns * loadJavaColumns().height);
    });
});
