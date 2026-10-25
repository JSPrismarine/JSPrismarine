import type { RandomSource } from '@jsprismarine/worldgen';
import { LegacyRandomSource, SimplexNoise } from '@jsprismarine/worldgen';

import { asArray, asBoolean, asEnum, asInteger, asNumber, asObject, fail } from '../json';
import type { BlockPredicate } from '../providers/blockPredicate';
import { alwaysTrue, parseBlockPredicate } from '../providers/blockPredicate';
import type { HeightProvider } from '../providers/heightProvider';
import { parseHeightProvider } from '../providers/heightProvider';
import type { IntProvider } from '../providers/valueProviders';
import { constantInt, parseIntProvider } from '../providers/valueProviders';
import { typeNameOf } from '../registry';
import type { VerticalDirection } from '../world/BlockState';
import type { BlockPos, FeatureWorld, HeightmapType } from '../world/FeatureWorld';
import { atY, isOutsideBuildHeight, offset } from '../world/FeatureWorld';
import { randomElement } from './WorldgenRandom';

/**
 * The noise Java samples for `noise_based_count` and `noise_threshold_count`.
 *
 * It is `Biome.BIOME_INFO_NOISE`: one simplex octave seeded from 2345 with its coordinate offsets
 * discarded, shared by every world regardless of seed. That is why a flower field sits in the
 * same place in every world, and it is the one part of the decoration pass that is not keyed off
 * the world seed at all.
 */
export const BIOME_INFO_NOISE = new SimplexNoise(new LegacyRandomSource(2345n), true);

/** What a modifier is allowed to ask about the world while it transforms positions. */
export interface PlacementContext {
    /** The world being decorated. */
    readonly world: FeatureWorld;
    /**
     * Answers whether the placed feature being run is listed for the biome at a position, which
     * is the whole of what `minecraft:biome` does.
     *
     * The chunk generator supplies this, because the biome-to-feature table lives there. When a
     * caller places one feature directly, the default accepts every position.
     */
    readonly featureBelongsToBiome?: (position: BlockPos) => boolean;
}

/**
 * One stage of a placed feature's pipeline, Java's `PlacementModifier`.
 *
 * A modifier takes one position and emits zero, one or many. Filters emit zero or one, spreads
 * emit one moved, and counts emit the same position several times. The pipeline composes them.
 */
export interface PlacementModifier {
    /** The modifier's registry name. */
    readonly type: PlacementModifierTypeName;
    /** Transforms one position, pushing each result to `output`. */
    modify(
        context: PlacementContext,
        random: RandomSource,
        origin: BlockPos,
        output: (position: BlockPos) => void
    ): void;
}

/** The eighteen types Java 26.3 registers in `worldgen/placement_modifier_type`. */
export type PlacementModifierTypeName =
    | 'block_predicate_filter'
    | 'rarity_filter'
    | 'random_chance'
    | 'surface_relative_threshold_filter'
    | 'surface_water_depth_filter'
    | 'biome'
    | 'count'
    | 'noise_based_count'
    | 'noise_threshold_count'
    | 'count_on_every_layer'
    | 'cuboid'
    | 'environment_scan'
    | 'heightmap'
    | 'height_range'
    | 'in_square'
    | 'offset'
    | 'randomly_selected'
    | 'fixed_placement';

/** Builds a modifier that keeps a position or drops it, Java's `PlacementFilter`. */
const filter = (
    type: PlacementModifierTypeName,
    shouldPlace: (context: PlacementContext, random: RandomSource, origin: BlockPos) => boolean
): PlacementModifier => ({
    type,
    modify: (context, random, origin, output) => {
        if (shouldPlace(context, random, origin)) output(origin);
    }
});

/** Builds a modifier that repeats a position, Java's `RepeatingPlacement`. */
const repeating = (
    type: PlacementModifierTypeName,
    count: (random: RandomSource, origin: BlockPos) => number
): PlacementModifier => ({
    type,
    modify: (_context, random, origin, output) => {
        const times = count(random, origin);
        for (let index = 0; index < times; index++) output(origin);
    }
});

/** Repeats the origin a drawn number of times. */
export const countPlacement = (count: IntProvider): PlacementModifier =>
    repeating('count', (random) => count.sample(random));

/** Keeps the position with probability `1 / chance`. Costs one draw whether it passes or not. */
export const rarityFilter = (chance: number): PlacementModifier =>
    filter('rarity_filter', (_context, random) => random.nextFloat() < 1 / chance);

/** Keeps the position with the given probability. */
export const randomChance = (chance: number): PlacementModifier =>
    filter('random_chance', (_context, random) => random.nextFloat() < chance);

/** Scatters the position uniformly across the chunk's 16 by 16 footprint, keeping its y. */
export const inSquare = (): PlacementModifier => ({
    type: 'in_square',
    modify: (_context, random, origin, output) => {
        const x = random.nextIntBounded(16) + origin.x;
        const z = random.nextIntBounded(16) + origin.z;
        output({ x, y: origin.y, z });
    }
});

/** Moves the position by a drawn offset on each axis, in x, y, z draw order. */
export const offsetPlacement = (x: IntProvider, y: IntProvider, z: IntProvider): PlacementModifier => ({
    type: 'offset',
    modify: (_context, random, origin, output) => {
        output(offset(origin, x.sample(random), y.sample(random), z.sample(random)));
    }
});

/** Replaces the position's y with a draw from a height provider. */
export const heightRange = (height: HeightProvider): PlacementModifier => ({
    type: 'height_range',
    modify: (context, random, origin, output) => {
        output(atY(origin, height.sample(random, context.world)));
    }
});

/** Moves the position to the top of a heightmap column, dropping it when the column is empty. */
export const heightmapPlacement = (heightmap: HeightmapType): PlacementModifier => ({
    type: 'heightmap',
    modify: (context, _random, origin, output) => {
        const height = context.world.getHeight(heightmap, origin.x, origin.z);
        if (height > context.world.minY) output({ x: origin.x, y: height, z: origin.z });
    }
});

/**
 * Keeps the position when the placed feature is listed for the biome there.
 *
 * Java throws when a feature reaches this modifier without having been looked up through a
 * biome, because placing it anyway would ignore the biome's own list. This reproduces that: a
 * context with no biome table accepts everything, and the chunk generator always supplies one.
 */
export const biomeFilter = (): PlacementModifier =>
    filter('biome', (context, _random, origin) => context.featureBelongsToBiome?.(origin) ?? true);

/** Keeps the position when a block predicate holds there. */
export const blockPredicateFilter = (predicate: BlockPredicate): PlacementModifier =>
    filter('block_predicate_filter', (context, _random, origin) => predicate(context.world, origin));

/** Keeps the position when its y sits within a window around a heightmap's surface. */
export const surfaceRelativeThresholdFilter = (
    heightmap: HeightmapType,
    minInclusive: number,
    maxInclusive: number
): PlacementModifier =>
    filter('surface_relative_threshold_filter', (context, _random, origin) => {
        const surface = context.world.getHeight(heightmap, origin.x, origin.z);
        return surface + minInclusive <= origin.y && origin.y <= surface + maxInclusive;
    });

/** Keeps the position when no more than `maxWaterDepth` of water covers the ocean floor. */
export const surfaceWaterDepthFilter = (maxWaterDepth: number): PlacementModifier =>
    filter('surface_water_depth_filter', (context, _random, origin) => {
        const floor = context.world.getHeight('OCEAN_FLOOR', origin.x, origin.z);
        const surface = context.world.getHeight('WORLD_SURFACE', origin.x, origin.z);
        return surface - floor <= maxWaterDepth;
    });

/** Repeats the origin a number of times read from the shared biome-info noise. */
export const noiseThresholdCount = (noiseLevel: number, belowNoise: number, aboveNoise: number): PlacementModifier =>
    repeating('noise_threshold_count', (_random, origin) =>
        BIOME_INFO_NOISE.get2(origin.x / 200, origin.z / 200) < noiseLevel ? belowNoise : aboveNoise
    );

/** Repeats the origin a number of times scaled from the shared biome-info noise. */
export const noiseBasedCount = (
    noiseToCountRatio: number,
    noiseFactor: number,
    noiseOffset: number
): PlacementModifier =>
    repeating('noise_based_count', (_random, origin) => {
        const value = BIOME_INFO_NOISE.get2(origin.x / noiseFactor, origin.z / noiseFactor);
        return Math.ceil((value + noiseOffset) * noiseToCountRatio);
    });

const isEmptyForLayers = (world: FeatureWorld, position: BlockPos): boolean => {
    const state = world.getBlock(position);
    return world.blocks.isAir(state) || state.name === 'minecraft:water' || state.name === 'minecraft:lava';
};

const findOnGroundY = (world: FeatureWorld, x: number, startY: number, z: number, layer: number): number => {
    let currentLayer = 0;
    let currentIsEmpty = isEmptyForLayers(world, { x, y: startY, z });
    for (let y = startY; y >= world.minY + 1; y--) {
        const below = world.getBlock({ x, y: y - 1, z });
        const belowIsEmpty =
            world.blocks.isAir(below) || below.name === 'minecraft:water' || below.name === 'minecraft:lava';
        if (!belowIsEmpty && currentIsEmpty && below.name !== 'minecraft:bedrock') {
            if (currentLayer === layer) return y;
            currentLayer++;
        }
        currentIsEmpty = belowIsEmpty;
    }
    return Number.MAX_SAFE_INTEGER;
};

/**
 * Places `count` positions on every exposed floor in the column, working downward.
 *
 * Java marks this deprecated and only the nether's vegetation still uses it. It keeps raising the
 * layer index until a pass finds nothing, so the number of draws depends on the terrain.
 */
export const countOnEveryLayer = (count: IntProvider): PlacementModifier => ({
    type: 'count_on_every_layer',
    modify: (context, random, origin, output) => {
        const world = context.world;
        let layer = 0;
        let foundAny: boolean;
        do {
            foundAny = false;
            const times = count.sample(random);
            for (let index = 0; index < times; index++) {
                const x = random.nextIntBounded(16) + origin.x;
                const z = random.nextIntBounded(16) + origin.z;
                const startY = world.getHeight('MOTION_BLOCKING', x, z);
                const y = findOnGroundY(world, x, startY, z, layer);
                if (y !== Number.MAX_SAFE_INTEGER) {
                    output({ x, y, z });
                    foundAny = true;
                }
            }
            layer++;
        } while (foundAny);
    }
});

/**
 * Walks up or down looking for a position that satisfies a predicate.
 *
 * The scan stops at the first target hit, at the world edge, or when the search condition stops
 * holding, and it tests the target once more after the final step, which is how a scan of
 * `max_steps` can land one block past its last move.
 */
export const environmentScan = (
    directionOfSearch: VerticalDirection,
    targetCondition: BlockPredicate,
    allowedSearchCondition: BlockPredicate,
    maxSteps: number
): PlacementModifier => ({
    type: 'environment_scan',
    modify: (context, _random, origin, output) => {
        const world = context.world;
        const step = directionOfSearch === 'up' ? 1 : -1;
        let position = origin;
        if (!allowedSearchCondition(world, position)) return;

        for (let index = 0; index < maxSteps; index++) {
            if (targetCondition(world, position)) {
                output(position);
                return;
            }
            position = atY(position, position.y + step);
            if (isOutsideBuildHeight(world, position.y)) return;
            if (!allowedSearchCondition(world, position)) break;
        }

        if (targetCondition(world, position)) output(position);
    }
});

/** Emits every position of a box anchored at the origin, optionally hollow or shell-free. */
export const cuboidPlacement = (
    xzSize: IntProvider,
    ySize: IntProvider,
    includeEdges: boolean,
    includeInterior: boolean
): PlacementModifier => ({
    type: 'cuboid',
    modify: (_context, random, origin, output) => {
        const height = ySize.sample(random);
        const width = xzSize.sample(random);
        const length = xzSize.sample(random);
        for (let x = 0; x <= width; x++) {
            for (let y = 0; y <= height; y++) {
                for (let z = 0; z <= length; z++) {
                    const onXEdge = x === 0 || x === width;
                    const onYEdge = y === 0 || y === height;
                    const onZEdge = z === 0 || z === length;
                    // Java drops a position only when it sits on two of the three pairs of faces,
                    // which is the set of cube edges rather than its faces.
                    const keepEdges =
                        includeEdges || (!(onXEdge && onYEdge) && !(onZEdge && onYEdge) && !(onXEdge && onZEdge));
                    const keepInterior = includeInterior || onXEdge || onYEdge || onZEdge;
                    if (keepEdges && keepInterior) output(offset(origin, x, y, z));
                }
            }
        }
    }
});

/** Runs one of several modifiers, drawn uniformly. */
export const randomlySelected = (placements: readonly PlacementModifier[]): PlacementModifier => ({
    type: 'randomly_selected',
    modify: (context, random, origin, output) => {
        randomElement(placements, random).modify(context, random, origin, output);
    }
});

/** Emits the listed absolute positions that fall in the origin's chunk. */
export const fixedPlacement = (positions: readonly BlockPos[]): PlacementModifier => ({
    type: 'fixed_placement',
    modify: (_context, _random, origin, output) => {
        const chunkX = origin.x >> 4;
        const chunkZ = origin.z >> 4;
        for (const position of positions) {
            if (position.x >> 4 === chunkX && position.z >> 4 === chunkZ) output(position);
        }
    }
});

const HEIGHTMAPS = [
    'WORLD_SURFACE_WG',
    'WORLD_SURFACE',
    'OCEAN_FLOOR_WG',
    'OCEAN_FLOOR',
    'MOTION_BLOCKING',
    'MOTION_BLOCKING_NO_LEAVES'
] as const satisfies readonly HeightmapType[];

const VERTICAL_DIRECTIONS = ['up', 'down'] as const satisfies readonly VerticalDirection[];

/** Reads one `worldgen/placement_modifier_type` document. */
export const parsePlacementModifier = (source: unknown, path: string): PlacementModifier => {
    const raw = asObject(source, path);
    const type = typeNameOf(raw['type'], path);
    switch (type) {
        case 'count':
            return countPlacement(parseIntProvider(raw['count'], `${path}.count`));
        case 'rarity_filter':
            return rarityFilter(asInteger(raw['chance'], `${path}.chance`));
        case 'random_chance':
            return randomChance(asNumber(raw['chance'], `${path}.chance`));
        case 'in_square':
            return inSquare();
        case 'offset':
            return offsetPlacement(
                raw['x'] === undefined ? constantInt(0) : parseIntProvider(raw['x'], `${path}.x`),
                raw['y'] === undefined ? constantInt(0) : parseIntProvider(raw['y'], `${path}.y`),
                raw['z'] === undefined ? constantInt(0) : parseIntProvider(raw['z'], `${path}.z`)
            );
        case 'height_range':
            return heightRange(parseHeightProvider(raw['height'], `${path}.height`));
        case 'heightmap':
            return heightmapPlacement(asEnum(raw['heightmap'], HEIGHTMAPS, `${path}.heightmap`));
        case 'biome':
            return biomeFilter();
        case 'block_predicate_filter':
            return blockPredicateFilter(parseBlockPredicate(raw['predicate'], `${path}.predicate`));
        case 'surface_relative_threshold_filter':
            return surfaceRelativeThresholdFilter(
                asEnum(raw['heightmap'], HEIGHTMAPS, `${path}.heightmap`),
                asInteger(raw['min_inclusive'], `${path}.min_inclusive`, Number.MIN_SAFE_INTEGER),
                asInteger(raw['max_inclusive'], `${path}.max_inclusive`, Number.MAX_SAFE_INTEGER)
            );
        case 'surface_water_depth_filter':
            return surfaceWaterDepthFilter(asInteger(raw['max_water_depth'], `${path}.max_water_depth`));
        case 'noise_threshold_count':
            return noiseThresholdCount(
                asNumber(raw['noise_level'], `${path}.noise_level`),
                asInteger(raw['below_noise'], `${path}.below_noise`),
                asInteger(raw['above_noise'], `${path}.above_noise`)
            );
        case 'noise_based_count':
            return noiseBasedCount(
                asInteger(raw['noise_to_count_ratio'], `${path}.noise_to_count_ratio`),
                asNumber(raw['noise_factor'], `${path}.noise_factor`),
                asNumber(raw['noise_offset'], `${path}.noise_offset`, 0)
            );
        case 'count_on_every_layer':
            return countOnEveryLayer(parseIntProvider(raw['count'], `${path}.count`));
        case 'environment_scan':
            return environmentScan(
                asEnum(raw['direction_of_search'], VERTICAL_DIRECTIONS, `${path}.direction_of_search`),
                parseBlockPredicate(raw['target_condition'], `${path}.target_condition`),
                raw['allowed_search_condition'] === undefined
                    ? alwaysTrue
                    : parseBlockPredicate(raw['allowed_search_condition'], `${path}.allowed_search_condition`),
                asInteger(raw['max_steps'], `${path}.max_steps`)
            );
        case 'cuboid':
            return cuboidPlacement(
                parseIntProvider(raw['xz_size'], `${path}.xz_size`),
                parseIntProvider(raw['y_size'], `${path}.y_size`),
                asBoolean(raw['include_edges'], `${path}.include_edges`, true),
                asBoolean(raw['include_interior'], `${path}.include_interior`, true)
            );
        case 'randomly_selected': {
            const placements = asArray(raw['placements'], `${path}.placements`).map((entry, index) =>
                parsePlacementModifier(entry, `${path}.placements[${index}]`)
            );
            if (placements.length === 0) return fail(`${path}.placements`, 'expected a non-empty list');
            return randomlySelected(placements);
        }
        case 'fixed_placement':
            return fixedPlacement(
                asArray(raw['positions'], `${path}.positions`).map((entry, index) => {
                    const entryPath = `${path}.positions[${index}]`;
                    const values = asArray(entry, entryPath);
                    if (values.length !== 3) return fail(entryPath, 'expected three integers');
                    return {
                        x: asInteger(values[0], `${entryPath}[0]`),
                        y: asInteger(values[1], `${entryPath}[1]`),
                        z: asInteger(values[2], `${entryPath}[2]`)
                    };
                })
            );
        default:
            return fail(path, `unknown placement modifier type ${JSON.stringify(type)}`);
    }
};
