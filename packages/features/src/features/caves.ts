import type { RandomSource } from '@jsprismarine/worldgen';

import { asInteger, asNumber, asObject } from '../json';
import type { PlacedFeature } from '../placement/pipeline';
import { placeFeature } from '../placement/pipeline';
import { randomBetweenInclusive, randomElement } from '../placement/WorldgenRandom';
import type { BlockPredicate } from '../providers/blockPredicate';
import { parseBlockPredicate } from '../providers/blockPredicate';
import type { BlockStateProvider } from '../providers/blockStateProvider';
import { parseBlockState } from '../providers/blockStateProvider';
import type { FloatProvider, IntProvider } from '../providers/valueProviders';
import { parseFloatProvider, parseIntProvider } from '../providers/valueProviders';
import type { BlockSet } from '../registry';
import { parseBlockSet } from '../registry';
import type { BlockState, Direction, VerticalDirection } from '../world/BlockState';
import {
    ALL_DIRECTIONS,
    blockState,
    HORIZONTAL_DIRECTIONS,
    oppositeDirection,
    withProperty
} from '../world/BlockState';
import type { BlockPos, FeatureWorld } from '../world/FeatureWorld';
import { atY, offset } from '../world/FeatureWorld';
import type { ConfiguredFeature } from './Feature';
import { feature } from './Feature';
import type { FeatureParsers } from './parseContext';
import { above, below, betweenClosed, inBlockSet, mthCos, mthSin, outsideBuildHeight, relative } from './support';

const f32 = Math.fround;
const WATER = blockState('minecraft:water');
const DRIPSTONE_BLOCK = blockState('minecraft:dripstone_block');

/**
 * The cave decoration features: speleothems, large dripstone, vegetation patches, sculk and the
 * nether's stepped columns.
 *
 * They share one shape that nothing else in the feature set has: each starts by scanning the
 * column the origin sits in for a floor and a ceiling, and places relative to whichever it
 * found. Java's `Column.scan` is reproduced here as {@link scanColumn}, because the exact stop
 * condition decides whether a stalagmite roots in the floor or in the air above it.
 */

/** A scanned column: the first non-matching block below and above the origin. */
export interface ScannedColumn {
    /** The y of the first block below the origin that fails `inside`, when there is one. */
    readonly floor?: number;
    /** The y of the first block above the origin that fails `inside`, when there is one. */
    readonly ceiling?: number;
    /** How many `inside` blocks sit strictly between the floor and the ceiling. */
    readonly height?: number;
}

/**
 * Java's `Column.scan`.
 *
 * It walks up to `searchRange - 1` steps in each direction while `inside` holds, and reports the
 * stopping position only when `validEdge` holds there. Both ends are the *edge* block, not the
 * last inside block, which is why a caller adds or subtracts one before placing.
 */
export const scanColumn = (
    world: FeatureWorld,
    origin: BlockPos,
    searchRange: number,
    inside: (state: BlockState, world: FeatureWorld) => boolean,
    validEdge: (state: BlockState, world: FeatureWorld) => boolean
): ScannedColumn | undefined => {
    if (!inside(world.getBlock(origin), world)) return undefined;

    const scan = (step: number): number | undefined => {
        let y = origin.y;
        for (let index = 1; index < searchRange && inside(world.getBlock(atY(origin, y)), world); index++) y += step;
        return validEdge(world.getBlock(atY(origin, y)), world) ? y : undefined;
    };

    const ceiling = scan(1);
    const floor = scan(-1);
    const height = ceiling !== undefined && floor !== undefined ? ceiling - floor - 1 : undefined;
    return {
        ...(floor === undefined ? {} : { floor }),
        ...(ceiling === undefined ? {} : { ceiling }),
        ...(height === undefined ? {} : { height })
    };
};

const isEmptyOrWater = (state: BlockState, world: FeatureWorld): boolean =>
    world.blocks.isAir(state) || state.name === 'minecraft:water';
const isNeitherEmptyNorWater = (state: BlockState, world: FeatureWorld): boolean => !isEmptyOrWater(state, world);
const isEmptyOrWaterOrLava = (state: BlockState, world: FeatureWorld): boolean =>
    isEmptyOrWater(state, world) || state.name === 'minecraft:lava';

const SPELEOTHEM_THICKNESS = ['tip_merge', 'tip', 'frustum', 'middle', 'base'] as const;
type SpeleothemThickness = (typeof SPELEOTHEM_THICKNESS)[number];

const pointedState = (
    pointedBlock: string,
    tipDirection: VerticalDirection,
    thickness: SpeleothemThickness
): BlockState => blockState(pointedBlock, { vertical_direction: tipDirection, thickness, waterlogged: 'false' });

/** Builds the base-to-tip run of pointed blocks Java's `buildBaseToTipColumn` produces. */
const baseToTipColumn = (
    pointedBlock: string,
    tipDirection: VerticalDirection,
    totalLength: number,
    mergedTip: boolean
): BlockState[] => {
    const column: BlockState[] = [];
    if (totalLength >= 3) {
        column.push(pointedState(pointedBlock, tipDirection, 'base'));
        for (let index = 0; index < totalLength - 3; index++) {
            column.push(pointedState(pointedBlock, tipDirection, 'middle'));
        }
    }
    if (totalLength >= 2) column.push(pointedState(pointedBlock, tipDirection, 'frustum'));
    if (totalLength >= 1) column.push(pointedState(pointedBlock, tipDirection, mergedTip ? 'tip_merge' : 'tip'));
    return column;
};

const isBase = (world: FeatureWorld, state: BlockState, baseBlock: string, replaceable: BlockSet): boolean =>
    state.name === baseBlock || inBlockSet(world.blocks, state, replaceable);

const placeBaseBlockIfPossible = (
    world: FeatureWorld,
    position: BlockPos,
    baseBlock: string,
    replaceable: BlockSet
): boolean => {
    if (!inBlockSet(world.blocks, world.getBlock(position), replaceable)) return false;
    world.setBlock(position, blockState(baseBlock));
    return true;
};

const growSpeleothem = (
    world: FeatureWorld,
    startPos: BlockPos,
    tipDirection: VerticalDirection,
    height: number,
    mergedTip: boolean,
    baseBlock: string,
    pointedBlock: string,
    replaceable: BlockSet
): void => {
    const behind = relative(startPos, oppositeDirection(tipDirection));
    if (!isBase(world, world.getBlock(behind), baseBlock, replaceable)) return;

    let position = startPos;
    for (const state of baseToTipColumn(pointedBlock, tipDirection, height, mergedTip)) {
        const wet = world.blocks.fluid(world.getBlock(position)) === 'water';
        world.setBlock(position, withProperty(state, 'waterlogged', wet ? 'true' : 'false'));
        position = relative(position, tipDirection);
    }
};

/**
 * One pointed dripstone with a small patch of base block under it, Java's `speleothem`.
 *
 * 26.3 renamed this from `pointed_dripstone` and made the two blocks configurable, which is what
 * lets the nether's sulfur spikes reuse it.
 */
export const speleothem = (
    baseBlock: string,
    pointedBlock: string,
    replaceableBlocks: BlockSet,
    chanceOfTallerGeneration: number,
    chanceOfDirectionalSpread: number,
    chanceOfSpreadRadius2: number,
    chanceOfSpreadRadius3: number
): ConfiguredFeature =>
    feature('speleothem', (world, random, origin) => {
        const canPlaceAbove = isBase(world, world.getBlock(above(origin)), baseBlock, replaceableBlocks);
        const canPlaceBelow = isBase(world, world.getBlock(below(origin)), baseBlock, replaceableBlocks);
        let tipDirection: VerticalDirection | undefined;
        if (canPlaceAbove && canPlaceBelow) tipDirection = random.nextBoolean() ? 'down' : 'up';
        else if (canPlaceAbove) tipDirection = 'down';
        else if (canPlaceBelow) tipDirection = 'up';
        if (tipDirection === undefined) return false;

        const rootPos = relative(origin, oppositeDirection(tipDirection));
        placeBaseBlockIfPossible(world, rootPos, baseBlock, replaceableBlocks);
        for (const direction of HORIZONTAL_DIRECTIONS) {
            if (random.nextFloat() > chanceOfDirectionalSpread) continue;
            const first = relative(rootPos, direction);
            placeBaseBlockIfPossible(world, first, baseBlock, replaceableBlocks);
            if (random.nextFloat() > chanceOfSpreadRadius2) continue;
            const second = relative(first, randomElement(ALL_DIRECTIONS, random));
            placeBaseBlockIfPossible(world, second, baseBlock, replaceableBlocks);
            if (random.nextFloat() > chanceOfSpreadRadius3) continue;
            const third = relative(second, randomElement(ALL_DIRECTIONS, random));
            placeBaseBlockIfPossible(world, third, baseBlock, replaceableBlocks);
        }

        const taller =
            random.nextFloat() < chanceOfTallerGeneration &&
            isEmptyOrWater(world.getBlock(relative(origin, tipDirection)), world);
        growSpeleothem(world, origin, tipDirection, taller ? 2 : 1, false, baseBlock, pointedBlock, replaceableBlocks);
        return true;
    });

/** How a speleothem cluster is shaped. */
export interface SpeleothemClusterConfig {
    readonly baseBlock: string;
    readonly pointedBlock: string;
    readonly replaceableBlocks: BlockSet;
    readonly floorToCeilingSearchRange: number;
    readonly height: IntProvider;
    readonly radius: IntProvider;
    readonly maxStalagmiteStalactiteHeightDiff: number;
    readonly heightDeviation: number;
    readonly speleothemBlockLayerThickness: IntProvider;
    readonly density: FloatProvider;
    readonly wetness: FloatProvider;
    readonly chanceOfSpeleothemAtMaxDistanceFromCenter: number;
    readonly maxDistanceFromEdgeAffectingChanceOfSpeleothem: number;
    readonly maxDistanceFromCenterAffectingHeightBias: number;
}

const clampedMap = (value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number => {
    if (value <= fromMin) return toMin;
    if (value >= fromMax) return toMax;
    return toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin);
};

const clampedNormal = (random: RandomSource, mean: number, deviation: number, min: number, max: number): number =>
    Math.min(Math.max(f32(mean + f32(f32(random.nextGaussian()) * deviation)), min), max);

/** A field of stalactites and stalagmites, Java's `speleothem_cluster`. */
export const speleothemCluster = (config: SpeleothemClusterConfig): ConfiguredFeature =>
    feature('speleothem_cluster', (world, random, origin) => {
        if (!isEmptyOrWater(world.getBlock(origin), world)) return false;

        const clusterHeight = config.height.sample(random);
        const wetness = config.wetness.sample(random);
        const density = config.density.sample(random);
        const xRadius = config.radius.sample(random);
        const zRadius = config.radius.sample(random);

        const speleothemHeight = (dx: number, dz: number, maxHeight: number): number => {
            if (random.nextFloat() > density) return 0;
            const distance = Math.abs(dx) + Math.abs(dz);
            const mean = clampedMap(distance, 0, config.maxDistanceFromCenterAffectingHeightBias, maxHeight / 2, 0);
            return Math.trunc(clampedNormal(random, mean, config.heightDeviation, 0, maxHeight));
        };

        for (let dx = -xRadius; dx <= xRadius; dx++) {
            for (let dz = -zRadius; dz <= zRadius; dz++) {
                const edgeDistance = Math.min(xRadius - Math.abs(dx), zRadius - Math.abs(dz));
                const chanceOfSpeleothem = clampedMap(
                    edgeDistance,
                    0,
                    config.maxDistanceFromEdgeAffectingChanceOfSpeleothem,
                    config.chanceOfSpeleothemAtMaxDistanceFromCenter,
                    1
                );
                placeSpeleothemColumn(
                    world,
                    random,
                    config,
                    offset(origin, dx, 0, dz),
                    dx,
                    dz,
                    wetness,
                    chanceOfSpeleothem,
                    clusterHeight,
                    speleothemHeight
                );
            }
        }
        return true;
    });

const placeSpeleothemColumn = (
    world: FeatureWorld,
    random: RandomSource,
    config: SpeleothemClusterConfig,
    position: BlockPos,
    dx: number,
    dz: number,
    chanceOfWater: number,
    chanceOfSpeleothem: number,
    clusterHeight: number,
    speleothemHeight: (dx: number, dz: number, maxHeight: number) => number
): void => {
    const scanned = scanColumn(
        world,
        position,
        config.floorToCeilingSearchRange,
        isEmptyOrWater,
        isNeitherEmptyNorWater
    );
    if (scanned === undefined) return;
    const { ceiling } = scanned;
    let floor = scanned.floor;
    if (ceiling === undefined && floor === undefined) return;

    const isLava = (y: number) => world.getBlock(atY(position, y)).name === 'minecraft:lava';
    const replaceWithBase = (startY: number, count: number, step: number) => {
        let cursor = atY(position, startY);
        for (let index = 0; index < count; index++) {
            if (!placeBaseBlockIfPossible(world, cursor, config.baseBlock, config.replaceableBlocks)) return;
            cursor = atY(cursor, cursor.y + step);
        }
    };

    const wantPool = random.nextFloat() < chanceOfWater;
    if (wantPool && floor !== undefined && canPlacePool(world, atY(position, floor), config)) {
        world.setBlock(atY(position, floor), WATER);
        floor = floor - 1;
    }

    const wantStalactite = random.nextDouble() < chanceOfSpeleothem;
    let stalactiteHeight = 0;
    if (ceiling !== undefined && wantStalactite && !isLava(ceiling)) {
        replaceWithBase(ceiling, config.speleothemBlockLayerThickness.sample(random), 1);
        const maxHeight = floor === undefined ? clusterHeight : Math.min(clusterHeight, ceiling - floor);
        stalactiteHeight = speleothemHeight(dx, dz, maxHeight);
    }

    const wantStalagmite = random.nextDouble() < chanceOfSpeleothem;
    let stalagmiteHeight = 0;
    if (floor !== undefined && wantStalagmite && !isLava(floor)) {
        replaceWithBase(floor, config.speleothemBlockLayerThickness.sample(random), -1);
        stalagmiteHeight =
            ceiling !== undefined
                ? Math.max(
                      0,
                      stalactiteHeight +
                          randomBetweenInclusive(
                              random,
                              -config.maxStalagmiteStalactiteHeightDiff,
                              config.maxStalagmiteStalactiteHeightDiff
                          )
                  )
                : speleothemHeight(dx, dz, clusterHeight);
    }

    let actualStalactite = stalactiteHeight;
    let actualStalagmite = stalagmiteHeight;
    if (ceiling !== undefined && floor !== undefined && ceiling - stalactiteHeight <= floor + stalagmiteHeight) {
        const lowestStalactiteBottom = Math.max(ceiling - stalactiteHeight, floor + 1);
        const highestStalagmiteTop = Math.min(floor + stalagmiteHeight, ceiling - 1);
        const bottom = randomBetweenInclusive(random, lowestStalactiteBottom, highestStalagmiteTop + 1);
        actualStalactite = ceiling - bottom;
        actualStalagmite = bottom - 1 - floor;
    }

    const mergeTips =
        random.nextBoolean() &&
        actualStalactite > 0 &&
        actualStalagmite > 0 &&
        scanned.height !== undefined &&
        actualStalactite + actualStalagmite === scanned.height;

    if (ceiling !== undefined) {
        growSpeleothem(
            world,
            atY(position, ceiling - 1),
            'down',
            actualStalactite,
            mergeTips,
            config.baseBlock,
            config.pointedBlock,
            config.replaceableBlocks
        );
    }
    if (floor !== undefined) {
        growSpeleothem(
            world,
            atY(position, floor + 1),
            'up',
            actualStalagmite,
            mergeTips,
            config.baseBlock,
            config.pointedBlock,
            config.replaceableBlocks
        );
    }
};

const canPlacePool = (world: FeatureWorld, position: BlockPos, config: SpeleothemClusterConfig): boolean => {
    const state = world.getBlock(position);
    if (state.name === 'minecraft:water' || state.name === config.baseBlock || state.name === config.pointedBlock) {
        return false;
    }
    if (world.blocks.fluid(world.getBlock(above(position))) === 'water') return false;
    const canBeAdjacent = (target: BlockPos) => {
        const neighbor = world.getBlock(target);
        return (
            world.blocks.hasTag(neighbor, 'minecraft:base_stone_overworld') || world.blocks.fluid(neighbor) === 'water'
        );
    };
    for (const direction of HORIZONTAL_DIRECTIONS) {
        if (!canBeAdjacent(relative(position, direction))) return false;
    }
    return canBeAdjacent(below(position));
};

/** How a large dripstone is shaped. */
export interface LargeDripstoneConfig {
    readonly replaceableBlocks: BlockSet;
    readonly floorToCeilingSearchRange: number;
    readonly columnRadius: IntProvider;
    readonly heightScale: FloatProvider;
    readonly maxColumnRadiusToCaveHeightRatio: number;
    readonly stalactiteBluntness: FloatProvider;
    readonly stalagmiteBluntness: FloatProvider;
    readonly windSpeed: FloatProvider;
    readonly minRadiusForWind: number;
    readonly minBluntnessForWind: number;
}

/** The analytic height curve a large dripstone's profile follows. */
const dripstoneHeight = (xzDistanceFromCenter: number, radius: number, scale: number, bluntness: number): number => {
    const distance = Math.max(xzDistanceFromCenter, bluntness);
    const ratio = (distance / radius) * 0.384;
    const value = scale * (0.75 * ratio ** (4 / 3) - ratio ** (2 / 3) - (1 / 3) * Math.log(ratio));
    return (Math.max(value, 0) / 0.384) * radius;
};

const isCircleMostlyEmbeddedInStone = (world: FeatureWorld, center: BlockPos, radius: number): boolean => {
    if (isEmptyOrWaterOrLava(world.getBlock(center), world)) return false;
    const increment = f32(6 / radius);
    for (let angle = 0; angle < Math.PI * 2; angle = f32(angle + increment)) {
        const dx = Math.trunc(mthCos(angle) * radius);
        const dz = Math.trunc(mthSin(angle) * radius);
        if (isEmptyOrWaterOrLava(world.getBlock(offset(center, dx, 0, dz)), world)) return false;
    }
    return true;
};

/** The cave-spanning dripstone cone pair, Java's `large_dripstone`. */
export const largeDripstone = (config: LargeDripstoneConfig): ConfiguredFeature =>
    feature('large_dripstone', (world, random, origin) => {
        if (!isEmptyOrWater(world.getBlock(origin), world)) return false;
        const scanned = scanColumn(
            world,
            origin,
            config.floorToCeilingSearchRange,
            isEmptyOrWater,
            (state) =>
                isBase(world, state, 'minecraft:dripstone_block', config.replaceableBlocks) ||
                state.name === 'minecraft:lava'
        );
        if (scanned?.floor === undefined || scanned.ceiling === undefined || scanned.height === undefined) return false;
        if (scanned.height < 4) return false;

        const byHeight = Math.trunc(scanned.height * config.maxColumnRadiusToCaveHeightRatio);
        const maxRadius = Math.min(Math.max(byHeight, config.columnRadius.minValue), config.columnRadius.maxValue);
        const radius = randomBetweenInclusive(random, config.columnRadius.minValue, maxRadius);

        const stalactite = {
            root: atY(origin, scanned.ceiling - 1),
            pointingUp: false,
            radius,
            bluntness: config.stalactiteBluntness.sample(random),
            scale: config.heightScale.sample(random)
        };
        const stalagmite = {
            root: atY(origin, scanned.floor + 1),
            pointingUp: true,
            radius,
            bluntness: config.stalagmiteBluntness.sample(random),
            scale: config.heightScale.sample(random)
        };

        const suitable = (cone: typeof stalactite) =>
            cone.radius >= config.minRadiusForWind && cone.bluntness >= config.minBluntnessForWind;
        let wind: ((position: BlockPos) => BlockPos) | undefined;
        if (suitable(stalactite) && suitable(stalagmite)) {
            const speed = config.windSpeed.sample(random);
            const direction = f32(random.nextFloat() * f32(Math.PI));
            const windX = mthCos(direction) * speed;
            const windZ = mthSin(direction) * speed;
            const maxOffset = 16 - radius;
            wind = (position) => {
                const dy = origin.y - position.y;
                const dx = Math.min(Math.max(Math.floor(windX * dy), -maxOffset), maxOffset);
                const dz = Math.min(Math.max(Math.floor(windZ * dy), -maxOffset), maxOffset);
                return offset(position, dx, 0, dz);
            };
        }
        const offsetByWind = wind ?? ((position: BlockPos) => position);

        const settle = (cone: typeof stalactite): boolean => {
            while (cone.radius > 1) {
                let root = cone.root;
                const maxTries = Math.min(10, Math.trunc(dripstoneHeight(0, cone.radius, cone.scale, cone.bluntness)));
                for (let attempt = 0; attempt < maxTries; attempt++) {
                    if (world.getBlock(root).name === 'minecraft:lava') return false;
                    if (isCircleMostlyEmbeddedInStone(world, offsetByWind(root), cone.radius)) {
                        cone.root = root;
                        return true;
                    }
                    root = cone.pointingUp ? below(root) : above(root);
                }
                cone.radius = Math.trunc(cone.radius / 2);
            }
            return false;
        };

        const placeCone = (cone: typeof stalactite): void => {
            for (let dx = -cone.radius; dx <= cone.radius; dx++) {
                for (let dz = -cone.radius; dz <= cone.radius; dz++) {
                    const currentRadius = f32(Math.sqrt(dx * dx + dz * dz));
                    if (currentRadius > cone.radius) continue;
                    let height = Math.trunc(dripstoneHeight(currentRadius, cone.radius, cone.scale, cone.bluntness));
                    if (height <= 0) continue;
                    if (random.nextFloat() < 0.2) {
                        height = Math.trunc(height * f32(f32(random.nextFloat() * f32(0.2)) + 0.8));
                    }

                    let position = offset(cone.root, dx, 0, dz);
                    let hasBeenOutOfStone = false;
                    const maxY = cone.pointingUp
                        ? world.getHeight('WORLD_SURFACE_WG', position.x, position.z)
                        : Number.MAX_SAFE_INTEGER;
                    for (let step = 0; step < height && position.y < maxY; step++) {
                        const target = offsetByWind(position);
                        if (isEmptyOrWaterOrLava(world.getBlock(target), world)) {
                            hasBeenOutOfStone = true;
                            world.setBlock(target, DRIPSTONE_BLOCK);
                        } else if (
                            hasBeenOutOfStone &&
                            world.blocks.hasTag(world.getBlock(target), 'minecraft:base_stone_overworld')
                        ) {
                            break;
                        }
                        position = cone.pointingUp ? above(position) : below(position);
                    }
                }
            }
        };

        const stalactiteSettled = settle(stalactite);
        const stalagmiteSettled = settle(stalagmite);
        if (stalactiteSettled) placeCone(stalactite);
        if (stalagmiteSettled) placeCone(stalagmite);
        return true;
    });

/** How a vegetation patch is shaped. */
export interface VegetationPatchConfig {
    readonly replaceable: BlockSet;
    readonly groundState: BlockStateProvider;
    readonly vegetationFeature: PlacedFeature;
    readonly surface: 'floor' | 'ceiling';
    readonly depth: IntProvider;
    readonly extraBottomBlockChance: number;
    readonly verticalRange: number;
    readonly vegetationChance: number;
    readonly xzRadius: IntProvider;
    readonly extraEdgeColumnChance: number;
}

/**
 * A patch of ground with vegetation on it, Java's `vegetation_patch`.
 *
 * `surface` decides which way is in: a floor patch carves down into the ground and grows up, and
 * a ceiling patch does the reverse, which is how one implementation covers both the lush cave
 * moss floor and its ceiling.
 */
export const vegetationPatch = (config: VegetationPatchConfig, waterlogged = false): ConfiguredFeature =>
    feature(
        waterlogged ? 'waterlogged_vegetation_patch' : 'vegetation_patch',
        (world, random, origin) => {
            const xRadius = config.xzRadius.sample(random) + 1;
            const zRadius = config.xzRadius.sample(random) + 1;
            const inwards: Direction = config.surface === 'floor' ? 'down' : 'up';
            const outwards = oppositeDirection(inwards);
            const surface: BlockPos[] = [];

            const placeGround = (startPos: BlockPos, depth: number): boolean => {
                let cursor = startPos;
                for (let index = 0; index < depth; index++) {
                    const stateToPlace = config.groundState.getState(world, random, cursor);
                    const existing = world.getBlock(cursor);
                    if (stateToPlace.name === existing.name) continue;
                    if (!inBlockSet(world.blocks, existing, config.replaceable)) return index !== 0;
                    world.setBlock(cursor, stateToPlace);
                    cursor = relative(cursor, inwards);
                }
                return true;
            };

            for (let dx = -xRadius; dx <= xRadius; dx++) {
                const isXEdge = dx === -xRadius || dx === xRadius;
                for (let dz = -zRadius; dz <= zRadius; dz++) {
                    const isZEdge = dz === -zRadius || dz === zRadius;
                    const isCorner = isXEdge && isZEdge;
                    const isEdgeNotCorner = (isXEdge || isZEdge) && !isCorner;
                    const keep =
                        !isCorner &&
                        (!isEdgeNotCorner ||
                            (config.extraEdgeColumnChance !== 0 &&
                                !(random.nextFloat() > config.extraEdgeColumnChance)));
                    if (!keep) continue;

                    let cursor = offset(origin, dx, 0, dz);
                    for (
                        let step = 0;
                        world.blocks.isAir(world.getBlock(cursor)) && step < config.verticalRange;
                        step++
                    ) {
                        cursor = relative(cursor, inwards);
                    }
                    for (
                        let step = 0;
                        !world.blocks.isAir(world.getBlock(cursor)) && step < config.verticalRange;
                        step++
                    ) {
                        cursor = relative(cursor, outwards);
                    }

                    const groundPos = relative(cursor, inwards);
                    const groundState = world.getBlock(groundPos);
                    if (!world.blocks.isAir(world.getBlock(cursor))) continue;
                    if (!world.blocks.isSturdy(groundState, outwards)) continue;

                    const extra =
                        config.extraBottomBlockChance > 0 && random.nextFloat() < config.extraBottomBlockChance ? 1 : 0;
                    if (placeGround(groundPos, config.depth.sample(random) + extra)) surface.push(groundPos);
                }
            }

            let placementSurface = surface;
            if (waterlogged) {
                const exposed = (position: BlockPos) =>
                    (['north', 'east', 'south', 'west', 'down'] satisfies Direction[]).some((direction) => {
                        const neighbor = relative(position, direction);
                        return !world.blocks.isSturdy(world.getBlock(neighbor), oppositeDirection(direction));
                    });
                placementSurface = surface.filter((position) => !exposed(position));
                for (const position of placementSurface) world.setBlock(position, WATER);
            }

            for (const position of placementSurface) {
                if (!(config.vegetationChance > 0 && random.nextFloat() < config.vegetationChance)) continue;
                const target = relative(position, outwards);
                const vegetationPos = waterlogged ? below(target) : target;
                if (!placeFeature(config.vegetationFeature, { world }, random, vegetationPos)) continue;
                if (!waterlogged) continue;
                const placed = world.getBlock(target);
                if (placed.properties['waterlogged'] === 'false') {
                    world.setBlock(target, withProperty(placed, 'waterlogged', 'true'));
                }
            }

            return placementSurface.length > 0;
        },
        [config.vegetationFeature.feature]
    );

/**
 * The sculk patch, Java's `sculk_patch`.
 *
 * Java runs its `SculkSpreader` here, which is the same charge-and-cursor simulation the sculk
 * catalyst uses at runtime and lives in the block layer rather than in world generation. This
 * places the seed block and reports success, and the README records the spreader as the caller's
 * job: a server that has sculk behavior already owns the algorithm.
 */
export const sculkPatch = (
    chargeCount: number,
    amountPerCharge: number,
    spreadAttempts: number,
    growthRounds: number,
    spreadRounds: number
): ConfiguredFeature =>
    feature('sculk_patch', (world, _random, origin) => {
        const start = world.getBlock(origin);
        const canSpread =
            start.name.startsWith('minecraft:sculk') ||
            ((world.blocks.isAir(start) || start.name === 'minecraft:water') &&
                ALL_DIRECTIONS.some((direction) => world.blocks.isSolid(world.getBlock(relative(origin, direction)))));
        if (!canSpread) return false;
        void chargeCount;
        void amountPerCharge;
        void spreadAttempts;
        void growthRounds;
        void spreadRounds;
        world.setBlock(origin, blockState('minecraft:sculk'));
        return true;
    });

/** How a stepped column cluster is shaped. */
export interface SteppedColumnClusterConfig {
    readonly block: BlockStateProvider;
    readonly continueThrough: BlockPredicate;
    readonly canReplace: BlockPredicate;
    readonly cannotPlaceOn: BlockSet;
    readonly clusterReach: IntProvider;
    readonly columnCount: IntProvider;
    readonly columnReach: IntProvider;
    readonly height: IntProvider;
}

/** The nether's stepped columns, Java's `stepped_column_cluster`. */
export const steppedColumnCluster = (config: SteppedColumnClusterConfig): ConfiguredFeature =>
    feature('stepped_column_cluster', (world, random, origin) => {
        const canPlaceAt = (position: BlockPos): boolean => {
            if (!config.canReplace(world, position)) return false;
            const under = world.getBlock(below(position));
            return !world.blocks.isAir(under) && !inBlockSet(world.blocks, under, config.cannotPlaceOn);
        };
        if (!canPlaceAt(origin)) return false;

        const columnHeight = config.height.sample(random);
        const clusterReach = Math.min(columnHeight, config.clusterReach.sample(random));
        const count = config.columnCount.sample(random);
        let placed = false;

        for (let index = 0; index < count; index++) {
            // Java's `BlockPos.randomBetweenClosed` draws x, y and z in that order per position.
            const position = {
                x: randomBetweenInclusive(random, origin.x - clusterReach, origin.x + clusterReach),
                y: origin.y,
                z: randomBetweenInclusive(random, origin.z - clusterReach, origin.z + clusterReach)
            };
            const manhattan = Math.abs(position.x - origin.x) + Math.abs(position.z - origin.z);
            const blocksToPlace = columnHeight - manhattan;
            if (blocksToPlace < 0) continue;
            placed =
                placeSteppedColumn(
                    world,
                    random,
                    config,
                    position,
                    blocksToPlace,
                    config.columnReach.sample(random),
                    canPlaceAt
                ) || placed;
        }
        return placed;
    });

const placeSteppedColumn = (
    world: FeatureWorld,
    random: RandomSource,
    config: SteppedColumnClusterConfig,
    origin: BlockPos,
    columnHeight: number,
    reach: number,
    canPlaceAt: (position: BlockPos) => boolean
): boolean => {
    let placedAny = false;
    for (const position of betweenClosed(offset(origin, -reach, 0, -reach), offset(origin, reach, 0, reach))) {
        const stepLimit = Math.abs(position.x - origin.x) + Math.abs(position.z - origin.z);
        const start = config.canReplace(world, position)
            ? findSurfaceBelow(world, position, stepLimit, canPlaceAt)
            : findAirAbove(world, position, stepLimit, config.cannotPlaceOn);
        if (start === undefined) continue;

        let cursor = start;
        for (let remaining = columnHeight - Math.trunc(stepLimit / 2); remaining >= 0; remaining--) {
            if (config.canReplace(world, cursor)) {
                world.setBlock(cursor, config.block.getState(world, random, cursor));
                placedAny = true;
            } else if (!config.continueThrough(world, cursor)) {
                break;
            }
            cursor = above(cursor);
        }
    }
    return placedAny;
};

const findSurfaceBelow = (
    world: FeatureWorld,
    start: BlockPos,
    limit: number,
    canPlaceAt: (position: BlockPos) => boolean
): BlockPos | undefined => {
    let cursor = start;
    let remaining = limit;
    while (cursor.y > world.minY + 1 && remaining > 0) {
        remaining--;
        if (canPlaceAt(cursor)) return cursor;
        cursor = below(cursor);
    }
    return undefined;
};

const findAirAbove = (
    world: FeatureWorld,
    start: BlockPos,
    limit: number,
    cannotPlaceOn: BlockSet
): BlockPos | undefined => {
    let cursor = start;
    let remaining = limit;
    while (!outsideBuildHeight(world, cursor.y) && remaining > 0) {
        remaining--;
        const state = world.getBlock(cursor);
        if (inBlockSet(world.blocks, state, cannotPlaceOn)) return undefined;
        if (world.blocks.isAir(state)) return cursor;
        cursor = above(cursor);
    }
    return undefined;
};

/** Reads the cave feature types. */
export const parseCaveFeature = (
    type: string,
    raw: Record<string, unknown>,
    path: string,
    parsers: FeatureParsers
): ConfiguredFeature | undefined => {
    switch (type) {
        case 'speleothem':
            return speleothem(
                parseBlockState(raw['base_block'], `${path}.base_block`).name,
                parseBlockState(raw['pointed_block'], `${path}.pointed_block`).name,
                parseBlockSet(raw['replaceable_blocks'], `${path}.replaceable_blocks`),
                asNumber(raw['chance_of_taller_generation'], `${path}.chance_of_taller_generation`, 0.2),
                asNumber(raw['chance_of_directional_spread'], `${path}.chance_of_directional_spread`, 0.7),
                asNumber(raw['chance_of_spread_radius2'], `${path}.chance_of_spread_radius2`, 0.5),
                asNumber(raw['chance_of_spread_radius3'], `${path}.chance_of_spread_radius3`, 0.5)
            );

        case 'speleothem_cluster':
            return speleothemCluster({
                baseBlock: parseBlockState(raw['base_block'], `${path}.base_block`).name,
                pointedBlock: parseBlockState(raw['pointed_block'], `${path}.pointed_block`).name,
                replaceableBlocks: parseBlockSet(raw['replaceable_blocks'], `${path}.replaceable_blocks`),
                floorToCeilingSearchRange: asInteger(
                    raw['floor_to_ceiling_search_range'],
                    `${path}.floor_to_ceiling_search_range`
                ),
                height: parseIntProvider(raw['height'], `${path}.height`),
                radius: parseIntProvider(raw['radius'], `${path}.radius`),
                maxStalagmiteStalactiteHeightDiff: asInteger(
                    raw['max_stalagmite_stalactite_height_diff'],
                    `${path}.max_stalagmite_stalactite_height_diff`
                ),
                heightDeviation: asInteger(raw['height_deviation'], `${path}.height_deviation`),
                speleothemBlockLayerThickness: parseIntProvider(
                    raw['speleothem_block_layer_thickness'],
                    `${path}.speleothem_block_layer_thickness`
                ),
                density: parseFloatProvider(raw['density'], `${path}.density`),
                wetness: parseFloatProvider(raw['wetness'], `${path}.wetness`),
                chanceOfSpeleothemAtMaxDistanceFromCenter: asNumber(
                    raw['chance_of_speleothem_at_max_distance_from_center'],
                    `${path}.chance_of_speleothem_at_max_distance_from_center`
                ),
                maxDistanceFromEdgeAffectingChanceOfSpeleothem: asInteger(
                    raw['max_distance_from_edge_affecting_chance_of_speleothem'],
                    `${path}.max_distance_from_edge_affecting_chance_of_speleothem`
                ),
                maxDistanceFromCenterAffectingHeightBias: asInteger(
                    raw['max_distance_from_center_affecting_height_bias'],
                    `${path}.max_distance_from_center_affecting_height_bias`
                )
            });

        case 'large_dripstone':
            return largeDripstone({
                replaceableBlocks: parseBlockSet(raw['replaceable_blocks'], `${path}.replaceable_blocks`),
                floorToCeilingSearchRange: asInteger(
                    raw['floor_to_ceiling_search_range'],
                    `${path}.floor_to_ceiling_search_range`,
                    30
                ),
                columnRadius: parseIntProvider(raw['column_radius'], `${path}.column_radius`),
                heightScale: parseFloatProvider(raw['height_scale'], `${path}.height_scale`),
                maxColumnRadiusToCaveHeightRatio: asNumber(
                    raw['max_column_radius_to_cave_height_ratio'],
                    `${path}.max_column_radius_to_cave_height_ratio`
                ),
                stalactiteBluntness: parseFloatProvider(raw['stalactite_bluntness'], `${path}.stalactite_bluntness`),
                stalagmiteBluntness: parseFloatProvider(raw['stalagmite_bluntness'], `${path}.stalagmite_bluntness`),
                windSpeed: parseFloatProvider(raw['wind_speed'], `${path}.wind_speed`),
                minRadiusForWind: asInteger(raw['min_radius_for_wind'], `${path}.min_radius_for_wind`),
                minBluntnessForWind: asNumber(raw['min_bluntness_for_wind'], `${path}.min_bluntness_for_wind`)
            });

        case 'vegetation_patch':
        case 'waterlogged_vegetation_patch':
            return vegetationPatch(
                {
                    replaceable: parseBlockSet(raw['replaceable'], `${path}.replaceable`),
                    groundState: parsers.blockStateProvider(raw['ground_state'], `${path}.ground_state`),
                    vegetationFeature: parsers.placedFeature(raw['vegetation_feature'], `${path}.vegetation_feature`),
                    surface: raw['surface'] === 'ceiling' ? 'ceiling' : 'floor',
                    depth: parseIntProvider(raw['depth'], `${path}.depth`),
                    extraBottomBlockChance: asNumber(
                        raw['extra_bottom_block_chance'],
                        `${path}.extra_bottom_block_chance`
                    ),
                    verticalRange: asInteger(raw['vertical_range'], `${path}.vertical_range`),
                    vegetationChance: asNumber(raw['vegetation_chance'], `${path}.vegetation_chance`),
                    xzRadius: parseIntProvider(raw['xz_radius'], `${path}.xz_radius`),
                    extraEdgeColumnChance: asNumber(raw['extra_edge_column_chance'], `${path}.extra_edge_column_chance`)
                },
                type === 'waterlogged_vegetation_patch'
            );

        case 'sculk_patch':
            return sculkPatch(
                asInteger(raw['charge_count'], `${path}.charge_count`),
                asInteger(raw['amount_per_charge'], `${path}.amount_per_charge`),
                asInteger(raw['spread_attempts'], `${path}.spread_attempts`),
                asInteger(raw['growth_rounds'], `${path}.growth_rounds`),
                asInteger(raw['spread_rounds'], `${path}.spread_rounds`)
            );

        case 'stepped_column_cluster':
            return steppedColumnCluster({
                block: parsers.blockStateProvider(raw['block'], `${path}.block`),
                continueThrough: parseBlockPredicate(raw['continue_through'], `${path}.continue_through`),
                canReplace: parseBlockPredicate(raw['can_replace'], `${path}.can_replace`),
                cannotPlaceOn: parseBlockSet(raw['cannot_place_on'], `${path}.cannot_place_on`),
                clusterReach: parseIntProvider(raw['cluster_reach'], `${path}.cluster_reach`),
                columnCount: parseIntProvider(raw['column_count'], `${path}.column_count`),
                columnReach: parseIntProvider(raw['column_reach'], `${path}.column_reach`),
                height: parseIntProvider(raw['height'], `${path}.height`)
            });

        default:
            return undefined;
    }
};

/** Shared with the structural features, which also read a block state object out of a field. */
export const readStateObject = (source: unknown, path: string): Record<string, unknown> => asObject(source, path);
