/**
 * The structures, against Mojang's real data and in real generated chunks.
 *
 * Every case here asserts two things: that the structure starts in the chunk Java's seeded
 * placement puts it in, and that its blocks are in the chunk once it is generated. A structure
 * that lays out but places nothing passes the first and fails the second.
 *
 * Gated, because it reads the Java vanilla datapack, the data generator reports and the
 * structure templates out of the server jar:
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * pnpm --filter @jsprismarine/bedrock-data run datagen:java
 * pnpm --filter @jsprismarine/prismarine exec vitest run src/world/generators
 * ```
 */
import { createHash } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import type Chunk from '../../chunk/Chunk';
import type { Generator } from '../../Generator';
import { Dimensions } from '../../Dimension';
import type { StemKey } from './DataDrivenGenerator';
import { DataDrivenGenerator } from './DataDrivenGenerator';
import { findJavaTemplateSource } from './javaStructureTemplates';
import { STRUCTURE_BUILDERS } from './javaStructureTypes';
import { cacheRoot, findJavaWorldgenSources, loadJavaWorldgenRegistries } from './javaWorldgenData';
import type { JavaWorldgenRegistries } from './javaWorldgenData';
import { GeneratorFactories } from '../../GeneratorFactories';
import { OVERWORLD_NOISE_STEM } from '../factories/noise';

const sources = findJavaWorldgenSources();
const enabled = sources !== undefined;

/** Generating a chunk that holds a structure runs the whole stack, which is not fast. */
const CHUNK_TIMEOUT = 900_000;

const SEED = 1234n;

/**
 * Java's random spread placement puts this seed's plains village here. The chunk is far from the
 * origin because the seed's own neighborhood is ocean.
 */
const VILLAGE_CHUNK = { x: -166, z: -80 };

/** Where this seed's trail ruins starts, which is also the chunk most of its gravel lands in. */
const TRAIL_RUINS_CHUNK = { x: -113, z: 50 };

/**
 * A desert well at this seed, found by the rarity draw and the biome rather than by a placement.
 *
 * The well is a feature rather than a structure, and it is here because it is the only feature
 * whose template carries a block entity. The chunk is this far out because the nearest desert to
 * the origin is: of the 1982 chunks within 700 of it that pass the 1 in 1000 rarity draw, 76 are
 * desert, and four of those grow a well.
 */
const DESERT_WELL_CHUNK = { x: -691, z: -239 };

/** The End's level stem, which the end city is the one structure of. */
const END_STEM: StemKey = {
    noiseSettings: 'minecraft:end',
    biomeSource: { type: 'minecraft:the_end' },
    dimension: Dimensions.TheEnd
};

/** The chunk an end city starts in for the seed, the first found walking outward from the origin. */
const END_CITY_CHUNK = { x: -77, z: -37 };

/**
 * The End chunk the city starts in, block for block, so the layout cannot drift unnoticed.
 *
 * The End has no generation corpus yet, so this one digest stands in for it. A change in the
 * end city's layout, Java's End terrain or the template translation moves it; nothing else does.
 */
const END_CITY_CHUNK_DIGEST = 'dabf486203e5f5147adcfc30f7ab52eaafdf3c00b2b8d9501f042a4f27701d0d';

/** The stem the Nether runs on, which is what `forStem` and `structureStartsAt` take. */
const NETHER_STEM: StemKey = {
    noiseSettings: 'minecraft:nether',
    biomeSource: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' },
    dimension: Dimensions.Nether
};

/** Where this seed's nearest nether fortress to the origin starts, by the `nether_complexes` set. */
const FORTRESS_CHUNK = { x: 14, z: 8 };

/** The chunk of that fortress holding a corridor turn with a chest in it, seven pieces deep. */
const FORTRESS_CHEST_CHUNK = { x: 13, z: 9 };

/**
 * The block names of {@link FORTRESS_CHEST_CHUNK}, hashed in y, x, z order.
 *
 * The Nether has no parity corpus yet, so this one chunk is the determinism check for it: a
 * change to the fortress, the Nether terrain or its decoration moves the digest.
 */
const FORTRESS_CHEST_CHUNK_DIGEST = 'f9a1caaf981adaa4f54acc3806aaa2beb1357584f29264f1a347b7982070c307';

describe.skipIf(!enabled)('the structures the data-driven overworld generates', { tags: ['real-data'] }, () => {
    let generator: DataDrivenGenerator;
    let registries: JavaWorldgenRegistries;
    const chunks = new Map<string, Chunk>();

    beforeAll(() => {
        registries = loadJavaWorldgenRegistries(sources!);
        generator = new DataDrivenGenerator({
            registries,
            templates: findJavaTemplateSource(cacheRoot(), registries.processorLists)
        });
    }, CHUNK_TIMEOUT);

    /** Generates a chunk once and keeps it, because several assertions read the same one. */
    const chunkAt = async (chunkX: number, chunkZ: number): Promise<Chunk> => {
        const key = `${chunkX},${chunkZ}`;
        const cached = chunks.get(key);
        if (cached !== undefined) return cached;

        const chunk = await generator.generateChunk(chunkX, chunkZ, SEED);
        chunks.set(key, chunk);
        return chunk;
    };

    /** Every Bedrock block identifier a chunk holds above the given y. */
    const identifiersAbove = (chunk: Chunk, minY: number): Set<string> => {
        const names = new Set<string>();
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                for (let y = minY; y <= chunk.getMaxY(); y++) {
                    const name = chunk.getBlock(x, y, z).name;
                    if (name !== 'minecraft:air') names.add(name);
                }
            }
        }
        return names;
    };

    /** How many blocks of one identifier a chunk holds, over its whole height. */
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

    /** Asserts a structure starts where the seeded placement puts it, and names its blocks. */
    const landsIn = async (
        chunkX: number,
        chunkZ: number,
        structure: string,
        set: string,
        blocks: readonly string[],
        from: number
    ): Promise<void> => {
        const start = generator
            .structureStartsAt(chunkX, chunkZ, SEED)
            .find((candidate) => candidate.structure === structure);

        expect(start, structure).toBeDefined();
        expect(start!.set).toBe(set);
        expect(start!.chunkX).toBe(chunkX);
        expect(start!.chunkZ).toBe(chunkZ);

        const names = identifiersAbove(await chunkAt(chunkX, chunkZ), from);
        for (const block of blocks) expect(names, `${structure} is missing ${block}`).toContain(block);
    };

    describe('a jigsaw structure', () => {
        it(
            'starts in the chunk the seeded placement chose',
            () => {
                const starts = generator.structureStartsAt(VILLAGE_CHUNK.x, VILLAGE_CHUNK.z, SEED);
                const village = starts.find((start) => start.structure === 'minecraft:village_plains');

                expect(village).toBeDefined();
                expect(village!.chunkX).toBe(VILLAGE_CHUNK.x);
                expect(village!.chunkZ).toBe(VILLAGE_CHUNK.z);
                expect(village!.set).toBe('minecraft:villages');
                expect(village!.step).toBe('surface_structures');
                // A plains village is a town center plus the streets and houses that grew off it.
                expect(village!.pieces.length).toBeGreaterThan(20);
            },
            CHUNK_TIMEOUT
        );

        it(
            'settles the start piece on the surface rather than at the start height',
            () => {
                const village = generator
                    .structureStartsAt(VILLAGE_CHUNK.x, VILLAGE_CHUNK.z, SEED)
                    .find((start) => start.structure === 'minecraft:village_plains')!;

                // `start_height` is an absolute 0 and `project_start_to_heightmap` moves it to the
                // terrain, so a generation point still at 0 would mean the projection never ran.
                expect(village.origin.y).toBeGreaterThan(60);
                expect(village.origin.y).toBeLessThan(200);
            },
            CHUNK_TIMEOUT
        );

        it(
            'puts the village in the generated chunk',
            async () => {
                const chunk = await chunkAt(VILLAGE_CHUNK.x, VILLAGE_CHUNK.z);
                const names = identifiersAbove(chunk, 80);

                // The meeting point's bell, and the parts of a house no feature ever places.
                expect(names).toContain('minecraft:bell');
                expect(names).toContain('minecraft:wooden_door');
                expect(names).toContain('minecraft:glass_pane');
            },
            CHUNK_TIMEOUT
        );
    });

    it(
        'sinks a shipwreck onto the sea floor where the placement puts it',
        async () => {
            // The hull this seed draws is a mixed oak and spruce one; the planks and the stairs
            // are the parts no feature places in an ocean.
            await landsIn(
                8,
                -30,
                'minecraft:shipwreck',
                'minecraft:shipwrecks',
                ['minecraft:oak_planks', 'minecraft:oak_stairs', 'minecraft:spruce_planks'],
                25
            );
        },
        CHUNK_TIMEOUT
    );

    it(
        'builds an ocean ruin on the sea floor where the placement puts it',
        async () => {
            await landsIn(
                -12,
                0,
                'minecraft:ocean_ruin_cold',
                'minecraft:ocean_ruins',
                ['minecraft:stone_bricks', 'minecraft:chiseled_stone_bricks', 'minecraft:sea_lantern'],
                30
            );
        },
        CHUNK_TIMEOUT
    );

    it(
        'ruins a portal and spreads netherrack under it',
        async () => {
            await landsIn(
                14,
                -23,
                'minecraft:ruined_portal_ocean',
                'minecraft:ruined_portals',
                ['minecraft:obsidian', 'minecraft:netherrack', 'minecraft:gold_block'],
                25
            );
        },
        CHUNK_TIMEOUT
    );

    it(
        'buries one treasure chest where the placement puts it',
        async () => {
            await landsIn(-23, -10, 'minecraft:buried_treasure', 'minecraft:buried_treasures', ['minecraft:chest'], 50);
        },
        CHUNK_TIMEOUT
    );

    it(
        'digs a mineshaft where the placement puts it',
        async () => {
            await landsIn(
                16,
                128,
                'minecraft:mineshaft',
                'minecraft:mineshafts',
                ['minecraft:rail', 'minecraft:oak_fence', 'minecraft:web', 'minecraft:oak_planks'],
                -64
            );
        },
        CHUNK_TIMEOUT
    );

    it(
        'builds a stronghold where the concentric rings put it',
        async () => {
            await landsIn(
                -48,
                115,
                'minecraft:stronghold',
                'minecraft:strongholds',
                ['minecraft:stone_bricks', 'minecraft:mossy_stone_bricks', 'minecraft:iron_bars'],
                -64
            );
        },
        CHUNK_TIMEOUT
    );

    it(
        'raises an ocean monument where the placement puts it',
        async () => {
            await landsIn(
                -80,
                -73,
                'minecraft:monument',
                'minecraft:ocean_monuments',
                [
                    'minecraft:prismarine',
                    'minecraft:prismarine_bricks',
                    'minecraft:dark_prismarine',
                    'minecraft:sea_lantern'
                ],
                35
            );
        },
        CHUNK_TIMEOUT
    );

    it(
        'maps Java structure-only entity IDs before checking override bounds',
        () => {
            const monument = generator
                .structureStartsAt(-80, -73, SEED)
                .find((start) => start.structure === 'minecraft:monument');
            if (monument === undefined) throw new Error('the seeded ocean monument did not start');

            const inside = {
                x: Math.floor((monument.boundingBox.minX + monument.boundingBox.maxX) / 2),
                y: Math.floor((monument.boundingBox.minY + monument.boundingBox.maxY) / 2),
                z: Math.floor((monument.boundingBox.minZ + monument.boundingBox.maxZ) / 2)
            };
            const outside = { ...inside, x: monument.boundingBox.minX - 1 };

            expect(generator.structureSpawnOverrideAt('minecraft:guardian', inside, SEED)).toBe(true);
            expect(generator.structureSpawnOverrideAt('minecraft:guardian', outside, SEED)).toBe(false);
            expect(generator.structureSpawnOverrideAt('minecraft:pig', inside, SEED)).toBeUndefined();
            expect(generator.structureSpawnOverrideAt('minecraft:witch', outside, SEED)).toBeUndefined();
        },
        CHUNK_TIMEOUT
    );

    it(
        'forwards guardian spawn overrides through the generator the Overworld stem builds',
        () => {
            const monument = generator
                .structureStartsAt(-80, -73, SEED)
                .find((start) => start.structure === 'minecraft:monument');
            if (monument === undefined) throw new Error('the seeded ocean monument did not start');

            const inside = {
                x: Math.floor((monument.boundingBox.minX + monument.boundingBox.maxX) / 2),
                y: Math.floor((monument.boundingBox.minY + monument.boundingBox.maxY) / 2),
                z: Math.floor((monument.boundingBox.minZ + monument.boundingBox.maxZ) / 2)
            };
            const outside = { ...inside, x: monument.boundingBox.minX - 1 };
            const overworld: Generator = new GeneratorFactories().build({
                stem: OVERWORLD_NOISE_STEM,
                dimension: Dimensions.Overworld,
                seed: SEED,
                content: () => {
                    throw new Error('spawn override lookup does not read server content');
                },
                worldgen: () => registries,
                logger: { info: () => {}, warn: () => {} },
                // Workers cannot import a `.ts` pipeline under vitest's loader.
                workers: 0
            });

            expect(overworld.structureSpawnOverrideAt?.('minecraft:guardian', inside, SEED)).toBe(true);
            expect(overworld.structureSpawnOverrideAt?.('minecraft:guardian', outside, SEED)).toBe(false);
        },
        CHUNK_TIMEOUT
    );

    it(
        'builds a woodland mansion in the dark forest the placement found',
        async () => {
            await landsIn(
                111,
                420,
                'minecraft:mansion',
                'minecraft:woodland_mansions',
                [
                    'minecraft:dark_oak_planks',
                    'minecraft:birch_planks',
                    'minecraft:cobblestone',
                    'minecraft:dark_oak_log'
                ],
                60
            );
        },
        CHUNK_TIMEOUT
    );

    describe('what a structure leaves in a chunk besides blocks', () => {
        /** The block entities a chunk holds, by the id Bedrock files them under. */
        const blockEntityIds = (chunk: Chunk): string[] => [...chunk.getBlockEntities()].map((entry) => entry.getId());

        /** The `LootTable` tags the chunk's block entities carry, which is what the fill reads. */
        const lootTables = (chunk: Chunk): string[] =>
            [...chunk.getBlockEntities()]
                .map((entry) => entry.toNBT().getString('LootTable', ''))
                .filter((table) => table !== '');

        it(
            'gives a generated chest a container carrying its loot table',
            async () => {
                const chunk = await chunkAt(-12, 0);

                expect(blockEntityIds(chunk)).toContain('Chest');
                // Bedrock's own spelling of the table, which is what `fillContainerLoot` reads
                // back through `javaLootIdOf` the first time a player opens the chest.
                expect(lootTables(chunk)).toContain('loot_tables/chests/underwater_ruin_big.json');
            },
            CHUNK_TIMEOUT
        );

        it(
            'gives a generated spawner the mob it spawns',
            async () => {
                const chunk = await chunkAt(16, 128);
                const spawner = [...chunk.getBlockEntities()].find((entry) => entry.getId() === 'MobSpawner');

                expect(spawner, 'the mineshaft placed no spawner').toBeDefined();
                expect(spawner!.toNBT().getString('EntityIdentifier', '')).toBe('minecraft:cave_spider');
            },
            CHUNK_TIMEOUT
        );

        it(
            'gives a trial chamber its vaults, with the reward and the key each wants',
            async () => {
                const chunk = await chunkAt(3, -14);
                const vaults = [...chunk.getBlockEntities()].filter((entry) => entry.getId() === 'Vault');
                const configs = vaults.map((vault) => vault.toNBT().getCompound('config', false));

                expect(vaults.length).toBeGreaterThan(0);
                // Both live inside the `config`, which is where a Bedrock vault reads them. A
                // top-level `LootTable` is what a chest carries and what no vault does.
                expect(configs.map((config) => config?.getString('loot_table', ''))).toContain(
                    'loot_tables/chests/trial_chambers/reward_ominous.json'
                );
                expect(
                    configs.map((config) => config?.getCompound('key_item', false)?.getString('Name', ''))
                ).toContain('minecraft:ominous_trial_key');
                expect(lootTables(chunk)).not.toContain('loot_tables/chests/trial_chambers/reward_ominous.json');
            },
            CHUNK_TIMEOUT
        );

        it(
            'fills a trail ruins suspicious gravel with something to brush out of it',
            async () => {
                const chunk = await chunkAt(TRAIL_RUINS_CHUNK.x, TRAIL_RUINS_CHUNK.z);
                const brushable = [...chunk.getBlockEntities()].filter((entry) => entry.getId() === 'BrushableBlock');

                // The archaeology rule gives the gravel a loot table and no block entity type,
                // the way Java's own data does, because the suspicious gravel block already has
                // a block entity. A chunk with the gravel and none of these brushes up empty.
                expect(brushable.length).toBeGreaterThan(0);
                expect(new Set(lootTables(chunk))).toEqual(
                    new Set([
                        'loot_tables/archaeology/trail_ruins_common.json',
                        'loot_tables/archaeology/trail_ruins_rare.json'
                    ])
                );
            },
            CHUNK_TIMEOUT
        );

        it(
            'fills a desert well suspicious sand with something to brush out of it',
            async () => {
                const chunk = await chunkAt(DESERT_WELL_CHUNK.x, DESERT_WELL_CHUNK.z);
                const brushable = [...chunk.getBlockEntities()].filter((entry) => entry.getId() === 'BrushableBlock');

                // The other half of the archaeology path: a feature stamping a template rather
                // than a structure piece, with its rule written where the feature stands rather
                // than in a named list. The sand reaches the chunk either way; without both the
                // block entity and the rule it is sand with nothing in it.
                const sand = blocksNamed(chunk, 'minecraft:suspicious_sand');
                expect(sand).toBe(2);
                expect(brushable).toHaveLength(2);
                expect(lootTables(chunk)).toEqual([
                    'loot_tables/archaeology/desert_well.json',
                    'loot_tables/archaeology/desert_well.json'
                ]);
            },
            CHUNK_TIMEOUT
        );

        it(
            'stands a village up with the mobs its templates saved',
            async () => {
                const spawns = (await chunkAt(VILLAGE_CHUNK.x, VILLAGE_CHUNK.z)).getEntitySpawns();

                expect(spawns.map((spawn) => spawn.type)).toContain('minecraft:villager_v2');
                expect(spawns.map((spawn) => spawn.type)).toContain('minecraft:cat');
                // A template saves a mob between blocks, and that is where it stands.
                for (const spawn of spawns) expect(Number.isInteger(spawn.x) && Number.isInteger(spawn.z)).toBe(false);
            },
            CHUNK_TIMEOUT
        );
    });

    describe('an end city in the End', () => {
        /** Every block name of a chunk, column by column, run through one hash. */
        const digestOf = (chunk: Chunk): string => {
            const hash = createHash('sha256');
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    for (let y = chunk.getMinY(); y <= chunk.getMaxY(); y++) {
                        hash.update(chunk.getBlock(x, y, z).name);
                        hash.update('\n');
                    }
                }
            }
            return hash.digest('hex');
        };

        it(
            'starts in the chunk the seeded placement chose, on an island high enough for it',
            () => {
                const start = generator
                    .structureStartsAt(END_CITY_CHUNK.x, END_CITY_CHUNK.z, SEED, END_STEM)
                    .find((candidate) => candidate.structure === 'minecraft:end_city');

                expect(start).toBeDefined();
                expect(start!.set).toBe('minecraft:end_cities');
                expect([start!.chunkX, start!.chunkZ]).toEqual([END_CITY_CHUNK.x, END_CITY_CHUNK.z]);
                // Seven blocks into the chunk, and Java refuses a site under y 60.
                expect([start!.origin.x, start!.origin.z]).toEqual([
                    END_CITY_CHUNK.x * 16 + 7,
                    END_CITY_CHUNK.z * 16 + 7
                ]);
                expect(start!.origin.y).toBeGreaterThanOrEqual(60);
                expect(start!.pieces.length).toBeGreaterThan(5);
                expect(generator.unbuiltStructureTypes(SEED, END_STEM).size).toBe(0);
            },
            CHUNK_TIMEOUT
        );

        it(
            'places purpur and end rods in the chunk, with a shulker on its sentry marker',
            async () => {
                const chunk = await generator.forStem(END_STEM).generateChunk(END_CITY_CHUNK.x, END_CITY_CHUNK.z, SEED);
                const names = identifiersAbove(chunk, 60);

                expect(names).toContain('minecraft:purpur_block');
                expect(names).toContain('minecraft:end_rod');
                expect(chunk.getEntitySpawns().map((spawn) => spawn.type)).toContain('minecraft:shulker');
                expect(digestOf(chunk)).toBe(END_CITY_CHUNK_DIGEST);
            },
            CHUNK_TIMEOUT
        );
    });

    describe('the nether fortress', () => {
        /** One Nether chunk, generated once through the Nether stem and kept. */
        const netherChunkAt = async (chunkX: number, chunkZ: number): Promise<Chunk> => {
            const key = `nether:${chunkX},${chunkZ}`;
            const cached = chunks.get(key);
            if (cached !== undefined) return cached;

            const chunk = await generator.forStem(NETHER_STEM).generateChunk(chunkX, chunkZ, SEED);
            chunks.set(key, chunk);
            return chunk;
        };

        it(
            'starts where the nether complexes placement puts it, with its floor at 48 or above',
            () => {
                const start = generator
                    .structureStartsAt(FORTRESS_CHUNK.x, FORTRESS_CHUNK.z, SEED, NETHER_STEM)
                    .find((candidate) => candidate.structure === 'minecraft:fortress');

                expect(start).toBeDefined();
                expect(start!.set).toBe('minecraft:nether_complexes');
                expect(start!.chunkX).toBe(FORTRESS_CHUNK.x);
                expect(start!.chunkZ).toBe(FORTRESS_CHUNK.z);
                expect(start!.origin).toEqual({ x: FORTRESS_CHUNK.x * 16, y: 64, z: FORTRESS_CHUNK.z * 16 });
                expect(start!.pieces.length).toBeGreaterThan(20);
                expect(start!.boundingBox.minY).toBeGreaterThanOrEqual(48);
                expect(generator.unbuiltStructureTypes(SEED, NETHER_STEM)).toEqual(new Set());
            },
            CHUNK_TIMEOUT
        );

        it(
            'writes nether bricks and a chest on the nether bridge loot table into a castle chunk',
            async () => {
                const chunk = await netherChunkAt(FORTRESS_CHEST_CHUNK.x, FORTRESS_CHEST_CHUNK.z);

                expect(chunk.getDimension()).toBe(Dimensions.Nether);
                expect(blocksNamed(chunk, 'minecraft:nether_brick')).toBeGreaterThan(1000);
                expect(blocksNamed(chunk, 'minecraft:nether_brick_fence')).toBeGreaterThan(0);
                expect([...chunk.getBlockEntities()].map((entry) => entry.getId())).toEqual(['Chest']);
                expect([...chunk.getBlockEntities()].map((entry) => entry.toNBT().getString('LootTable', ''))).toEqual([
                    'loot_tables/chests/nether_bridge.json'
                ]);
            },
            CHUNK_TIMEOUT
        );

        it(
            'generates the same castle chunk every time',
            async () => {
                const chunk = await netherChunkAt(FORTRESS_CHEST_CHUNK.x, FORTRESS_CHEST_CHUNK.z);
                const hash = createHash('sha256');
                for (let y = chunk.getMinY(); y <= chunk.getMaxY(); y++) {
                    for (let x = 0; x < 16; x++) {
                        for (let z = 0; z < 16; z++) hash.update(`${chunk.getBlock(x, y, z).name}\n`);
                    }
                }

                expect(hash.digest('hex')).toBe(FORTRESS_CHEST_CHUNK_DIGEST);
            },
            CHUNK_TIMEOUT
        );
    });

    it(
        'names the structure types that still have no builder',
        () => {
            const registries = loadJavaWorldgenRegistries(sources!);
            const types = new Set(
                [...registries.structures.values()].map((document) => String((document as { type?: unknown }).type))
            );
            const missing = [...types].filter((type) => !STRUCTURE_BUILDERS.has(type)).sort();

            // The inventory of what this server does not generate yet, empty since the end city
            // and the nether fortress landed. A type that silently stops generating lands here.
            expect(missing).toEqual([]);
        },
        CHUNK_TIMEOUT
    );
});
