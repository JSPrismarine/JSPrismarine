import type { RandomSource } from '@jsprismarine/worldgen';

import { asInteger, asNumber } from '../json';
import type { BlockPredicate } from '../providers/blockPredicate';
import { parseBlockPredicate } from '../providers/blockPredicate';
import type { BlockStateProvider } from '../providers/blockStateProvider';
import type { IntProvider } from '../providers/valueProviders';
import { parseIntProvider } from '../providers/valueProviders';
import type { BlockState } from '../world/BlockState';
import { blockState, HORIZONTAL_DIRECTIONS } from '../world/BlockState';
import type { BlockPos, FeatureWorld } from '../world/FeatureWorld';
import { atY, pos } from '../world/FeatureWorld';
import type { ConfiguredFeature } from './Feature';
import { feature } from './Feature';
import type { FeatureParsers } from './parseContext';
import { above, below, relative } from './support';

const f32 = Math.fround;
const AIR = blockState('minecraft:air');
const PI_F = f32(Math.PI);
const TWO_PI_F = f32(Math.PI * 2);

/** How a crevasse is shaped, the fields of Java 26.4's `CrevasseFeature`. */
export interface CrevasseConfig {
    readonly maxWidth: number;
    readonly maxLength: number;
    /** The fewest columns a crevasse may carve; a smaller one places nothing. */
    readonly minFootprint: number;
    readonly cursorSurfaceSearchRange: number;
    readonly columnSurfaceSearchRange: number;
    readonly twistiness: number;
    readonly tapering: number;
    readonly turnFactor: number;
    readonly carveDepth: IntProvider;
    readonly fillDepth: IntProvider;
    readonly surfaceBlock: BlockStateProvider;
    readonly fillBlock: BlockStateProvider;
    readonly carvableBlocks: BlockPredicate;
    readonly acceptableBarrier: BlockPredicate;
}

/** One column the crevasse cuts: its top block, what stood there, and how far below it to cut. */
interface CarveColumn {
    readonly surface: BlockPos;
    readonly originalSurfaceBlock: BlockState;
    readonly depth: number;
}

const bottomY = (column: CarveColumn): number => column.surface.y - column.depth;
const containsY = (column: CarveColumn, y: number): boolean => y >= bottomY(column) && y <= column.surface.y;
const columnKey = (x: number, z: number): string => `${x},${z}`;

/**
 * The first carvable block with air above it, scanning down from `searchRange / 2` above the
 * center to `searchRange` below that start. Java's `findCarvableSurface`.
 */
const findCarvableSurface = (
    world: FeatureWorld,
    config: CrevasseConfig,
    center: BlockPos,
    searchRange: number
): { readonly position: BlockPos; readonly state: BlockState } | undefined => {
    const start = above(center, Math.trunc(searchRange / 2));
    let isBlockAboveEmpty = world.blocks.isAir(world.getBlock(above(start)));
    const minY = Math.max(world.minY, start.y - searchRange);
    for (let y = start.y; y >= minY; y--) {
        const position = atY(start, y);
        const state = world.getBlock(position);
        if (config.carvableBlocks(world, position) && isBlockAboveEmpty) return { position, state };
        isBlockAboveEmpty = world.blocks.isAir(state);
    }
    return undefined;
};

/**
 * Walks one branch out from the origin and records every column within the tapering radius of
 * each step. A column keeps the first surface found for it.
 */
const appendBranchColumns = (
    world: FeatureWorld,
    config: CrevasseConfig,
    columns: Map<string, CarveColumn>,
    origin: BlockPos,
    branchLength: number,
    carveDepth: number,
    initialYaw: number,
    random: RandomSource
): void => {
    let yaw = initialYaw;
    let cursorX = origin.x;
    let cursorZ = origin.z;
    let previousSurfaceY = origin.y;
    let yawAcceleration = 0;

    for (let step = 0; step < branchLength; step++) {
        // The cursor is a double moved by the double cosine of a float yaw, and every turn is
        // float arithmetic, as in Java.
        cursorX += Math.cos(yaw);
        cursorZ += Math.sin(yaw);
        const turnDirection = f32(random.nextGaussian());
        const turnMagnitude = random.nextFloat();
        yawAcceleration = f32(f32(yawAcceleration * 0.5) + f32(f32(turnDirection * turnMagnitude) * config.twistiness));
        yaw = f32(yaw + f32(yawAcceleration * config.turnFactor));
        const blockX = Math.floor(cursorX);
        const blockZ = Math.floor(cursorZ);
        const surface = findCarvableSurface(
            world,
            config,
            pos(blockX, previousSurfaceY, blockZ),
            config.cursorSurfaceSearchRange
        );
        if (surface === undefined) continue;

        const progress = f32(step / branchLength);
        const taper = f32(1 - f32(progress * config.tapering));
        const radius = Math.max(f32(f32(config.maxWidth * 0.5) * taper), 0.5);
        const radiusSquared = f32(radius * radius);
        const maxDepth = Math.max(Math.trunc(f32(carveDepth * taper)), 1);
        const expandedRadius = Math.ceil(radius);

        for (let x = blockX - expandedRadius; x <= blockX + expandedRadius; x++) {
            for (let z = blockZ - expandedRadius; z <= blockZ + expandedRadius; z++) {
                const dx = x - blockX;
                const dz = z - blockZ;
                if (dx * dx + dz * dz > radiusSquared) continue;
                const key = columnKey(x, z);
                if (columns.has(key)) continue;

                const columnSurface = findCarvableSurface(
                    world,
                    config,
                    pos(x, surface.position.y, z),
                    config.columnSurfaceSearchRange
                );
                if (columnSurface === undefined) continue;
                let depth = 1;
                let test = below(columnSurface.position);
                while (depth < maxDepth && config.carvableBlocks(world, test)) {
                    test = below(test);
                    depth++;
                }
                columns.set(key, {
                    surface: columnSurface.position,
                    originalSurfaceBlock: columnSurface.state,
                    depth: depth - 1
                });
            }
        }
        previousSurfaceY = surface.position.y;
    }
};

const hasSteepNeighbor = (columns: ReadonlyMap<string, CarveColumn>, column: CarveColumn): boolean => {
    for (const direction of HORIZONTAL_DIRECTIONS) {
        const next = relative(column.surface, direction);
        const neighbor = columns.get(columnKey(next.x, next.z));
        if (neighbor !== undefined && Math.abs(column.surface.y - neighbor.surface.y) > 1) return true;
    }
    return false;
};

/**
 * Keeps the columns reachable from the origin's column through neighbors that step at most one
 * block. A column beside a steeper step is dropped, and so is everything only it connects.
 */
const removeDisconnectedColumns = (columns: Map<string, CarveColumn>, origin: BlockPos): void => {
    const originColumn = columns.get(columnKey(origin.x, origin.z));
    if (originColumn === undefined || hasSteepNeighbor(columns, originColumn)) {
        columns.clear();
        return;
    }

    const connected = [originColumn];
    const processed = new Set([columnKey(origin.x, origin.z)]);
    // An array iterator reads the length on every step, so this visits the columns it pushes.
    for (const column of connected) {
        for (const direction of HORIZONTAL_DIRECTIONS) {
            const next = relative(column.surface, direction);
            const key = columnKey(next.x, next.z);
            const neighbor = columns.get(key);
            if (neighbor === undefined || processed.has(key) || hasSteepNeighbor(columns, neighbor)) continue;
            connected.push(neighbor);
            processed.add(key);
        }
    }

    columns.clear();
    for (const column of connected) columns.set(columnKey(column.surface.x, column.surface.z), column);
};

/** Puts the column's original surface block beside a carved position wherever the wall would open. */
const sealExternalSides = (
    world: FeatureWorld,
    config: CrevasseConfig,
    columns: ReadonlyMap<string, CarveColumn>,
    column: CarveColumn,
    position: BlockPos,
    placementBlock: string
): void => {
    for (const direction of HORIZONTAL_DIRECTIONS) {
        const next = relative(position, direction);
        if (config.acceptableBarrier(world, next)) continue;
        const neighbor = columns.get(columnKey(next.x, next.z));
        if (neighbor !== undefined && containsY(neighbor, position.y)) continue;
        if (world.getBlock(next).name !== placementBlock) world.setBlock(next, column.originalSurfaceBlock);
    }
};

const wouldExposeSideLiquid = (world: FeatureWorld, position: BlockPos): boolean =>
    HORIZONTAL_DIRECTIONS.some(
        (direction) => world.blocks.fluid(world.getBlock(relative(position, direction))) !== 'empty'
    );

const carveColumn = (
    world: FeatureWorld,
    config: CrevasseConfig,
    columns: ReadonlyMap<string, CarveColumn>,
    column: CarveColumn,
    fillLevel: number,
    random: RandomSource
): void => {
    const carveMinY = bottomY(column);
    let carvedAnyBlock = false;
    for (let y = column.surface.y; y >= carveMinY; y--) {
        const position = atY(column.surface, y);
        const fill = config.fillBlock.getOptionalState(world, random, position);
        const shouldFill = fill !== undefined && y <= fillLevel;
        // An air pocket beside standing fluid would let it pour in, so the cut stops there.
        if (!shouldFill && wouldExposeSideLiquid(world, position)) break;

        const placed = shouldFill ? fill : AIR;
        sealExternalSides(world, config, columns, column, position, placed.name);
        world.setBlock(position, placed);
        if (shouldFill && y === carveMinY) {
            const under = below(position);
            if (!config.acceptableBarrier(world, under) && world.getBlock(under).name !== placed.name) {
                world.setBlock(under, column.originalSurfaceBlock);
            }
        }
        carvedAnyBlock = true;
    }

    if (!carvedAnyBlock) return;
    const surface = config.surfaceBlock.getOptionalState(world, random, column.surface);
    if (surface !== undefined) world.setBlock(column.surface, surface);
};

/**
 * A tapered cut through the surface, filled with fluid below a level and capped with a surface
 * block, Java 26.4's `crevasse`. Vanilla's `ice_crevasse` cuts the ice caves' ice and fills it
 * with water under `brittle_ice`.
 *
 * Two branches run from the origin in opposite directions. Each twists as it goes, and its width
 * and depth taper toward the end. The columns are then pruned to the ones connected to the
 * origin without a step of more than one block, and carved in x-then-z order.
 */
export const crevasse = (config: CrevasseConfig): ConfiguredFeature =>
    feature('crevasse', (world, random, origin) => {
        const carveDepth = config.carveDepth.sample(random);
        if (origin.y <= world.minY + carveDepth) return false;
        const branchLength = Math.trunc(config.maxLength / 2);
        const yaw = f32(random.nextFloat() * TWO_PI_F);
        const fillDepth = config.fillDepth.sample(random);

        const columns = new Map<string, CarveColumn>();
        for (let direction = 0; direction < 2; direction++) {
            appendBranchColumns(
                world,
                config,
                columns,
                origin,
                branchLength,
                carveDepth,
                f32(yaw + f32(direction * PI_F)),
                random
            );
        }
        removeDisconnectedColumns(columns, origin);
        if (columns.size < config.minFootprint) return false;

        let lowestSurfaceY = Number.POSITIVE_INFINITY;
        for (const column of columns.values()) lowestSurfaceY = Math.min(lowestSurfaceY, column.surface.y);
        const fillLevel = Math.min(origin.y - fillDepth, lowestSurfaceY - 1);

        // Each fill draw comes from the shared stream, so the carve order is part of the seed
        // contract: Java sorts by x, then z.
        const ordered = [...columns.values()].sort((a, b) => a.surface.x - b.surface.x || a.surface.z - b.surface.z);
        for (const column of ordered) carveColumn(world, config, columns, column, fillLevel, random);
        return true;
    });

/** Reads the `crevasse` feature type. */
export const parseCrevasseFeature = (
    type: string,
    raw: Record<string, unknown>,
    path: string,
    parsers: FeatureParsers
): ConfiguredFeature | undefined => {
    if (type !== 'crevasse') return undefined;
    return crevasse({
        maxWidth: asInteger(raw['max_width'], `${path}.max_width`),
        maxLength: asInteger(raw['max_length'], `${path}.max_length`),
        minFootprint: asInteger(raw['min_footprint'], `${path}.min_footprint`),
        cursorSurfaceSearchRange: asInteger(raw['cursor_surface_search_range'], `${path}.cursor_surface_search_range`),
        columnSurfaceSearchRange: asInteger(raw['column_surface_search_range'], `${path}.column_surface_search_range`),
        twistiness: f32(asNumber(raw['twistiness'], `${path}.twistiness`)),
        tapering: f32(asNumber(raw['tapering'], `${path}.tapering`)),
        turnFactor: f32(asNumber(raw['turn_factor'], `${path}.turn_factor`)),
        carveDepth: parseIntProvider(raw['carve_depth'], `${path}.carve_depth`),
        fillDepth: parseIntProvider(raw['fill_depth'], `${path}.fill_depth`),
        surfaceBlock: parsers.blockStateProvider(raw['surface_block'], `${path}.surface_block`),
        fillBlock: parsers.blockStateProvider(raw['fill_block'], `${path}.fill_block`),
        carvableBlocks: parseBlockPredicate(raw['carvable_blocks'], `${path}.carvable_blocks`),
        acceptableBarrier: parseBlockPredicate(raw['acceptable_barrier'], `${path}.acceptable_barrier`)
    });
};
