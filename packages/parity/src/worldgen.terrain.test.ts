import { createHash } from 'node:crypto';

import { ChunkSampler, RandomState, WorldgenData } from '@jsprismarine/worldgen';
import type { RandomStateOptions } from '@jsprismarine/worldgen';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import type { JavaColumnRun, JavaDensityVolumeChunk } from './goldens.ts';
import { loadJavaColumns, loadJavaDensityVolumes, loadJavaWorldgenRegistries } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';
import type { ParityTrackerRecord } from './trackerCases.ts';
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

/** The Java worldgen registries the oracle copied out of the jar, parsed. */
const vanillaWorldgenData = (): WorldgenData => {
    const registries = loadJavaWorldgenRegistries();
    const parse = (documents: Record<string, string>): Map<string, unknown> =>
        // The oracle writes each registry document as one line of JSON.
        new Map(Object.entries(documents).map(([id, document]) => [id, JSON.parse(document) as unknown]));
    return new WorldgenData({
        densityFunctions: parse(registries.densityFunctions),
        noises: parse(registries.noises),
        noiseSettings: parse(registries.noiseSettings)
    });
};

interface TerrainParityCase {
    readonly id: string;
    readonly title: string;
    readonly context: string;
    readonly gaps: string[];
    readonly details: string[];
}

const compareTerrain = (
    options: RandomStateOptions
): {
    gaps: string[];
    columns: number;
    heights: number;
    detail: string[];
    cases: TerrainParityCase[];
} => {
    const vectors = loadJavaColumns();
    const data = vanillaWorldgenData();
    const settings = data.settings(vectors.settings);
    const state = new RandomState(data, BigInt(vectors.seed), settings, options);
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

/** Floats in one 16-block section of a chunk. */
const SECTION_FLOATS = 16 * 16 * 16;

/**
 * Samples `final_density` at every block of one chunk, one block at a time, columns top down, into
 * the layout the oracle hashes: y, then z, then x. This is the path a caller outside the terrain
 * fill takes, and Java's `sampleValue`.
 */
const sampleChunkDensity = (
    data: WorldgenData,
    seed: bigint,
    chunk: JavaDensityVolumeChunk,
    options: RandomStateOptions
): Float32Array => {
    const state = new RandomState(data, seed, data.settings(chunk.settings), options);
    const sample = state.sampler(state.settings.noiseRouter.finalDensity);
    const context = state.createContext();
    const values = new Float32Array(16 * chunk.height * 16);
    for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
            for (let y = chunk.height - 1; y >= 0; y--) {
                values[(y * 16 + z) * 16 + x] = sample(
                    context,
                    chunk.chunkX * 16 + x,
                    chunk.minY + y,
                    chunk.chunkZ * 16 + z
                );
            }
        }
    }
    return values;
};

/**
 * Samples `final_density` over one chunk the way the terrain fill does: cell by cell, with the
 * interpolation buffers on, so each `interpolated` node fills whole cells. This is the path Java's
 * `doFill` takes through `sampleVolume`.
 */
const fillChunkDensity = (
    data: WorldgenData,
    seed: bigint,
    chunk: JavaDensityVolumeChunk,
    options: RandomStateOptions
): Float32Array => {
    const state = new RandomState(data, seed, data.settings(chunk.settings), options);
    const node = state.settings.noiseRouter.finalDensity;
    const sample = state.sampler(node);
    const cell = state.interpolationCellSizeOf(node) ?? { xz: 1, y: 1 };
    const context = state.createContext();
    context.interpolationBuffersEnabled = true;
    const values = new Float32Array(16 * chunk.height * 16);
    for (let cellZ = 0; cellZ < 16; cellZ += cell.xz) {
        for (let cellX = 0; cellX < 16; cellX += cell.xz) {
            for (let cellY = chunk.height - cell.y; cellY >= 0; cellY -= cell.y) {
                for (let z = cellZ; z < cellZ + cell.xz; z++) {
                    for (let x = cellX; x < cellX + cell.xz; x++) {
                        for (let y = cellY + cell.y - 1; y >= cellY; y--) {
                            values[(y * 16 + z) * 16 + x] = sample(
                                context,
                                chunk.chunkX * 16 + x,
                                chunk.minY + y,
                                chunk.chunkZ * 16 + z
                            );
                        }
                    }
                }
            }
        }
    }
    return values;
};

/** SHA-256 of each section's float bits, little-endian, as the oracle writes them. */
const sectionHashes = (values: Float32Array): string[] => {
    const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
    const hashes: string[] = [];
    for (let start = 0; start < values.length; start += SECTION_FLOATS) {
        hashes.push(
            createHash('sha256')
                .update(bytes.subarray(start * 4, (start + SECTION_FLOATS) * 4))
                .digest('hex')
        );
    }
    return hashes;
};

/** The sections where two lists of section hashes disagree. */
const differingSections = (actual: readonly string[], expected: readonly string[]): number[] =>
    actual.flatMap((hash, index) => (hash === expected[index] ? [] : [index]));

/**
 * `final_density` over whole chunks against both of Java's density paths.
 *
 * Gap id `density-volume:<settings>:<x>,<z>` where any section differs from `sampleVolume`, the path
 * `doFill` builds terrain from. A section that differs from `sampleValue`, Java's per-block path,
 * is a regression of what the generator already matches, reported separately.
 */
const compareDensityVolumes = (
    options: RandomStateOptions
): {
    gaps: string[];
    chunks: number;
    sections: number;
    valueRegressions: string[];
    cases: (TerrainParityCase & { sections: number })[];
} => {
    const vectors = loadJavaDensityVolumes();
    const data = vanillaWorldgenData();
    const seed = BigInt(vectors.seed);
    const gaps: string[] = [];
    const valueRegressions: string[] = [];
    const cases: (TerrainParityCase & { sections: number })[] = [];
    let sections = 0;

    for (const chunk of vectors.chunks) {
        const at = `${chunk.settings}:${chunk.chunkX},${chunk.chunkZ}`;
        const perBlock = sectionHashes(sampleChunkDensity(data, seed, chunk, options));
        const filled = sectionHashes(fillChunkDensity(data, seed, chunk, options));
        sections += filled.length;
        const caseGaps: string[] = [];
        const caseDetails: string[] = [];

        const fromValue = differingSections(perBlock, chunk.sampleValue);
        if (fromValue.length > 0) {
            valueRegressions.push(`${at} differs from sampleValue in sections ${fromValue.join(', ')}`);
        }

        const fromVolume = differingSections(filled, chunk.sampleVolume);
        if (fromVolume.length > 0) {
            const gap = `density-volume:${at}`;
            gaps.push(gap);
            caseGaps.push(gap);
            caseDetails.push(
                `sections ${fromVolume.join(', ')} of ${filled.length} differ from sampleVolume in the last bits`
            );
        }

        cases.push({
            id: `density-volume:${at}`,
            title: `final_density over chunk ${chunk.chunkX}, ${chunk.chunkZ} (${chunk.settings})`,
            context: "Java's sampleVolume bits, per 16-block section",
            gaps: caseGaps,
            details: caseDetails,
            sections: filled.length
        });
    }

    return { gaps, chunks: vectors.chunks.length, sections, valueRegressions, cases };
};

describeFamily(
    FAMILIES.worldgenTerrain,
    [REFERENCES.worldgenRegistries, REFERENCES.worldgenColumns, REFERENCES.worldgenDensityVolumes],
    () => {
        // Noise runs in @jsprismarine/native-worldgen wherever its library loads, and in TypeScript
        // otherwise. The TypeScript run holds the fallback to Java too, so both paths stay exact.
        const closure = compareTerrain({ generatedFunctions: false });
        const generated = compareTerrain({ generatedFunctions: true });
        const typescriptNoise = compareTerrain({ generatedFunctions: false, nativeNoise: false });
        const density = compareDensityVolumes({});
        const typescriptDensity = compareDensityVolumes({ nativeNoise: false });
        const densityGaps = [...new Set([...density.gaps, ...typescriptDensity.gaps])];
        const closureVerdict = checkAllowList(FAMILIES.worldgenTerrain, [...closure.gaps, ...densityGaps]);
        const generatedVerdict = checkAllowList(FAMILIES.worldgenTerrain, [...generated.gaps, ...densityGaps]);
        const typescriptVerdict = checkAllowList(FAMILIES.worldgenTerrain, [...typescriptNoise.gaps, ...densityGaps]);
        const unexpected = new Set([
            ...closureVerdict.unexpected,
            ...generatedVerdict.unexpected,
            ...typescriptVerdict.unexpected
        ]);
        const generatedCases = new Map(generated.cases.map((entry) => [entry.id, entry]));
        const typescriptCases = new Map(typescriptNoise.cases.map((entry) => [entry.id, entry]));
        const typescriptDensityGaps = new Map(typescriptDensity.cases.map((entry) => [entry.id, entry.gaps]));

        reportParityCases(
            FAMILIES.worldgenTerrain,
            import.meta.filename,
            closure.cases
                .map(({ id, title, context, gaps: caseGaps, details }): ParityTrackerRecord => {
                    const generatedCase = generatedCases.get(id);
                    const typescriptCase = typescriptCases.get(id);
                    if (!generatedCase || !typescriptCase)
                        throw new Error(`A parity path omitted terrain column ${id}`);
                    const allGaps = [...new Set([...caseGaps, ...generatedCase.gaps, ...typescriptCase.gaps])];
                    const allDetails = [...new Set([...details, ...generatedCase.details, ...typescriptCase.details])];
                    const disagrees = [generatedCase, typescriptCase].some(
                        (other) =>
                            caseGaps.join('\0') !== other.gaps.join('\0') ||
                            details.join('\0') !== other.details.join('\0')
                    );
                    return {
                        id,
                        title,
                        context,
                        status: disagrees || allGaps.some((gap) => unexpected.has(gap)) ? 'failed' : 'passed',
                        ...(allDetails.length === 0 ? {} : { details: allDetails.join('; ') })
                    };
                })
                .concat(
                    density.cases.map(({ id, title, context, gaps: caseGaps, details }): ParityTrackerRecord => {
                        const typescriptGaps = typescriptDensityGaps.get(id) ?? [];
                        const allGaps = [...new Set([...caseGaps, ...typescriptGaps])];
                        return {
                            id,
                            title,
                            context,
                            status:
                                allGaps.some((gap) => unexpected.has(gap)) ||
                                caseGaps.join('\0') !== typescriptGaps.join('\0')
                                    ? 'failed'
                                    : allGaps.length > 0
                                      ? 'deferred'
                                      : 'passed',
                            ...(details.length === 0 ? {} : { details: details.join('; ') })
                        };
                    })
                )
        );

        it('generates the blocks, heightmap and terrain class Java generates with both density evaluators', () => {
            expect(closureVerdict.unexpected, closure.detail.join('\n')).toEqual([]);
            expect(generatedVerdict.unexpected, generated.detail.join('\n')).toEqual([]);
            expect(generated.gaps).toEqual(closure.gaps);
        });

        it('generates the same terrain with noise in the native library and in TypeScript', () => {
            expect(typescriptVerdict.unexpected, typescriptNoise.detail.join('\n')).toEqual([]);
            expect(typescriptNoise.gaps).toEqual(closure.gaps);
            expect(typescriptDensity.gaps).toEqual(density.gaps);
            expect(typescriptDensity.valueRegressions).toEqual([]);
        });

        it("keeps final_density on Java's per-block path in every section of every captured chunk", () => {
            expect(density.valueRegressions).toEqual([]);
            expect(density.chunks).toBeGreaterThan(0);
            expect(density.sections).toBe(
                loadJavaDensityVolumes().chunks.reduce((total, chunk) => total + chunk.height / 16, 0)
            );
        });

        it('carries no stale allow-list entry', () => {
            expect(closureVerdict.stale).toEqual([]);
            expect(generatedVerdict.stale).toEqual([]);
            expect(typescriptVerdict.stale).toEqual([]);
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
    }
);
