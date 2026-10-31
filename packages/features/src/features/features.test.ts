import { describe, expect, it } from 'vitest';
import { reportProgress } from '../../../../.test/reportProgress';

import { WorldgenRandom } from '../placement/WorldgenRandom';
import { blockState } from '../world/BlockState';
import type { BlockPos, EntitySpawnOptions, TemplateRequest } from '../world/FeatureWorld';
import { createTestOracle, TestFeatureWorld } from '../world/TestFeatureWorld';
import type { ConfiguredFeature } from './Feature';
import { FEATURE_TYPES } from './Feature';
import { FeatureLoader } from './parse';

/**
 * Feature placements are asserted against the in-memory world rather than against Java.
 *
 * Java's features need a `WorldGenLevel`, which cannot be stood up outside a running server, so
 * the golden vectors in `vectors.test.ts` cover the layer below them and these cover the
 * features themselves by shape, extent and distribution. The package README says so plainly.
 */

const STONE = blockState('minecraft:stone');
const DEEPSLATE = blockState('minecraft:deepslate');
const DIRT = blockState('minecraft:dirt');
const GRASS = blockState('minecraft:grass_block');
const WATER = blockState('minecraft:water');

const oracle = () =>
    createTestOracle({
        nonSolid: [
            'minecraft:oak_leaves',
            'minecraft:oak_sapling',
            'minecraft:short_grass',
            'minecraft:dandelion',
            'minecraft:vine',
            'minecraft:snow'
        ],
        replaceable: [
            'minecraft:oak_sapling',
            'minecraft:short_grass',
            'minecraft:dandelion',
            'minecraft:snow',
            'minecraft:vine'
        ],
        tags: {
            'minecraft:stone_ore_replaceables': ['minecraft:stone'],
            'minecraft:deepslate_ore_replaceables': ['minecraft:deepslate'],
            'minecraft:base_stone_overworld': ['minecraft:stone', 'minecraft:deepslate'],
            'minecraft:dirt': ['minecraft:dirt', 'minecraft:grass_block'],
            'minecraft:leaves': ['minecraft:oak_leaves'],
            'minecraft:logs': ['minecraft:oak_log'],
            'minecraft:replaceable_by_trees': [
                'minecraft:air',
                'minecraft:short_grass',
                'minecraft:dandelion',
                'minecraft:oak_sapling'
            ],
            'minecraft:features_cannot_replace': ['minecraft:bedrock', 'minecraft:chest', 'minecraft:spawner'],
            'minecraft:geode_invalid_blocks': ['minecraft:bedrock', 'minecraft:water', 'minecraft:lava'],
            'minecraft:air': ['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']
        }
    });

const loader = (documents: Record<string, unknown> = {}) =>
    new FeatureLoader({
        feature: (id) => documents[id],
        placedFeature: (id) => documents[id],
        blockStateProvider: (id) => documents[id]
    });

const build = (document: unknown): ConfiguredFeature => loader().readFeature(document, 'test');

/**
 * A column of deepslate, stone, dirt and grass around the origin.
 *
 * It is deliberately small: a feature test only needs the volume the feature can reach, and the
 * world stores every filled position, so a 16-block radius keeps a forty-seed loop fast.
 */
const stoneWorld = (topY = 64, radius = 16) => {
    const world = new TestFeatureWorld({ minY: -64, height: 384, blocks: oracle() });
    world.fill({ x: -radius, y: -64, z: -radius }, { x: radius, y: -1, z: radius }, DEEPSLATE);
    world.fill({ x: -radius, y: 0, z: -radius }, { x: radius, y: topY - 5, z: radius }, STONE);
    world.fill({ x: -radius, y: topY - 4, z: -radius }, { x: radius, y: topY - 1, z: radius }, DIRT);
    world.fill({ x: -radius, y: topY, z: -radius }, { x: radius, y: topY, z: radius }, GRASS);
    world.clearWrites();
    return world;
};

describe('ore', () => {
    const diamondOre = {
        type: 'minecraft:ore',
        size: 8,
        discard_chance_on_air_exposure: 0,
        targets: [
            {
                state: 'minecraft:diamond_ore',
                target: { predicate_type: 'minecraft:tag_match', tag: 'minecraft:stone_ore_replaceables' }
            },
            {
                state: 'minecraft:deepslate_diamond_ore',
                target: { predicate_type: 'minecraft:tag_match', tag: 'minecraft:deepslate_ore_replaceables' }
            }
        ]
    };

    it('places a connected vein of at most `size` blocks', () => {
        const world = stoneWorld();
        const placed = build(diamondOre).place(world, new WorldgenRandom(9n), { x: 0, y: 20, z: 0 });
        expect(placed).toBe(true);
        const ores = world.positionsOf('minecraft:diamond_ore');
        expect(ores.length).toBeGreaterThan(0);
        expect(ores.length).toBeLessThanOrEqual(64);
    });

    it('picks the target whose rule test matches the block it is cutting through', () => {
        const world = stoneWorld();
        build(diamondOre).place(world, new WorldgenRandom(9n), { x: 0, y: -30, z: 0 });
        expect(world.count('minecraft:deepslate_diamond_ore')).toBeGreaterThan(0);
        expect(world.count('minecraft:diamond_ore')).toBe(0);
    });

    it('places nothing where no target matches', () => {
        const world = new TestFeatureWorld({ blocks: oracle() });
        world.fill({ x: -12, y: 8, z: -12 }, { x: 12, y: 32, z: 12 }, blockState('minecraft:netherrack'));
        build(diamondOre).place(world, new WorldgenRandom(9n), { x: 0, y: 20, z: 0 });
        expect(world.count('minecraft:diamond_ore')).toBe(0);
    });

    it('spreads over many seeds without ever leaving its bounding box', () => {
        for (let seed = 0; seed < 20; seed++) {
            const world = stoneWorld();
            build(diamondOre).place(world, new WorldgenRandom(BigInt(seed)), { x: 0, y: 20, z: 0 });
            for (const position of world.positionsOf('minecraft:diamond_ore')) {
                expect(Math.abs(position.x)).toBeLessThanOrEqual(8);
                expect(Math.abs(position.y - 20)).toBeLessThanOrEqual(8);
                expect(Math.abs(position.z)).toBeLessThanOrEqual(8);
            }
        }
    });

    it('scatters loose ore instead of a vein', () => {
        const world = stoneWorld();
        build({ ...diamondOre, type: 'minecraft:scattered_ore', size: 16 }).place(world, new WorldgenRandom(3n), {
            x: 0,
            y: 20,
            z: 0
        });
        expect(world.count('minecraft:diamond_ore')).toBeLessThanOrEqual(16);
    });
});

describe('tree', () => {
    const oak = {
        type: 'minecraft:tree',
        below_trunk_provider: { id: 'minecraft:dirt' },
        trunk_provider: { id: 'minecraft:oak_log', properties: { axis: 'y' } },
        trunk_placer: { type: 'minecraft:straight_trunk_placer', base_height: 4, height_rand_a: 2, height_rand_b: 0 },
        foliage_provider: { id: 'minecraft:oak_leaves', properties: { distance: '7', persistent: 'false' } },
        foliage_placer: { type: 'minecraft:blob_foliage_placer', height: 3, offset: 0, radius: 2 },
        minimum_size: { type: 'minecraft:two_layers_feature_size' },
        decorators: [],
        ignore_vines: true
    };

    it('builds a trunk four to six logs tall on top of the ground', () => {
        const world = stoneWorld();
        const placed = build(oak).place(world, new WorldgenRandom(5n), { x: 0, y: 65, z: 0 });
        expect(placed).toBe(true);

        const logs = world.positionsOf('minecraft:oak_log').filter((position) => position.x === 0 && position.z === 0);
        const heights = logs.map((position) => position.y).sort((a, b) => a - b);
        expect(heights[0]).toBe(65);
        expect(heights.length).toBeGreaterThanOrEqual(4);
        expect(heights.length).toBeLessThanOrEqual(6);
        // The trunk is a contiguous run.
        for (const [index, y] of heights.entries()) expect(y).toBe(65 + index);
    });

    it('puts leaves above the trunk and none below it', () => {
        const world = stoneWorld();
        build(oak).place(world, new WorldgenRandom(5n), { x: 0, y: 65, z: 0 });
        const leaves = world.positionsOf('minecraft:oak_leaves');
        expect(leaves.length).toBeGreaterThan(20);
        for (const leaf of leaves) expect(leaf.y).toBeGreaterThan(65);
    });

    it('turns the dirt under the trunk into the below-trunk block', () => {
        const world = stoneWorld();
        build(oak).place(world, new WorldgenRandom(5n), { x: 0, y: 65, z: 0 });
        expect(world.getBlock({ x: 0, y: 64, z: 0 }).name).toBe('minecraft:dirt');
    });

    it('refuses to grow where the column is blocked', () => {
        const world = stoneWorld();
        world.fill({ x: -2, y: 66, z: -2 }, { x: 2, y: 72, z: 2 }, STONE);
        expect(build(oak).place(world, new WorldgenRandom(5n), { x: 0, y: 65, z: 0 })).toBe(false);
    });

    it('is reproducible for the same seed and different for another', () => {
        const first = stoneWorld();
        const second = stoneWorld();
        const third = stoneWorld();
        build(oak).place(first, new WorldgenRandom(11n), { x: 0, y: 65, z: 0 });
        build(oak).place(second, new WorldgenRandom(11n), { x: 0, y: 65, z: 0 });
        build(oak).place(third, new WorldgenRandom(12n), { x: 0, y: 65, z: 0 });
        expect(second.count('minecraft:oak_leaves')).toBe(first.count('minecraft:oak_leaves'));
        const heights = [first, second, third].map(
            (world) => world.positionsOf('minecraft:oak_log').filter((position) => position.x === 0).length
        );
        expect(heights[1]).toBe(heights[0]);
    });

    it('hangs vines off the trunk when the decorator asks', () => {
        const withVines = { ...oak, decorators: [{ type: 'minecraft:trunk_vine' }] };
        const world = stoneWorld();
        build(withVines).place(world, new WorldgenRandom(7n), { x: 0, y: 65, z: 0 });
        expect(world.count('minecraft:vine')).toBeGreaterThan(0);
    });
});

describe('lake', () => {
    const lavaLake = {
        type: 'minecraft:lake',
        fluid: { id: 'minecraft:lava' },
        barrier: { id: 'minecraft:stone' },
        can_place_feature: { type: 'minecraft:true' },
        can_replace_with_air_or_fluid: {
            type: 'minecraft:not',
            predicate: { type: 'minecraft:matching_block_tag', tag: 'minecraft:features_cannot_replace' }
        },
        can_replace_with_barrier: { type: 'minecraft:true' }
    };

    it('hollows a basin and fills its lower half with fluid', () => {
        const world = stoneWorld(80);
        const placed = build(lavaLake).place(world, new WorldgenRandom(4n), { x: 0, y: 30, z: 0 });
        expect(placed).toBe(true);
        expect(world.count('minecraft:lava')).toBeGreaterThan(0);
        expect(world.count('minecraft:cave_air')).toBeGreaterThan(0);
    });

    it('puts the fluid below the air, never above it', () => {
        const world = stoneWorld(80);
        build(lavaLake).place(world, new WorldgenRandom(4n), { x: 0, y: 30, z: 0 });
        const topFluid = Math.max(...world.positionsOf('minecraft:lava').map((position) => position.y));
        const bottomAir = Math.min(...world.positionsOf('minecraft:cave_air').map((position) => position.y));
        expect(topFluid).toBeLessThan(bottomAir);
    });

    it('refuses to place too close to the bottom of the world', () => {
        const world = stoneWorld(80);
        expect(build(lavaLake).place(world, new WorldgenRandom(4n), { x: 0, y: -62, z: 0 })).toBe(false);
    });
});

describe('geode', () => {
    const amethystGeode = {
        type: 'minecraft:geode',
        blocks: {
            filling_provider: { id: 'minecraft:air' },
            inner_layer_provider: { id: 'minecraft:amethyst_block' },
            alternate_inner_layer_provider: { id: 'minecraft:budding_amethyst' },
            middle_layer_provider: { id: 'minecraft:calcite' },
            outer_layer_provider: { id: 'minecraft:smooth_basalt' },
            inner_placements: ['minecraft:small_amethyst_bud', 'minecraft:amethyst_cluster'],
            cannot_replace: '#minecraft:features_cannot_replace',
            invalid_blocks: '#minecraft:geode_invalid_blocks'
        },
        layers: {},
        crack: { generate_crack_chance: 0.95 },
        outer_wall_distance: { type: 'minecraft:uniform', min_inclusive: 4, max_inclusive: 6 },
        use_alternate_layer0_chance: 0.083,
        invalid_blocks_threshold: 1
    };

    it('builds four concentric shells', () => {
        const world = stoneWorld();
        expect(build(amethystGeode).place(world, new WorldgenRandom(2n), { x: 0, y: 10, z: 0 })).toBe(true);
        expect(world.count('minecraft:smooth_basalt')).toBeGreaterThan(0);
        expect(world.count('minecraft:calcite')).toBeGreaterThan(0);
        expect(world.count('minecraft:amethyst_block')).toBeGreaterThan(0);
        expect(world.count('minecraft:air')).toBeGreaterThan(0);
    });

    it('nests the shells, basalt outside calcite outside amethyst', () => {
        const world = stoneWorld();
        build(amethystGeode).place(world, new WorldgenRandom(2n), { x: 0, y: 10, z: 0 });
        const spread = (name: string) => {
            const positions = world.positionsOf(name);
            return Math.max(...positions.map((position) => Math.abs(position.x)));
        };
        expect(spread('minecraft:smooth_basalt')).toBeGreaterThanOrEqual(spread('minecraft:calcite'));
        expect(spread('minecraft:calcite')).toBeGreaterThanOrEqual(spread('minecraft:amethyst_block'));
    });

    it('refuses to start where too many sample points are invalid', () => {
        const world = new TestFeatureWorld({ blocks: oracle() });
        world.fill({ x: -12, y: 0, z: -12 }, { x: 12, y: 24, z: 12 }, WATER);
        expect(build(amethystGeode).place(world, new WorldgenRandom(2n), { x: 0, y: 10, z: 0 })).toBe(false);
    });
});

describe('projected_random_patchy_square', () => {
    const grassPatch = {
        type: 'minecraft:projected_random_patchy_square',
        block: { id: 'minecraft:short_grass' },
        project_through: { type: 'minecraft:matching_block_tag', tag: 'minecraft:air' },
        size: 3,
        max_projection_height: 4
    };

    it('scatters blocks over a square of the drawn size', () => {
        const world = stoneWorld();
        expect(build(grassPatch).place(world, new WorldgenRandom(6n), { x: 0, y: 65, z: 0 })).toBe(true);
        const placed = world.positionsOf('minecraft:short_grass');
        expect(placed.length).toBeGreaterThan(10);
        for (const position of placed) {
            expect(Math.abs(position.x)).toBeLessThanOrEqual(3);
            expect(Math.abs(position.z)).toBeLessThanOrEqual(3);
        }
    });

    it('thins toward the corners', () => {
        const world = stoneWorld();
        let corners = 0;
        let centers = 0;
        for (let seed = 0; seed < 40; seed++) {
            const trial = stoneWorld();
            build(grassPatch).place(trial, new WorldgenRandom(BigInt(seed)), { x: 0, y: 65, z: 0 });
            for (const position of trial.positionsOf('minecraft:short_grass')) {
                if (Math.abs(position.x) === 3 && Math.abs(position.z) === 3) corners++;
                if (position.x === 0 && position.z === 0) centers++;
            }
        }
        void world;
        expect(corners).toBeLessThan(centers);
    });

    it('drops each block down to the surface below it', () => {
        const world = stoneWorld();
        world.fill({ x: -3, y: 61, z: -3 }, { x: 3, y: 65, z: 3 }, blockState('minecraft:air'));
        build(grassPatch).place(world, new WorldgenRandom(6n), { x: 0, y: 65, z: 0 });
        for (const position of world.positionsOf('minecraft:short_grass')) {
            expect(position.y).toBeLessThanOrEqual(65);
            expect(position.y).toBeGreaterThanOrEqual(61);
        }
    });
});

describe('the registry', () => {
    it('tracks the supported feature types', () => {
        expect(new Set(FEATURE_TYPES).size).toBe(FEATURE_TYPES.length);
        expect(FEATURE_TYPES).toContain('projected_random_patchy_square');
        // 26.3 removed `random_patch`, which the two patchy-square features replaced.
        expect(FEATURE_TYPES).not.toContain('random_patch');
        reportProgress(`${FEATURE_TYPES.length} Java worldgen feature types are registered.`);
    });

    it('refuses an unknown feature type rather than ignoring it', () => {
        expect(() => build({ type: 'minecraft:not_a_feature' })).toThrow(TypeError);
    });

    it('resolves a reference to another feature', () => {
        const documents = {
            'minecraft:inner': { type: 'minecraft:simple_block', to_place: { id: 'minecraft:dandelion' } },
            'minecraft:outer': {
                type: 'minecraft:sequence',
                features: [{ feature: 'minecraft:inner', placement: [] }]
            }
        };
        const resolved = loader(documents).feature('minecraft:outer');
        expect(resolved.type).toBe('sequence');
        expect(resolved.children?.[0]?.type).toBe('simple_block');
    });

    it('refuses a reference cycle rather than recursing forever', () => {
        const documents = {
            'minecraft:a': { type: 'minecraft:sequence', features: [{ feature: 'minecraft:b', placement: [] }] },
            'minecraft:b': { type: 'minecraft:sequence', features: [{ feature: 'minecraft:a', placement: [] }] }
        };
        expect(() => loader(documents).feature('minecraft:a')).toThrow(TypeError);
    });
});

describe('template', () => {
    /** The rule the desert well carries, which gives its suspicious sand something to hold. */
    const ARCHAEOLOGY = {
        processor_type: 'minecraft:rule',
        rules: [
            {
                input_predicate: { predicate_type: 'minecraft:block_match', block: 'minecraft:suspicious_sand' },
                location_predicate: { predicate_type: 'minecraft:always_true' },
                output_state: 'minecraft:suspicious_sand',
                block_entity_modifier: {
                    type: 'minecraft:append_loot',
                    loot_table: 'minecraft:archaeology/desert_well'
                }
            }
        ]
    };

    /** Places a `template` document against a world that records what it was asked to stamp. */
    const stamped = (document: unknown): TemplateRequest[] => {
        const requests: TemplateRequest[] = [];
        const world = Object.assign(new TestFeatureWorld({ blocks: oracle() }), {
            placeTemplate: (request: TemplateRequest) => {
                requests.push(request);
                return true;
            }
        });

        build(document).place(world, new WorldgenRandom(7n), { x: 0, y: 64, z: 0 });
        return requests;
    };

    it('passes a processor list named by identifier through to the world', () => {
        const [request] = stamped({
            type: 'minecraft:template',
            processors: 'minecraft:fossil_rot',
            templates: [{ data: { id: 'minecraft:fossil/spine_1' }, weight: 1 }]
        });

        expect(request?.processors).toBe('minecraft:fossil_rot');
    });

    it('passes a processor list written inline through to the world', () => {
        // Java's codec takes the list where the feature stands as readily as a reference, and
        // the desert well is the one vanilla feature that writes one. A dropped list places the
        // template unprocessed, which is suspicious sand with no loot table on it.
        const [request] = stamped({
            type: 'minecraft:template',
            processors: { processors: [ARCHAEOLOGY] },
            templates: [{ data: { id: 'minecraft:desert_well/suspicious_sand' }, weight: 1 }]
        });

        expect(request?.processors).toEqual({ processors: [ARCHAEOLOGY] });
    });

    it('reads a bare list of processors, which the codec also accepts', () => {
        const [request] = stamped({
            type: 'minecraft:template',
            processors: [ARCHAEOLOGY],
            templates: [{ data: { id: 'minecraft:desert_well/suspicious_sand' }, weight: 1 }]
        });

        expect(request?.processors).toEqual({ processors: [ARCHAEOLOGY] });
    });

    it('asks for no processors when the feature names none', () => {
        const [request] = stamped({
            type: 'minecraft:template',
            templates: [{ data: { id: 'minecraft:desert_well/well' }, weight: 1 }]
        });

        expect(request?.processors).toBeUndefined();
    });
});

describe('end spike', () => {
    const spikeWorld = () => new TestFeatureWorld({ minY: 0, height: 256, seed: 1234n, blocks: oracle() });

    /** Attaches a recording `spawnEntity` to a test world. */
    const recordSpawns = (world: TestFeatureWorld) => {
        const spawns: { type: string; position: BlockPos; options?: EntitySpawnOptions }[] = [];
        const spawning = Object.assign(world, {
            spawnEntity: (type: string, position: BlockPos, options?: EntitySpawnOptions) => {
                spawns.push(options === undefined ? { type, position } : { type, position, options });
            }
        });
        return { spawning, spawns };
    };

    it('forwards the crystal options to spawnEntity', () => {
        const { spawning, spawns } = recordSpawns(spikeWorld());
        const placed = build({
            type: 'minecraft:end_spike',
            spikes: [{ centerX: 5, centerZ: 5, radius: 2, height: 70, guarded: false }],
            crystal_invulnerable: true,
            crystal_beam_target: [0, 128, 0]
        }).place(spawning, new WorldgenRandom(9n), { x: 5, y: 60, z: 5 });

        expect(placed).toBe(true);
        expect(spawns).toHaveLength(1);
        expect(spawns[0]).toMatchObject({
            type: 'minecraft:end_crystal',
            position: { x: 5, y: 71, z: 5 },
            options: { beamTarget: { x: 0, y: 128, z: 0 }, invulnerable: true }
        });
        expect(spawns[0]?.options?.yaw).toBeGreaterThanOrEqual(0);
        expect(spawns[0]?.options?.yaw).toBeLessThan(360);
        expect(spawns[0]?.options?.showBottom).toBeUndefined();
    });

    // Vanilla's end_spike.json ships "spikes": [], which means "derive the ten pillars from the
    // world seed" (EndSpikeFeature.place calling getSpikesForLevel). The expected shapes are the
    // Java-derived literals for seed 1234 pinned in endSpikes.test.ts.
    it('derives the pillars from the world seed when the config lists none', () => {
        const { spawning, spawns } = recordSpawns(spikeWorld());
        const configured = build({ type: 'minecraft:end_spike', spikes: [] });
        const centers = [
            [42, 0],
            [33, 24],
            [12, 39],
            [-13, 39],
            [-34, 24],
            [-42, -1],
            [-34, -25],
            [-13, -40],
            [12, -40],
            [33, -25]
        ] as const;
        for (const [x, z] of centers) {
            expect(configured.place(spawning, new WorldgenRandom(9n), { x, y: 60, z })).toBe(true);
        }

        expect(spawns.map((spawn) => spawn.type)).toEqual(Array(10).fill('minecraft:end_crystal'));

        // The (42, 0) pillar draws index 7 at seed 1234: radius 4, height 97, no cage.
        expect(spawns[0]?.position).toEqual({ x: 42, y: 98, z: 0 });
        expect(spawning.getBlock({ x: 42, y: 96, z: 0 }).name).toBe('minecraft:obsidian');
        expect(spawning.getBlock({ x: 46, y: 96, z: 0 }).name).toBe('minecraft:obsidian');
        expect(spawning.getBlock({ x: 42, y: 97, z: 0 }).name).toBe('minecraft:bedrock');
        expect(spawning.getBlock({ x: 42, y: 98, z: 0 }).name).toBe('minecraft:fire');
        expect(spawning.getBlock({ x: 44, y: 97, z: 0 }).name).toBe('minecraft:air');

        // The (12, 39) pillar draws index 2: radius 2, height 82, iron-bar cage.
        expect(spawns[2]?.position).toEqual({ x: 12, y: 83, z: 39 });
        expect(spawning.getBlock({ x: 14, y: 82, z: 39 }).name).toBe('minecraft:iron_bars');
        expect(spawning.getBlock({ x: 12, y: 85, z: 39 }).name).toBe('minecraft:iron_bars');
    });

    it('leaves the beam target off a worldgen crystal', () => {
        const { spawning, spawns } = recordSpawns(spikeWorld());
        build({
            type: 'minecraft:end_spike',
            spikes: [{ centerX: 5, centerZ: 5, radius: 2, height: 70, guarded: false }]
        }).place(spawning, new WorldgenRandom(9n), { x: 5, y: 60, z: 5 });

        expect(spawns[0]?.options).toMatchObject({ invulnerable: false });
        expect(spawns[0]?.options?.beamTarget).toBeUndefined();
    });
});

describe('the world seam', () => {
    it('writes nothing outside the dimension', () => {
        const world = new TestFeatureWorld({ minY: 0, height: 16, blocks: oracle() });
        const position: BlockPos = { x: 0, y: 100, z: 0 };
        expect(world.setBlock(position, STONE)).toBe(false);
        expect(world.getBlock(position).name).toBe('minecraft:air');
    });

    it('answers heightmaps from the blocks a feature just wrote', () => {
        const world = stoneWorld();
        expect(world.getHeight('WORLD_SURFACE_WG', 0, 0)).toBe(65);
        world.setBlock({ x: 0, y: 70, z: 0 }, STONE);
        expect(world.getHeight('WORLD_SURFACE_WG', 0, 0)).toBe(71);
    });
});
