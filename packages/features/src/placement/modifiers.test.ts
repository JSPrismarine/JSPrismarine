import type { RandomSource } from '@jsprismarine/worldgen';
import { describe, expect, it } from 'vitest';

import { alwaysTrue, parseBlockPredicate } from '../providers/blockPredicate';
import { constantInt, uniformInt } from '../providers/valueProviders';
import { blockState } from '../world/BlockState';
import type { BlockPos } from '../world/FeatureWorld';
import { createTestOracle, TestFeatureWorld } from '../world/TestFeatureWorld';
import type { PlacementContext, PlacementModifier } from './modifiers';
import {
    biomeFilter,
    blockPredicateFilter,
    countOnEveryLayer,
    countPlacement,
    cuboidPlacement,
    environmentScan,
    fixedPlacement,
    heightmapPlacement,
    heightRange,
    inSquare,
    noiseBasedCount,
    noiseThresholdCount,
    offsetPlacement,
    parsePlacementModifier,
    randomChance,
    randomlySelected,
    rarityFilter,
    surfaceRelativeThresholdFilter,
    surfaceWaterDepthFilter
} from './modifiers';
import { constantHeight } from '../providers/heightProvider';
import { WorldgenRandom } from './WorldgenRandom';

const STONE = blockState('minecraft:stone');
const WATER = blockState('minecraft:water');
const ORIGIN: BlockPos = { x: 16, y: -64, z: 32 };

const run = (
    modifier: PlacementModifier,
    context: PlacementContext,
    random: RandomSource = new WorldgenRandom(1n),
    origin: BlockPos = ORIGIN
): BlockPos[] => {
    const produced: BlockPos[] = [];
    modifier.modify(context, random, origin, (position) => produced.push(position));
    return produced;
};

const emptyWorld = (): PlacementContext => ({ world: new TestFeatureWorld() });

describe('count', () => {
    it('repeats the origin the drawn number of times', () => {
        expect(run(countPlacement(constantInt(3)), emptyWorld())).toEqual([ORIGIN, ORIGIN, ORIGIN]);
    });

    it('emits nothing for a count of zero', () => {
        expect(run(countPlacement(constantInt(0)), emptyWorld())).toEqual([]);
    });

    it('draws a varying count from a provider', () => {
        const random = new WorldgenRandom(5n);
        const context = emptyWorld();
        const counts = new Set<number>();
        for (let trial = 0; trial < 200; trial++) {
            counts.add(run(countPlacement(uniformInt(1, 4)), context, random).length);
        }
        expect([...counts].sort()).toEqual([1, 2, 3, 4]);
    });
});

describe('rarity_filter', () => {
    it('keeps about one position in `chance`', () => {
        const random = new WorldgenRandom(11n);
        const context = emptyWorld();
        let kept = 0;
        for (let trial = 0; trial < 20000; trial++) kept += run(rarityFilter(32), context, random).length;
        expect(kept).toBeGreaterThan(500);
        expect(kept).toBeLessThan(750);
    });

    it('keeps everything at a chance of one', () => {
        const random = new WorldgenRandom(11n);
        const context = emptyWorld();
        for (let trial = 0; trial < 50; trial++) expect(run(rarityFilter(1), context, random)).toHaveLength(1);
    });

    it('costs a draw whether it passes or not', () => {
        const counting = new WorldgenRandom(11n);
        const reference = new WorldgenRandom(11n);
        const context = emptyWorld();
        for (let trial = 0; trial < 20; trial++) run(rarityFilter(4), context, counting);
        for (let trial = 0; trial < 20; trial++) reference.nextFloat();
        expect(counting.nextInt()).toBe(reference.nextInt());
    });
});

describe('random_chance', () => {
    it('keeps positions at roughly the declared rate', () => {
        const random = new WorldgenRandom(13n);
        const context = emptyWorld();
        let kept = 0;
        for (let trial = 0; trial < 10000; trial++) kept += run(randomChance(0.2), context, random).length;
        expect(kept).toBeGreaterThan(1800);
        expect(kept).toBeLessThan(2200);
    });
});

describe('in_square', () => {
    it('scatters across the chunk footprint and keeps y', () => {
        const random = new WorldgenRandom(2n);
        const context = emptyWorld();
        const xs = new Set<number>();
        const zs = new Set<number>();
        for (let trial = 0; trial < 2000; trial++) {
            const [produced] = run(inSquare(), context, random);
            expect(produced).toBeDefined();
            expect(produced?.y).toBe(ORIGIN.y);
            xs.add((produced?.x ?? 0) - ORIGIN.x);
            zs.add((produced?.z ?? 0) - ORIGIN.z);
        }
        expect([...xs].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_value, index) => index));
        expect([...zs].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_value, index) => index));
    });
});

describe('offset', () => {
    it('draws x, y and z in that order', () => {
        const random = new WorldgenRandom(4n);
        const reference = new WorldgenRandom(4n);
        const [produced] = run(
            offsetPlacement(uniformInt(0, 9), uniformInt(0, 9), uniformInt(0, 9)),
            emptyWorld(),
            random
        );
        const expectedX = reference.nextIntBounded(10);
        const expectedY = reference.nextIntBounded(10);
        const expectedZ = reference.nextIntBounded(10);
        expect(produced).toEqual({ x: ORIGIN.x + expectedX, y: ORIGIN.y + expectedY, z: ORIGIN.z + expectedZ });
    });
});

describe('height_range', () => {
    it('replaces y and keeps x and z', () => {
        const [produced] = run(heightRange(constantHeight({ kind: 'absolute', y: 42 })), emptyWorld());
        expect(produced).toEqual({ x: ORIGIN.x, y: 42, z: ORIGIN.z });
    });

    it('resolves an anchor against the world the context carries', () => {
        const context: PlacementContext = { world: new TestFeatureWorld({ minY: 0, height: 128, seaLevel: 40 }) };
        const [produced] = run(heightRange(constantHeight({ kind: 'relative_to_sea_level', offset: 5 })), context);
        expect(produced?.y).toBe(45);
    });
});

describe('heightmap', () => {
    it('moves the position to the first free y above the column', () => {
        const world = new TestFeatureWorld().fillGround(70, STONE);
        const [produced] = run(heightmapPlacement('WORLD_SURFACE_WG'), { world });
        expect(produced).toEqual({ x: ORIGIN.x, y: 71, z: ORIGIN.z });
    });

    it('drops a position whose column is empty', () => {
        expect(run(heightmapPlacement('WORLD_SURFACE_WG'), emptyWorld())).toEqual([]);
    });

    it('reads water for MOTION_BLOCKING and not for OCEAN_FLOOR', () => {
        const world = new TestFeatureWorld()
            .fillGround(50, STONE)
            .fill({ x: 0, y: 51, z: 0 }, { x: 32, y: 62, z: 64 }, WATER);
        const context = { world };
        expect(run(heightmapPlacement('MOTION_BLOCKING'), context)[0]?.y).toBe(63);
        expect(run(heightmapPlacement('OCEAN_FLOOR'), context)[0]?.y).toBe(51);
    });
});

describe('biome', () => {
    it('accepts everything when the caller supplies no biome table', () => {
        expect(run(biomeFilter(), emptyWorld())).toEqual([ORIGIN]);
    });

    it('asks the caller whether the feature belongs to the biome there', () => {
        const asked: BlockPos[] = [];
        const context: PlacementContext = {
            world: new TestFeatureWorld(),
            featureBelongsToBiome: (position) => {
                asked.push(position);
                return false;
            }
        };
        expect(run(biomeFilter(), context)).toEqual([]);
        expect(asked).toEqual([ORIGIN]);
    });
});

describe('block_predicate_filter', () => {
    it('keeps a position whose predicate holds and drops one whose does not', () => {
        const world = new TestFeatureWorld();
        world.setBlock(ORIGIN, STONE);
        const matchesStone = parseBlockPredicate(
            { type: 'minecraft:matching_blocks', blocks: 'minecraft:stone' },
            'test'
        );
        expect(run(blockPredicateFilter(matchesStone), { world })).toEqual([ORIGIN]);
        expect(
            run(blockPredicateFilter(matchesStone), { world }, new WorldgenRandom(1n), { x: 0, y: 0, z: 0 })
        ).toEqual([]);
    });

    it('draws nothing from the random stream', () => {
        const random = new WorldgenRandom(8n);
        const reference = new WorldgenRandom(8n);
        run(blockPredicateFilter(alwaysTrue), emptyWorld(), random);
        expect(random.nextInt()).toBe(reference.nextInt());
    });
});

describe('surface_relative_threshold_filter', () => {
    it('keeps positions inside the window around the surface', () => {
        const world = new TestFeatureWorld().fillGround(60, STONE);
        const modifier = surfaceRelativeThresholdFilter('WORLD_SURFACE_WG', -2, 3);
        const keep = (y: number) => run(modifier, { world }, new WorldgenRandom(1n), { ...ORIGIN, y }).length === 1;
        // The surface is 61, so the window is [59, 64].
        expect([58, 59, 61, 64, 65].map(keep)).toEqual([false, true, true, true, false]);
    });
});

describe('surface_water_depth_filter', () => {
    it('keeps shallow water and drops deep water', () => {
        const shallow = new TestFeatureWorld()
            .fillGround(50, STONE)
            .fill({ x: 0, y: 51, z: 0 }, { x: 32, y: 51, z: 64 }, WATER);
        const deep = new TestFeatureWorld()
            .fillGround(50, STONE)
            .fill({ x: 0, y: 51, z: 0 }, { x: 32, y: 60, z: 64 }, WATER);
        expect(run(surfaceWaterDepthFilter(2), { world: shallow })).toHaveLength(1);
        expect(run(surfaceWaterDepthFilter(2), { world: deep })).toHaveLength(0);
    });
});

describe('the two noise counts', () => {
    it('reads the shared noise rather than the random stream', () => {
        const random = new WorldgenRandom(3n);
        const reference = new WorldgenRandom(3n);
        run(noiseThresholdCount(-0.8, 15, 4), emptyWorld(), random);
        run(noiseBasedCount(160, 80, 0.3), emptyWorld(), random);
        expect(random.nextInt()).toBe(reference.nextInt());
    });

    it('splits on the threshold', () => {
        const context = emptyWorld();
        const counts = new Set<number>();
        for (let x = 0; x < 2000; x += 37) {
            counts.add(
                run(noiseThresholdCount(-0.8, 15, 4), context, new WorldgenRandom(1n), { x, y: 0, z: 0 }).length
            );
        }
        expect([...counts].sort((a, b) => a - b)).toEqual([4, 15]);
    });

    it('scales the count with the noise and never goes negative', () => {
        const context = emptyWorld();
        for (let x = 0; x < 500; x += 13) {
            const produced = run(noiseBasedCount(160, 80, 0.3), context, new WorldgenRandom(1n), { x, y: 0, z: x });
            expect(produced.length).toBeGreaterThanOrEqual(0);
            expect(produced.length).toBeLessThanOrEqual(208);
        }
    });
});

describe('count_on_every_layer', () => {
    it('finds a floor on every exposed layer of a column', () => {
        const world = new TestFeatureWorld({ minY: 0, height: 64 });
        // Two slabs of stone with air between them, so there are two layers to land on.
        world.fill({ x: 16, y: 0, z: 32 }, { x: 31, y: 9, z: 47 }, STONE);
        world.fill({ x: 16, y: 20, z: 32 }, { x: 31, y: 29, z: 47 }, STONE);
        const produced = run(countOnEveryLayer(constantInt(4)), { world }, new WorldgenRandom(6n), {
            x: 16,
            y: 0,
            z: 32
        });
        const levels = new Set(produced.map((position) => position.y));
        expect([...levels].sort((a, b) => a - b)).toEqual([10, 30]);
    });

    it('emits nothing in an empty world and still terminates', () => {
        expect(run(countOnEveryLayer(constantInt(2)), emptyWorld())).toEqual([]);
    });
});

describe('environment_scan', () => {
    const solid = parseBlockPredicate({ type: 'minecraft:solid' }, 'test');
    const air = parseBlockPredicate({ type: 'minecraft:matching_blocks', blocks: 'minecraft:air' }, 'test');

    it('walks down to the first solid block', () => {
        const world = new TestFeatureWorld().fillGround(40, STONE);
        const produced = run(environmentScan('down', solid, air, 12), { world }, new WorldgenRandom(1n), {
            ...ORIGIN,
            y: 48
        });
        expect(produced).toEqual([{ x: ORIGIN.x, y: 40, z: ORIGIN.z }]);
    });

    it('gives up when the target is further than max_steps', () => {
        const world = new TestFeatureWorld().fillGround(40, STONE);
        expect(
            run(environmentScan('down', solid, air, 3), { world }, new WorldgenRandom(1n), { ...ORIGIN, y: 48 })
        ).toEqual([]);
    });

    it('refuses to start when the search condition fails at the origin', () => {
        const world = new TestFeatureWorld().fillGround(40, STONE);
        expect(
            run(environmentScan('down', solid, air, 12), { world }, new WorldgenRandom(1n), { ...ORIGIN, y: 30 })
        ).toEqual([]);
    });

    it('draws nothing from the random stream', () => {
        const random = new WorldgenRandom(9n);
        const reference = new WorldgenRandom(9n);
        run(environmentScan('up', solid, air, 8), emptyWorld(), random);
        expect(random.nextInt()).toBe(reference.nextInt());
    });
});

describe('cuboid', () => {
    it('fills a solid box', () => {
        const produced = run(cuboidPlacement(constantInt(2), constantInt(1), true, true), emptyWorld());
        expect(produced).toHaveLength(3 * 2 * 3);
    });

    it('drops the cube edges when include_edges is false', () => {
        const solid = run(cuboidPlacement(constantInt(2), constantInt(2), true, true), emptyWorld());
        const edgeless = run(cuboidPlacement(constantInt(2), constantInt(2), false, true), emptyWorld());
        // A 3 by 3 by 3 cube has 8 corners and 12 edge centers.
        expect(solid.length - edgeless.length).toBe(20);
    });

    it('keeps only the shell when include_interior is false', () => {
        const produced = run(cuboidPlacement(constantInt(2), constantInt(2), true, false), emptyWorld());
        expect(produced).toHaveLength(26);
    });
});

describe('randomly_selected', () => {
    it('runs exactly one of its branches', () => {
        const random = new WorldgenRandom(12n);
        const context = emptyWorld();
        const modifier = randomlySelected([countPlacement(constantInt(1)), countPlacement(constantInt(5))]);
        const sizes = new Set<number>();
        for (let trial = 0; trial < 200; trial++) sizes.add(run(modifier, context, random).length);
        expect([...sizes].sort((a, b) => a - b)).toEqual([1, 5]);
    });
});

describe('fixed_placement', () => {
    it('keeps only the positions inside the origin chunk', () => {
        const inside = { x: 20, y: 64, z: 40 };
        const outside = { x: 200, y: 64, z: 40 };
        expect(run(fixedPlacement([inside, outside]), emptyWorld())).toEqual([inside]);
    });
});

describe('parsePlacementModifier', () => {
    it('reads every modifier the vanilla placed features use', () => {
        const documents: Record<string, unknown> = {
            count: { type: 'minecraft:count', count: 7 },
            in_square: { type: 'minecraft:in_square' },
            biome: { type: 'minecraft:biome' },
            heightmap: { type: 'minecraft:heightmap', heightmap: 'OCEAN_FLOOR' },
            height_range: {
                type: 'minecraft:height_range',
                height: {
                    type: 'minecraft:trapezoid',
                    max_inclusive: { above_bottom: 80 },
                    min_inclusive: { above_bottom: -80 }
                }
            },
            offset: { type: 'minecraft:offset', y: 1 },
            rarity_filter: { type: 'minecraft:rarity_filter', chance: 32 },
            random_chance: { type: 'minecraft:random_chance', chance: 0.2 },
            block_predicate_filter: { type: 'minecraft:block_predicate_filter', predicate: { type: 'minecraft:true' } },
            surface_water_depth_filter: { type: 'minecraft:surface_water_depth_filter', max_water_depth: 0 },
            surface_relative_threshold_filter: {
                type: 'minecraft:surface_relative_threshold_filter',
                heightmap: 'OCEAN_FLOOR_WG',
                max_inclusive: -1
            },
            environment_scan: {
                type: 'minecraft:environment_scan',
                direction_of_search: 'down',
                max_steps: 12,
                target_condition: { type: 'minecraft:solid' }
            },
            count_on_every_layer: { type: 'minecraft:count_on_every_layer', count: 4 },
            noise_threshold_count: {
                type: 'minecraft:noise_threshold_count',
                noise_level: -0.8,
                below_noise: 15,
                above_noise: 4
            },
            noise_based_count: {
                type: 'minecraft:noise_based_count',
                noise_to_count_ratio: 160,
                noise_factor: 80.0,
                noise_offset: 0.3
            },
            fixed_placement: { type: 'minecraft:fixed_placement', positions: [[0, 0, 0]] },
            cuboid: { type: 'minecraft:cuboid', xz_size: 3, y_size: 2 },
            randomly_selected: { type: 'minecraft:randomly_selected', placements: [{ type: 'minecraft:in_square' }] }
        };

        for (const [name, document] of Object.entries(documents)) {
            expect(parsePlacementModifier(document, name).type).toBe(name);
        }
        expect(Object.keys(documents)).toHaveLength(18);
    });

    it('refuses an unknown type rather than ignoring it', () => {
        expect(() => parsePlacementModifier({ type: 'minecraft:not_a_modifier' }, 'test')).toThrow(TypeError);
    });

    it('defaults an absent offset axis to zero', () => {
        const world = new TestFeatureWorld({ blocks: createTestOracle() });
        const modifier = parsePlacementModifier({ type: 'minecraft:offset', y: 1 }, 'test');
        expect(run(modifier, { world })).toEqual([{ x: ORIGIN.x, y: ORIGIN.y + 1, z: ORIGIN.z }]);
    });
});
