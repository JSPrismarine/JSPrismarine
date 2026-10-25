import type { RandomSource } from '@jsprismarine/worldgen';

import type { BlockSet } from '../registry';
import type { BlockState, Direction } from '../world/BlockState';
import { DIRECTION_STEPS } from '../world/BlockState';
import type { BlockOracle, BlockPos, FeatureWorld } from '../world/FeatureWorld';
import { offset } from '../world/FeatureWorld';

/** Returns the position one step in a direction. */
export const relative = (position: BlockPos, direction: Direction, distance = 1): BlockPos => {
    const [dx, dy, dz] = DIRECTION_STEPS[direction];
    return offset(position, dx * distance, dy * distance, dz * distance);
};

/** Returns the position one block up. */
export const above = (position: BlockPos, distance = 1): BlockPos => relative(position, 'up', distance);

/** Returns the position one block down. */
export const below = (position: BlockPos, distance = 1): BlockPos => relative(position, 'down', distance);

/** Answers Java's `LevelAccessor.isEmptyBlock`. */
export const isEmptyBlock = (world: FeatureWorld, position: BlockPos): boolean =>
    world.blocks.isAir(world.getBlock(position));

/** Writes a state only when a test on the block already there passes, Java's `safeSetBlock`. */
export const safeSetBlock = (
    world: FeatureWorld,
    position: BlockPos,
    state: BlockState,
    canReplace: (existing: BlockState) => boolean
): boolean => (canReplace(world.getBlock(position)) ? world.setBlock(position, state) : false);

/**
 * Shuffles a copy of a list the way Java's `Util.shuffle` does.
 *
 * The direction order several features draw out of this decides which face a growth attaches to,
 * so the swap order matters as much as the result: Java walks from the end and swaps with a draw
 * in `[0, i)`.
 */
export const shuffledCopy = <T>(items: readonly T[], random: RandomSource): T[] => {
    const copy = [...items];
    for (let index = copy.length; index > 1; index--) {
        const swapTo = random.nextIntBounded(index);
        const held = copy[index - 1];
        const other = copy[swapTo];
        if (held === undefined || other === undefined) continue;
        copy[index - 1] = other;
        copy[swapTo] = held;
    }
    return copy;
};

/** Answers whether a y is outside the generated range. */
export const outsideBuildHeight = (world: FeatureWorld, y: number): boolean =>
    y < world.minY || y >= world.minY + world.height;

/** Iterates every position of an inclusive box, in Java's `BlockPos.betweenClosed` order. */
export const betweenClosed = function* (from: BlockPos, to: BlockPos): Generator<BlockPos> {
    const minX = Math.min(from.x, to.x);
    const minY = Math.min(from.y, to.y);
    const minZ = Math.min(from.z, to.z);
    const maxX = Math.max(from.x, to.x);
    const maxY = Math.max(from.y, to.y);
    const maxZ = Math.max(from.z, to.z);
    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) yield { x, y, z };
        }
    }
};

/**
 * Iterates a box in Java's `BlockPos.withinBoxByManhattanDistance` order.
 *
 * It spirals outward by Manhattan distance, which is why `delta_feature` and
 * `netherrack_replace_blobs` can stop at the first position past their radius instead of
 * filtering the whole box.
 */
export const withinManhattan = function* (
    center: BlockPos,
    rangeX: number,
    rangeY: number,
    rangeZ: number
): Generator<BlockPos> {
    const maxDistance = rangeX + rangeY + rangeZ;
    for (let distance = 0; distance <= maxDistance; distance++) {
        for (let dx = -rangeX; dx <= rangeX; dx++) {
            const remainingAfterX = distance - Math.abs(dx);
            if (remainingAfterX < 0) continue;
            for (let dy = -rangeY; dy <= rangeY; dy++) {
                const remaining = remainingAfterX - Math.abs(dy);
                if (remaining < 0) continue;
                const candidates = remaining === 0 ? [0] : [-remaining, remaining];
                for (const dz of candidates) {
                    if (Math.abs(dz) > rangeZ) continue;
                    yield offset(center, dx, dy, dz);
                }
            }
        }
    }
};

const SIN_SCALE = 10430.378350470453;
const SIN_TABLE = (() => {
    const table = new Float32Array(65536);
    for (let index = 0; index < 65536; index++) table[index] = Math.fround(Math.sin(index / SIN_SCALE));
    return table;
})();

/**
 * Java's `Mth.sin`, which reads a 65536-entry `float` table rather than calling `Math.sin`.
 *
 * The two differ by up to about 5e-5, which is enough to move an ore vein's sphere radii across
 * a block boundary, so worldgen code that calls `Mth.sin` has to call this and code that calls
 * `java.lang.Math.sin` has to call `Math.sin`.
 */
export const mthSin = (value: number): number => SIN_TABLE[Math.trunc(value * SIN_SCALE) & 65535] ?? 0;

/** Java's `Mth.cos`, the same table a quarter turn along. */
export const mthCos = (value: number): number => SIN_TABLE[Math.trunc(value * SIN_SCALE + 16384) & 65535] ?? 0;

/** Answers whether a state is in a parsed `HolderSet<Block>`. */
export const inBlockSet = (blocks: BlockOracle, state: BlockState, set: BlockSet): boolean =>
    set.kind === 'tag' ? blocks.hasTag(state, set.tag) : set.names.includes(state.name);

/** The Manhattan distance between two positions. */
export const manhattan = (a: BlockPos, b: BlockPos): number =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);

/** The squared Euclidean distance between two positions. */
export const distanceSquared = (a: BlockPos, b: BlockPos): number => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
};
