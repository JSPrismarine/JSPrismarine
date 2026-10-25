/**
 * Compares a fresh capture against the committed golden and says where the two disagree.
 *
 * A moved hash is a useless failure report. Every comparison here narrows the answer as far as
 * the golden allows: a chunk's twenty-four section digests put a block change inside a sixteen
 * block band of y, the census names which block states gained or lost, and for the chunks the
 * golden keeps whole the report gives the first differing block by coordinate with both state
 * names. That is the difference between "the generator changed" and "the generator put
 * `minecraft:dirt` where `minecraft:gravel` was at 208,71,208".
 *
 * The comparison is pure, so it has unit tests that need no Java data and no generated chunk.
 */
import type { ChunkDigest, GenerationCorpusGolden, StructurePlacement, WholeChunkSample } from './golden.ts';

/** What a comparison found: ids for the allow list, and lines a human reads. */
export interface CorpusDiff {
    /** One id per disagreement, which is what `checkAllowList` is given. */
    readonly gaps: string[];
    /** One line per disagreement, naming where it is. */
    readonly detail: string[];
}

/** The half of a capture the chunk comparison reads. */
export interface CapturedChunks {
    readonly chunks: readonly ChunkDigest[];
    readonly samples: readonly WholeChunkSample[];
}

const byId = <T extends { readonly id: string }>(entries: readonly T[]): Map<string, T> =>
    new Map(entries.map((entry) => [entry.id, entry]));

/** Expands alternating value and run length back into one entry per position. */
export const decodeRuns = (runs: readonly number[]): number[] => {
    const values: number[] = [];
    for (let at = 0; at + 1 < runs.length; at += 2) {
        for (let repeat = 0; repeat < runs[at + 1]!; repeat++) values.push(runs[at]!);
    }
    return values;
};

/**
 * The first position where two whole-chunk samples hold a different block, as a sentence.
 *
 * @param minY - The dimension floor, so the reported y is a world coordinate.
 * @returns The sentence, or undefined when the two samples agree block for block.
 */
export const firstBlockDifference = (
    golden: WholeChunkSample,
    found: WholeChunkSample,
    minY: number,
    layer: 'blocks' | 'liquids' = 'blocks'
): string | undefined => {
    const named = layer === 'blocks' ? 'the block layer' : 'the liquid layer';
    const expected = decodeRuns(golden[layer]);
    const actual = decodeRuns(found[layer]);
    if (expected.length !== actual.length) {
        return `${named} holds ${actual.length} blocks, the golden holds ${expected.length}`;
    }

    const height = expected.length / 256;
    for (const [at, value] of expected.entries()) {
        if (actual[at] === value) continue;

        const column = Math.floor(at / height);
        const x = Math.floor(column / 16);
        const z = column % 16;
        const y = minY + (at % height);
        return (
            `${named} first differs at ${x},${y},${z} within the chunk: ` +
            `found ${found.palette[actual[at]!]}, golden ${golden.palette[value]}`
        );
    }

    return undefined;
};

/** The sixteen block band each differing section digest covers. */
const differingSections = (golden: ChunkDigest, found: ChunkDigest, minY: number): string[] => {
    const bands: string[] = [];
    const sections = Math.max(golden.digests.sections.length, found.digests.sections.length);
    for (let section = 0; section < sections; section++) {
        if (golden.digests.sections[section] === found.digests.sections[section]) continue;
        bands.push(`y ${minY + section * 16}..${minY + section * 16 + 15}`);
    }
    return bands;
};

/** The block states whose count moved, worst first, as `state golden->found` phrases. */
export const censusDelta = (
    golden: Readonly<Record<string, number>>,
    found: Readonly<Record<string, number>>
): string[] =>
    [...new Set([...Object.keys(golden), ...Object.keys(found)])]
        .map((state) => ({ state, was: golden[state] ?? 0, now: found[state] ?? 0 }))
        .filter((row) => row.was !== row.now)
        .sort((left, right) => Math.abs(right.now - right.was) - Math.abs(left.now - left.was))
        .map((row) => `${row.state} ${row.was}->${row.now}`);

/**
 * Compares the per-chunk digests.
 *
 * Gap ids are `blocks:<chunk>`, `liquids:<chunk>`, `biomes:<chunk>`, `heightmap:<chunk>`,
 * `block-entities:<chunk>`, `entity-spawns:<chunk>`, plus `missing:<chunk>` and `extra:<chunk>`
 * when the plan and the golden disagree about which chunks exist.
 */
export const diffChunks = (golden: GenerationCorpusGolden, found: CapturedChunks): CorpusDiff => {
    const gaps: string[] = [];
    const detail: string[] = [];
    const expected = byId(golden.chunks);
    const actual = byId(found.chunks);
    const goldenSamples = byId(golden.samples);
    const foundSamples = byId(found.samples);

    for (const id of expected.keys()) {
        if (actual.has(id)) continue;
        gaps.push(`missing:${id}`);
        detail.push(`${id} is in the golden and the capture did not produce it`);
    }
    for (const id of actual.keys()) {
        if (expected.has(id)) continue;
        gaps.push(`extra:${id}`);
        detail.push(`${id} was captured and the golden has no row for it`);
    }

    for (const [id, was] of expected) {
        const now = actual.get(id);
        if (now === undefined) continue;

        if (was.digests.blocks !== now.digests.blocks) {
            gaps.push(`blocks:${id}`);
            const bands = differingSections(was, now, golden.dimension.minY);
            const sample = goldenSamples.get(id);
            const captured = foundSamples.get(id);
            const where =
                sample !== undefined && captured !== undefined
                    ? firstBlockDifference(sample, captured, golden.dimension.minY)
                    : undefined;
            detail.push(
                `${id} blocks differ in ${bands.length} of ${was.digests.sections.length} sections ` +
                    `(${bands.join(', ')})${where === undefined ? '' : `; ${where}`}`
            );
            const moved = censusDelta(was.census, now.census);
            if (moved.length > 0) detail.push(`${id} census: ${moved.slice(0, 12).join(', ')}`);
        }

        if (was.digests.liquids !== now.digests.liquids) {
            gaps.push(`liquids:${id}`);
            const sample = goldenSamples.get(id);
            const captured = foundSamples.get(id);
            const where =
                sample !== undefined && captured !== undefined
                    ? firstBlockDifference(sample, captured, golden.dimension.minY, 'liquids')
                    : undefined;
            detail.push(`${id} liquid layer differs${where === undefined ? '' : `; ${where}`}`);
        }

        if (was.digests.biomes !== now.digests.biomes) {
            gaps.push(`biomes:${id}`);
            detail.push(`${id} biome cells differ`);
        }

        if (was.digests.heightmap !== now.digests.heightmap) {
            gaps.push(`heightmap:${id}`);
            detail.push(`${id} heightmap differs`);
        }

        if (was.digests.blockEntities !== now.digests.blockEntities) {
            gaps.push(`block-entities:${id}`);
            detail.push(`${id} block entities differ: ${was.blockEntities} in the golden, ${now.blockEntities} found`);
        }

        if (was.digests.entitySpawns !== now.digests.entitySpawns) {
            gaps.push(`entity-spawns:${id}`);
            detail.push(`${id} entity spawns differ: ${was.entitySpawns} in the golden, ${now.entitySpawns} found`);
        }
    }

    return { gaps, detail };
};

/**
 * Compares the block census of the decorated chunks, which is what the feature pass placed.
 *
 * Gap ids are `block-count:<state>` for a state whose total moved, `census:<chunk>` for a
 * decorated chunk whose own census moved.
 */
export const diffCensus = (golden: GenerationCorpusGolden, found: CapturedChunks): CorpusDiff => {
    const gaps: string[] = [];
    const detail: string[] = [];

    const totals: Record<string, number> = {};
    for (const chunk of found.chunks) {
        if (chunk.tier !== 'full') continue;
        for (const [state, count] of Object.entries(chunk.census)) totals[state] = (totals[state] ?? 0) + count;
    }

    for (const moved of censusDelta(golden.blockCounts, totals)) {
        gaps.push(`block-count:${moved.slice(0, moved.indexOf(' '))}`);
        detail.push(`across the decorated chunks, ${moved}`);
    }

    const actual = byId(found.chunks);
    for (const was of golden.chunks) {
        const now = actual.get(was.id);
        if (now === undefined) continue;

        const moved = censusDelta(was.census, now.census);
        if (moved.length === 0) continue;
        gaps.push(`census:${was.id}`);
        detail.push(`${was.id}: ${moved.slice(0, 12).join(', ')}`);
    }

    return { gaps, detail };
};

const placementKey = (placement: StructurePlacement): string =>
    `${placement.seed}/${placement.structure}@${placement.chunkX},${placement.chunkZ}`;

/**
 * Compares the structure placements the scan found.
 *
 * Gap ids are `structure-gone:<key>` and `structure-new:<key>` for a start that moved in or out,
 * `structure-box:<key>` for one whose pieces now cover a different volume, and
 * `unbuilt-structure-type:<type>` for a structure type whose builder appeared or disappeared.
 */
export const diffStructures = (
    golden: GenerationCorpusGolden,
    found: { readonly structures: readonly StructurePlacement[]; readonly unbuiltStructureTypes: readonly string[] }
): CorpusDiff => {
    const gaps: string[] = [];
    const detail: string[] = [];
    const expected = new Map(golden.structures.map((placement) => [placementKey(placement), placement]));
    const actual = new Map(found.structures.map((placement) => [placementKey(placement), placement]));

    for (const [key, placement] of expected) {
        if (actual.has(key)) continue;
        gaps.push(`structure-gone:${key}`);
        detail.push(`${key} is in the golden and the scan no longer finds it (set ${placement.set})`);
    }
    for (const key of actual.keys()) {
        if (expected.has(key)) continue;
        gaps.push(`structure-new:${key}`);
        detail.push(`${key} was found and the golden has no start there`);
    }

    for (const [key, was] of expected) {
        const now = actual.get(key);
        if (now === undefined) continue;

        const sameBox = was.box.every((value, at) => value === now.box[at]);
        const sameOrigin = was.origin.every((value, at) => value === now.origin[at]);
        if (sameBox && sameOrigin && was.pieces === now.pieces && was.step === now.step) continue;

        gaps.push(`structure-box:${key}`);
        detail.push(
            `${key} moved: origin ${was.origin.join(',')}->${now.origin.join(',')}, ` +
                `box ${was.box.join(',')}->${now.box.join(',')}, ` +
                `${was.pieces}->${now.pieces} pieces, step ${was.step}->${now.step}`
        );
    }

    const wasUnbuilt = new Set(golden.unbuiltStructureTypes);
    const isUnbuilt = new Set(found.unbuiltStructureTypes);
    for (const type of wasUnbuilt) {
        if (isUnbuilt.has(type)) continue;
        gaps.push(`unbuilt-structure-type:${type}`);
        detail.push(`${type} had no builder when the golden was captured and now has one`);
    }
    for (const type of isUnbuilt) {
        if (wasUnbuilt.has(type)) continue;
        gaps.push(`unbuilt-structure-type:${type}`);
        detail.push(`${type} has no builder and did when the golden was captured`);
    }

    return { gaps, detail };
};
