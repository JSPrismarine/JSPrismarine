import type { RandomSource } from '@jsprismarine/worldgen';
import { LegacyRandomSource, NormalNoise } from '@jsprismarine/worldgen';

import { asArray, asBoolean, asInteger, asNumber, asObject } from '../json';
import type { PlacedFeature } from '../placement/pipeline';
import { placeFeature } from '../placement/pipeline';
import { randomBetweenInclusive, randomElement, randomWeighted } from '../placement/WorldgenRandom';
import type { BlockPredicate } from '../providers/blockPredicate';
import { parseBlockPredicate } from '../providers/blockPredicate';
import type { BlockStateProvider } from '../providers/blockStateProvider';
import { parseBlockState } from '../providers/blockStateProvider';
import type { IntProvider } from '../providers/valueProviders';
import { parseIntProvider, parseWeightedList } from '../providers/valueProviders';
import type { BlockSet } from '../registry';
import { normalizeIdentifier, parseBlockSet } from '../registry';
import type { BlockState, Direction } from '../world/BlockState';
import { blockState, HORIZONTAL_DIRECTIONS, oppositeDirection, withProperty } from '../world/BlockState';
import type { BlockPos, FeatureWorld, TemplateProcessors } from '../world/FeatureWorld';
import { atY, offset } from '../world/FeatureWorld';
import type { ConfiguredFeature } from './Feature';
import { feature } from './Feature';
import { JavaHashSet } from './javaHashSet';
import type { FeatureParsers } from './parseContext';
import {
    above,
    below,
    betweenClosed,
    distanceSquared,
    inBlockSet,
    isEmptyBlock,
    mthCos,
    mthSin,
    relative,
    shuffledCopy
} from './support';
import type { TreeDecorator } from './tree';
import { treeInternals, validTreePos } from './tree';

const f32 = Math.fround;
const AIR = blockState('minecraft:air');
const CAVE_AIR = blockState('minecraft:cave_air');
const WATER = blockState('minecraft:water');
const BEDROCK = blockState('minecraft:bedrock');
const END_STONE = blockState('minecraft:end_stone');
const OBSIDIAN = blockState('minecraft:obsidian');
const COBBLESTONE = blockState('minecraft:cobblestone');
const MOSSY_COBBLESTONE = blockState('minecraft:mossy_cobblestone');
const PACKED_ICE = blockState('minecraft:packed_ice');
const SNOW_BLOCK = blockState('minecraft:snow_block');
const PODZOL = blockState('minecraft:podzol');

/**
 * The features that build a structure rather than scatter blocks: geodes, lakes, icebergs, the
 * dungeon, the end's fixtures, the two huge mushrooms, the huge fungus and the two features that
 * delegate to a structure template.
 */

/** How a geode is shaped and what it is made of. */
export interface GeodeConfig {
    readonly fillingProvider: BlockStateProvider;
    readonly innerLayerProvider: BlockStateProvider;
    readonly alternateInnerLayerProvider: BlockStateProvider;
    readonly middleLayerProvider: BlockStateProvider;
    readonly outerLayerProvider: BlockStateProvider;
    readonly innerPlacements: readonly BlockState[];
    readonly cannotReplace: BlockSet;
    readonly invalidBlocks: BlockSet;
    readonly filling: number;
    readonly innerLayer: number;
    readonly middleLayer: number;
    readonly outerLayer: number;
    readonly generateCrackChance: number;
    readonly baseCrackSize: number;
    readonly crackPointOffset: number;
    readonly usePotentialPlacementsChance: number;
    readonly useAlternateLayer0Chance: number;
    readonly placementsRequireLayer0Alternate: boolean;
    readonly outerWallDistance: IntProvider;
    readonly distributionPoints: IntProvider;
    readonly pointOffset: IntProvider;
    readonly minGenOffset: number;
    readonly maxGenOffset: number;
    readonly noiseMultiplier: number;
    readonly invalidBlocksThreshold: number;
}

// `NormalNoise.createParity(-4, 1.0)`: one octave at frequency 2^-4 under the pre-1.18
// normalization, which `@jsprismarine/worldgen` spells as `normalize: 'legacy'`.
const GEODE_NOISE = new NormalNoise({
    baseOctave: -4,
    octaveCount: 1,
    baseAmplitude: 1,
    normalize: 'legacy',
    amplitudeModifiers: [1]
});

/**
 * An amethyst geode, Java's `geode`.
 *
 * It is a metaball field: several points are scattered inside the origin's neighborhood, and
 * every block in the generation box sums the inverse square roots of its distances to them.
 * Four thresholds on that sum cut the sum into the four shells, and a second field of three
 * points cuts the crack through them.
 */
export const geode = (config: GeodeConfig): ConfiguredFeature =>
    feature('geode', (world, random, origin) => {
        const numPoints = config.distributionPoints.sample(random);
        const noise = GEODE_NOISE.create(new LegacyRandomSource(world.seed));
        const crackSizeAdjustment = numPoints / config.outerWallDistance.maxValue;
        const innerAir = 1 / Math.sqrt(config.filling);
        const innermostBlockLayer = 1 / Math.sqrt(config.innerLayer + crackSizeAdjustment);
        const innerCrust = 1 / Math.sqrt(config.middleLayer + crackSizeAdjustment);
        const outerCrust = 1 / Math.sqrt(config.outerLayer + crackSizeAdjustment);
        const crackSize =
            1 / Math.sqrt(config.baseCrackSize + random.nextDouble() / 2 + (numPoints > 3 ? crackSizeAdjustment : 0));
        const shouldGenerateCrack = random.nextFloat() < config.generateCrackChance;

        const points: { position: BlockPos; offset: number }[] = [];
        let invalidPoints = 0;
        for (let index = 0; index < numPoints; index++) {
            const position = offset(
                origin,
                config.outerWallDistance.sample(random),
                config.outerWallDistance.sample(random),
                config.outerWallDistance.sample(random)
            );
            const state = world.getBlock(position);
            if (world.blocks.isAir(state) || inBlockSet(world.blocks, state, config.invalidBlocks)) {
                if (++invalidPoints > config.invalidBlocksThreshold) return false;
            }
            points.push({ position, offset: config.pointOffset.sample(random) });
        }

        const crackPoints: BlockPos[] = [];
        if (shouldGenerateCrack) {
            const index = random.nextIntBounded(4);
            const crackOffset = numPoints * 2 + 1;
            const dx = index === 0 || index === 2 ? crackOffset : 0;
            const dz = index === 1 || index === 2 ? crackOffset : 0;
            for (const dy of [7, 5, 1]) crackPoints.push(offset(origin, dx, dy, dz));
        }

        const canReplace = (state: BlockState) => !inBlockSet(world.blocks, state, config.cannotReplace);
        const safeSet = (position: BlockPos, state: BlockState) => {
            if (canReplace(world.getBlock(position))) world.setBlock(position, state);
        };

        const potentialPlacements: BlockPos[] = [];
        const from = offset(origin, config.minGenOffset, config.minGenOffset, config.minGenOffset);
        const to = offset(origin, config.maxGenOffset, config.maxGenOffset, config.maxGenOffset);

        for (const position of betweenClosed(from, to)) {
            const noiseOffset = noise.get3(position.x, position.y, position.z) * config.noiseMultiplier;
            let shell = 0;
            for (const point of points) {
                shell += 1 / Math.sqrt(distanceSquared(position, point.position) + point.offset) + noiseOffset;
            }
            if (shell < outerCrust) continue;

            if (shell >= innerAir) {
                safeSet(position, config.fillingProvider.getState(world, random, position));
                continue;
            }

            let crack = 0;
            for (const point of crackPoints) {
                crack += 1 / Math.sqrt(distanceSquared(position, point) + config.crackPointOffset) + noiseOffset;
            }

            if (shouldGenerateCrack && crack >= crackSize) {
                safeSet(position, AIR);
            } else if (shell >= innermostBlockLayer) {
                const useAlternate = random.nextFloat() < config.useAlternateLayer0Chance;
                const provider = useAlternate ? config.alternateInnerLayerProvider : config.innerLayerProvider;
                safeSet(position, provider.getState(world, random, position));
                if (
                    (!config.placementsRequireLayer0Alternate || useAlternate) &&
                    random.nextFloat() < config.usePotentialPlacementsChance
                ) {
                    potentialPlacements.push(position);
                }
            } else if (shell >= innerCrust) {
                safeSet(position, config.middleLayerProvider.getState(world, random, position));
            } else if (shell >= outerCrust) {
                safeSet(position, config.outerLayerProvider.getState(world, random, position));
            }
        }

        for (const crystalPos of potentialPlacements) {
            let state = randomElement(config.innerPlacements, random);
            for (const direction of ['down', 'up', 'north', 'south', 'west', 'east'] satisfies Direction[]) {
                if ('facing' in state.properties) state = withProperty(state, 'facing', direction);
                const placePos = relative(crystalPos, direction);
                const existing = world.getBlock(placePos);
                if ('waterlogged' in state.properties) {
                    state = withProperty(
                        state,
                        'waterlogged',
                        world.blocks.fluid(existing) === 'water' ? 'true' : 'false'
                    );
                }
                // Java's `BuddingAmethystBlock.canClusterGrowAtState`: air, or a water source.
                const canGrow = world.blocks.isAir(existing) || existing.name === 'minecraft:water';
                if (!canGrow) continue;
                safeSet(placePos, state);
                break;
            }
        }
        return true;
    });

/**
 * A lake, Java's `lake`.
 *
 * The shape is drawn into a 16 by 8 by 16 boolean grid by four to seven overlapping ellipsoids,
 * checked against the world, and then written twice: fluid below y offset 4 and cave air above
 * it, then a barrier shell around whatever that touched.
 */
export const lake = (
    fluid: BlockStateProvider,
    barrier: BlockStateProvider,
    canPlaceFeature: BlockPredicate,
    canReplaceWithAirOrFluid: BlockPredicate,
    canReplaceWithBarrier: BlockPredicate
): ConfiguredFeature =>
    feature('lake', (world, random, start) => {
        if (start.y <= world.minY + 4) return false;
        const origin = offset(start, -8, -4, -8);
        const grid = new Uint8Array(2048);
        const index = (x: number, y: number, z: number) => (x * 16 + z) * 8 + y;

        const spots = random.nextIntBounded(4) + 4;
        for (let spot = 0; spot < spots; spot++) {
            const xr = random.nextDouble() * 6 + 3;
            const yr = random.nextDouble() * 4 + 2;
            const zr = random.nextDouble() * 6 + 3;
            const xp = random.nextDouble() * (16 - xr - 2) + 1 + xr / 2;
            const yp = random.nextDouble() * (8 - yr - 4) + 2 + yr / 2;
            const zp = random.nextDouble() * (16 - zr - 2) + 1 + zr / 2;
            for (let x = 1; x < 15; x++) {
                for (let z = 1; z < 15; z++) {
                    for (let y = 1; y < 7; y++) {
                        const xd = (x - xp) / (xr / 2);
                        const yd = (y - yp) / (yr / 2);
                        const zd = (z - zp) / (zr / 2);
                        if (xd * xd + yd * yd + zd * zd < 1) grid[index(x, y, z)] = 1;
                    }
                }
            }
        }

        const isShell = (x: number, y: number, z: number): boolean =>
            grid[index(x, y, z)] === 0 &&
            ((x < 15 && grid[index(x + 1, y, z)] === 1) ||
                (x > 0 && grid[index(x - 1, y, z)] === 1) ||
                (z < 15 && grid[index(x, y, z + 1)] === 1) ||
                (z > 0 && grid[index(x, y, z - 1)] === 1) ||
                (y < 7 && grid[index(x, y + 1, z)] === 1) ||
                (y > 0 && grid[index(x, y - 1, z)] === 1));

        const fluidState = fluid.getState(world, random, origin);
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                for (let y = 0; y < 8; y++) {
                    if (!isShell(x, y, z)) continue;
                    const position = offset(origin, x, y, z);
                    const state = world.getBlock(position);
                    if (y >= 4 && world.blocks.fluid(state) !== 'empty') return false;
                    if (y < 4 && !world.blocks.isSolid(state) && state.name !== fluidState.name) return false;
                    if (!canPlaceFeature(world, position)) return false;
                }
            }
        }

        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                for (let y = 0; y < 8; y++) {
                    if (grid[index(x, y, z)] !== 1) continue;
                    const position = offset(origin, x, y, z);
                    if (!canReplaceWithAirOrFluid(world, position)) continue;
                    world.setBlock(position, y >= 4 ? CAVE_AIR : fluidState);
                }
            }
        }

        const barrierState = barrier.getState(world, random, origin);
        if (!world.blocks.isAir(barrierState)) {
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    for (let y = 0; y < 8; y++) {
                        if (!isShell(x, y, z)) continue;
                        if (!(y < 4 || random.nextIntBounded(2) !== 0)) continue;
                        const position = offset(origin, x, y, z);
                        if (!world.blocks.isSolid(world.getBlock(position))) continue;
                        if (!canReplaceWithBarrier(world, position)) continue;
                        world.setBlock(position, barrierState);
                    }
                }
            }
        }

        if (world.blocks.fluid(fluidState) === 'water') {
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    const position = offset(origin, x, 4, z);
                    if (world.isColdEnoughToSnow?.(position) !== true) continue;
                    if (!canReplaceWithAirOrFluid(world, position)) continue;
                    world.setBlock(position, blockState('minecraft:ice'));
                }
            }
        }
        return true;
    });

const isIcebergState = (state: BlockState): boolean =>
    state.name === 'minecraft:packed_ice' ||
    state.name === 'minecraft:snow_block' ||
    state.name === 'minecraft:blue_ice';

/** An iceberg, Java's `iceberg`. */
export const iceberg = (state: BlockState): ConfiguredFeature =>
    feature('iceberg', (world, random, start) => {
        const origin = { x: start.x, y: world.seaLevel, z: start.z };
        const snowOnTop = random.nextDouble() > 0.7;
        const shapeAngle = random.nextDouble() * 2 * Math.PI;
        const shapeEllipseA = 11 - random.nextIntBounded(5);
        const shapeEllipseC = 3 + random.nextIntBounded(3);
        const isEllipse = random.nextDouble() > 0.7;
        let overWaterHeight = isEllipse ? random.nextIntBounded(6) + 6 : random.nextIntBounded(15) + 3;
        if (!isEllipse && random.nextDouble() > 0.9) overWaterHeight += random.nextIntBounded(19) + 7;

        const underWaterHeight = Math.min(overWaterHeight + random.nextIntBounded(11), 18);
        const width = Math.min(overWaterHeight + random.nextIntBounded(7) - random.nextIntBounded(5), 11);
        const extent = isEllipse ? shapeEllipseA : 11;

        const signedDistanceEllipse = (xo: number, zo: number, center: BlockPos, a: number, c: number, angle: number) =>
            ((xo - center.x) * Math.cos(angle) - (zo - center.z) * Math.sin(angle)) ** 2 / a ** 2 +
            ((xo - center.x) * Math.sin(angle) + (zo - center.z) * Math.cos(angle)) ** 2 / c ** 2 -
            1;
        const signedDistanceCircle = (xo: number, zo: number, radius: number) =>
            (10 * Math.min(Math.max(random.nextFloat(), 0.2), 0.8)) / radius + xo ** 2 + zo ** 2 - radius ** 2;

        const radiusRound = (yOff: number, height: number): number => {
            const k = f32(3.5 - random.nextFloat());
            let scale = f32(f32(1 - yOff ** 2 / (height * k)) * width);
            if (height > 15 + random.nextIntBounded(5)) {
                const tempYOff = yOff < 3 + random.nextIntBounded(6) ? Math.trunc(yOff / 2) : yOff;
                scale = f32(f32(1 - tempYOff / f32(height * k * 0.4)) * width);
            }
            return Math.ceil(scale / 2);
        };
        const radiusEllipse = (yOff: number, height: number) => Math.ceil(f32(f32(1 - yOff ** 2 / height) * width) / 2);
        const radiusSteep = (yOff: number, height: number) => {
            const k = f32(1 + random.nextFloat() / 2);
            return Math.ceil(f32(f32(1 - yOff / f32(height * k)) * width) / 2);
        };
        const ellipseC = (yOff: number, height: number) =>
            yOff > 0 && height - yOff <= 3 ? shapeEllipseC - (4 - (height - yOff)) : shapeEllipseC;

        const setIcebergBlock = (position: BlockPos, hDiff: number, height: number) => {
            const existing = world.getBlock(position);
            const replaceable =
                world.blocks.isAir(existing) ||
                existing.name === 'minecraft:snow_block' ||
                existing.name === 'minecraft:ice' ||
                existing.name === 'minecraft:water';
            if (!replaceable) return;
            const randomness = !isEllipse || random.nextDouble() > 0.05;
            const divisor = isEllipse ? 3 : 2;
            const snowy =
                snowOnTop &&
                existing.name !== 'minecraft:water' &&
                hDiff <= random.nextIntBounded(Math.max(1, Math.trunc(height / divisor))) + height * 0.6 &&
                randomness;
            world.setBlock(position, snowy ? SNOW_BLOCK : state);
        };

        const generateBlock = (xo: number, yOff: number, zo: number, radius: number, a: number, height: number) => {
            const distance = isEllipse
                ? signedDistanceEllipse(xo, zo, { x: 0, y: 0, z: 0 }, a, ellipseC(yOff, height), shapeAngle)
                : signedDistanceCircle(xo, zo, radius);
            if (distance >= 0) return;
            const compare = isEllipse ? -0.5 : -6 - random.nextIntBounded(3);
            if (distance > compare && random.nextDouble() > 0.9) return;
            setIcebergBlock(offset(origin, xo, yOff, zo), height - yOff, height);
        };

        for (let xo = -extent; xo < extent; xo++) {
            for (let zo = -extent; zo < extent; zo++) {
                for (let yOff = 0; yOff < overWaterHeight; yOff++) {
                    const radius = isEllipse
                        ? radiusEllipse(yOff, overWaterHeight)
                        : radiusRound(yOff, overWaterHeight);
                    if (isEllipse || xo < radius) generateBlock(xo, yOff, zo, radius, extent, overWaterHeight);
                }
            }
        }

        const smoothExtent = isEllipse ? shapeEllipseA : Math.trunc(width / 2);
        for (let x = -smoothExtent; x <= smoothExtent; x++) {
            for (let z = -smoothExtent; z <= smoothExtent; z++) {
                for (let yOff = 0; yOff <= overWaterHeight; yOff++) {
                    const position = offset(origin, x, yOff, z);
                    const existing = world.getBlock(position);
                    if (!isIcebergState(existing) && existing.name !== 'minecraft:snow') continue;
                    if (world.blocks.isAir(world.getBlock(below(position)))) {
                        world.setBlock(position, AIR);
                        world.setBlock(above(position), AIR);
                        continue;
                    }
                    if (!isIcebergState(existing)) continue;
                    let exposed = 0;
                    for (const direction of HORIZONTAL_DIRECTIONS) {
                        if (!isIcebergState(world.getBlock(relative(position, direction)))) exposed++;
                    }
                    if (exposed >= 3) world.setBlock(position, AIR);
                }
            }
        }

        for (let xo = -extent; xo < extent; xo++) {
            for (let zo = -extent; zo < extent; zo++) {
                for (let yOff = -1; yOff > -underWaterHeight; yOff--) {
                    const newExtent = isEllipse
                        ? Math.ceil(extent * f32(1 - yOff ** 2 / f32(underWaterHeight * 8)))
                        : extent;
                    const radius = radiusSteep(-yOff, underWaterHeight);
                    if (xo < radius) generateBlock(xo, yOff, zo, radius, newExtent, underWaterHeight);
                }
            }
        }

        const doCutOut = isEllipse ? random.nextDouble() > 0.1 : random.nextDouble() > 0.7;
        if (!doCutOut) return true;

        const signX = random.nextBoolean() ? -1 : 1;
        const signZ = random.nextBoolean() ? -1 : 1;
        let xOff = random.nextIntBounded(Math.max(Math.trunc(width / 2) - 2, 1));
        if (random.nextBoolean()) {
            xOff = Math.trunc(width / 2) + 1 - random.nextIntBounded(Math.max(width - Math.trunc(width / 2) - 1, 1));
        }
        let zOff = random.nextIntBounded(Math.max(Math.trunc(width / 2) - 2, 1));
        if (random.nextBoolean()) {
            zOff = Math.trunc(width / 2) + 1 - random.nextIntBounded(Math.max(width - Math.trunc(width / 2) - 1, 1));
        }
        if (isEllipse) {
            xOff = random.nextIntBounded(Math.max(shapeEllipseA - 5, 1));
            zOff = xOff;
        }

        const localOrigin = { x: signX * xOff, y: 0, z: signZ * zOff };
        const angle = isEllipse ? shapeAngle + Math.PI / 2 : random.nextDouble() * 2 * Math.PI;

        const carve = (radius: number, yOff: number, underWater: boolean) => {
            const a = radius + 1 + Math.trunc(shapeEllipseA / 3);
            const c = Math.min(radius - 3, 3) + Math.trunc(shapeEllipseC / 2) - 1;
            for (let xo = -a; xo < a; xo++) {
                for (let zo = -a; zo < a; zo++) {
                    if (signedDistanceEllipse(xo, zo, localOrigin, a, c, angle) >= 0) continue;
                    const position = offset(origin, xo, yOff, zo);
                    const existing = world.getBlock(position);
                    if (!isIcebergState(existing) && existing.name !== 'minecraft:snow_block') continue;
                    if (underWater) {
                        world.setBlock(position, WATER);
                    } else {
                        world.setBlock(position, AIR);
                        if (world.getBlock(above(position)).name === 'minecraft:snow')
                            world.setBlock(above(position), AIR);
                    }
                }
            }
        };

        for (let yOff = 0; yOff < overWaterHeight - 3; yOff++) {
            carve(radiusRound(yOff, overWaterHeight), yOff, false);
        }
        for (let yOff = -1; yOff > -overWaterHeight + random.nextIntBounded(5); yOff--) {
            carve(radiusSteep(-yOff, overWaterHeight), yOff, true);
        }
        return true;
    });

const DUNGEON_MOBS = ['minecraft:skeleton', 'minecraft:zombie', 'minecraft:zombie', 'minecraft:spider'];

/** The dungeon, Java's `monster_room`. */
export const monsterRoom = (): ConfiguredFeature =>
    feature('monster_room', (world, random, origin) => {
        const canReplace = (state: BlockState) => !world.blocks.hasTag(state, 'minecraft:features_cannot_replace');
        const safeSet = (position: BlockPos, state: BlockState) => {
            if (canReplace(world.getBlock(position))) world.setBlock(position, state);
        };

        const xr = random.nextIntBounded(2) + 2;
        const zr = random.nextIntBounded(2) + 2;
        const minX = -xr - 1;
        const maxX = xr + 1;
        const minZ = -zr - 1;
        const maxZ = zr + 1;

        let holeCount = 0;
        for (let dx = minX; dx <= maxX; dx++) {
            for (let dy = -1; dy <= 4; dy++) {
                for (let dz = minZ; dz <= maxZ; dz++) {
                    const position = offset(origin, dx, dy, dz);
                    const solid = world.blocks.isSolid(world.getBlock(position));
                    if ((dy === -1 || dy === 4) && !solid) return false;
                    const onWall = dx === minX || dx === maxX || dz === minZ || dz === maxZ;
                    if (onWall && dy === 0 && isEmptyBlock(world, position) && isEmptyBlock(world, above(position))) {
                        holeCount++;
                    }
                }
            }
        }
        if (holeCount < 1 || holeCount > 5) return false;

        for (let dx = minX; dx <= maxX; dx++) {
            for (let dy = 3; dy >= -1; dy--) {
                for (let dz = minZ; dz <= maxZ; dz++) {
                    const position = offset(origin, dx, dy, dz);
                    const state = world.getBlock(position);
                    const isWall = dx === minX || dy === -1 || dz === minZ || dx === maxX || dy === 4 || dz === maxZ;
                    if (isWall) {
                        if (position.y >= world.minY && !world.blocks.isSolid(world.getBlock(below(position)))) {
                            world.setBlock(position, CAVE_AIR);
                        } else if (world.blocks.isSolid(state) && state.name !== 'minecraft:chest') {
                            const mossy = dy === -1 && random.nextIntBounded(4) !== 0;
                            safeSet(position, mossy ? MOSSY_COBBLESTONE : COBBLESTONE);
                        }
                    } else if (state.name !== 'minecraft:chest' && state.name !== 'minecraft:spawner') {
                        safeSet(position, CAVE_AIR);
                    }
                }
            }
        }

        for (let chest = 0; chest < 2; chest++) {
            for (let attempt = 0; attempt < 3; attempt++) {
                const position = {
                    x: origin.x + random.nextIntBounded(xr * 2 + 1) - xr,
                    y: origin.y,
                    z: origin.z + random.nextIntBounded(zr * 2 + 1) - zr
                };
                if (!isEmptyBlock(world, position)) continue;
                let walls = 0;
                for (const direction of HORIZONTAL_DIRECTIONS) {
                    if (world.blocks.isSolid(world.getBlock(relative(position, direction)))) walls++;
                }
                if (walls !== 1) continue;
                safeSet(position, blockState('minecraft:chest', { facing: 'north' }));
                world.setBlockEntity?.(position, {
                    id: 'minecraft:chest',
                    lootTable: 'minecraft:chests/simple_dungeon'
                });
                break;
            }
        }

        safeSet(origin, blockState('minecraft:spawner'));
        world.setBlockEntity?.(origin, {
            id: 'minecraft:mob_spawner',
            spawnEntity: randomElement(DUNGEON_MOBS, random)
        });
        return true;
    });

/** The bonus chest, Java's `bonus_chest`. */
export const bonusChest = (): ConfiguredFeature =>
    feature('bonus_chest', (world, random, origin) => {
        const chunkX = origin.x >> 4;
        const chunkZ = origin.z >> 4;
        const xs = shuffledCopy(
            Array.from({ length: 16 }, (_value, index) => chunkX * 16 + index),
            random
        );
        const zs = shuffledCopy(
            Array.from({ length: 16 }, (_value, index) => chunkZ * 16 + index),
            random
        );

        for (const x of xs) {
            for (const z of zs) {
                const y = world.getHeight('MOTION_BLOCKING_NO_LEAVES', x, z);
                const chestPos = { x, y, z };
                if (!isEmptyBlock(world, chestPos)) continue;
                world.setBlock(chestPos, blockState('minecraft:chest', { facing: 'north' }));
                world.setBlockEntity?.(chestPos, {
                    id: 'minecraft:chest',
                    lootTable: 'minecraft:chests/spawn_bonus_chest'
                });
                for (const direction of HORIZONTAL_DIRECTIONS) {
                    const torchPos = relative(chestPos, direction);
                    const torch = blockState('minecraft:torch');
                    if (world.blocks.canSurvive(world, torchPos, torch)) world.setBlock(torchPos, torch);
                }
                return true;
            }
        }
        return false;
    });

const ROTATIONS = ['none', 'clockwise_90', 'clockwise_180', 'counterclockwise_90'] as const;

/** Places one template from a weighted list, Java's `template`. */
export const templateFeature = (
    templates: readonly {
        readonly value: { readonly template: string; readonly rotations: readonly number[] };
        readonly weight: number;
    }[],
    processors?: TemplateProcessors
): ConfiguredFeature =>
    feature('template', (world, random, origin) => {
        const entry = randomWeighted(templates, random);
        const rotation = randomElement(entry.rotations, random);
        return (
            world.placeTemplate?.({
                template: entry.template,
                origin,
                rotation,
                mirror: 'none',
                ...(processors === undefined ? {} : { processors })
            }) ?? false
        );
    });

/** Buries a fossil, Java's `fossil`. */
export const fossil = (
    fossilStructures: readonly string[],
    overlayStructures: readonly string[],
    fossilProcessors: string,
    overlayProcessors: string,
    maxEmptyCornersAllowed: number
): ConfiguredFeature =>
    feature('fossil', (world, random, origin) => {
        const rotation = random.nextIntBounded(4);
        const index = random.nextIntBounded(fossilStructures.length);
        const base = fossilStructures[index];
        const overlay = overlayStructures[index];
        if (base === undefined || overlay === undefined) return false;

        // Java scans the template's footprint for the lowest surface; without the template's
        // size that reduces to the origin's own column, which is the same answer for the four
        // vanilla fossils because they are placed from a heightmap already.
        const lowestSurface = Math.min(origin.y, world.getHeight('OCEAN_FLOOR_WG', origin.x, origin.z));
        const targetY = Math.max(lowestSurface - 15 - random.nextIntBounded(10), world.minY + 10);
        const target = atY(origin, targetY);
        void maxEmptyCornersAllowed;

        const placed =
            world.placeTemplate?.({
                template: base,
                origin: target,
                rotation,
                mirror: 'none',
                processors: fossilProcessors
            }) ?? false;
        const overlaid =
            world.placeTemplate?.({
                template: overlay,
                origin: target,
                rotation,
                mirror: 'none',
                processors: overlayProcessors
            }) ?? false;
        return placed || overlaid;
    });

/** How a root system is shaped. */
export interface RootSystemConfig {
    readonly treeFeature: PlacedFeature;
    readonly requiredVerticalSpaceForTree: number;
    readonly levelTestDistance: number;
    readonly maxLevelDeviation: number;
    readonly rootRadius: number;
    readonly rootReplaceable: BlockSet;
    readonly rootStateProvider: BlockStateProvider;
    readonly rootPlacementAttempts: number;
    readonly rootColumnMaxHeight: number;
    readonly hangingRootRadius: number;
    readonly hangingRootsVerticalSpan: number;
    readonly hangingRootStateProvider: BlockStateProvider;
    readonly hangingRootPlacementAttempts: number;
    readonly allowedVerticalWaterForTree: number;
    readonly allowedTreePosition: BlockPredicate;
}

/** The azalea tree's rooted dirt column, Java's `root_system`. */
export const rootSystem = (config: RootSystemConfig): ConfiguredFeature =>
    feature(
        'root_system',
        (world, random, origin) => {
            if (!world.blocks.isAir(world.getBlock(origin))) return false;

            const spaceForTree = (position: BlockPos): boolean => {
                for (let step = 1; step <= config.requiredVerticalSpaceForTree; step++) {
                    const state = world.getBlock(above(position, step));
                    if (world.blocks.isAir(state)) continue;
                    const blocksAboveGround = step + 1;
                    const allowed =
                        blocksAboveGround <= config.allowedVerticalWaterForTree &&
                        world.blocks.fluid(state) === 'water';
                    if (!allowed) return false;
                }
                if (config.levelTestDistance <= 0) return true;
                for (const direction of HORIZONTAL_DIRECTIONS) {
                    const corner = relative(position, direction, config.levelTestDistance);
                    const under = world.getBlock(below(corner, config.maxLevelDeviation));
                    const over = world.getBlock(above(corner, config.maxLevelDeviation));
                    if (world.blocks.isAir(under) || !world.blocks.isAir(over)) return false;
                }
                return true;
            };

            let placedTree = false;
            let heightAboveOrigin = 0;
            for (let step = 0; step < config.rootColumnMaxHeight; step++) {
                const working = above(origin, step + 1);
                if (world.getHeight('WORLD_SURFACE', working.x, working.z) < working.y) break;
                if (!config.allowedTreePosition(world, working) || !spaceForTree(working)) continue;
                const under = below(working);
                if (world.blocks.fluid(world.getBlock(under)) === 'lava') break;
                if (!world.blocks.isSolid(world.getBlock(under))) break;
                if (!placeFeature(config.treeFeature, { world }, random, working)) continue;
                placedTree = true;
                heightAboveOrigin = step;
                break;
            }

            if (placedTree) {
                for (let y = origin.y; y < origin.y + heightAboveOrigin; y++) {
                    for (let attempt = 0; attempt < config.rootPlacementAttempts; attempt++) {
                        const position = {
                            x:
                                origin.x +
                                random.nextIntBounded(config.rootRadius) -
                                random.nextIntBounded(config.rootRadius),
                            y,
                            z:
                                origin.z +
                                random.nextIntBounded(config.rootRadius) -
                                random.nextIntBounded(config.rootRadius)
                        };
                        if (!inBlockSet(world.blocks, world.getBlock(position), config.rootReplaceable)) continue;
                        world.setBlock(position, config.rootStateProvider.getState(world, random, position));
                    }
                }

                for (let attempt = 0; attempt < config.hangingRootPlacementAttempts; attempt++) {
                    const position = offset(
                        origin,
                        random.nextIntBounded(config.hangingRootRadius) -
                            random.nextIntBounded(config.hangingRootRadius),
                        random.nextIntBounded(config.hangingRootsVerticalSpan) -
                            random.nextIntBounded(config.hangingRootsVerticalSpan),
                        random.nextIntBounded(config.hangingRootRadius) -
                            random.nextIntBounded(config.hangingRootRadius)
                    );
                    if (!isEmptyBlock(world, position)) continue;
                    const state = config.hangingRootStateProvider.getState(world, random, position);
                    if (!world.blocks.canSurvive(world, position, state)) continue;
                    if (!world.blocks.isSturdy(world.getBlock(above(position)), 'down')) continue;
                    world.setBlock(position, state);
                }
            }
            return true;
        },
        [config.treeFeature.feature]
    );

const BAMBOO_BASE = { age: '1', leaves: 'none', stage: '0' };

/** A bamboo stalk with its podzol disc, Java's `bamboo`. */
export const bamboo = (probability: number): ConfiguredFeature =>
    feature('bamboo', (world, random, origin) => {
        if (!isEmptyBlock(world, origin)) return false;
        const stalk = blockState('minecraft:bamboo', BAMBOO_BASE);
        if (!world.blocks.canSurvive(world, origin, stalk)) return true;

        const height = random.nextIntBounded(12) + 5;
        if (random.nextFloat() < probability) {
            const radius = random.nextIntBounded(4) + 1;
            for (let x = origin.x - radius; x <= origin.x + radius; x++) {
                for (let z = origin.z - radius; z <= origin.z + radius; z++) {
                    const dx = x - origin.x;
                    const dz = z - origin.z;
                    if (dx * dx + dz * dz > radius * radius) continue;
                    const position = { x, y: world.getHeight('WORLD_SURFACE', x, z) - 1, z };
                    if (!world.blocks.hasTag(world.getBlock(position), 'minecraft:beneath_bamboo_podzol_replaceable')) {
                        continue;
                    }
                    world.setBlock(position, PODZOL);
                }
            }
        }

        let cursor = origin;
        for (let step = 0; step < height && isEmptyBlock(world, cursor); step++) {
            world.setBlock(cursor, stalk);
            cursor = above(cursor);
        }

        if (cursor.y - origin.y >= 3) {
            world.setBlock(cursor, blockState('minecraft:bamboo', { ...BAMBOO_BASE, leaves: 'large', stage: '1' }));
            cursor = below(cursor);
            world.setBlock(cursor, blockState('minecraft:bamboo', { ...BAMBOO_BASE, leaves: 'large' }));
            cursor = below(cursor);
            world.setBlock(cursor, blockState('minecraft:bamboo', { ...BAMBOO_BASE, leaves: 'small' }));
        }
        return true;
    });

/** The basalt pillar and its nether cousins, Java's `spike`. */
export const spike = (state: BlockState, canPlaceOn: BlockPredicate, canReplace: BlockPredicate): ConfiguredFeature =>
    feature('spike', (world, random, start) => {
        let base = start;
        while (isEmptyBlock(world, base) && base.y > world.minY + 2) base = below(base);
        if (!canPlaceOn(world, base)) return false;

        let origin = above(base, random.nextIntBounded(4));
        const height = random.nextIntBounded(4) + 7;
        const width = Math.trunc(height / 4) + random.nextIntBounded(2);
        if (width > 1 && random.nextIntBounded(60) === 0) origin = above(origin, 10 + random.nextIntBounded(30));

        for (let yOff = 0; yOff < height; yOff++) {
            const scale = f32(f32(1 - yOff / height) * width);
            const newWidth = Math.ceil(scale);
            for (let xo = -newWidth; xo <= newWidth; xo++) {
                const dx = f32(Math.abs(xo) - 0.25);
                for (let zo = -newWidth; zo <= newWidth; zo++) {
                    const dz = f32(Math.abs(zo) - 0.25);
                    const inside = (xo === 0 && zo === 0) || !(dx * dx + dz * dz > scale * scale);
                    const onEdge = xo === -newWidth || xo === newWidth || zo === -newWidth || zo === newWidth;
                    if (!inside || (onEdge && random.nextFloat() > 0.75)) continue;

                    const up = offset(origin, xo, yOff, zo);
                    if (world.blocks.isAir(world.getBlock(up)) || canReplace(world, up)) world.setBlock(up, state);
                    if (yOff === 0 || newWidth <= 1) continue;
                    const down = offset(origin, xo, -yOff, zo);
                    if (world.blocks.isAir(world.getBlock(down)) || canReplace(world, down))
                        world.setBlock(down, state);
                }
            }
        }

        const pillarWidth = Math.min(Math.max(width - 1, 0), 1);
        for (let xo = -pillarWidth; xo <= pillarWidth; xo++) {
            for (let zo = -pillarWidth; zo <= pillarWidth; zo++) {
                let cursor = offset(origin, xo, -1, zo);
                let runLength = Math.abs(xo) === 1 && Math.abs(zo) === 1 ? random.nextIntBounded(5) : 50;
                while (cursor.y > 50) {
                    const existing = world.getBlock(cursor);
                    if (!world.blocks.isAir(existing) && !canReplace(world, cursor) && existing.name !== state.name)
                        break;
                    world.setBlock(cursor, state);
                    cursor = below(cursor);
                    if (--runLength > 0) continue;
                    cursor = below(cursor, random.nextIntBounded(5) + 1);
                    runLength = random.nextIntBounded(5);
                }
            }
        }
        return true;
    });

/**
 * A chorus plant, Java's `chorus_plant`.
 *
 * Java delegates to `ChorusFlowerBlock.generatePlant`, which is block behavior rather than world
 * generation. This places the flower and reports success; the growth pass belongs to the
 * server's block layer, which is recorded in the README.
 */
export const chorusPlant = (): ConfiguredFeature =>
    feature('chorus_plant', (world, _random, origin) => {
        if (!isEmptyBlock(world, origin)) return false;
        if (!world.blocks.hasTag(world.getBlock(below(origin)), 'minecraft:supports_chorus_plant')) return false;
        world.setBlock(origin, blockState('minecraft:chorus_flower', { age: '0' }));
        return true;
    });

/** A coral tree, Java's `coral_tree`. */
export const coralTree = (block: PlacedFeature): ConfiguredFeature =>
    feature(
        'coral_tree',
        (world, random, origin) => {
            let cursor = origin;
            const trunkHeight = random.nextIntBounded(3) + 1;
            for (let step = 0; step < trunkHeight; step++) {
                if (!placeFeature(block, { world }, random, cursor)) return true;
                cursor = above(cursor);
            }

            const top = cursor;
            const branches = random.nextIntBounded(3) + 2;
            const directions = shuffledCopy(HORIZONTAL_DIRECTIONS, random).slice(0, branches);
            for (const branchDirection of directions) {
                cursor = relative(top, branchDirection);
                const branchHeight = random.nextIntBounded(5) + 2;
                let segment = 0;
                for (let step = 0; step < branchHeight; step++) {
                    if (!placeFeature(block, { world }, random, cursor)) break;
                    segment++;
                    cursor = above(cursor);
                    if (step === 0 || (segment >= 2 && random.nextFloat() < 0.25)) {
                        cursor = relative(cursor, branchDirection);
                        segment = 0;
                    }
                }
            }
            return true;
        },
        [block.feature]
    );

const CLOCKWISE: Readonly<Record<Direction, Direction>> = {
    north: 'east',
    east: 'south',
    south: 'west',
    west: 'north',
    up: 'up',
    down: 'down'
};

/** A coral claw, Java's `coral_claw`. */
export const coralClaw = (block: PlacedFeature): ConfiguredFeature =>
    feature(
        'coral_claw',
        (world, random, origin) => {
            if (!placeFeature(block, { world }, random, origin)) return false;
            const clawDirection = randomElement(HORIZONTAL_DIRECTIONS, random);
            const branches = random.nextIntBounded(2) + 2;
            const counterClockwise = oppositeDirection(CLOCKWISE[clawDirection]);
            const candidates = shuffledCopy([clawDirection, CLOCKWISE[clawDirection], counterClockwise], random).slice(
                0,
                branches
            );

            for (const branchDirection of candidates) {
                let cursor = relative(origin, branchDirection);
                const sidewayLength = random.nextIntBounded(2) + 1;
                let segmentDirection: Direction;
                let inwayLength: number;
                if (branchDirection === clawDirection) {
                    segmentDirection = clawDirection;
                    inwayLength = random.nextIntBounded(3) + 2;
                } else {
                    cursor = above(cursor);
                    segmentDirection = randomElement([branchDirection, 'up'] satisfies Direction[], random);
                    inwayLength = random.nextIntBounded(3) + 3;
                }

                for (let step = 0; step < sidewayLength; step++) {
                    if (!placeFeature(block, { world }, random, cursor)) break;
                    cursor = relative(cursor, segmentDirection);
                }
                cursor = above(relative(cursor, oppositeDirection(segmentDirection)));

                for (let step = 0; step < inwayLength; step++) {
                    cursor = relative(cursor, clawDirection);
                    if (!placeFeature(block, { world }, random, cursor)) break;
                    if (random.nextFloat() < 0.25) cursor = above(cursor);
                }
            }
            return true;
        },
        [block.feature]
    );

/** A floating end island, Java's `end_island`. */
export const endIsland = (): ConfiguredFeature =>
    feature('end_island', (world, random, origin) => {
        let size = f32(random.nextIntBounded(3) + 4);
        for (let y = 0; size > 0.5; y--) {
            for (let x = Math.floor(-size); x <= Math.ceil(size); x++) {
                for (let z = Math.floor(-size); z <= Math.ceil(size); z++) {
                    if (x * x + z * z > f32(size + 1) * f32(size + 1)) continue;
                    world.setBlock(offset(origin, x, y, z), END_STONE);
                }
            }
            size = f32(size - f32(random.nextIntBounded(2) + 0.5));
        }
        return true;
    });

/** The exit portal's bedrock podium, Java's `end_podium`. */
export const endPodium = (active: boolean): ConfiguredFeature =>
    feature('end_podium', (world, _random, origin) => {
        const from = { x: origin.x - 4, y: origin.y - 1, z: origin.z - 4 };
        const to = { x: origin.x + 4, y: origin.y + 32, z: origin.z + 4 };
        for (const position of betweenClosed(from, to)) {
            const distance = Math.sqrt(distanceSquared(position, origin));
            const insideRim = distance < 2.5;
            if (!insideRim && distance >= 3.5) continue;

            if (position.y < origin.y) {
                world.setBlock(position, insideRim ? BEDROCK : END_STONE);
            } else if (position.y > origin.y) {
                world.setBlock(position, AIR);
            } else if (!insideRim) {
                world.setBlock(position, BEDROCK);
            } else {
                world.setBlock(position, active ? blockState('minecraft:end_portal') : AIR);
            }
        }

        for (let y = 0; y < 4; y++) world.setBlock(above(origin, y), BEDROCK);
        const torchCenter = above(origin, 2);
        for (const direction of HORIZONTAL_DIRECTIONS) {
            world.setBlock(relative(torchCenter, direction), blockState('minecraft:wall_torch', { facing: direction }));
        }
        return true;
    });

/** An end gateway, Java's `end_gateway`. */
export const endGateway = (exit: BlockPos | undefined, exact: boolean): ConfiguredFeature =>
    feature('end_gateway', (world, _random, origin) => {
        for (const position of betweenClosed(offset(origin, -1, -2, -1), offset(origin, 1, 2, 1))) {
            const sameX = position.x === origin.x;
            const sameY = position.y === origin.y;
            const sameZ = position.z === origin.z;
            const end = Math.abs(position.y - origin.y) === 2;

            if (sameX && sameY && sameZ) {
                world.setBlock(position, blockState('minecraft:end_gateway'));
                if (exit !== undefined) {
                    world.setBlockEntity?.(position, {
                        id: 'minecraft:end_gateway',
                        exitPortal: exit,
                        exactTeleport: exact
                    });
                }
            } else if (sameY) {
                world.setBlock(position, AIR);
            } else if ((end && sameX && sameZ) || ((sameX || sameZ) && !end)) {
                world.setBlock(position, BEDROCK);
            } else {
                world.setBlock(position, AIR);
            }
        }
        return true;
    });

/** The obsidian pillars of the end, Java's `end_spike`. */
export const endSpike = (
    spikes: readonly {
        readonly centerX: number;
        readonly centerZ: number;
        readonly radius: number;
        readonly height: number;
        readonly guarded: boolean;
    }[],
    crystalInvulnerable: boolean,
    crystalBeamTarget: BlockPos | undefined
): ConfiguredFeature =>
    feature('end_spike', (world, random, origin) => {
        for (const spike of spikes) {
            if (spike.centerX >> 4 !== origin.x >> 4 || spike.centerZ >> 4 !== origin.z >> 4) continue;
            const from = { x: spike.centerX - spike.radius, y: world.minY, z: spike.centerZ - spike.radius };
            const to = { x: spike.centerX + spike.radius, y: spike.height + 10, z: spike.centerZ + spike.radius };
            for (const position of betweenClosed(from, to)) {
                const dx = position.x - spike.centerX;
                const dz = position.z - spike.centerZ;
                const insideRadius = dx * dx + dz * dz <= spike.radius * spike.radius + 1;
                if (insideRadius && position.y < spike.height) world.setBlock(position, OBSIDIAN);
                else if (position.y > 65) world.setBlock(position, AIR);
            }

            if (spike.guarded) {
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dz = -2; dz <= 2; dz++) {
                        for (let dy = 0; dy <= 3; dy++) {
                            const isXSide = Math.abs(dx) === 2;
                            const isZSide = Math.abs(dz) === 2;
                            const top = dy === 3;
                            if (!isXSide && !isZSide && !top) continue;
                            const xEdge = dx === -2 || dx === 2 || top;
                            const zEdge = dz === -2 || dz === 2 || top;
                            world.setBlock(
                                { x: spike.centerX + dx, y: spike.height + dy, z: spike.centerZ + dz },
                                blockState('minecraft:iron_bars', {
                                    north: String(xEdge && dz !== -2),
                                    south: String(xEdge && dz !== 2),
                                    west: String(zEdge && dx !== -2),
                                    east: String(zEdge && dx !== 2),
                                    waterlogged: 'false'
                                })
                            );
                        }
                    }
                }
            }

            const crystalPos = { x: spike.centerX, y: spike.height + 1, z: spike.centerZ };
            world.spawnEntity?.('minecraft:end_crystal', crystalPos, {
                yaw: f32(random.nextFloat() * 360),
                ...(crystalBeamTarget === undefined ? {} : { beamTarget: crystalBeamTarget }),
                invulnerable: crystalInvulnerable
            });
            world.setBlock(below(crystalPos), BEDROCK);
            world.setBlock(crystalPos, blockState('minecraft:fire'));
        }
        return true;
    });

/** How a huge mushroom is shaped. */
export interface HugeMushroomConfig {
    readonly capProvider: BlockStateProvider;
    readonly stemProvider: BlockStateProvider;
    readonly foliageRadius: number;
    readonly canPlaceOn: BlockPredicate;
}

const hugeMushroom = (
    type: 'huge_red_mushroom' | 'huge_brown_mushroom',
    config: HugeMushroomConfig,
    radiusForHeight: (treeHeight: number, leafRadius: number, yo: number) => number,
    makeCap: (
        world: FeatureWorld,
        random: RandomSource,
        origin: BlockPos,
        treeHeight: number,
        place: (position: BlockPos, state: BlockState) => void
    ) => void
): ConfiguredFeature =>
    feature(type, (world, random, origin) => {
        let treeHeight = random.nextIntBounded(3) + 4;
        if (random.nextIntBounded(12) === 0) treeHeight *= 2;

        if (origin.y < world.minY + 1 || origin.y + treeHeight + 1 > world.minY + world.height - 1) return false;
        if (!config.canPlaceOn(world, below(origin))) return false;
        for (let dy = 0; dy <= treeHeight; dy++) {
            const radius = radiusForHeight(-1, config.foliageRadius, dy);
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const state = world.getBlock(offset(origin, dx, dy, dz));
                    if (!world.blocks.isAir(state) && !world.blocks.hasTag(state, 'minecraft:leaves')) return false;
                }
            }
        }

        const place = (position: BlockPos, state: BlockState) => {
            const existing = world.getBlock(position);
            if (world.blocks.isAir(existing) || world.blocks.hasTag(existing, 'minecraft:replaceable_by_mushrooms')) {
                world.setBlock(position, state);
            }
        };

        makeCap(world, random, origin, treeHeight, place);
        for (let dy = 0; dy < treeHeight; dy++) {
            place(above(origin, dy), config.stemProvider.getState(world, random, origin));
        }
        return true;
    });

const MUSHROOM_FACES = ['up', 'down', 'north', 'south', 'west', 'east'] as const;

const mushroomCapState = (
    base: BlockState,
    values: Readonly<Partial<Record<(typeof MUSHROOM_FACES)[number], boolean>>>
): BlockState => {
    let state = base;
    for (const face of MUSHROOM_FACES) {
        const value = values[face];
        if (value === undefined || !(face in base.properties)) continue;
        state = withProperty(state, face, String(value));
    }
    return state;
};

/** The red mushroom's domed cap, Java's `huge_red_mushroom`. */
export const hugeRedMushroom = (config: HugeMushroomConfig): ConfiguredFeature =>
    hugeMushroom(
        'huge_red_mushroom',
        config,
        (treeHeight, leafRadius, yo) => (yo >= treeHeight - 3 ? leafRadius : 0),
        (world, random, origin, treeHeight, place) => {
            for (let dy = treeHeight - 3; dy <= treeHeight; dy++) {
                const radius = dy < treeHeight ? config.foliageRadius : config.foliageRadius - 1;
                const center = config.foliageRadius - 2;
                for (let dx = -radius; dx <= radius; dx++) {
                    for (let dz = -radius; dz <= radius; dz++) {
                        const xEdge = dx === -radius || dx === radius;
                        const zEdge = dz === -radius || dz === radius;
                        if (!(dy >= treeHeight || xEdge !== zEdge)) continue;
                        const base = config.capProvider.getState(world, random, origin);
                        place(
                            offset(origin, dx, dy, dz),
                            mushroomCapState(base, {
                                up: dy >= treeHeight - 1,
                                west: dx < -center,
                                east: dx > center,
                                north: dz < -center,
                                south: dz > center
                            })
                        );
                    }
                }
            }
        }
    );

/** The brown mushroom's flat cap, Java's `huge_brown_mushroom`. */
export const hugeBrownMushroom = (config: HugeMushroomConfig): ConfiguredFeature =>
    hugeMushroom(
        'huge_brown_mushroom',
        config,
        (_treeHeight, leafRadius, yo) => (yo <= 3 ? 0 : leafRadius),
        (world, random, origin, treeHeight, place) => {
            const radius = config.foliageRadius;
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const minX = dx === -radius;
                    const maxX = dx === radius;
                    const minZ = dz === -radius;
                    const maxZ = dz === radius;
                    const xEdge = minX || maxX;
                    const zEdge = minZ || maxZ;
                    if (xEdge && zEdge) continue;
                    const base = config.capProvider.getState(world, random, origin);
                    place(
                        offset(origin, dx, treeHeight, dz),
                        mushroomCapState(base, {
                            west: minX || (zEdge && dx === 1 - radius),
                            east: maxX || (zEdge && dx === radius - 1),
                            north: minZ || (xEdge && dz === 1 - radius),
                            south: maxZ || (xEdge && dz === radius - 1)
                        })
                    );
                }
            }
        }
    );

/** A huge nether fungus, Java's `huge_fungus`. */
export const hugeFungus = (
    validBaseState: BlockState,
    stemState: BlockState,
    hatState: BlockState,
    decorState: BlockState,
    replaceableBlocks: BlockPredicate,
    planted: boolean
): ConfiguredFeature =>
    feature('huge_fungus', (world, random, origin) => {
        if (world.getBlock(below(origin)).name !== validBaseState.name) return false;

        let totalHeight = randomBetweenInclusive(random, 4, 13);
        if (random.nextIntBounded(12) === 0) totalHeight *= 2;
        if (!planted && origin.y + totalHeight + 1 >= world.minY + world.height) return false;

        const isHuge = !planted && random.nextFloat() < 0.06;
        world.setBlock(origin, AIR);

        const isReplaceable = (position: BlockPos, checkPlants: boolean): boolean =>
            world.blocks.isReplaceable(world.getBlock(position)) || (checkPlants && replaceableBlocks(world, position));

        const stemRadius = isHuge ? 1 : 0;
        for (let dx = -stemRadius; dx <= stemRadius; dx++) {
            for (let dz = -stemRadius; dz <= stemRadius; dz++) {
                const corner = isHuge && Math.abs(dx) === stemRadius && Math.abs(dz) === stemRadius;
                for (let dy = 0; dy < totalHeight; dy++) {
                    const position = offset(origin, dx, dy, dz);
                    if (!isReplaceable(position, true)) continue;
                    if (corner) {
                        if (random.nextFloat() < 0.1) world.setBlock(position, stemState);
                    } else {
                        world.setBlock(position, stemState);
                    }
                }
            }
        }

        const placeVines = hatState.name === 'minecraft:nether_wart_block';
        const hatHeight = Math.min(random.nextIntBounded(1 + Math.trunc(totalHeight / 3)) + 5, totalHeight);
        const hatStartY = totalHeight - hatHeight;

        const tryWeepingVines = (hatBlockPos: BlockPos) => {
            let cursor = below(hatBlockPos);
            if (!isEmptyBlock(world, cursor)) return;
            let goal = randomBetweenInclusive(random, 1, 5);
            if (random.nextIntBounded(7) === 0) goal *= 2;
            for (let height = 0; height <= goal; height++) {
                if (!isEmptyBlock(world, cursor)) {
                    cursor = below(cursor);
                    continue;
                }
                if (height === goal || !isEmptyBlock(world, below(cursor))) {
                    world.setBlock(
                        cursor,
                        blockState('minecraft:weeping_vines', { age: String(randomBetweenInclusive(random, 23, 25)) })
                    );
                    break;
                }
                world.setBlock(cursor, blockState('minecraft:weeping_vines_plant'));
                cursor = below(cursor);
            }
        };

        const placeHatBlock = (position: BlockPos, decorChance: number, hatChance: number, vineChance: number) => {
            if (random.nextFloat() < decorChance) {
                world.setBlock(position, decorState);
                return;
            }
            if (random.nextFloat() >= hatChance) return;
            world.setBlock(position, hatState);
            if (random.nextFloat() < vineChance) tryWeepingVines(position);
        };

        for (let dy = hatStartY; dy <= totalHeight; dy++) {
            let radius = dy < totalHeight - random.nextIntBounded(3) ? 2 : 1;
            if (hatHeight > 8 && dy < hatStartY + 4) radius = 3;
            if (isHuge) radius++;

            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const isEdgeX = dx === -radius || dx === radius;
                    const isEdgeZ = dz === -radius || dz === radius;
                    const inside = !isEdgeX && !isEdgeZ && dy !== totalHeight;
                    const corner = isEdgeX && isEdgeZ;
                    const isHatBottom = dy < hatStartY + 3;
                    const position = offset(origin, dx, dy, dz);
                    if (!isReplaceable(position, false)) continue;

                    if (isHatBottom) {
                        if (inside) continue;
                        if (world.getBlock(below(position)).name === hatState.name) {
                            world.setBlock(position, hatState);
                        } else if (random.nextFloat() < 0.15) {
                            world.setBlock(position, hatState);
                            if (placeVines && random.nextIntBounded(11) === 0) tryWeepingVines(position);
                        }
                    } else if (inside) {
                        placeHatBlock(position, 0.1, 0.2, placeVines ? 0.1 : 0);
                    } else if (corner) {
                        placeHatBlock(position, 0.01, 0.7, placeVines ? 0.083 : 0);
                    } else {
                        placeHatBlock(position, 5e-4, 0.98, placeVines ? 0.07 : 0);
                    }
                }
            }
        }
        return true;
    });

/** A fallen log with its stump, Java's `fallen_tree`. */
export const fallenTree = (
    trunkProvider: BlockStateProvider,
    logLength: IntProvider,
    stumpDecorators: readonly TreeDecorator[],
    logDecorators: readonly TreeDecorator[]
): ConfiguredFeature =>
    feature('fallen_tree', (world, random, origin) => {
        const axisFor = (direction: Direction) => (direction === 'north' || direction === 'south' ? 'z' : 'x');
        const placeLogBlock = (position: BlockPos, axis?: string): BlockPos => {
            const state = trunkProvider.getState(world, random, position);
            world.setBlock(
                position,
                axis !== undefined && 'axis' in state.properties ? withProperty(state, 'axis', axis) : state
            );
            return position;
        };
        const decorate = (logs: readonly BlockPos[], decorators: readonly TreeDecorator[]) => {
            if (decorators.length === 0) return;
            const set = new JavaHashSet();
            for (const log of logs) set.add(log);
            const context = {
                world,
                random,
                logs: set.sortedByY(),
                leaves: [] as BlockPos[],
                roots: [] as BlockPos[],
                setBlock: (position: BlockPos, state: BlockState) => {
                    world.setBlock(position, state);
                }
            };
            for (const decorator of decorators) decorator.place(context);
        };

        decorate([placeLogBlock(origin)], stumpDecorators);

        const direction = randomElement(HORIZONTAL_DIRECTIONS, random);
        const length = logLength.sample(random) - 2;
        let logStart = relative(origin, direction, 2 + random.nextIntBounded(2));

        logStart = above(logStart);
        for (let step = 0; step < 6; step++) {
            const overSolid = world.blocks.isSturdy(world.getBlock(below(logStart)), 'up');
            if (validTreePos(world, logStart) && overSolid) break;
            logStart = below(logStart);
        }

        let gap = 0;
        let cursor = logStart;
        for (let step = 0; step < length; step++) {
            if (!validTreePos(world, cursor)) return true;
            if (!world.blocks.isSturdy(world.getBlock(below(cursor)), 'up')) {
                if (++gap > 2) return true;
            } else {
                gap = 0;
            }
            cursor = relative(cursor, direction);
        }

        const logs: BlockPos[] = [];
        cursor = logStart;
        for (let step = 0; step < length; step++) {
            logs.push(placeLogBlock(cursor, axisFor(direction)));
            cursor = relative(cursor, direction);
        }
        decorate(logs, logDecorators);
        return true;
    });

const parseStateList = (source: unknown, path: string): BlockState[] =>
    asArray(source, path).map((entry, index) => parseBlockState(entry, `${path}[${index}]`));

/**
 * Reads the processors a `template` feature runs its blocks through.
 *
 * Java's processor list codec takes an identifier, a bare list of processors, or an object
 * holding that list, and the desert well is the one vanilla feature that writes its rules where
 * it stands rather than naming a list. Dropping the inline form places the template unprocessed,
 * which for the desert well is suspicious sand with nothing to brush out of it.
 *
 * The rules themselves stay `unknown`: this package names a chain and the world reads it.
 */
const parseTemplateProcessors = (value: unknown, path: string): TemplateProcessors | undefined => {
    if (value === undefined) return undefined;
    if (typeof value === 'string') return normalizeIdentifier(value, path);
    if (Array.isArray(value)) return { processors: asArray(value, path) };

    return { processors: asArray(asObject(value, path)['processors'], `${path}.processors`) };
};

/** Reads the structural feature types. */
export const parseStructuralFeature = (
    type: string,
    raw: Record<string, unknown>,
    path: string,
    parsers: FeatureParsers
): ConfiguredFeature | undefined => {
    switch (type) {
        case 'geode': {
            const blocks = asObject(raw['blocks'], `${path}.blocks`);
            const layers = asObject(raw['layers'], `${path}.layers`);
            const crack = asObject(raw['crack'] ?? {}, `${path}.crack`);
            return geode({
                fillingProvider: parsers.blockStateProvider(
                    blocks['filling_provider'],
                    `${path}.blocks.filling_provider`
                ),
                innerLayerProvider: parsers.blockStateProvider(
                    blocks['inner_layer_provider'],
                    `${path}.blocks.inner_layer_provider`
                ),
                alternateInnerLayerProvider: parsers.blockStateProvider(
                    blocks['alternate_inner_layer_provider'],
                    `${path}.blocks.alternate_inner_layer_provider`
                ),
                middleLayerProvider: parsers.blockStateProvider(
                    blocks['middle_layer_provider'],
                    `${path}.blocks.middle_layer_provider`
                ),
                outerLayerProvider: parsers.blockStateProvider(
                    blocks['outer_layer_provider'],
                    `${path}.blocks.outer_layer_provider`
                ),
                innerPlacements: asArray(blocks['inner_placements'], `${path}.blocks.inner_placements`).map(
                    (entry, index) =>
                        typeof entry === 'string'
                            ? blockState(normalizeIdentifier(entry, `${path}.blocks.inner_placements[${index}]`))
                            : parseBlockState(entry, `${path}.blocks.inner_placements[${index}]`)
                ),
                cannotReplace: parseBlockSet(blocks['cannot_replace'], `${path}.blocks.cannot_replace`),
                invalidBlocks: parseBlockSet(blocks['invalid_blocks'], `${path}.blocks.invalid_blocks`),
                filling: asNumber(layers['filling'], `${path}.layers.filling`, 1.7),
                innerLayer: asNumber(layers['inner_layer'], `${path}.layers.inner_layer`, 2.2),
                middleLayer: asNumber(layers['middle_layer'], `${path}.layers.middle_layer`, 3.2),
                outerLayer: asNumber(layers['outer_layer'], `${path}.layers.outer_layer`, 4.2),
                generateCrackChance: asNumber(crack['generate_crack_chance'], `${path}.crack.generate_crack_chance`, 1),
                baseCrackSize: asNumber(crack['base_crack_size'], `${path}.crack.base_crack_size`, 2),
                crackPointOffset: asInteger(crack['crack_point_offset'], `${path}.crack.crack_point_offset`, 2),
                usePotentialPlacementsChance: asNumber(
                    raw['use_potential_placements_chance'],
                    `${path}.use_potential_placements_chance`,
                    0.35
                ),
                useAlternateLayer0Chance: asNumber(
                    raw['use_alternate_layer0_chance'],
                    `${path}.use_alternate_layer0_chance`,
                    0
                ),
                placementsRequireLayer0Alternate: asBoolean(
                    raw['placements_require_layer0_alternate'],
                    `${path}.placements_require_layer0_alternate`,
                    true
                ),
                outerWallDistance: parseIntProvider(raw['outer_wall_distance'] ?? 5, `${path}.outer_wall_distance`),
                distributionPoints: parseIntProvider(raw['distribution_points'] ?? 4, `${path}.distribution_points`),
                pointOffset: parseIntProvider(raw['point_offset'] ?? 2, `${path}.point_offset`),
                minGenOffset: asInteger(raw['min_gen_offset'], `${path}.min_gen_offset`, -16),
                maxGenOffset: asInteger(raw['max_gen_offset'], `${path}.max_gen_offset`, 16),
                noiseMultiplier: asNumber(raw['noise_multiplier'], `${path}.noise_multiplier`, 0.05),
                invalidBlocksThreshold: asInteger(raw['invalid_blocks_threshold'], `${path}.invalid_blocks_threshold`)
            });
        }

        case 'lake':
            return lake(
                parsers.blockStateProvider(raw['fluid'], `${path}.fluid`),
                parsers.blockStateProvider(raw['barrier'], `${path}.barrier`),
                parseBlockPredicate(raw['can_place_feature'], `${path}.can_place_feature`),
                parseBlockPredicate(raw['can_replace_with_air_or_fluid'], `${path}.can_replace_with_air_or_fluid`),
                parseBlockPredicate(raw['can_replace_with_barrier'], `${path}.can_replace_with_barrier`)
            );

        case 'iceberg':
            return iceberg(parseBlockState(raw['state'], `${path}.state`));

        case 'monster_room':
            return monsterRoom();

        case 'bonus_chest':
            return bonusChest();

        case 'template': {
            const processors = parseTemplateProcessors(raw['processors'], `${path}.processors`);
            return templateFeature(
                parseWeightedList(raw['templates'], `${path}.templates`, (value, entryPath) => {
                    const entry = asObject(value, entryPath);
                    const rotations = entry['rotations'];
                    return {
                        template: normalizeIdentifier(entry['id'], `${entryPath}.id`),
                        rotations:
                            rotations === undefined
                                ? [0, 1, 2, 3]
                                : asArray(rotations, `${entryPath}.rotations`).map((value) =>
                                      ROTATIONS.indexOf(
                                          typeof value === 'string' && (ROTATIONS as readonly string[]).includes(value)
                                              ? // The membership test narrows to the rotation union.
                                                (value as (typeof ROTATIONS)[number])
                                              : 'none'
                                      )
                                  )
                    };
                }),
                processors
            );
        }

        case 'fossil':
            return fossil(
                asArray(raw['fossil_structures'], `${path}.fossil_structures`).map((entry, index) =>
                    normalizeIdentifier(entry, `${path}.fossil_structures[${index}]`)
                ),
                asArray(raw['overlay_structures'], `${path}.overlay_structures`).map((entry, index) =>
                    normalizeIdentifier(entry, `${path}.overlay_structures[${index}]`)
                ),
                normalizeIdentifier(raw['fossil_processors'], `${path}.fossil_processors`),
                normalizeIdentifier(raw['overlay_processors'], `${path}.overlay_processors`),
                asInteger(raw['max_empty_corners_allowed'], `${path}.max_empty_corners_allowed`)
            );

        case 'root_system':
            return rootSystem({
                treeFeature: parsers.placedFeature(raw['feature'], `${path}.feature`),
                requiredVerticalSpaceForTree: asInteger(
                    raw['required_vertical_space_for_tree'],
                    `${path}.required_vertical_space_for_tree`
                ),
                levelTestDistance: asInteger(raw['root_radius'], `${path}.root_radius`, 1),
                maxLevelDeviation: asInteger(raw['max_root_column_height'], `${path}.max_root_column_height`, 1),
                rootRadius: asInteger(raw['root_radius'], `${path}.root_radius`),
                rootReplaceable: parseBlockSet(raw['root_replaceable'], `${path}.root_replaceable`),
                rootStateProvider: parsers.blockStateProvider(
                    raw['root_state_provider'],
                    `${path}.root_state_provider`
                ),
                rootPlacementAttempts: asInteger(raw['root_placement_attempts'], `${path}.root_placement_attempts`),
                rootColumnMaxHeight: asInteger(raw['root_column_max_height'], `${path}.root_column_max_height`),
                hangingRootRadius: asInteger(raw['hanging_root_radius'], `${path}.hanging_root_radius`),
                hangingRootsVerticalSpan: asInteger(
                    raw['hanging_roots_vertical_span'],
                    `${path}.hanging_roots_vertical_span`
                ),
                hangingRootStateProvider: parsers.blockStateProvider(
                    raw['hanging_root_state_provider'],
                    `${path}.hanging_root_state_provider`
                ),
                hangingRootPlacementAttempts: asInteger(
                    raw['hanging_root_placement_attempts'],
                    `${path}.hanging_root_placement_attempts`
                ),
                allowedVerticalWaterForTree: asInteger(
                    raw['allowed_vertical_water_for_tree'],
                    `${path}.allowed_vertical_water_for_tree`
                ),
                allowedTreePosition: parseBlockPredicate(raw['allowed_tree_position'], `${path}.allowed_tree_position`)
            });

        case 'bamboo':
            return bamboo(asNumber(raw['probability'], `${path}.probability`));

        case 'spike':
            return spike(
                parseBlockState(raw['state'], `${path}.state`),
                parseBlockPredicate(raw['can_place_on'], `${path}.can_place_on`),
                parseBlockPredicate(raw['can_replace'], `${path}.can_replace`)
            );

        case 'chorus_plant':
            return chorusPlant();

        case 'coral_tree':
            return coralTree(parsers.placedFeature(raw['feature'], `${path}.feature`));

        case 'coral_claw':
            return coralClaw(parsers.placedFeature(raw['feature'], `${path}.feature`));

        case 'end_island':
            return endIsland();

        case 'end_podium':
            return endPodium(asBoolean(raw['active'], `${path}.active`, false));

        case 'end_gateway': {
            const exit = raw['exit'];
            const values = exit === undefined ? undefined : asArray(exit, `${path}.exit`);
            return endGateway(
                values === undefined
                    ? undefined
                    : {
                          x: asInteger(values[0], `${path}.exit[0]`),
                          y: asInteger(values[1], `${path}.exit[1]`),
                          z: asInteger(values[2], `${path}.exit[2]`)
                      },
                asBoolean(raw['exact'], `${path}.exact`, false)
            );
        }

        case 'end_spike': {
            const crystalBeamTarget = raw['crystal_beam_target'];
            const beam =
                crystalBeamTarget === undefined ? undefined : asArray(crystalBeamTarget, `${path}.crystal_beam_target`);
            return endSpike(
                asArray(raw['spikes'] ?? [], `${path}.spikes`).map((entry, index) => {
                    const spikePath = `${path}.spikes[${index}]`;
                    const spikeRaw = asObject(entry, spikePath);
                    return {
                        centerX: asInteger(spikeRaw['centerX'], `${spikePath}.centerX`, 0),
                        centerZ: asInteger(spikeRaw['centerZ'], `${spikePath}.centerZ`, 0),
                        radius: asInteger(spikeRaw['radius'], `${spikePath}.radius`, 0),
                        height: asInteger(spikeRaw['height'], `${spikePath}.height`, 0),
                        guarded: asBoolean(spikeRaw['guarded'], `${spikePath}.guarded`, false)
                    };
                }),
                asBoolean(raw['crystal_invulnerable'], `${path}.crystal_invulnerable`, false),
                beam === undefined
                    ? undefined
                    : {
                          x: asInteger(beam[0], `${path}.crystal_beam_target[0]`),
                          y: asInteger(beam[1], `${path}.crystal_beam_target[1]`),
                          z: asInteger(beam[2], `${path}.crystal_beam_target[2]`)
                      }
            );
        }

        case 'huge_red_mushroom':
        case 'huge_brown_mushroom': {
            const config: HugeMushroomConfig = {
                capProvider: parsers.blockStateProvider(raw['cap_provider'], `${path}.cap_provider`),
                stemProvider: parsers.blockStateProvider(raw['stem_provider'], `${path}.stem_provider`),
                foliageRadius: asInteger(raw['foliage_radius'], `${path}.foliage_radius`, 2),
                canPlaceOn: parseBlockPredicate(raw['can_place_on'], `${path}.can_place_on`)
            };
            return type === 'huge_red_mushroom' ? hugeRedMushroom(config) : hugeBrownMushroom(config);
        }

        case 'huge_fungus':
            return hugeFungus(
                parseBlockState(raw['valid_base_block'], `${path}.valid_base_block`),
                parseBlockState(raw['stem_state'], `${path}.stem_state`),
                parseBlockState(raw['hat_state'], `${path}.hat_state`),
                parseBlockState(raw['decor_state'], `${path}.decor_state`),
                parseBlockPredicate(raw['replaceable_blocks'], `${path}.replaceable_blocks`),
                asBoolean(raw['planted'], `${path}.planted`, false)
            );

        case 'fallen_tree':
            return fallenTree(
                parsers.blockStateProvider(raw['trunk_provider'], `${path}.trunk_provider`),
                parseIntProvider(raw['log_length'], `${path}.log_length`),
                asArray(raw['stump_decorators'] ?? [], `${path}.stump_decorators`).map((entry, index) =>
                    treeInternals.parseTreeDecorator(entry, `${path}.stump_decorators[${index}]`, parsers)
                ),
                asArray(raw['log_decorators'] ?? [], `${path}.log_decorators`).map((entry, index) =>
                    treeInternals.parseTreeDecorator(entry, `${path}.log_decorators[${index}]`, parsers)
                )
            );

        default:
            return undefined;
    }
};

/** Exported for the corpus test, which reports how many states a geode's inner placements hold. */
export const structuralInternals = { parseStateList, PACKED_ICE, mthCos, mthSin };
