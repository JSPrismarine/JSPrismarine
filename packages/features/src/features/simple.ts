import { asArray, asBoolean, asInteger, asNumber, asObject } from '../json';
import type { PlacedFeature } from '../placement/pipeline';
import { placeFeature } from '../placement/pipeline';
import { randomWeighted } from '../placement/WorldgenRandom';
import type { BlockPredicate } from '../providers/blockPredicate';
import { parseBlockPredicate } from '../providers/blockPredicate';
import type { BlockStateProvider } from '../providers/blockStateProvider';
import { parseBlockState } from '../providers/blockStateProvider';
import type { IntProvider } from '../providers/valueProviders';
import { parseIntProvider, parseWeightedList } from '../providers/valueProviders';
import type { BlockSet } from '../registry';
import { parseBlockSet } from '../registry';
import type { BlockState, Direction } from '../world/BlockState';
import {
    ALL_DIRECTIONS,
    blockState,
    HORIZONTAL_DIRECTIONS,
    oppositeDirection,
    withProperty
} from '../world/BlockState';
import type { BlockPos } from '../world/FeatureWorld';
import { atY, offset } from '../world/FeatureWorld';
import type { ConfiguredFeature } from './Feature';
import { feature } from './Feature';
import type { BlockReplacement } from './ruleTest';
import { parseBlockReplacements } from './ruleTest';
import {
    above,
    below,
    betweenClosed,
    distanceSquared,
    inBlockSet,
    isEmptyBlock,
    manhattan,
    outsideBuildHeight,
    relative,
    shuffledCopy,
    withinManhattan
} from './support';
import type { FeatureParsers } from './parseContext';

/**
 * The features whose whole implementation is a few dozen lines: the five selectors, the two
 * sequencers and the small block writers.
 *
 * They are grouped because they share one property that matters for the seed: each decides what
 * to do with the random stream before it touches the world, so a selector that picks a branch
 * costs exactly one draw whichever branch wins.
 */

/** Builds the `no_op` feature, which Java reports as a successful placement that wrote nothing. */
export const noOp = (): ConfiguredFeature => feature('no_op', () => true);

/** Runs one of several placed features, drawn uniformly. Costs one draw. */
export const simpleRandomSelector = (features: readonly PlacedFeature[]): ConfiguredFeature =>
    feature(
        'simple_random_selector',
        (world, random, origin) => {
            const chosen = features[random.nextIntBounded(features.length)];
            return chosen === undefined ? false : placeFeature(chosen, { world }, random, origin);
        },
        features.map((entry) => entry.feature)
    );

/** Runs one of two placed features on a coin flip. */
export const randomBooleanSelector = (whenTrue: PlacedFeature, whenFalse: PlacedFeature): ConfiguredFeature =>
    feature(
        'random_boolean_selector',
        (world, random, origin) => placeFeature(random.nextBoolean() ? whenTrue : whenFalse, { world }, random, origin),
        [whenTrue.feature, whenFalse.feature]
    );

/** Runs one placed feature drawn by weight. */
export const weightedRandomSelector = (
    features: readonly { readonly value: PlacedFeature; readonly weight: number }[]
): ConfiguredFeature =>
    feature(
        'weighted_random_selector',
        (world, random, origin) => placeFeature(randomWeighted(features, random), { world }, random, origin),
        features.map((entry) => entry.value.feature)
    );

/**
 * Walks a list of chance-weighted features, taking the first whose roll succeeds.
 *
 * Java marks this deprecated in favor of `weighted_random_selector`, but 21 vanilla features
 * still use it, and the draw pattern differs: this rolls once per entry until one passes, so the
 * number of draws depends on where the winner sits.
 */
export const randomSelector = (
    features: readonly { readonly feature: PlacedFeature; readonly chance: number }[],
    fallback: PlacedFeature
): ConfiguredFeature =>
    feature(
        'random_selector',
        (world, random, origin) => {
            for (const entry of features) {
                if (random.nextFloat() < entry.chance) {
                    return placeFeature(entry.feature, { world }, random, origin);
                }
            }
            return placeFeature(fallback, { world }, random, origin);
        },
        [...features.map((entry) => entry.feature.feature), fallback.feature]
    );

/** Runs every placed feature at the same origin, reporting whether any placed. */
export const overlay = (features: readonly PlacedFeature[]): ConfiguredFeature =>
    feature(
        'overlay',
        (world, random, origin) => {
            let placedAny = false;
            for (const entry of features) placedAny = placeFeature(entry, { world }, random, origin) || placedAny;
            return placedAny;
        },
        features.map((entry) => entry.feature)
    );

/** Runs every placed feature in order and stops at the first failure. */
export const sequence = (features: readonly PlacedFeature[]): ConfiguredFeature =>
    feature(
        'sequence',
        (world, random, origin) => {
            for (const entry of features) {
                if (!placeFeature(entry, { world }, random, origin)) return false;
            }
            return true;
        },
        features.map((entry) => entry.feature)
    );

/**
 * Places one block, if it would survive there.
 *
 * Java has two special cases this cannot reproduce without a block registry: a double plant
 * places both halves, and a mossy carpet spreads onto its neighbors. Both are recorded in the
 * README as the places where a server's own block behavior has to finish the job.
 */
export const simpleBlock = (toPlace: BlockStateProvider, scheduleTick: boolean): ConfiguredFeature =>
    feature('simple_block', (world, random, origin) => {
        const state = toPlace.getOptionalState(world, random, origin);
        if (state === undefined) return false;
        if (!world.blocks.canSurvive(world, origin, state)) return false;
        world.setBlock(origin, state);
        void scheduleTick;
        return true;
    });

/** Replaces the block at the origin with the first replacement whose rule test matches. */
export const replaceSingleBlock = (replacements: readonly BlockReplacement[]): ConfiguredFeature =>
    feature('replace_single_block', (world, random, origin) => {
        for (const replacement of replacements) {
            if (replacement.target(world.blocks, world.getBlock(origin), origin, random)) {
                world.setBlock(origin, replacement.state);
                break;
            }
        }
        return true;
    });

/** Fills one y level of the chunk with a state, wherever that level is air. */
export const fillLayer = (height: number, state: BlockState): ConfiguredFeature =>
    feature('fill_layer', (world, _random, origin) => {
        const y = world.minY + height;
        for (let dx = 0; dx < 16; dx++) {
            for (let dz = 0; dz < 16; dz++) {
                const position = { x: origin.x + dx, y, z: origin.z + dz };
                if (world.blocks.isAir(world.getBlock(position))) world.setBlock(position, state);
            }
        }
        return true;
    });

const BLUE_ICE = blockState('minecraft:blue_ice');

/** Grows a patch of blue ice underwater beside packed ice. */
export const blueIce = (): ConfiguredFeature =>
    feature('blue_ice', (world, random, origin) => {
        if (origin.y > world.seaLevel - 1) return false;
        if (
            world.getBlock(origin).name !== 'minecraft:water' &&
            world.getBlock(below(origin)).name !== 'minecraft:water'
        ) {
            return false;
        }

        let foundPackedIce = false;
        for (const direction of ALL_DIRECTIONS) {
            if (direction === 'down') continue;
            if (world.getBlock(relative(origin, direction)).name === 'minecraft:packed_ice') {
                foundPackedIce = true;
                break;
            }
        }
        if (!foundPackedIce) return false;

        world.setBlock(origin, BLUE_ICE);
        for (let attempt = 0; attempt < 200; attempt++) {
            const yOffset = random.nextIntBounded(5) - random.nextIntBounded(6);
            // Java narrows the horizontal spread as the attempt reaches below the start.
            let spread = 3;
            if (yOffset < 2) spread += Math.trunc(yOffset / 2);
            if (spread < 1) continue;

            const position = offset(
                origin,
                random.nextIntBounded(spread) - random.nextIntBounded(spread),
                yOffset,
                random.nextIntBounded(spread) - random.nextIntBounded(spread)
            );
            const existing = world.getBlock(position);
            const replaceable =
                world.blocks.isAir(existing) ||
                existing.name === 'minecraft:water' ||
                existing.name === 'minecraft:packed_ice' ||
                existing.name === 'minecraft:ice';
            if (!replaceable) continue;

            for (const direction of ALL_DIRECTIONS) {
                if (world.getBlock(relative(position, direction)).name !== 'minecraft:blue_ice') continue;
                world.setBlock(position, BLUE_ICE);
                break;
            }
        }
        return true;
    });

const COBBLESTONE = blockState('minecraft:cobblestone');
const STONE = blockState('minecraft:stone');

/** Builds the stone platform a player spawns on in a void world. */
export const voidStartPlatform = (): ConfiguredFeature =>
    feature('void_start_platform', (world, _random, origin) => {
        const chunkX = origin.x >> 4;
        const chunkZ = origin.z >> 4;
        const checkerboard = (ax: number, az: number, bx: number, bz: number) =>
            Math.max(Math.abs(ax - bx), Math.abs(az - bz));
        if (checkerboard(chunkX, chunkZ, 0, 0) > 1) return true;

        const platform = { x: 8, y: origin.y + 3, z: 8 };
        for (let z = chunkZ * 16; z <= chunkZ * 16 + 15; z++) {
            for (let x = chunkX * 16; x <= chunkX * 16 + 15; x++) {
                if (checkerboard(platform.x, platform.z, x, z) > 16) continue;
                const position = { x, y: platform.y, z };
                const isCenter = x === platform.x && z === platform.z;
                world.setBlock(position, isCenter ? COBBLESTONE : STONE);
            }
        }
        return true;
    });

const OBSIDIAN = blockState('minecraft:obsidian');
const AIR = blockState('minecraft:air');

/** Builds the five by five obsidian platform an arrival in the end lands on. */
export const endPlatform = (): ConfiguredFeature =>
    feature('end_platform', (world, _random, origin) => {
        for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -1; dy < 3; dy++) {
                    const position = offset(origin, dx, dy, dz);
                    const wanted = dy === -1 ? OBSIDIAN : AIR;
                    if (world.getBlock(position).name !== wanted.name) world.setBlock(position, wanted);
                }
            }
        }
        return true;
    });

/** Stacks one block upward or downward while a predicate and a per-block chance both hold. */
export const singleBlockPillar = (
    block: BlockStateProvider,
    canReplace: BlockPredicate,
    direction: Direction,
    chanceToContinue: number,
    capFeature?: PlacedFeature
): ConfiguredFeature =>
    feature(
        'single_block_pillar',
        (world, random, origin) => {
            let position = origin;
            while (
                canReplace(world, position) &&
                random.nextFloat() < chanceToContinue &&
                !outsideBuildHeight(world, position.y)
            ) {
                world.setBlock(position, block.getState(world, random, position));
                position = relative(position, direction);
            }
            position = relative(position, oppositeDirection(direction));
            if (capFeature !== undefined) placeFeature(capFeature, { world }, random, position);
            return true;
        },
        capFeature === undefined ? undefined : [capFeature.feature]
    );

const MAGMA_BLOCK = blockState('minecraft:magma_block');

/** Scatters magma blocks on an underwater floor, avoiding any that would be visible from the side. */
export const underwaterMagma = (
    floorSearchRange: number,
    placementRadiusAroundFloor: number,
    placementProbabilityPerValidPosition: number
): ConfiguredFeature =>
    feature('underwater_magma', (world, random, origin) => {
        const floorY = findWaterFloor(world, origin, floorSearchRange);
        if (floorY === undefined) return false;

        const floor = atY(origin, floorY);
        const radius = placementRadiusAroundFloor;
        let placed = 0;
        for (const position of betweenClosed(
            offset(floor, -radius, -radius, -radius),
            offset(floor, radius, radius, radius)
        )) {
            if (random.nextFloat() >= placementProbabilityPerValidPosition) continue;
            if (!isValidMagmaPlacement(world, position)) continue;
            world.setBlock(position, MAGMA_BLOCK);
            placed++;
        }
        return placed > 0;
    });

/**
 * Walks down through water and returns the y of the first block that is not water.
 *
 * This is Java's `Column.scan` with water inside and anything else as the edge, so the value is
 * the floor block itself rather than the water above it.
 */
const findWaterFloor = (
    world: Parameters<ConfiguredFeature['place']>[0],
    origin: BlockPos,
    range: number
): number | undefined => {
    if (world.getBlock(origin).name !== 'minecraft:water') return undefined;
    let y = origin.y;
    for (let step = 1; step < range && world.getBlock(atY(origin, y)).name === 'minecraft:water'; step++) y--;
    return world.getBlock(atY(origin, y)).name === 'minecraft:water' ? undefined : y;
};

const isValidMagmaPlacement = (world: Parameters<ConfiguredFeature['place']>[0], position: BlockPos): boolean => {
    const state = world.getBlock(position);
    const isWaterOrAir = state.name === 'minecraft:water' || world.blocks.isAir(state);
    if (isWaterOrAir) return false;
    if (!world.blocks.isSolid(world.getBlock(below(position)))) return false;
    for (const direction of HORIZONTAL_DIRECTIONS) {
        if (!world.blocks.isSolid(world.getBlock(relative(position, direction)))) return false;
    }
    return true;
};

/** Places a block at the origin and scatters more wherever exactly one accepted neighbor sits. */
export const randomNeighborSpread = (
    block: BlockStateProvider,
    acceptedNeighbors: BlockSet,
    canReplace: BlockPredicate,
    attempts: IntProvider,
    xzOffset: IntProvider,
    yOffset: IntProvider
): ConfiguredFeature =>
    feature('random_neighbor_spread', (world, random, origin) => {
        world.setBlock(origin, block.getState(world, random, origin));
        const tries = attempts.sample(random);
        for (let attempt = 0; attempt < tries; attempt++) {
            const position = offset(origin, xzOffset.sample(random), yOffset.sample(random), xzOffset.sample(random));
            if (!canReplace(world, position)) continue;

            let neighbors = 0;
            for (const direction of ALL_DIRECTIONS) {
                if (inBlockSet(world.blocks, world.getBlock(relative(position, direction)), acceptedNeighbors)) {
                    neighbors++;
                }
                if (neighbors > 1) break;
            }
            if (neighbors === 1) world.setBlock(position, block.getState(world, random, position));
        }
        return true;
    });

const ICE = blockState('minecraft:ice');
const SNOW = blockState('minecraft:snow');

/**
 * Freezes exposed water and lays a snow layer across the chunk.
 *
 * Java decides both from the biome's temperature at the position and from the block light there.
 * Temperature comes through {@link import('../world/FeatureWorld').FeatureWorld.isColdEnoughToSnow}
 * and light is taken as dark, which is what a chunk being generated has everywhere but under a
 * light-emitting block.
 */
export const freezeTopLayer = (): ConfiguredFeature =>
    feature('freeze_top_layer', (world, _random, origin) => {
        for (let dx = 0; dx < 16; dx++) {
            for (let dz = 0; dz < 16; dz++) {
                const x = origin.x + dx;
                const z = origin.z + dz;
                const y = world.getHeight('MOTION_BLOCKING', x, z);
                const top = { x, y, z };
                const under = { x, y: y - 1, z };
                if (world.isColdEnoughToSnow?.(top) !== true) continue;

                if (world.getBlock(under).name === 'minecraft:water') world.setBlock(under, ICE);
                const topState = world.getBlock(top);
                if (world.blocks.isAir(topState) && world.blocks.canSurvive(world, top, SNOW)) {
                    world.setBlock(top, SNOW);
                    const belowState = world.getBlock(under);
                    if ('snowy' in belowState.properties)
                        world.setBlock(under, withProperty(belowState, 'snowy', 'true'));
                }
            }
        }
        return true;
    });

/** Scatters blocks over a small disc of ground, thinning toward the edge. */
export const blockPile = (stateProvider: BlockStateProvider): ConfiguredFeature =>
    feature('block_pile', (world, random, origin) => {
        if (origin.y < world.minY + 5) return false;
        const spreadX = 2 + random.nextIntBounded(2);
        const spreadZ = 2 + random.nextIntBounded(2);

        for (const position of betweenClosed(
            offset(origin, -spreadX, 0, -spreadZ),
            offset(origin, spreadX, 1, spreadZ)
        )) {
            const dx = origin.x - position.x;
            const dz = origin.z - position.z;
            const withinBlob = dx * dx + dz * dz <= random.nextFloat() * 10 - random.nextFloat() * 6;
            if (withinBlob || random.nextFloat() < 0.031) {
                if (!isEmptyBlock(world, position)) continue;
                const under = below(position);
                const underState = world.getBlock(under);
                const mayPlace =
                    underState.name === 'minecraft:dirt_path'
                        ? random.nextBoolean()
                        : world.blocks.isSturdy(underState, 'up');
                if (mayPlace) world.setBlock(position, stateProvider.getState(world, random, position));
            }
        }
        return true;
    });

/** Drops three overlapping blobs of one state onto the first block that passes a predicate. */
export const blockBlob = (state: BlockState, canPlaceOn: BlockPredicate): ConfiguredFeature =>
    feature('block_blob', (world, random, origin) => {
        let center = origin;
        while (center.y > world.minY + 3 && !canPlaceOn(world, below(center))) center = below(center);
        if (center.y <= world.minY + 3) return false;

        for (let blob = 0; blob < 3; blob++) {
            const rx = random.nextIntBounded(2);
            const ry = random.nextIntBounded(2);
            const rz = random.nextIntBounded(2);
            const radius = Math.fround((rx + ry + rz) * 0.333 + 0.5);
            for (const position of betweenClosed(offset(center, -rx, -ry, -rz), offset(center, rx, ry, rz))) {
                if (distanceSquared(position, center) <= radius * radius) world.setBlock(position, state);
            }
            center = offset(
                center,
                -1 + random.nextIntBounded(2),
                -random.nextIntBounded(2),
                -1 + random.nextIntBounded(2)
            );
        }
        return true;
    });

/** Finds the nearest target block below and replaces a Manhattan blob of it. */
export const netherrackReplaceBlobs = (
    target: BlockState,
    replacement: BlockState,
    radius: IntProvider
): ConfiguredFeature =>
    feature('netherrack_replace_blobs', (world, random, origin) => {
        const start = atY(origin, Math.min(Math.max(origin.y, world.minY + 1), world.minY + world.height - 1));
        let center: BlockPos | undefined;
        for (let y = start.y; y > world.minY + 1; y--) {
            const position = atY(start, y);
            if (world.getBlock(position).name === target.name) {
                center = position;
                break;
            }
        }
        if (center === undefined) return false;

        const radiusX = radius.sample(random);
        const radiusY = radius.sample(random);
        const radiusZ = radius.sample(random);
        const maximumRadius = Math.max(radiusX, Math.max(radiusY, radiusZ));
        let replacedAny = false;
        for (const position of withinManhattan(center, radiusX, radiusY, radiusZ)) {
            if (manhattan(position, center) > maximumRadius) break;
            if (world.getBlock(position).name !== target.name) continue;
            world.setBlock(position, replacement);
            replacedAny = true;
        }
        return replacedAny;
    });

const DELTA_CANNOT_REPLACE = new Set([
    'minecraft:bedrock',
    'minecraft:nether_bricks',
    'minecraft:nether_brick_fence',
    'minecraft:nether_brick_stairs',
    'minecraft:nether_wart',
    'minecraft:chest',
    'minecraft:spawner'
]);

/** Pours a lava delta with an offset rim over the basalt deltas floor. */
export const deltaFeature = (
    contents: BlockState,
    rim: BlockState,
    size: IntProvider,
    rimSize: IntProvider
): ConfiguredFeature =>
    feature('delta_feature', (world, random, origin) => {
        let anyPlaced = false;
        const spawnRim = random.nextDouble() < 0.9;
        const rimX = spawnRim ? rimSize.sample(random) : 0;
        const rimZ = spawnRim ? rimSize.sample(random) : 0;
        const hasRim = spawnRim && rimX !== 0 && rimZ !== 0;
        const radiusX = size.sample(random);
        const radiusZ = size.sample(random);
        const radiusLimit = Math.max(radiusX, radiusZ);

        const isClear = (position: BlockPos): boolean => {
            const state = world.getBlock(position);
            if (state.name === contents.name) return false;
            if (DELTA_CANNOT_REPLACE.has(state.name)) return false;
            for (const direction of ALL_DIRECTIONS) {
                const isAir = world.blocks.isAir(world.getBlock(relative(position, direction)));
                if ((isAir && direction !== 'up') || (!isAir && direction === 'up')) return false;
            }
            return true;
        };

        for (const position of withinManhattan(origin, radiusX, 0, radiusZ)) {
            if (manhattan(position, origin) > radiusLimit) break;
            if (!isClear(position)) continue;
            if (hasRim) {
                anyPlaced = true;
                world.setBlock(position, rim);
            }
            const shifted = offset(position, rimX, 0, rimZ);
            if (isClear(shifted)) {
                anyPlaced = true;
                world.setBlock(shifted, contents);
            }
        }
        return anyPlaced;
    });

/** Lays a flat disc of blocks wherever a target predicate holds, within a drawn radius. */
export const disk = (
    stateProvider: BlockStateProvider,
    target: BlockPredicate,
    radius: IntProvider,
    halfHeight: number
): ConfiguredFeature =>
    feature('disk', (world, random, origin) => {
        let placedAny = false;
        const top = origin.y + halfHeight;
        const bottom = origin.y - halfHeight - 1;
        const drawn = radius.sample(random);

        for (const column of betweenClosed(offset(origin, -drawn, 0, -drawn), offset(origin, drawn, 0, drawn))) {
            const dx = column.x - origin.x;
            const dz = column.z - origin.z;
            if (dx * dx + dz * dz > drawn * drawn) continue;
            for (let y = top; y > bottom; y--) {
                const position = { x: column.x, y, z: column.z };
                if (!target(world, position)) continue;
                const state = stateProvider.getOptionalState(world, random, position);
                if (state === undefined) continue;
                world.setBlock(position, state);
                placedAny = true;
            }
        }
        return placedAny;
    });

/** Opens a one-block fluid spring in a wall with exactly the declared rock and hole counts. */
export const springFeature = (
    fluid: BlockState,
    requiresBlockBelow: boolean,
    rockCount: number,
    holeCount: number,
    validBlocks: BlockSet
): ConfiguredFeature =>
    feature('spring_feature', (world, _random, origin) => {
        const isValid = (position: BlockPos) => inBlockSet(world.blocks, world.getBlock(position), validBlocks);
        if (!isValid(above(origin))) return false;
        if (requiresBlockBelow && !isValid(below(origin))) return false;

        const current = world.getBlock(origin);
        if (!world.blocks.isAir(current) && !inBlockSet(world.blocks, current, validBlocks)) return false;

        const sides = [
            relative(origin, 'west'),
            relative(origin, 'east'),
            relative(origin, 'north'),
            relative(origin, 'south'),
            below(origin)
        ];
        let rocks = 0;
        for (const side of sides) if (isValid(side)) rocks++;
        let holes = 0;
        for (const side of sides) if (isEmptyBlock(world, side)) holes++;

        if (rocks !== rockCount || holes !== holeCount) return false;
        world.setBlock(origin, fluid);
        return true;
    });

/**
 * The vine state property for the face a vine attaches to.
 *
 * A vine names the direction of the block it hangs on, so `north=true` means the support is to
 * the north. There is no `down`, which is why the feature skips that direction.
 */
const VINE_FACE_PROPERTIES: Readonly<Record<Direction, string | undefined>> = {
    up: 'up',
    down: undefined,
    north: 'north',
    south: 'south',
    west: 'west',
    east: 'east'
};

/** Hangs a vine on the first face of the origin that has a block behind it. */
export const vines = (): ConfiguredFeature =>
    feature('vines', (world, _random, origin) => {
        if (!isEmptyBlock(world, origin)) return false;
        for (const direction of ALL_DIRECTIONS) {
            if (direction === 'down') continue;
            const property = VINE_FACE_PROPERTIES[direction];
            if (property === undefined) continue;
            const neighbor = world.getBlock(relative(origin, direction));
            if (!world.blocks.isSturdy(neighbor, oppositeDirection(direction))) continue;
            world.setBlock(origin, blockState('minecraft:vine', { [property]: 'true' }));
            return true;
        }
        return false;
    });

/**
 * Grows a face-attached block such as glow lichen or sculk vein onto a nearby surface.
 *
 * Java then rolls `chance_of_spreading` and, when it passes, asks the block's own spreader to
 * continue from the placed face. The spreader is block behavior rather than world generation, so
 * this places the first face and stops; the README records the spread pass as the caller's job.
 * The roll is still drawn, because it costs one float whichever way it lands, and the chance
 * itself therefore does not reach this function.
 */
export const multifaceGrowth = (
    placeBlock: string,
    searchRange: number,
    canPlaceOnFloor: boolean,
    canPlaceOnCeiling: boolean,
    canPlaceOnWall: boolean,
    canBePlacedOn: BlockSet
): ConfiguredFeature =>
    feature('multiface_growth', (world, random, origin) => {
        const isAirOrWater = (position: BlockPos) => {
            const state = world.getBlock(position);
            return world.blocks.isAir(state) || state.name === 'minecraft:water';
        };
        if (!isAirOrWater(origin)) return false;

        const valid: Direction[] = [];
        if (canPlaceOnCeiling) valid.push('up');
        if (canPlaceOnFloor) valid.push('down');
        if (canPlaceOnWall) valid.push(...HORIZONTAL_DIRECTIONS);
        if (valid.length === 0) return false;

        const tryPlace = (position: BlockPos, directions: readonly Direction[]): boolean => {
            for (const direction of directions) {
                const neighbor = world.getBlock(relative(position, direction));
                if (!inBlockSet(world.blocks, neighbor, canBePlacedOn)) continue;
                // A multiface block names the face it sits on, including `down`, which vines lack.
                const existing = world.getBlock(position);
                const base = existing.name === placeBlock ? existing : blockState(placeBlock);
                world.setBlock(position, withProperty(base, direction, 'true'));
                random.nextFloat();
                return true;
            }
            return false;
        };

        const searchDirections = shuffledCopy(valid, random);
        if (tryPlace(origin, searchDirections)) return true;

        for (const searchDirection of searchDirections) {
            const opposite = oppositeDirection(searchDirection);
            const placementDirections = shuffledCopy(
                valid.filter((direction) => direction !== opposite),
                random
            );
            // Java resets the cursor to one step from the origin on every iteration rather than
            // walking outward, so the scan tests the same position `search_range` times.
            let position = origin;
            for (let step = 0; step < searchRange; step++) {
                position = relative(origin, searchDirection);
                const state = world.getBlock(position);
                if (!isAirOrWater(position) && state.name !== placeBlock) break;
                if (tryPlace(position, placementDirections)) return true;
            }
        }
        return false;
    });

/** One band of a `block_column`: how many blocks and which state they take. */
export interface BlockColumnLayer {
    /** How tall the band is. */
    readonly height: IntProvider;
    /** What the band is made of. */
    readonly provider: BlockStateProvider;
}

/**
 * Stacks several bands of blocks in one direction, trimming them when the column runs into
 * something.
 *
 * Which end gets trimmed is `prioritize_tip`: a twisting vine keeps its tip and loses its stem,
 * while a kelp column keeps its stem and loses its tip.
 */
export const blockColumn = (
    layers: readonly BlockColumnLayer[],
    direction: Direction,
    allowedPlacement: BlockPredicate,
    prioritizeTip: boolean
): ConfiguredFeature =>
    feature('block_column', (world, random, origin) => {
        const heights = layers.map((layer) => layer.height.sample(random));
        let totalHeight = 0;
        for (const height of heights) totalHeight += height;
        if (totalHeight === 0) return false;

        let probe = relative(origin, direction);
        for (let step = 0; step < totalHeight; step++) {
            if (!allowedPlacement(world, probe)) {
                truncateColumn(heights, totalHeight, step, prioritizeTip);
                break;
            }
            probe = relative(probe, direction);
        }

        let position = origin;
        for (const [index, layer] of layers.entries()) {
            const count = heights[index] ?? 0;
            for (let step = 0; step < count; step++) {
                world.setBlock(position, layer.provider.getState(world, random, position));
                position = relative(position, direction);
            }
        }
        return true;
    });

const truncateColumn = (heights: number[], totalHeight: number, newHeight: number, prioritizeTip: boolean): void => {
    let toRemove = totalHeight - newHeight;
    const step = prioritizeTip ? 1 : -1;
    const start = prioritizeTip ? 0 : heights.length - 1;
    const end = prioritizeTip ? heights.length : -1;
    for (let index = start; index !== end && toRemove > 0; index += step) {
        const held = heights[index] ?? 0;
        const removed = Math.min(held, toRemove);
        toRemove -= removed;
        heights[index] = held - removed;
    }
};

/**
 * Scatters blocks over a square, thinning toward the corners, dropping each one onto the surface
 * below it.
 *
 * 26.3 added this and removed `random_patch`. The corner thinning is the whole difference: a
 * position's chance of being used falls with the product of its two offsets, so the patch comes
 * out round rather than square.
 */
export const projectedRandomPatchySquare = (
    block: BlockStateProvider,
    projectThrough: BlockPredicate,
    size: IntProvider,
    maxProjectionHeight: number
): ConfiguredFeature =>
    feature('projected_random_patchy_square', (world, random, origin) => {
        const drawn = size.sample(random);
        const bound = drawn * drawn + 1;

        for (let dx = -drawn; dx <= drawn; dx++) {
            for (let dz = -drawn; dz <= drawn; dz++) {
                const probability = Math.abs(dx) * Math.abs(dz);
                if (random.nextIntBounded(bound) >= bound - probability) continue;

                let position = offset(origin, dx, 0, dz);
                let drop = maxProjectionHeight;
                while (projectThrough(world, below(position))) {
                    position = below(position);
                    if (--drop <= 0) break;
                }

                const state = block.getOptionalState(world, random, position);
                if (state !== undefined) world.setBlock(position, state);
            }
        }
        return true;
    });

/** Reads the simple feature types, given the parsers for the nested documents they carry. */
export const parseSimpleFeature = (
    type: string,
    raw: Record<string, unknown>,
    path: string,
    parsers: FeatureParsers
): ConfiguredFeature | undefined => {
    switch (type) {
        case 'no_op':
            return noOp();
        case 'simple_random_selector':
            return simpleRandomSelector(parsers.placedFeatureList(raw['features'], `${path}.features`));
        case 'random_boolean_selector':
            return randomBooleanSelector(
                parsers.placedFeature(raw['feature_true'], `${path}.feature_true`),
                parsers.placedFeature(raw['feature_false'], `${path}.feature_false`)
            );
        case 'weighted_random_selector':
            return weightedRandomSelector(
                parseWeightedList(raw['features'], `${path}.features`, (value, entryPath) =>
                    parsers.placedFeature(value, entryPath)
                )
            );
        case 'random_selector':
            return randomSelector(
                asArray(raw['features'], `${path}.features`).map((entry, index) => {
                    const entryPath = `${path}.features[${index}]`;
                    const item = asObject(entry, entryPath);
                    return {
                        feature: parsers.placedFeature(item['feature'], `${entryPath}.feature`),
                        chance: asNumber(item['chance'], `${entryPath}.chance`)
                    };
                }),
                parsers.placedFeature(raw['default'], `${path}.default`)
            );
        case 'overlay':
            return overlay(parsers.placedFeatureList(raw['features'], `${path}.features`));
        case 'sequence':
            return sequence(parsers.placedFeatureList(raw['features'], `${path}.features`));
        case 'simple_block':
            return simpleBlock(
                parsers.blockStateProvider(raw['to_place'], `${path}.to_place`),
                asBoolean(raw['schedule_tick'], `${path}.schedule_tick`, false)
            );
        case 'replace_single_block':
            return replaceSingleBlock(parseBlockReplacements(raw['replacements'], `${path}.replacements`));
        case 'fill_layer':
            return fillLayer(
                asInteger(raw['height'], `${path}.height`),
                parseBlockState(raw['state'], `${path}.state`)
            );
        case 'blue_ice':
            return blueIce();
        case 'void_start_platform':
            return voidStartPlatform();
        case 'end_platform':
            return endPlatform();
        case 'single_block_pillar': {
            const cap = raw['cap_feature'];
            return singleBlockPillar(
                parsers.blockStateProvider(raw['block'], `${path}.block`),
                raw['can_replace'] === undefined
                    ? () => true
                    : parseBlockPredicate(raw['can_replace'], `${path}.can_replace`),
                parsers.verticalDirection(raw['direction'], `${path}.direction`),
                asNumber(raw['chance_to_continue'], `${path}.chance_to_continue`, 1),
                cap === undefined ? undefined : parsers.placedFeature(cap, `${path}.cap_feature`)
            );
        }
        case 'underwater_magma':
            return underwaterMagma(
                asInteger(raw['floor_search_range'], `${path}.floor_search_range`),
                asInteger(raw['placement_radius_around_floor'], `${path}.placement_radius_around_floor`),
                asNumber(
                    raw['placement_probability_per_valid_position'],
                    `${path}.placement_probability_per_valid_position`
                )
            );
        case 'random_neighbor_spread':
            return randomNeighborSpread(
                parsers.blockStateProvider(raw['block'], `${path}.block`),
                parseBlockSet(raw['accepted_neighbors'], `${path}.accepted_neighbors`),
                parseBlockPredicate(raw['can_replace'], `${path}.can_replace`),
                parseIntProvider(raw['attempts'], `${path}.attempts`),
                parseIntProvider(raw['xz_offset'], `${path}.xz_offset`),
                parseIntProvider(raw['y_offset'], `${path}.y_offset`)
            );
        case 'freeze_top_layer':
            return freezeTopLayer();
        case 'block_pile':
            return blockPile(parsers.blockStateProvider(raw['state_provider'], `${path}.state_provider`));
        case 'block_blob':
            return blockBlob(
                parseBlockState(raw['state'], `${path}.state`),
                parseBlockPredicate(raw['can_place_on'], `${path}.can_place_on`)
            );
        case 'netherrack_replace_blobs':
            return netherrackReplaceBlobs(
                parseBlockState(raw['target'], `${path}.target`),
                parseBlockState(raw['state'], `${path}.state`),
                parseIntProvider(raw['radius'], `${path}.radius`)
            );
        case 'delta_feature':
            return deltaFeature(
                parseBlockState(raw['contents'], `${path}.contents`),
                parseBlockState(raw['rim'], `${path}.rim`),
                parseIntProvider(raw['size'], `${path}.size`),
                parseIntProvider(raw['rim_size'], `${path}.rim_size`)
            );
        case 'disk':
            return disk(
                parsers.blockStateProvider(raw['state_provider'], `${path}.state_provider`),
                parseBlockPredicate(raw['target'], `${path}.target`),
                parseIntProvider(raw['radius'], `${path}.radius`),
                asInteger(raw['half_height'], `${path}.half_height`)
            );
        case 'spring_feature':
            return springFeature(
                parsers.fluidState(raw['state'], `${path}.state`),
                asBoolean(raw['requires_block_below'], `${path}.requires_block_below`, true),
                asInteger(raw['rock_count'], `${path}.rock_count`, 4),
                asInteger(raw['hole_count'], `${path}.hole_count`, 1),
                parseBlockSet(raw['valid_blocks'], `${path}.valid_blocks`)
            );
        case 'vines':
            return vines();
        case 'multiface_growth':
            return multifaceGrowth(
                parsers.identifier(raw['block'], `${path}.block`),
                asInteger(raw['search_range'], `${path}.search_range`, 10),
                asBoolean(raw['can_place_on_floor'], `${path}.can_place_on_floor`, false),
                asBoolean(raw['can_place_on_ceiling'], `${path}.can_place_on_ceiling`, false),
                asBoolean(raw['can_place_on_wall'], `${path}.can_place_on_wall`, false),
                parseBlockSet(raw['can_be_placed_on'], `${path}.can_be_placed_on`)
            );
        case 'block_column':
            return blockColumn(
                asArray(raw['layers'], `${path}.layers`).map((entry, index) => {
                    const layerPath = `${path}.layers[${index}]`;
                    const layer = asObject(entry, layerPath);
                    return {
                        height: parseIntProvider(layer['height'], `${layerPath}.height`),
                        provider: parsers.blockStateProvider(layer['provider'], `${layerPath}.provider`)
                    };
                }),
                parsers.direction(raw['direction'], `${path}.direction`),
                parseBlockPredicate(raw['allowed_placement'], `${path}.allowed_placement`),
                asBoolean(raw['prioritize_tip'], `${path}.prioritize_tip`, false)
            );
        case 'projected_random_patchy_square':
            return projectedRandomPatchySquare(
                parsers.blockStateProvider(raw['block'], `${path}.block`),
                parseBlockPredicate(raw['project_through'], `${path}.project_through`),
                parseIntProvider(raw['size'], `${path}.size`),
                asInteger(raw['max_projection_height'], `${path}.max_projection_height`)
            );
        default:
            return undefined;
    }
};
