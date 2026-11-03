import { ChunkSampler, RandomState, WorldgenData } from '@jsprismarine/worldgen';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import type { JavaColumnRun } from './goldens.ts';
import { loadJavaColumns, loadJavaWorldgenRegistries } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';
import { reportParityCases } from './trackerCases.ts';

/**
 * Phase 4's terrain half, as far as the repository's reference data reaches.
 *
 * The exit criterion names a reference region. No capture job generates one yet, so the
 * reference here is the set of whole overworld columns the worldgen oracle dumped out of Java
 * 26.3 at seed 1234, aquifers applied. Each column gives three rows the criterion names: the block at
 * every height, the heightmap value, and the set of block types the column holds, which is its
 * terrain class.
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

interface TerrainParityCase {
    readonly id: string;
    readonly title: string;
    readonly context: string;
    readonly gaps: string[];
    readonly details: string[];
}

const compareTerrain = (
    generatedFunctions: boolean
): {
    gaps: string[];
    columns: number;
    heights: number;
    detail: string[];
    cases: TerrainParityCase[];
} => {
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
    const state = new RandomState(data, BigInt(vectors.seed), settings, { generatedFunctions });
    const sampler = new ChunkSampler(state, { chunkX: vectors.chunkX, chunkZ: vectors.chunkZ });

    const gaps: string[] = [];
    const detail: string[] = [];
    const cases: TerrainParityCase[] = [];
    let heights = 0;

    for (const column of vectors.columns) {
        const expected = expand(column.runs);
        const found = sampler.column(column.x, column.z).map((entry) => entry.state);
        heights += expected.length;
        const at = `${column.x},${column.z}`;
        const caseGaps: string[] = [];
        const caseDetails: string[] = [];

        if (found.join('\u0000') !== expected.join('\u0000')) {
            const gap = `blocks:${at}`;
            gaps.push(gap);
            caseGaps.push(gap);
            const first = found.findIndex((block, index) => block !== expected[index]);
            const mismatch = `column ${at} first differs at y ${vectors.minY + first}: server ${found[first]}, Java ${expected[first]}`;
            detail.push(mismatch);
            caseDetails.push(mismatch);
        }

        const foundHeight = heightmapOf(found, vectors.minY);
        const expectedHeight = heightmapOf(expected, vectors.minY);
        if (foundHeight !== expectedHeight) {
            const gap = `heightmap:${at}`;
            gaps.push(gap);
            caseGaps.push(gap);
            const mismatch = `column ${at} heightmap: server ${foundHeight}, Java ${expectedHeight}`;
            detail.push(mismatch);
            caseDetails.push(mismatch);
        }

        const foundClasses = [...new Set(found)].sort().join(' ');
        const expectedClasses = [...new Set(expected)].sort().join(' ');
        if (foundClasses !== expectedClasses) {
            const gap = `terrain-class:${at}`;
            gaps.push(gap);
            caseGaps.push(gap);
            const mismatch = `column ${at} terrain class: server [${foundClasses}], Java [${expectedClasses}]`;
            detail.push(mismatch);
            caseDetails.push(mismatch);
        }

        cases.push({
            id: at,
            title: `column ${at}`,
            context: `Java terrain blocks · ${expectedClasses}`,
            gaps: caseGaps,
            details: caseDetails
        });
    }

    return { gaps, columns: vectors.columns.length, heights, detail, cases };
};

describeFamily(FAMILIES.worldgenTerrain, [REFERENCES.worldgenRegistries, REFERENCES.worldgenColumns], () => {
    const closure = compareTerrain(false);
    const generated = compareTerrain(true);
    const closureVerdict = checkAllowList(FAMILIES.worldgenTerrain, closure.gaps);
    const generatedVerdict = checkAllowList(FAMILIES.worldgenTerrain, generated.gaps);
    const unexpected = new Set([...closureVerdict.unexpected, ...generatedVerdict.unexpected]);
    const generatedCases = new Map(generated.cases.map((entry) => [entry.id, entry]));

    reportParityCases(
        FAMILIES.worldgenTerrain,
        import.meta.filename,
        closure.cases.map(({ id, title, context, gaps: caseGaps, details }) => {
            const generatedCase = generatedCases.get(id);
            if (!generatedCase) throw new Error(`Generated parity omitted terrain column ${id}`);
            const allGaps = [...new Set([...caseGaps, ...generatedCase.gaps])];
            const allDetails = [...details, ...generatedCase.details];
            const disagrees =
                caseGaps.join('\0') !== generatedCase.gaps.join('\0') ||
                details.join('\0') !== generatedCase.details.join('\0');
            return {
                id,
                title,
                context,
                status: disagrees || allGaps.some((gap) => unexpected.has(gap)) ? 'failed' : 'passed',
                ...(allDetails.length === 0 ? {} : { details: allDetails.join('; ') })
            };
        })
    );

    it('generates the blocks, heightmap and terrain class Java generates with both density evaluators', () => {
        expect(closureVerdict.unexpected, closure.detail.join('\n')).toEqual([]);
        expect(generatedVerdict.unexpected, generated.detail.join('\n')).toEqual([]);
        expect(generated.gaps).toEqual(closure.gaps);
    });

    it('carries no stale allow-list entry', () => {
        expect(closureVerdict.stale).toEqual([]);
        expect(generatedVerdict.stale).toEqual([]);
    });

    it('covers each whole reference column, floor to sky', () => {
        reportParityProgress(FAMILIES.worldgenTerrain, {
            javaColumns: closure.columns,
            blockPositions: closure.heights
        });
        expect(closure.columns).toBeGreaterThan(0);
        expect(closure.heights).toBe(closure.columns * loadJavaColumns().height);
        expect(generated.columns).toBe(closure.columns);
        expect(generated.heights).toBe(closure.heights);
    });

    it('samples every Java terrain reference position identically in density volumes', () => {
        const vectors = loadJavaColumns();
        const registries = loadJavaWorldgenRegistries();
        const parse = (documents: Record<string, string>): Map<string, unknown> =>
            new Map(Object.entries(documents).map(([id, document]) => [id, JSON.parse(document) as unknown]));
        const data = new WorldgenData({
            densityFunctions: parse(registries.densityFunctions),
            noises: parse(registries.noises),
            noiseSettings: parse(registries.noiseSettings)
        });
        const state = new RandomState(data, BigInt(vectors.seed), data.settings(vectors.settings));
        const node = state.settings.noiseRouter.finalDensity;
        const scalar = state.sampler(node);
        const volumeSampler = state.volumeSampler(node);

        for (const column of vectors.columns) {
            const volume = {
                minX: column.x,
                minY: vectors.minY,
                minZ: column.z,
                sizeX: 1,
                sizeY: vectors.height,
                sizeZ: 1
            };
            const actual = new Float64Array(vectors.height);
            const context = state.createContext();
            context.interpolationBuffersEnabled = true;
            volumeSampler.sample(context, volume, actual);

            const scalarContext = state.createContext();
            scalarContext.interpolationBuffersEnabled = true;
            for (let offset = 0; offset < vectors.height; offset++) {
                const y = vectors.minY + offset;
                expect(actual[offset], `density at ${column.x},${y},${column.z}`).toBe(
                    scalar(scalarContext, column.x, y, column.z)
                );
            }
        }
    });
});
