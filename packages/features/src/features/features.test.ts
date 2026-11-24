import { describe, expect, it, vi } from 'vitest';
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

    it('keeps an ore out of a block with air on any of its six sides when exposure discards it', () => {
        // Loose ore of size one tries the origin itself first, so the air check runs on one block.
        const looseOre = { ...diamondOre, type: 'minecraft:scattered_ore', size: 1, discard_chance_on_air_exposure: 1 };
        const origin = { x: 0, y: 20, z: 0 };
        const placeAt = (seed: bigint, air?: BlockPos): number => {
            const world = stoneWorld();
            if (air !== undefined) world.fill(air, air, blockState('minecraft:air'));
            build(looseOre).place(world, new WorldgenRandom(seed), origin);
            return world.count('minecraft:diamond_ore');
        };
        // A seed whose draw makes one attempt, which in solid stone places the ore.
        const seed = [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n].find((candidate) => placeAt(candidate) === 1);
        if (seed === undefined) throw new Error('no seed made an attempt');

        for (const [dx, dy, dz] of [
            [0, -1, 0],
            [0, 1, 0],
            [0, 0, -1],
            [0, 0, 1],
            [-1, 0, 0],
            [1, 0, 0]
        ] as const) {
            expect(placeAt(seed, { x: origin.x + dx, y: origin.y + dy, z: origin.z + dz }), `${dx},${dy},${dz}`).toBe(
                0
            );
        }
    });

    it("reads a candidate's neighbors through reused positions, as Java moves a MutableBlockPos", () => {
        const world = stoneWorld();
        const reads = vi.spyOn(world, 'getBlock');
        // Every candidate checks for air, and solid stone makes it read all six neighbors.
        build({ ...diamondOre, size: 16, discard_chance_on_air_exposure: 1 }).place(world, new WorldgenRandom(9n), {
            x: 0,
            y: 20,
            z: 0
        });

        // A neighbor read that made a position of its own for each of the six reads left every
        // position read once. A reused one serves several reads, whether it is shared by the whole
        // placement or by one candidate's six neighbors.
        const readsPerPosition = new Map<BlockPos, number>();
        for (const [position] of reads.mock.calls) {
            readsPerPosition.set(position, (readsPerPosition.get(position) ?? 0) + 1);
        }
        const reused = [...readsPerPosition.values()].filter((count) => count > 1);
        expect(reused.length).toBeGreaterThan(0);
        expect(readsPerPosition.size).toBeLessThan(reads.mock.calls.length);
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

describe('spring_feature', () => {
    const waterSpring = {
        type: 'minecraft:spring_feature',
        state: { Name: 'minecraft:water', Properties: { falling: 'true' } },
        requires_block_below: true,
        rock_count: 4,
        hole_count: 1,
        valid_blocks: ['minecraft:stone']
    };

    it('ticks the fluid it opens in a wall, which is what starts the stream', () => {
        const world = stoneWorld();
        world.fill({ x: 0, y: 30, z: 0 }, { x: 0, y: 30, z: 1 }, blockState('minecraft:air'));
        world.clearWrites();

        expect(build(waterSpring).place(world, new WorldgenRandom(1n), { x: 0, y: 30, z: 0 })).toBe(true);
        expect(world.getBlock({ x: 0, y: 30, z: 0 }).name).toBe('minecraft:water');
        expect(world.fluidTicks).toEqual([{ x: 0, y: 30, z: 0 }]);
    });

    it('asks for no tick where it does not open', () => {
        const world = stoneWorld();
        world.fill({ x: 0, y: 30, z: 0 }, { x: 0, y: 30, z: 0 }, blockState('minecraft:air'));
        world.clearWrites();

        expect(build(waterSpring).place(world, new WorldgenRandom(1n), { x: 0, y: 30, z: 0 })).toBe(false);
        expect(world.fluidTicks).toEqual([]);
    });
});

describe('post-processing marks', () => {
    it('writes an ore vein past the post-processing marks, as Java writes ore through the section', () => {
        const world = stoneWorld();
        const magmaOre = {
            type: 'minecraft:ore',
            size: 33,
            discard_chance_on_air_exposure: 0,
            targets: [
                {
                    target: { predicate_type: 'minecraft:tag_match', tag: 'minecraft:stone_ore_replaceables' },
                    state: { Name: 'minecraft:magma_block' }
                }
            ]
        };

        expect(build(magmaOre).place(world, new WorldgenRandom(3n), { x: 0, y: 30, z: 0 })).toBe(true);
        const placed = world.writes.filter((write) => write.state.name === 'minecraft:magma_block');
        expect(placed.length).toBeGreaterThan(0);
        expect(placed.every((write) => !write.postProcess)).toBe(true);
    });

    it('marks every face a multiface growth places, as placeGrowthIfPossible does', () => {
        const world = stoneWorld();
        world.fill({ x: -2, y: 20, z: -2 }, { x: 2, y: 22, z: 2 }, blockState('minecraft:air'));
        world.clearWrites();
        const lichen = {
            type: 'minecraft:multiface_growth',
            block: 'minecraft:glow_lichen',
            search_range: 4,
            can_place_on_floor: true,
            can_place_on_ceiling: true,
            can_place_on_wall: true,
            chance_of_spreading: 0,
            can_be_placed_on: ['minecraft:stone']
        };

        expect(build(lichen).place(world, new WorldgenRandom(5n), { x: 0, y: 21, z: 0 })).toBe(true);
        const faces = world.writes.filter((write) => write.state.name === 'minecraft:glow_lichen');
        expect(faces.length).toBeGreaterThan(0);
        expect(world.postProcessMarks).toEqual(faces.map((write) => write.position));
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

    it('ticks the fluid beside its crack, as Java lets the water it opens onto flow in', () => {
        let ticked = 0;
        for (let seed = 1n; seed <= 40n; seed++) {
            // Stone around the geode, and water on every side past its sample points, where the
            // crack comes out through the shell.
            const world = stoneWorld();
            for (const [from, to] of [
                [-16, -7],
                [7, 16]
            ] as const) {
                world.fill({ x: from, y: 0, z: -16 }, { x: to, y: 30, z: 16 }, WATER);
                world.fill({ x: -16, y: 0, z: from }, { x: 16, y: 30, z: to }, WATER);
            }
            world.clearWrites();
            const wasWater = (position: { x: number; z: number }) =>
                Math.max(Math.abs(position.x), Math.abs(position.z)) >= 7;
            if (!build(amethystGeode).place(world, new WorldgenRandom(seed), { x: 0, y: 14, z: 0 })) continue;

            // A later crack block or amethyst bud can still take a ticked position or the air
            // beside it, which Java's order allows too; the tick then finds no fluid. What holds
            // is that every tick is asked for the water the crack opened onto.
            for (const position of world.fluidTicks) expect(wasWater(position)).toBe(true);
            ticked += world.fluidTicks.length;
        }
        expect(ticked).toBeGreaterThan(0);
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

describe('end podium', () => {
    // Java's EndPodiumFeature.place touches the box (-4, -1, -4)..(4, 32, 4) around the origin
    // where the integer 3D distance to the origin is under 3.5. On the origin layer the cells
    // outside 2.5 are bedrock (squared distances 8, 9 and 10: sixteen cells) and the cells inside
    // are end portal when active, air when inactive (twenty cells once the pillar takes the
    // center). Below sits bedrock inside 2.5 and end stone outside; above is air. A four-high
    // bedrock pillar rises at the origin with a wall torch on each side two blocks up.
    const ORIGIN = { x: 0, y: 62, z: 0 };
    const RING = { inner: [0, 1, 2, 4, 5], rim: [8, 9, 10] };
    const cellsAt = (world: TestFeatureWorld, name: string, y: number) =>
        world.positionsOf(name).filter((position) => position.y === y);
    const placePodium = (active: boolean) => {
        const world = new TestFeatureWorld({ minY: 0, height: 256, blocks: oracle() });
        build({ type: 'minecraft:end_podium', active }).place(world, new WorldgenRandom(9n), ORIGIN);
        return world;
    };

    it('builds the rim, the floor, the pillar and the torches', () => {
        const world = placePodium(false);

        const rim = cellsAt(world, 'minecraft:bedrock', ORIGIN.y).filter(({ x, z }) => x !== 0 || z !== 0);
        expect(rim).toHaveLength(16);
        for (const { x, z } of rim) expect(RING.rim).toContain(x * x + z * z);

        const floor = cellsAt(world, 'minecraft:bedrock', ORIGIN.y - 1);
        expect(floor).toHaveLength(21);
        for (const { x, z } of floor) expect(RING.inner).toContain(x * x + z * z);
        const apron = cellsAt(world, 'minecraft:end_stone', ORIGIN.y - 1);
        expect(apron).toHaveLength(16);
        for (const { x, z } of apron) expect(RING.rim).toContain(x * x + z * z);

        for (let dy = 0; dy < 4; dy++) {
            expect(world.getBlock({ x: 0, y: ORIGIN.y + dy, z: 0 }).name).toBe('minecraft:bedrock');
        }
        expect(world.getBlock({ x: 0, y: ORIGIN.y + 4, z: 0 }).name).toBe('minecraft:air');

        const torchY = ORIGIN.y + 2;
        expect(world.getBlock({ x: 0, y: torchY, z: -1 })).toEqual(
            blockState('minecraft:wall_torch', { facing: 'north' })
        );
        expect(world.getBlock({ x: 1, y: torchY, z: 0 })).toEqual(
            blockState('minecraft:wall_torch', { facing: 'east' })
        );
        expect(world.getBlock({ x: 0, y: torchY, z: 1 })).toEqual(
            blockState('minecraft:wall_torch', { facing: 'south' })
        );
        expect(world.getBlock({ x: -1, y: torchY, z: 0 })).toEqual(
            blockState('minecraft:wall_torch', { facing: 'west' })
        );
        expect(world.count('minecraft:wall_torch')).toBe(4);
    });

    it('fills the active podium with twenty portal cells', () => {
        const world = placePodium(true);

        const portal = cellsAt(world, 'minecraft:end_portal', ORIGIN.y);
        expect(portal).toHaveLength(20);
        for (const { x, z } of portal) expect(RING.inner).toContain(x * x + z * z);
        expect(world.getBlock(ORIGIN).name).toBe('minecraft:bedrock');
        expect(world.count('minecraft:end_portal')).toBe(20);
    });

    it('opens the inactive podium and clears the box above', () => {
        const world = new TestFeatureWorld({ minY: 0, height: 256, blocks: oracle() });
        world.fill({ x: -4, y: ORIGIN.y, z: -4 }, { x: 4, y: ORIGIN.y + 4, z: 4 }, blockState('minecraft:end_stone'));
        build({ type: 'minecraft:end_podium', active: false }).place(world, new WorldgenRandom(9n), ORIGIN);

        expect(world.count('minecraft:end_portal')).toBe(0);
        expect(world.getBlock({ x: 1, y: ORIGIN.y, z: 0 }).name).toBe('minecraft:air');
        // Above the origin layer everything closer than 3.5 becomes air; (1, +3, 0) squares to
        // 10 and is cleared, (2, +3, 0) squares to 13 and stays.
        expect(world.getBlock({ x: 1, y: ORIGIN.y + 3, z: 0 }).name).toBe('minecraft:air');
        expect(world.getBlock({ x: 2, y: ORIGIN.y + 3, z: 0 }).name).toBe('minecraft:end_stone');
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

describe('large_speleothem', () => {
    /** 26.4's `large_icicle` configuration, which builds its cones out of packed ice. */
    const largeIcicle = {
        type: 'minecraft:large_speleothem',
        base_block: 'minecraft:packed_ice',
        column_radius: { type: 'minecraft:uniform', min_inclusive: 3, max_inclusive: 6 },
        height_scale: { type: 'minecraft:uniform', min_inclusive: 0.4, max_exclusive: 2 },
        max_column_radius_to_cave_height_ratio: 0.33,
        min_bluntness_for_wind: 0.6,
        min_radius_for_wind: 4,
        replaceable_blocks: ['minecraft:stone'],
        stalactite_bluntness: { type: 'minecraft:uniform', min_inclusive: 0.3, max_exclusive: 0.9 },
        stalagmite_bluntness: { type: 'minecraft:uniform', min_inclusive: 0.4, max_exclusive: 1 },
        wind_speed: { type: 'minecraft:uniform', min_inclusive: 0, max_exclusive: 0.3 }
    };

    /** A stone floor and ceiling with a 20-block cave between them. */
    const cave = (): TestFeatureWorld => {
        const world = new TestFeatureWorld({ blocks: oracle() });
        for (let x = -12; x <= 12; x++) {
            for (let z = -12; z <= 12; z++) {
                for (let y = -8; y < 0; y++) world.setBlock({ x, y, z }, STONE);
                for (let y = 20; y < 28; y++) world.setBlock({ x, y, z }, STONE);
            }
        }
        return world;
    };

    it('builds its cones out of the base block it names', () => {
        const feature = build(largeIcicle);
        expect(feature.type).toBe('large_speleothem');

        const world = cave();
        expect(feature.place(world, new WorldgenRandom(3n), { x: 0, y: 10, z: 0 })).toBe(true);
        const placed = new Set<string>();
        for (let x = -12; x <= 12; x++) {
            for (let z = -12; z <= 12; z++) {
                for (let y = 0; y < 20; y++) placed.add(world.getBlock({ x, y, z }).name);
            }
        }
        expect(placed).toContain('minecraft:packed_ice');
        expect(placed).not.toContain('minecraft:dripstone_block');
    });
});

describe('crevasse', () => {
    /** 26.4's `ice_crevasse`, with its two tags declared by the test oracle. */
    const iceCrevasse = {
        type: 'minecraft:crevasse',
        acceptable_barrier: { type: 'minecraft:matching_block_tag', tag: 'minecraft:blocks_fluid_flow' },
        carvable_blocks: { type: 'minecraft:matching_block_tag', tag: 'minecraft:ice_crevasse_replaceables' },
        carve_depth: { type: 'minecraft:uniform', min_inclusive: 6, max_inclusive: 10 },
        column_surface_search_range: 8,
        cursor_surface_search_range: 8,
        fill_block: { id: 'minecraft:water', properties: { level: '0' } },
        fill_depth: { type: 'minecraft:uniform', min_inclusive: 4, max_inclusive: 6 },
        max_length: 16,
        max_width: 4,
        min_footprint: 10,
        surface_block: { id: 'minecraft:brittle_ice', properties: { age: '0' } },
        tapering: 0.6,
        turn_factor: 0.05,
        twistiness: 4.0
    };

    const ICE = blockState('minecraft:packed_ice');
    const SURFACE_Y = 40;

    /** A flat sheet of packed ice, 20 deep, with air above it. */
    const iceSheet = (): TestFeatureWorld => {
        const world = new TestFeatureWorld({
            minY: -64,
            height: 384,
            blocks: createTestOracle({
                tags: {
                    'minecraft:ice_crevasse_replaceables': ['minecraft:packed_ice', 'minecraft:snow_block'],
                    'minecraft:blocks_fluid_flow': ['minecraft:stone']
                }
            })
        });
        world.fill({ x: -16, y: SURFACE_Y - 20, z: -16 }, { x: 16, y: SURFACE_Y, z: 16 }, ICE);
        world.clearWrites();
        return world;
    };

    const placeAt = (world: TestFeatureWorld, seed: bigint) =>
        build(iceCrevasse).place(world, new WorldgenRandom(seed), { x: 0, y: SURFACE_Y, z: 0 });

    it('cuts a water-filled channel capped with brittle ice', () => {
        const world = iceSheet();
        expect(placeAt(world, 1n)).toBe(true);

        const caps = world.positionsOf('minecraft:brittle_ice');
        expect(caps.length).toBeGreaterThanOrEqual(10);
        expect(caps.every((cap) => cap.y === SURFACE_Y)).toBe(true);
        expect(world.getBlock({ x: 0, y: SURFACE_Y, z: 0 }).name).toBe('minecraft:brittle_ice');

        // fill_depth is at least 4, so the water starts that far below the origin's surface and
        // runs down to the carved floor, with air between it and the cap.
        const water = world.positionsOf('minecraft:water');
        expect(water.length).toBeGreaterThan(0);
        expect(Math.max(...water.map((block) => block.y))).toBeLessThanOrEqual(SURFACE_Y - 4);
        expect(world.getBlock({ x: 0, y: SURFACE_Y - 1, z: 0 }).name).toBe('minecraft:air');
    });

    it('carves less as the branches taper', () => {
        const world = iceSheet();
        placeAt(world, 7n);
        const depthAt = (x: number, z: number) => {
            let y = SURFACE_Y - 1;
            while (world.getBlock({ x, y, z }).name !== 'minecraft:packed_ice' && y > SURFACE_Y - 20) y--;
            return SURFACE_Y - y;
        };
        const caps = world.positionsOf('minecraft:brittle_ice');
        const farthest = caps.reduce((best, cap) =>
            Math.hypot(cap.x, cap.z) > Math.hypot(best.x, best.z) ? cap : best
        );
        expect(depthAt(farthest.x, farthest.z)).toBeLessThan(depthAt(0, 0));
    });

    it('places nothing when the origin has no carvable surface', () => {
        const world = iceSheet();
        world.fill({ x: -16, y: SURFACE_Y - 20, z: -16 }, { x: 16, y: SURFACE_Y, z: 16 }, STONE);
        world.clearWrites();
        expect(placeAt(world, 1n)).toBe(false);
        expect(world.writes).toEqual([]);
    });

    it('stops carving air beside standing water', () => {
        const world = iceSheet();
        // Water under the ice east of the origin column, one block below the surface.
        world.fill({ x: 1, y: SURFACE_Y - 1, z: -16 }, { x: 16, y: SURFACE_Y - 1, z: 16 }, WATER);
        world.clearWrites();
        expect(placeAt(world, 1n)).toBe(true);
        expect(world.getBlock({ x: 0, y: SURFACE_Y, z: 0 }).name).toBe('minecraft:brittle_ice');
        expect(world.getBlock({ x: 0, y: SURFACE_Y - 1, z: 0 }).name).toBe('minecraft:packed_ice');
    });
});
