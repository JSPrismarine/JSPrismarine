import { beforeAll, describe, expect, it } from 'vitest';

import { loadVanillaWorldgenData } from '../../vectors/javaWorldgenData';
import biomeVectors from '../../vectors/biome-points.json' with { type: 'json' };
import columnVectors from '../../vectors/surface-columns.json' with { type: 'json' };
import registryVectors from '../../vectors/surface-registries.json' with { type: 'json' };
import type { BiomeClimate, BiomeClimateLookup } from '../biome/BiomeClimate';
import { parseBiomeClimate } from '../biome/BiomeClimate';
import { BiomeManager } from '../biome/BiomeManager';
import type { BiomeSource } from '../biome/BiomeSource';
import { MultiNoiseBiomeSource, TheEndBiomeSource } from '../biome/BiomeSource';
import type { ClimateEntry } from '../biome/Climate';
import { ClimateParameterList } from '../biome/Climate';
import { createClimateSampler } from '../biome/ClimateSampler';
import { ChunkSampler } from '../chunk/ChunkSampler';
import { SampleContext } from '../density/SampleContext';
import { RandomState } from '../RandomState';
import { WorldgenData } from '../WorldgenData';
import { MATERIAL_CONDITION_TYPES, MATERIAL_RULE_TYPES, MaterialRuleData } from './MaterialRule';
import { BlockArraySurfaceChunk } from './SurfaceChunk';
import { SurfaceSystem } from './SurfaceSystem';

const SEED = BigInt(columnVectors.seed);

/** The registry documents the dumper copied out of the jar, each one a compact JSON string. */
const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
    // Each value is a JSON document the dumper re-serialized onto one line.
    new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));

const worldgenData = new WorldgenData({
    densityFunctions: parseDocuments(registryVectors.densityFunctions),
    noises: parseDocuments(registryVectors.noises),
    noiseSettings: parseDocuments(registryVectors.noiseSettings)
});

const materialRuleData = new MaterialRuleData(
    {
        materialRules: parseDocuments(registryVectors.materialRules),
        materialConditions: parseDocuments(registryVectors.materialConditions)
    },
    (reference, path) => {
        if (typeof reference !== 'string') throw new TypeError(`${path}: expected a density function reference`);
        return worldgenData.densityFunction(reference);
    }
);

const biomeClimates = new Map<string, BiomeClimate>(
    Object.entries(registryVectors.biomeClimates).map(([id, document]) => [id, parseBiomeClimate(document, id)])
);
const biomeClimate: BiomeClimateLookup = (biome) => {
    const climate = biomeClimates.get(biome);
    if (!climate) throw new RangeError(`No climate is registered for ${biome}`);
    return climate;
};

/** Reads one packed parameter point out of the biome vector file. */
const unpackPoint = (row: string, biomes: readonly string[]): ClimateEntry<string> => {
    const values = row.split(' ').map(Number);
    const at = (index: number): number => values[index] as number;
    const range = (index: number) => ({ min: at(index), max: at(index + 1) });
    return {
        point: {
            temperature: range(1),
            humidity: range(3),
            continentalness: range(5),
            erosion: range(7),
            depth: range(9),
            weirdness: range(11),
            offset: at(13)
        },
        value: biomes[at(0)] as string
    };
};

/** Rebuilds the biome source the dumper gave each dimension. */
const createBiomeSource = (name: string): BiomeSource => {
    if (name === 'end') return new TheEndBiomeSource();
    const preset = name === 'nether' ? 'minecraft:nether' : 'minecraft:overworld';
    const list = biomeVectors.parameterLists.find((entry) => entry.name === preset);
    if (!list) throw new Error(`the vector file has no ${preset} parameter list`);
    return new MultiNoiseBiomeSource(new ClimateParameterList(list.points.map((row) => unpackPoint(row, list.biomes))));
};

/** Fills one chunk of a dimension from the noise router, which is what the surface pass reads. */
const buildChunk = (settingsId: string, biomeSourceName: string) => {
    const settings = worldgenData.settings(settingsId);
    const randomState = new RandomState(worldgenData, SEED, settings);
    const sampler = new ChunkSampler(randomState, {
        chunkX: columnVectors.chunkX,
        chunkZ: columnVectors.chunkZ
    });
    const grid = sampler.fill();
    return { randomState, settings, grid, biomeSourceName };
};

const runRule = (
    built: ReturnType<typeof buildChunk>,
    rule: ReturnType<MaterialRuleData['parseRule']>
): BlockArraySurfaceChunk => {
    const chunk = new BlockArraySurfaceChunk({
        chunkX: columnVectors.chunkX,
        chunkZ: columnVectors.chunkZ,
        minY: built.settings.noiseSettings.minY,
        column: (localX, localZ) => (built.grid[localZ]?.[localX] ?? []).map((block) => block.state)
    });
    const source = createBiomeSource(built.biomeSourceName);
    const resolver = source.resolver(createClimateSampler(built.randomState, new SampleContext()));
    const biomes = new BiomeManager(resolver, BiomeManager.obfuscateSeed(SEED));
    new SurfaceSystem(built.randomState).buildSurface({
        chunk,
        rule,
        biomeAt: (x, y, z) => biomes.getBiome(x, y, z),
        biomeClimate,
        sampleContext: new SampleContext()
    });
    return chunk;
};

/** Turns a built column into the `"<y> <count> <block>"` runs the vector file holds. */
const runsOf = (chunk: BlockArraySurfaceChunk, blockX: number, blockZ: number): string[] => {
    const runs: string[] = [];
    let runStart = chunk.minY;
    let current = chunk.getBlock(blockX, chunk.minY, blockZ);
    for (let y = chunk.minY + 1; y <= chunk.maxY + 1; y++) {
        const state = y > chunk.maxY ? undefined : chunk.getBlock(blockX, y, blockZ);
        if (state !== current) {
            runs.push(`${runStart} ${y - runStart} ${current}`);
            runStart = y;
            current = state as string;
        }
    }
    return runs;
};

/**
 * These run only with `JSP_WORLDGEN_VANILLA` set, because they read the pinned Java Edition
 * server jar, which a clean checkout does not have. Everything else in this file reads the
 * committed vectors instead, so the default run stays offline.
 */
describe.skipIf(!loadVanillaWorldgenData())('the committed registry documents against the jar', () => {
    const vanilla = loadVanillaWorldgenData();
    if (!vanilla) return;

    it('holds the same density functions, noises and noise settings the jar does', () => {
        expect(Object.keys(registryVectors.densityFunctions).sort()).toEqual(
            [...vanilla.data.densityFunctionIds].sort()
        );
        expect(Object.keys(registryVectors.noises).sort()).toEqual([...vanilla.data.noiseIds].sort());
        expect(Object.keys(registryVectors.noiseSettings).sort()).toEqual([...vanilla.data.noiseSettingsIds].sort());
    });
});

describe('the material rule registry', () => {
    it('parses every rule and condition the 26.3 data holds', () => {
        const failures: string[] = [];
        for (const id of materialRuleData.ruleIds) {
            try {
                materialRuleData.rule(id);
            } catch (error) {
                failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        for (const id of materialRuleData.conditionIds) {
            try {
                materialRuleData.condition(id);
            } catch (error) {
                failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        expect(failures).toEqual([]);
        expect(materialRuleData.ruleIds).toHaveLength(42);
        expect(materialRuleData.conditionIds).toHaveLength(8);
    });

    it('rejects an unknown rule type instead of placing nothing', () => {
        expect(() => materialRuleData.parseRule({ type: 'minecraft:invented' })).toThrow(/unknown material rule type/);
        expect(() => materialRuleData.parseCondition({ type: 'minecraft:invented' })).toThrow(
            /unknown material condition type/
        );
    });

    it('rejects a rule that references itself', () => {
        const looping = new MaterialRuleData(
            {
                materialRules: new Map([
                    ['minecraft:loop', { type: 'minecraft:sequence', sequence: ['minecraft:loop'] }]
                ]),
                materialConditions: new Map()
            },
            () => {
                throw new Error('unused');
            }
        );
        expect(() => looping.rule('minecraft:loop')).toThrow(/references itself/);
    });

    it('covers every type 26.3 registers', () => {
        expect([...MATERIAL_RULE_TYPES]).toEqual(['block', 'bandlands', 'sequence', 'condition', 'ore_vein']);
        expect([...MATERIAL_CONDITION_TYPES]).toHaveLength(11);
        const conditionCases = new Set(columnVectors.conditions.map((entry) => entry.name));
        for (const type of MATERIAL_CONDITION_TYPES) {
            expect([...conditionCases].some((name) => name.startsWith(type))).toBe(true);
        }
    });
});

describe('the surface pass over whole columns', () => {
    for (const dimension of columnVectors.dimensions) {
        describe(`${dimension.settings}`, () => {
            let chunk: BlockArraySurfaceChunk;
            beforeAll(() => {
                const built = buildChunk(dimension.settings, dimension.biomeSource);
                chunk = runRule(built, materialRuleData.rule(dimension.materialRule));
            }, 120_000);

            it('places the same block as Java in every column, from bedrock to sky', () => {
                for (const column of dimension.columns.entries) {
                    expect({ x: column.x, z: column.z, runs: runsOf(chunk, column.x, column.z) }).toEqual({
                        x: column.x,
                        z: column.z,
                        runs: column.runs
                    });
                }
            });

            it('resolves the same biome as Java at the top of every column', () => {
                const built = buildChunk(dimension.settings, dimension.biomeSource);
                const source = createBiomeSource(dimension.biomeSource);
                const resolver = source.resolver(createClimateSampler(built.randomState, new SampleContext()));
                const biomes = new BiomeManager(resolver, BiomeManager.obfuscateSeed(SEED));
                for (const column of dimension.columns.entries) {
                    const localX = column.x & 15;
                    const localZ = column.z & 15;
                    const height = chunk.surfaceHeight(localX, localZ) + 1;
                    expect(biomes.getBiome(column.x, height, column.z)).toBe(column.biome);
                }
            }, 120_000);
        });
    }
});

describe('one synthetic rule per material condition type', () => {
    let overworld: ReturnType<typeof buildChunk>;
    beforeAll(() => {
        overworld = buildChunk('minecraft:overworld', 'overworld');
    }, 120_000);

    for (const testCase of columnVectors.conditions) {
        it(`places the same blocks as Java for ${testCase.name}`, () => {
            const rule = materialRuleData.parseRule(testCase.rule, testCase.name);
            const chunk = runRule(overworld, rule);
            for (const column of testCase.columns.entries) {
                expect({ x: column.x, z: column.z, runs: runsOf(chunk, column.x, column.z) }).toEqual({
                    x: column.x,
                    z: column.z,
                    runs: column.runs
                });
            }
        }, 120_000);
    }
});
