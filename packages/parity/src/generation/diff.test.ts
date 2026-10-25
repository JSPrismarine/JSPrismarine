import { describe, expect, it } from 'vitest';

import type { ChunkDigest, GenerationCorpusGolden, StructurePlacement, WholeChunkSample } from './golden.ts';
import { GENERATION_CORPUS_FORMAT } from './golden.ts';
import { censusDelta, decodeRuns, diffCensus, diffChunks, diffStructures, firstBlockDifference } from './diff.ts';

// The differ is what turns a moved hash into a sentence somebody can act on, so it is tested
// against fixtures rather than only through a four minute generation run. A small height keeps
// the fixtures readable; nothing here depends on the real 384.
const HEIGHT = 32;

const digestsOf = (overrides: Partial<ChunkDigest['digests']> = {}): ChunkDigest['digests'] => ({
    blocks: 'blocks-hash',
    sections: ['section-0', 'section-1'],
    liquids: 'liquids-hash',
    biomes: 'biomes-hash',
    heightmap: 'heightmap-hash',
    blockEntities: 'block-entities-hash',
    entitySpawns: 'entity-spawns-hash',
    ...overrides
});

const chunkOf = (overrides: Partial<ChunkDigest> = {}): ChunkDigest => ({
    id: '1234/0,0/full',
    seed: 1234,
    chunkX: 0,
    chunkZ: 0,
    tier: 'full',
    digests: digestsOf(),
    census: { 'minecraft:stone': 10, 'minecraft:oak_log': 4 },
    blockEntities: 0,
    entitySpawns: 0,
    ...overrides
});

/** A sample whose every column is one run of `palette[0]`, with one block overridden. */
const sampleOf = (palette: readonly string[], override?: { at: number; index: number }): WholeChunkSample => {
    const blocks: number[] = [];
    for (let column = 0; column < 256; column++) {
        if (override === undefined || Math.floor(override.at / HEIGHT) !== column) {
            blocks.push(0, HEIGHT);
            continue;
        }
        const within = override.at % HEIGHT;
        if (within > 0) blocks.push(0, within);
        blocks.push(override.index, 1);
        if (within < HEIGHT - 1) blocks.push(0, HEIGHT - within - 1);
    }

    return {
        id: '1234/0,0/full',
        palette: [...palette],
        blocks,
        liquids: Array.from({ length: 512 }, (_, at) => (at % 2 === 0 ? 0 : HEIGHT)),
        biomes: [1, 16 * (HEIGHT / 4)],
        heightmap: Array.from({ length: 256 }, () => 10),
        blockEntities: [],
        entitySpawns: []
    };
};

const goldenOf = (overrides: Partial<GenerationCorpusGolden> = {}): GenerationCorpusGolden => ({
    formatVersion: GENERATION_CORPUS_FORMAT,
    provenance: {
        commit: '0'.repeat(40),
        capturedAt: '2026-10-25',
        javaVersion: '26.3',
        uncommitted: [],
        protocol: 'fixture'
    },
    dimension: { minY: -64, height: HEIGHT },
    chunks: [chunkOf()],
    samples: [],
    structures: [],
    unbuiltStructureTypes: [],
    blockCounts: { 'minecraft:stone': 10, 'minecraft:oak_log': 4 },
    ...overrides
});

const placementOf = (overrides: Partial<StructurePlacement> = {}): StructurePlacement => ({
    seed: 1234,
    structure: 'minecraft:monument',
    set: 'minecraft:monuments',
    chunkX: 13,
    chunkZ: 13,
    step: 'surface_structures',
    origin: [208, 39, 208],
    box: [196, 39, 196, 253, 100, 253],
    pieces: 1,
    ...overrides
});

describe('the generation corpus differ', () => {
    it('expands run-length pairs back into one value per position', () => {
        expect(decodeRuns([7, 3, 2, 1])).toEqual([7, 7, 7, 2]);
    });

    it('reports nothing when the capture matches the golden', () => {
        const golden = goldenOf();

        expect(diffChunks(golden, { chunks: [chunkOf()], samples: [] })).toEqual({ gaps: [], detail: [] });
    });

    it('names the chunk and the y band a block change landed in', () => {
        const golden = goldenOf();
        const moved = chunkOf({ digests: digestsOf({ blocks: 'other', sections: ['section-0', 'changed'] }) });
        const diff = diffChunks(golden, { chunks: [moved], samples: [] });

        expect(diff.gaps).toEqual(['blocks:1234/0,0/full']);
        expect(diff.detail[0]).toContain('1 of 2 sections');
        expect(diff.detail[0]).toContain('y -48..-33');
    });

    it('names the first differing block when the golden keeps the chunk whole', () => {
        const golden = goldenOf({ samples: [sampleOf(['minecraft:stone', 'minecraft:gravel'])] });
        const moved = chunkOf({ digests: digestsOf({ blocks: 'other' }) });
        const diff = diffChunks(golden, {
            chunks: [moved],
            samples: [sampleOf(['minecraft:stone', 'minecraft:dirt'], { at: HEIGHT * 3 + 7, index: 1 })]
        });

        // Column 3 is x 0, z 3; the seventh entry of a column that starts at the floor is y -57.
        expect(diff.detail[0]).toContain('first differs at 0,-57,3');
        expect(diff.detail[0]).toContain('found minecraft:dirt, golden minecraft:stone');
    });

    it('reports a chunk the golden has and the capture does not, and the other way round', () => {
        const golden = goldenOf();
        const diff = diffChunks(golden, { chunks: [chunkOf({ id: '1234/1,1/full' })], samples: [] });

        expect(diff.gaps).toEqual(['missing:1234/0,0/full', 'extra:1234/1,1/full']);
    });

    it('orders a census delta by how far the count moved', () => {
        expect(censusDelta({ a: 10, b: 2, c: 1 }, { a: 11, b: 40, c: 1 })).toEqual(['b 2->40', 'a 10->11']);
    });

    it('names every block state whose count moved across the decorated chunks', () => {
        const golden = goldenOf();
        const fewerLogs = chunkOf({ census: { 'minecraft:stone': 10, 'minecraft:oak_log': 1 } });
        const diff = diffCensus(golden, { chunks: [fewerLogs], samples: [] });

        expect(diff.gaps).toEqual(['block-count:minecraft:oak_log', 'census:1234/0,0/full']);
        expect(diff.detail[0]).toBe('across the decorated chunks, minecraft:oak_log 4->1');
    });

    it('leaves a terrain chunk out of the decorated census', () => {
        const golden = goldenOf({ chunks: [chunkOf({ tier: 'terrain' })], blockCounts: {} });
        const diff = diffCensus(golden, { chunks: [chunkOf({ tier: 'terrain' })], samples: [] });

        expect(diff.gaps).toEqual([]);
    });

    it('reports a structure that moved, with both boxes', () => {
        const golden = goldenOf({ structures: [placementOf()] });
        const diff = diffStructures(golden, {
            structures: [placementOf({ origin: [208, 40, 208] })],
            unbuiltStructureTypes: []
        });

        expect(diff.gaps).toEqual(['structure-box:1234/minecraft:monument@13,13']);
        expect(diff.detail[0]).toContain('origin 208,39,208->208,40,208');
    });

    it('reports a structure that appeared and one that went away', () => {
        const golden = goldenOf({ structures: [placementOf()] });
        const diff = diffStructures(golden, {
            structures: [placementOf({ structure: 'minecraft:igloo' })],
            unbuiltStructureTypes: []
        });

        expect(diff.gaps).toEqual([
            'structure-gone:1234/minecraft:monument@13,13',
            'structure-new:1234/minecraft:igloo@13,13'
        ]);
    });

    it('reports a structure type whose builder appeared', () => {
        const golden = goldenOf({ unbuiltStructureTypes: ['minecraft:jigsaw'] });
        const diff = diffStructures(golden, { structures: [], unbuiltStructureTypes: [] });

        expect(diff.gaps).toEqual(['unbuilt-structure-type:minecraft:jigsaw']);
    });

    it('says how far apart two samples are when one holds a different number of blocks', () => {
        const golden = sampleOf(['minecraft:stone']);
        const short: WholeChunkSample = { ...golden, blocks: [0, 16] };

        expect(firstBlockDifference(golden, short, -64)).toContain('holds 16 blocks, the golden holds 8192');
    });
});
