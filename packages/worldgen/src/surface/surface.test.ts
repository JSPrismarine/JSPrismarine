import { beforeAll, describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../.test/reportProgress';
import biomeVectors from '../../vectors/26.3/biome-points.json' with { type: 'json' };
import { loadVanillaWorldgenData } from '../../vectors/javaWorldgenData';
import columnVectors from '../../vectors/26.3/surface-columns.json' with { type: 'json' };
import registryVectors from '../../vectors/26.3/surface-registries.json' with { type: 'json' };
import type { BiomeClimate, BiomeClimateLookup } from '../biome/BiomeClimate';
import { parseBiomeClimate } from '../biome/BiomeClimate';
import { BiomeManager } from '../biome/BiomeManager';
import type { BiomeSource } from '../biome/BiomeSource';
import { MultiNoiseBiomeSource, TheEndBiomeSource } from '../biome/BiomeSource';
import type { ClimateEntry } from '../biome/Climate';
import { ClimateParameterList } from '../biome/Climate';
import { createClimateSampler } from '../biome/ClimateSampler';
import { ChunkSampler } from '../chunk/ChunkSampler';
import { compileOreVeinRule, ORE_VEIN_SEED } from '../chunk/oreVein';
import type { DensitySampler } from '../density/compile';
import { SampleContext } from '../density/SampleContext';
import { RandomState } from '../RandomState';
import { WorldgenData } from '../WorldgenData';
import { MATERIAL_CONDITION_TYPES, MATERIAL_RULE_TYPES, MaterialRuleData } from './MaterialRule';
import { BlockArraySurfaceChunk } from './SurfaceChunk';
import type { SurfaceChunk } from './SurfaceChunk';
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

const runPass = (
    built: ReturnType<typeof buildChunk>,
    rule: ReturnType<MaterialRuleData['parseRule']>,
    withOwnCells = false,
    withCandidateCells = false,
    blockByBlock = false
) => {
    const chunk = new BlockArraySurfaceChunk({
        chunkX: columnVectors.chunkX,
        chunkZ: columnVectors.chunkZ,
        minY: built.settings.noiseSettings.minY,
        column: (localX, localZ) => (built.grid[localZ]?.[localX] ?? []).map((block) => block.state)
    });
    const source = createBiomeSource(built.biomeSourceName);
    const resolver = source.resolver(createClimateSampler(built.randomState, new SampleContext()));
    const biomes = new BiomeManager(resolver, BiomeManager.obfuscateSeed(SEED));
    let lookups = 0;
    let reads = 0;
    // The pass's view of the chunk, which counts single-block reads and offers column reads
    // unless the run asks for the block-by-block fallback.
    const view: SurfaceChunk = {
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        minY: chunk.minY,
        maxY: chunk.maxY,
        getBlock: (x, y, z) => {
            reads++;
            return chunk.getBlock(x, y, z);
        },
        setBlock: (x, y, z, state) => chunk.setBlock(x, y, z, state),
        surfaceHeight: (localX, localZ) => chunk.surfaceHeight(localX, localZ),
        ...(blockByBlock
            ? {}
            : { readColumn: (localX: number, localZ: number, out: string[]) => chunk.readColumn(localX, localZ, out) })
    };
    const pass = new SurfaceSystem(built.randomState).buildSurface({
        chunk: view,
        rule,
        biomeAt: (x, y, z) => {
            lookups++;
            return biomes.getBiome(x, y, z);
        },
        biomeClimate,
        sampleContext: new SampleContext(),
        ...(withOwnCells ? { localBiomes: ownCellsBox(built, resolver) } : {}),
        ...(withCandidateCells ? { biomeCellAt: (x: number, y: number, z: number) => biomes.cellBiome(x, y, z) } : {})
    });
    return { chunk, pass, lookups, reads };
};

/**
 * The chunk's own cells and the blocks whose jittered biome lookup reads no other cell: local x
 * and z 2 to 13, and the y whose two candidate cells both lie inside the dimension's cells.
 */
const ownCellsBox = (built: ReturnType<typeof buildChunk>, resolver: (x: number, y: number, z: number) => string) => {
    const { minY, height } = built.settings.noiseSettings;
    const bottomQuart = minY >> 2;
    const topQuart = (minY + height - 1) >> 2;
    const biomes = new Set<string>();
    for (let quartX = columnVectors.chunkX * 4; quartX < columnVectors.chunkX * 4 + 4; quartX++) {
        for (let quartZ = columnVectors.chunkZ * 4; quartZ < columnVectors.chunkZ * 4 + 4; quartZ++) {
            for (let quartY = bottomQuart; quartY <= topQuart; quartY++) biomes.add(resolver(quartX, quartY, quartZ));
        }
    }
    return {
        biomes,
        minX: columnVectors.chunkX * 16 + 2,
        maxX: columnVectors.chunkX * 16 + 13,
        minZ: columnVectors.chunkZ * 16 + 2,
        maxZ: columnVectors.chunkZ * 16 + 13,
        minY: bottomQuart * 4 + 2,
        maxY: topQuart * 4 + 1
    };
};

const runRule = (
    built: ReturnType<typeof buildChunk>,
    rule: ReturnType<MaterialRuleData['parseRule']>
): BlockArraySurfaceChunk => runPass(built, rule).chunk;

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
 * These read the pinned Java Edition server jar,
 * which a clean checkout does not have. Everything else in this file reads the
 * committed vectors instead, so the default run stays offline.
 */
describe.skipIf(!loadVanillaWorldgenData())(
    'the committed registry documents against the jar',
    { tags: ['real-data'] },
    () => {
        const vanilla = loadVanillaWorldgenData();
        if (!vanilla) return;

        it('holds the same density functions, noises and noise settings the jar does', () => {
            expect(Object.keys(registryVectors.densityFunctions).sort()).toEqual(
                [...vanilla.data.densityFunctionIds].sort()
            );
            expect(Object.keys(registryVectors.noises).sort()).toEqual([...vanilla.data.noiseIds].sort());
            expect(Object.keys(registryVectors.noiseSettings).sort()).toEqual(
                [...vanilla.data.noiseSettingsIds].sort()
            );
        });
    }
);

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
        reportProgress(
            `Parsed ${materialRuleData.ruleIds.length} material rules and ${materialRuleData.conditionIds.length} conditions.`
        );
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
        reportProgress(
            `Material rules expose ${MATERIAL_RULE_TYPES.length} types and material conditions expose ${MATERIAL_CONDITION_TYPES.length} types.`
        );
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
            let lookups: number;
            let withOwnCells: ReturnType<typeof runPass>;
            let withCandidateCells: ReturnType<typeof runPass>;
            let byColumn: ReturnType<typeof runPass>;
            let blockByBlock: ReturnType<typeof runPass>;
            beforeAll(() => {
                const built = buildChunk(dimension.settings, dimension.biomeSource);
                byColumn = runPass(built, materialRuleData.rule(dimension.materialRule));
                ({ chunk, lookups } = byColumn);
                blockByBlock = runPass(built, materialRuleData.rule(dimension.materialRule), false, false, true);
                withOwnCells = runPass(built, materialRuleData.rule(dimension.materialRule), true);
                withCandidateCells = runPass(built, materialRuleData.rule(dimension.materialRule), true, true);
            }, 120_000);

            it("places the same blocks when a block's eight candidate cells answer its biome conditions", () => {
                for (const column of dimension.columns.entries) {
                    expect(runsOf(withCandidateCells.chunk, column.x, column.z)).toEqual(column.runs);
                }
                // A block still looks its biome up where its candidate cells disagree, and each
                // column looks up its surface biome once, so the count falls to a quarter or less
                // wherever the rules ask per block.
                const columns = 16 * 16;
                if (withOwnCells.lookups > columns) {
                    expect(withCandidateCells.lookups).toBeLessThan(withOwnCells.lookups / 4);
                } else {
                    expect(withCandidateCells.lookups).toBe(withOwnCells.lookups);
                }
            });

            it("places the same blocks when its own cells answer the inner blocks' biome conditions", () => {
                for (const column of dimension.columns.entries) {
                    expect(runsOf(withOwnCells.chunk, column.x, column.z)).toEqual(column.runs);
                }
                // One lookup a column finds the column's surface biome either way. Where the rules
                // also ask per block, the box answers for 144 of the 256 columns.
                const columns = 16 * 16;
                if (lookups > columns) expect(withOwnCells.lookups).toBeLessThan(lookups / 2);
                else expect(withOwnCells.lookups).toBe(lookups);
            });

            it('places the same blocks reading a chunk without column reads one block at a time', () => {
                for (const column of dimension.columns.entries) {
                    expect(runsOf(blockByBlock.chunk, column.x, column.z)).toEqual(column.runs);
                }
                // Each column's walk reads every block of it at least once; through column reads it
                // reads none, and only the badlands and iceberg extensions still ask per block.
                const blocks = 16 * 16 * (byColumn.chunk.maxY - byColumn.chunk.minY + 1);
                expect(blockByBlock.reads).toBeGreaterThanOrEqual(blocks);
                expect(byColumn.reads).toBeLessThan(blockByBlock.reads / 10);
            });

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

describe('the material rule at one position, which a carver asks after it opens a cave', () => {
    /**
     * Three outcomes, one per detail of Java's `MaterialSystem.topMaterial`. The outer branch
     * only runs at a floor depth of one, the inner one only above the water line.
     */
    const probe = materialRuleData.parseRule(
        {
            type: 'minecraft:sequence',
            sequence: [
                {
                    type: 'minecraft:condition',
                    if_true: {
                        type: 'minecraft:stone_depth',
                        offset: 0,
                        add_surface_depth: false,
                        secondary_depth_range: 0,
                        surface_type: 'floor'
                    },
                    then_run: {
                        type: 'minecraft:sequence',
                        sequence: [
                            {
                                type: 'minecraft:condition',
                                if_true: {
                                    type: 'minecraft:water',
                                    offset: 0,
                                    surface_depth_multiplier: 0,
                                    add_stone_depth: false
                                },
                                then_run: { type: 'minecraft:block', result_state: 'minecraft:gold_block' }
                            },
                            { type: 'minecraft:block', result_state: 'minecraft:lapis_block' }
                        ]
                    }
                },
                { type: 'minecraft:block', result_state: 'minecraft:diamond_block' }
            ]
        },
        'top material probe'
    );

    /** A column of the vector chunk and a y deep inside its stone, sixty blocks under the floor. */
    const column = columnVectors.dimensions[0]!.columns.entries[0]!;
    const deepY = 0;

    it('pins both stone depth counters to one, whatever the column really looks like', () => {
        const { chunk, pass } = runPass(buildChunk('minecraft:overworld', 'overworld'), probe);

        // The surface pass counts the real depth here and never reaches the outer branch.
        expect(chunk.getBlock(column.x, deepY, column.z)).toBe('minecraft:diamond_block');
        expect(pass.topMaterial(column.x, deepY, column.z, false)).toBe('minecraft:gold_block');
    });

    it('puts the water line one block above the position when the carved block holds fluid', () => {
        const { pass } = runPass(buildChunk('minecraft:overworld', 'overworld'), probe);

        expect(pass.topMaterial(column.x, deepY, column.z, true)).toBe('minecraft:lapis_block');
    });
});

describe('the ore vein rule', () => {
    /** Two chunks of the vector seed that hold an iron vein and a copper vein. */
    const VEIN_CHUNKS = [
        [0, 0],
        [6, 10]
    ] as const;

    it('samples the vein density only in cells that can hold a vein, and places the same blocks', () => {
        const randomState = new RandomState(worldgenData, SEED, worldgenData.settings('minecraft:overworld'));
        const random = randomState.randomFactory(ORE_VEIN_SEED);
        for (const id of ['minecraft:overworld/copper_ore_vein', 'minecraft:overworld/iron_ore_vein']) {
            const node = materialRuleData.rule(id);
            if (node.type !== 'ore_vein') throw new TypeError(`${id} is not an ore_vein rule`);
            const density = node.rule.density;
            const cell = randomState.interpolationCellSizeOf(density);
            if (cell === undefined) throw new TypeError(`${id} has no interpolated density`);

            let densitySamples = 0;
            const compile = (child: typeof density): DensitySampler => {
                const sampler = randomState.sampler(child);
                if (child !== density) return sampler;
                return (context, x, y, z) => {
                    densitySamples++;
                    return sampler(context, x, y, z);
                };
            };
            const everyBlock = compileOreVeinRule(node.rule, compile, random);
            const byCell = compileOreVeinRule(node.rule, compile, random, {
                density: randomState.boundSampler(density),
                cell
            });

            const walk = (place: typeof everyBlock): { placed: string[]; samples: number; blocks: number } => {
                densitySamples = 0;
                const placed: string[] = [];
                let blocks = 0;
                for (const [chunkX, chunkZ] of VEIN_CHUNKS) {
                    const context = new SampleContext();
                    // Columns top down, the order the surface pass asks in.
                    for (let x = chunkX * 16; x < chunkX * 16 + 16; x++) {
                        for (let z = chunkZ * 16; z < chunkZ * 16 + 16; z++) {
                            for (let y = 63; y >= -64; y--) {
                                blocks++;
                                const block = place(context, x, y, z);
                                if (block !== undefined) placed.push(`${x} ${y} ${z} ${block}`);
                            }
                        }
                    }
                }
                return { placed, samples: densitySamples, blocks };
            };

            const expected = walk(everyBlock);
            const actual = walk(byCell);
            expect(expected.placed.length, id).toBeGreaterThan(0);
            expect(actual.placed, id).toEqual(expected.placed);
            expect(expected.samples, id).toBe(expected.blocks);
            expect(actual.samples, id).toBeLessThan(expected.samples / 4);
        }
    });
});
