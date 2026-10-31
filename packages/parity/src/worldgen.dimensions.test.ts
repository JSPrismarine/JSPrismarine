import BinaryStream from '@jsprismarine/binaryutils';
import { bedrockDimensionOverlay } from '@jsprismarine/mapping';
import { Generator } from '@jsprismarine/minecraft';
import Chunk from '@jsprismarine/prismarine/world/chunk/Chunk';
import type { DimensionType } from '@jsprismarine/prismarine/world/Dimension';
import { dimensionTypeOf, maxSubChunk, minSubChunk, subChunkCount } from '@jsprismarine/prismarine/world/Dimension';
import type { StemKey } from '@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator';
import { DataDrivenGenerator } from '@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator';
import { bedrockBiomeIdOf } from '@jsprismarine/prismarine/world/generators/datadriven/javaTranslation';
import type {
    DimensionTypeDefinition,
    FlatGeneratorSettings,
    GeneratorDefinition,
    LevelStem,
    WorldPreset
} from '@jsprismarine/worldgen';
import {
    OVERWORLD_STEM_ID,
    parseBiomeSource,
    parseDimensionType,
    parseLevelStem,
    parseWorldPreset
} from '@jsprismarine/worldgen';
import { beforeAll, describe, expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import type { GenerationEnvironment } from './generation/capture.ts';
import { openGeneration } from './generation/capture.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';

/**
 * The dimensions, from Java's data to a Bedrock chunk payload.
 *
 * Two halves. The first parses every `dimension_type` and `worldgen/world_preset` document of
 * the pinned datapack through the public parsers of `@jsprismarine/worldgen` and compares the
 * result with the tables of docs/research/data-driven-dimensions.md: section 1.1 for the four
 * types, 1.2 for the seven presets and their stems, and 2.1, 2.4 and 2.5 for the three rows of
 * the Bedrock overlay that `@jsprismarine/mapping` keeps. The second generates chunk 0,0 of
 * each stem of `minecraft:normal` through the one shared noise generator and checks what a
 * client would receive: blocks inside the Bedrock bounds, biomes the stem's own biome source can
 * produce, the biome section count the client expects for that dimension id, and no structure
 * type the generator cannot build.
 *
 * The biome set is derived from the stem's `biome_source` rather than written out, so a change
 * to Java's parameter lists moves the expectation with the data.
 */

const SEED = 1234n;

/** Generating three chunks at the origin, the Overworld's an ocean, takes seconds. */
const GENERATION_TIMEOUT = 600_000;

const NETHER_TYPE_ID = 'minecraft:the_nether';
const END_TYPE_ID = 'minecraft:the_end';
const NORMAL_PRESET_ID = 'minecraft:normal';

/**
 * The fields of table 1.1 the parser reads into named properties. The attributes table is
 * checked separately, by the handful of rows the note names.
 */
type ExpectedType = Omit<DimensionTypeDefinition, 'attributes' | 'monsterSpawnLightLevel'> & {
    readonly monsterSpawnLightLevel: DimensionTypeDefinition['monsterSpawnLightLevel'];
};

const OVERWORLD_TYPE: ExpectedType = {
    minY: -64,
    height: 384,
    logicalHeight: 384,
    coordinateScale: 1,
    hasSkylight: true,
    hasCeiling: false,
    hasFixedTime: false,
    hasEnderDragonFight: false,
    ambientLight: 0,
    monsterSpawnLightLevel: { type: 'uniform', minInclusive: 0, maxInclusive: 7 },
    monsterSpawnBlockLightLimit: 0,
    infiniburn: '#minecraft:infiniburn_overworld',
    skybox: 'overworld',
    cardinalLight: 'default',
    defaultClock: 'minecraft:overworld',
    timelines: ['#minecraft:in_overworld']
};

/** Table 1.1 of the dimension note, one column per type; `overworld_caves` differs in one field. */
const EXPECTED_TYPES: Readonly<Record<string, ExpectedType>> = {
    'minecraft:overworld': OVERWORLD_TYPE,
    'minecraft:overworld_caves': { ...OVERWORLD_TYPE, hasCeiling: true },
    [NETHER_TYPE_ID]: {
        minY: 0,
        height: 256,
        logicalHeight: 128,
        coordinateScale: 8,
        hasSkylight: false,
        hasCeiling: true,
        hasFixedTime: true,
        hasEnderDragonFight: false,
        ambientLight: 0.1,
        monsterSpawnLightLevel: { type: 'constant', value: 7 },
        monsterSpawnBlockLightLimit: 15,
        infiniburn: '#minecraft:infiniburn_nether',
        skybox: 'none',
        cardinalLight: 'nether',
        timelines: ['#minecraft:in_nether']
    },
    [END_TYPE_ID]: {
        minY: 0,
        height: 256,
        logicalHeight: 256,
        coordinateScale: 1,
        hasSkylight: true,
        hasCeiling: false,
        hasFixedTime: true,
        hasEnderDragonFight: true,
        ambientLight: 0.25,
        monsterSpawnLightLevel: { type: 'constant', value: 15 },
        monsterSpawnBlockLightLimit: 0,
        infiniburn: '#minecraft:infiniburn_end',
        skybox: 'end',
        cardinalLight: 'default',
        defaultClock: 'minecraft:the_end',
        timelines: ['#minecraft:in_end']
    }
};

/**
 * The attribute rows of table 1.1 that replaced the old top-level booleans, by attribute id.
 * `undefined` is the note's "absent".
 */
const EXPECTED_ATTRIBUTES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
    'minecraft:gameplay/respawn_anchor_works': {
        'minecraft:overworld': false,
        [NETHER_TYPE_ID]: true,
        [END_TYPE_ID]: false
    },
    'minecraft:gameplay/piglins_zombify': { [NETHER_TYPE_ID]: false },
    'minecraft:gameplay/can_start_raid': { [NETHER_TYPE_ID]: false },
    'minecraft:gameplay/water_evaporates': { [NETHER_TYPE_ID]: true },
    'minecraft:gameplay/fast_lava': { [NETHER_TYPE_ID]: true },
    'minecraft:gameplay/nether_portal_spawns_piglin': { 'minecraft:overworld': true },
    'minecraft:visual/cloud_height': { 'minecraft:overworld': 192.33 }
};

/** A multi-noise stem over one of the data generator's parameter lists. */
const multiNoise = (settings: string, preset: string): GeneratorDefinition => ({
    type: 'minecraft:noise',
    settings,
    biomeSource: { type: 'minecraft:multi_noise', preset }
});

/** A flat stem with no features and no lakes, which is how every vanilla flat stem is written. */
const flat = (
    biome: string,
    layers: FlatGeneratorSettings['layers'],
    structureOverrides?: readonly string[]
): GeneratorDefinition => ({
    type: 'minecraft:flat',
    settings: {
        biome,
        layers,
        features: false,
        lakes: false,
        ...(structureOverrides === undefined ? {} : { structureOverrides })
    }
});

/** The three stems of `normal.json`, which section 1.2 quotes verbatim. */
const NORMAL_STEMS: Readonly<Record<string, LevelStem>> = {
    [OVERWORLD_STEM_ID]: {
        type: 'minecraft:overworld',
        generator: multiNoise('minecraft:overworld', 'minecraft:overworld')
    },
    [END_TYPE_ID]: {
        type: END_TYPE_ID,
        generator: { type: 'minecraft:noise', settings: 'minecraft:end', biomeSource: { type: 'minecraft:the_end' } }
    },
    [NETHER_TYPE_ID]: { type: NETHER_TYPE_ID, generator: multiNoise('minecraft:nether', 'minecraft:nether') }
};

/** The Overworld generator of each preset, from the table in section 1.2. */
const OVERWORLD_GENERATORS: Readonly<Record<string, GeneratorDefinition>> = {
    [NORMAL_PRESET_ID]: NORMAL_STEMS[OVERWORLD_STEM_ID]!.generator,
    'minecraft:large_biomes': multiNoise('minecraft:large_biomes', 'minecraft:overworld'),
    'minecraft:amplified': multiNoise('minecraft:amplified', 'minecraft:overworld'),
    'minecraft:single_biome_surface': {
        type: 'minecraft:noise',
        settings: 'minecraft:overworld',
        biomeSource: { type: 'minecraft:fixed', biome: 'minecraft:plains' }
    },
    'minecraft:flat': flat(
        'minecraft:plains',
        [
            { block: 'minecraft:bedrock', height: 1 },
            { block: 'minecraft:dirt', height: 2 },
            { block: 'minecraft:grass_block', height: 1 }
        ],
        ['minecraft:strongholds', 'minecraft:villages']
    ),
    'minecraft:debug_all_block_states': { type: 'minecraft:debug' },
    'minecraft:flat_all_dimensions': flat('minecraft:desert', [
        { block: 'minecraft:bedrock', height: 1 },
        { block: 'minecraft:sandstone', height: 67 }
    ])
};

/** The one preset whose Nether and End are not the stems of `normal.json`. */
const FLAT_ALL_DIMENSIONS: Readonly<Record<string, LevelStem>> = {
    [END_TYPE_ID]: {
        type: END_TYPE_ID,
        generator: flat('minecraft:the_end', [
            { block: 'minecraft:bedrock', height: 1 },
            { block: 'minecraft:end_stone', height: 3 }
        ])
    },
    [NETHER_TYPE_ID]: {
        type: NETHER_TYPE_ID,
        generator: flat('minecraft:basalt_deltas', [
            { block: 'minecraft:bedrock', height: 1 },
            { block: 'minecraft:basalt', height: 3 }
        ])
    }
};

/** Sections 2.1, 2.4 and 2.5: the id, the client's name, the `StartGame` generator and the clamp. */
const EXPECTED_OVERLAY = {
    'minecraft:overworld': {
        dimensionId: 0,
        bedrockName: 'minecraft:overworld',
        generatorType: Generator.OVERWORLD,
        minY: -64,
        height: 384
    },
    [NETHER_TYPE_ID]: {
        dimensionId: 1,
        bedrockName: 'minecraft:nether',
        generatorType: Generator.NETHER,
        minY: 0,
        height: 128
    },
    [END_TYPE_ID]: {
        dimensionId: 2,
        bedrockName: 'minecraft:the_end',
        generatorType: Generator.END,
        minY: 0,
        height: 256
    }
} as const;

/** One stem of `minecraft:normal` with its type resolved, ready to generate. */
interface VanillaDimension {
    readonly stemId: string;
    readonly stem: LevelStem;
    readonly dimension: DimensionType;
    readonly key: StemKey;
    /** The Bedrock biome ids the stem's biome source can produce. */
    readonly biomeIds: ReadonlySet<number>;
}

/** The stems of `normal.json`, each joined with its parsed type and its overlay. */
const vanillaDimensions = (environment: GenerationEnvironment, normal: WorldPreset): VanillaDimension[] =>
    [...normal.dimensions].map(([stemId, stem]) => {
        const generator = stem.generator;
        if (generator.type !== 'minecraft:noise' || !('biomeSource' in generator)) {
            throw new TypeError(`${stemId} of ${NORMAL_PRESET_ID} is not a noise stem`);
        }
        if (typeof generator.settings !== 'string') {
            throw new TypeError(`${stemId} of ${NORMAL_PRESET_ID} carries its noise settings inline`);
        }

        const document = environment.registries.dimensionTypes.get(stem.type);
        const dimension = dimensionTypeOf(parseDimensionType(document, stem.type), stem.type);
        const biomes = parseBiomeSource(generator.biomeSource, environment.registries.biomeParameters, stemId);

        return {
            stemId,
            stem,
            dimension,
            key: { noiseSettings: generator.settings, biomeSource: generator.biomeSource, dimension },
            biomeIds: new Set(biomes.possibleBiomes().map(bedrockBiomeIdOf))
        };
    });

/**
 * Reads the biome sections that follow the sub chunks in a `LevelChunk` payload, as
 * `ChunkBiomes.networkSerialize` writes them: a header byte whose high bits are the palette
 * width, packed words when the width is not zero, then the palette as varints.
 *
 * @returns One list of biome ids per section, in section order.
 */
const readBiomeSections = (stream: BinaryStream): number[][] => {
    const sections: number[][] = [];
    // The border block count closes the trailer; a chunk with no block entities ends there.
    while (stream.getBuffer().byteLength - stream.getReadIndex() > 1) {
        const header = stream.readByte();
        const bitsPerBlock = header >> 1;
        if (bitsPerBlock === 0) {
            sections.push([stream.readVarInt()]);
            continue;
        }
        const perWord = Math.floor(32 / bitsPerBlock);
        const words = Math.ceil(4096 / perWord);
        for (let word = 0; word < words; word++) stream.readIntLE();
        const palette: number[] = [];
        const count = stream.readVarInt();
        for (let entry = 0; entry < count; entry++) palette.push(stream.readVarInt());
        sections.push(palette);
    }
    return sections;
};

/** Every biome id a generated chunk's biome cells hold. */
const biomesIn = (chunk: Chunk): Set<number> => {
    const seen = new Set<number>();
    for (let x = 0; x < 16; x += 4) {
        for (let z = 0; z < 16; z += 4) {
            for (let y = chunk.getMinY(); y <= chunk.getMaxY(); y += 4) seen.add(chunk.getBiome(x, y, z));
        }
    }
    return seen;
};

/** How many blocks of one Bedrock identifier a chunk holds over its whole height. */
const blocksNamed = (chunk: Chunk, name: string): number => {
    let count = 0;
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            for (let y = chunk.getMinY(); y <= chunk.getMaxY(); y++) {
                if (chunk.getBlock(x, y, z).name === name) count++;
            }
        }
    }
    return count;
};

const environment = openGeneration();

describeFamily(
    FAMILIES.worldgenDimensions,
    [REFERENCES.javaWorldgenData],
    () => {
        const registries = environment!.registries;
        const types = new Map(
            [...registries.dimensionTypes].map(([id, document]) => [id, parseDimensionType(document, id)])
        );
        const presets = new Map(
            [...registries.worldPresets].map(([id, document]) => [id, parseWorldPreset(document, id)])
        );

        describe('the dimension types', () => {
            it('are the four of the 26.3 datapack, with the fields table 1.1 lists', () => {
                expect([...types.keys()].sort()).toEqual(Object.keys(EXPECTED_TYPES).sort());
                for (const [id, expected] of Object.entries(EXPECTED_TYPES)) {
                    const { attributes, ...parsed } = types.get(id)!;
                    expect(parsed, id).toEqual(expected);
                    expect(attributes.size, id).toBeGreaterThan(0);
                }
            });

            it('carry the gameplay rules that used to be booleans as attributes', () => {
                for (const [attribute, byType] of Object.entries(EXPECTED_ATTRIBUTES)) {
                    for (const id of Object.keys(EXPECTED_OVERLAY)) {
                        expect(types.get(id)!.attributes.get(attribute), `${id} ${attribute}`).toEqual(byType[id]);
                    }
                }
            });

            it('take the Bedrock id, name, generator and height clamp the overlay rows give them', () => {
                for (const [id, expected] of Object.entries(EXPECTED_OVERLAY)) {
                    const overlay = bedrockDimensionOverlay(id);
                    expect(overlay, id).toBeDefined();
                    expect(overlay!.dimensionId, id).toBe(expected.dimensionId);
                    expect(overlay!.bedrockName, id).toBe(expected.bedrockName);
                    expect(overlay!.generatorType, id).toBe(expected.generatorType);

                    // Section 2.5: the repository's column. The Nether is where the client's
                    // height is Java's `logical_height` rather than its `height`.
                    const dimension = dimensionTypeOf(types.get(id)!, id);
                    expect(dimension.bedrockId, id).toBe(expected.dimensionId);
                    expect([dimension.minY, dimension.height], id).toEqual([expected.minY, expected.height]);
                    expect(dimension.custom, id).toBe(false);
                }
                expect(dimensionTypeOf(types.get(NETHER_TYPE_ID)!, NETHER_TYPE_ID).height).toBe(
                    types.get(NETHER_TYPE_ID)!.logicalHeight
                );
                expect(bedrockDimensionOverlay('minecraft:overworld_caves')).toBeUndefined();
            });
        });

        describe('the world presets', () => {
            it('are the seven of the 26.3 datapack, each with the Overworld generator of table 1.2', () => {
                expect([...presets.keys()].sort()).toEqual(Object.keys(OVERWORLD_GENERATORS).sort());
                for (const [id, generator] of Object.entries(OVERWORLD_GENERATORS)) {
                    const stem = presets.get(id)!.dimensions.get(OVERWORLD_STEM_ID);
                    expect(stem?.type, id).toBe('minecraft:overworld');
                    expect(stem?.generator, id).toEqual(generator);
                }
            });

            it('keep the Nether and End stems of `normal.json` everywhere but `flat_all_dimensions`', () => {
                const normal = presets.get(NORMAL_PRESET_ID)!;
                expect([...normal.dimensions.keys()]).toEqual(Object.keys(NORMAL_STEMS));
                expect(Object.fromEntries(normal.dimensions)).toEqual(NORMAL_STEMS);

                for (const [id, preset] of presets) {
                    const expected = id === 'minecraft:flat_all_dimensions' ? FLAT_ALL_DIMENSIONS : NORMAL_STEMS;
                    expect(preset.dimensions.size, id).toBe(3);
                    for (const stemId of [NETHER_TYPE_ID, END_TYPE_ID]) {
                        expect(preset.dimensions.get(stemId), `${id} ${stemId}`).toEqual(expected[stemId]);
                    }
                }
            });

            it('read each stem the same whether through the preset or on its own', () => {
                // A stem under `dimensions` has the shape a `data/<ns>/dimension/<name>.json` file
                // has, so the stand-alone parser has to agree with the preset parser on every one.
                for (const [id, document] of registries.worldPresets) {
                    // The registry holds parsed JSON; `dimensions` is what `parseWorldPreset` read.
                    const { dimensions } = document as { dimensions: Record<string, unknown> };
                    for (const [stemId, raw] of Object.entries(dimensions)) {
                        expect(parseLevelStem(raw, `${id}/${stemId}`)).toEqual(presets.get(id)!.dimensions.get(stemId));
                    }
                }
            });
        });

        describe('chunk 0,0 of each `minecraft:normal` stem', () => {
            let dimensions: VanillaDimension[];
            const generator = new DataDrivenGenerator({
                registries,
                templates: environment!.templates
            });
            const chunks = new Map<string, Chunk>();

            beforeAll(async () => {
                dimensions = vanillaDimensions(environment!, presets.get(NORMAL_PRESET_ID)!);
                for (const entry of dimensions) {
                    chunks.set(entry.stemId, await generator.forStem(entry.key).generateChunk(0, 0, SEED));
                }
                reportParityProgress(
                    FAMILIES.worldgenDimensions,
                    Object.fromEntries(dimensions.map((entry) => [`${entry.stemId} biomes`, entry.biomeIds.size]))
                );
            }, GENERATION_TIMEOUT);

            it('keeps every block inside the bounds the client gives the dimension id', () => {
                for (const { stemId, dimension } of dimensions) {
                    const chunk = chunks.get(stemId)!;
                    expect(chunk.getDimension(), stemId).toBe(dimension);
                    expect([chunk.getMinY(), chunk.getMaxY()], stemId).toEqual([
                        dimension.minY,
                        dimension.minY + dimension.height - 1
                    ]);
                    for (const index of chunk.getSubChunks().keys()) {
                        expect(index, `${stemId} sub chunk`).toBeGreaterThanOrEqual(minSubChunk(dimension));
                        expect(index, `${stemId} sub chunk`).toBeLessThanOrEqual(maxSubChunk(dimension));
                    }
                    expect(chunk.getTopStoredY(), stemId).toBeLessThanOrEqual(dimension.minY + dimension.height);
                    expect(blocksNamed(chunk, 'minecraft:air'), stemId).toBeLessThan(256 * dimension.height);
                }
            });

            it('closes the Nether at the client ceiling, under what Java would build above it', () => {
                // Java's Nether is 256 tall and its bedrock roof sits at 123 to 127; the client's
                // Nether stops at 128, so the roof is the top of the chunk.
                const nether = chunks.get(NETHER_TYPE_ID)!;
                expect(nether.getMaxY()).toBe(127);
                expect(blocksNamed(nether, 'minecraft:bedrock')).toBeGreaterThan(256 * 2);
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        expect(nether.getBlock(x, 0, z).name, `floor ${x},${z}`).toBe('minecraft:bedrock');
                        expect(nether.getBlock(x, 127, z).name, `roof ${x},${z}`).toBe('minecraft:bedrock');
                    }
                }
            });

            it('places only biomes the stem biome source can produce', () => {
                for (const { stemId, biomeIds } of dimensions) {
                    const seen = biomesIn(chunks.get(stemId)!);
                    expect(seen.size, stemId).toBeGreaterThan(0);
                    for (const biome of seen) expect(biomeIds, `${stemId} biome ${biome}`).toContain(biome);
                }
            });

            it('serializes the biome sections the client expects for the dimension id: 24, 8 and 16', () => {
                for (const { stemId, dimension, biomeIds } of dimensions) {
                    const chunk = chunks.get(stemId)!;
                    const stream = new BinaryStream(chunk.networkSerialize());
                    const sent = chunk.getNetworkSubChunkCount();
                    expect(sent, stemId).toBeGreaterThan(0);
                    expect(sent, stemId).toBeLessThanOrEqual(subChunkCount(dimension));

                    Chunk.networkDeserialize(stream, 0, 0, sent, dimension);
                    const sections = readBiomeSections(stream);
                    expect(sections.length, stemId).toBe(subChunkCount(dimension));
                    for (const biome of sections.flat()) expect(biomeIds, `${stemId} wire biome`).toContain(biome);
                    expect(stream.readByte(), `${stemId} border blocks`).toBe(0);
                }

                expect(subChunkCount(dimensions.find((entry) => entry.stemId === NETHER_TYPE_ID)!.dimension)).toBe(8);
                expect(subChunkCount(dimensions.find((entry) => entry.stemId === END_TYPE_ID)!.dimension)).toBe(16);
                // The Nether column runs from bedrock floor to bedrock roof, so every sub chunk
                // is sent; the End island at the origin stops well under the ceiling.
                expect(chunks.get(NETHER_TYPE_ID)!.getNetworkSubChunkCount()).toBe(8);
                expect(chunks.get(END_TYPE_ID)!.getNetworkSubChunkCount()).toBeLessThan(16);
            });

            it('has a builder for every structure type each dimension places', () => {
                for (const { stemId, key } of dimensions) {
                    expect([...generator.unbuiltStructureTypes(SEED, key)], stemId).toEqual([]);
                }
            });
        });
    },
    { tags: ['real-data'] }
);
