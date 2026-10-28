/**
 * The one seam every system in this package reads and writes the world through.
 *
 * Redstone signal and random ticking never touch a chunk, a palette, or a block
 * entity directly. They call {@link WorldAccess}, so a test can use a small
 * voxel double and the server implements the interface once.
 */

import type { BlockStateValue } from '@jsprismarine/blocks';

export type { BlockStateValue };

/** A block position in world coordinates, with integer components. */
export interface BlockPosition {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * The six directions, in Java's `Direction.values()` order.
 *
 * The order matters: `SignalGetter.getBestNeighborSignal` iterates it and stops
 * at the first 15, so power readings depend on the order.
 */
export const DIRECTIONS = ['down', 'up', 'north', 'south', 'west', 'east'] as const;

/** One of {@link DIRECTIONS}. */
export type Direction = (typeof DIRECTIONS)[number];

/** The four horizontal directions, in Java's `Direction.Plane.HORIZONTAL` order. */
export const HORIZONTAL_DIRECTIONS = ['north', 'south', 'west', 'east'] as const satisfies readonly Direction[];

/** The two vertical directions, in Java's `Direction.Plane.VERTICAL` order. */
export const VERTICAL_DIRECTIONS = ['down', 'up'] as const satisfies readonly Direction[];

const STEPS = {
    down: { x: 0, y: -1, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    north: { x: 0, y: 0, z: -1 },
    south: { x: 0, y: 0, z: 1 },
    west: { x: -1, y: 0, z: 0 },
    east: { x: 1, y: 0, z: 0 }
} as const satisfies Record<Direction, BlockPosition>;

const OPPOSITES = {
    down: 'up',
    up: 'down',
    north: 'south',
    south: 'north',
    west: 'east',
    east: 'west'
} as const satisfies Record<Direction, Direction>;

const CLOCKWISE = { north: 'east', east: 'south', south: 'west', west: 'north' } as const;

/** The unit step of one direction, matching Java's `getStepX`, `getStepY` and `getStepZ`. */
export const stepOf = (direction: Direction): BlockPosition => STEPS[direction];

/** The direction facing the other way. */
export const opposite = (direction: Direction): Direction => OPPOSITES[direction];

/** The next horizontal direction clockwise, as Java's `Direction.getClockWise` gives it. */
export const clockWise = (direction: (typeof HORIZONTAL_DIRECTIONS)[number]): (typeof HORIZONTAL_DIRECTIONS)[number] =>
    CLOCKWISE[direction];

/** The next horizontal direction counterclockwise. */
export const counterClockWise = (
    direction: (typeof HORIZONTAL_DIRECTIONS)[number]
): (typeof HORIZONTAL_DIRECTIONS)[number] => CLOCKWISE[CLOCKWISE[CLOCKWISE[direction]]];

/**
 * The position `distance` blocks away in one direction.
 *
 * @param from - The position to start from.
 * @param direction - Which way to step.
 * @param distance - How many blocks to step, defaulting to one.
 */
export const relative = (from: BlockPosition, direction: Direction, distance = 1): BlockPosition => {
    const step = STEPS[direction];
    return { x: from.x + step.x * distance, y: from.y + step.y * distance, z: from.z + step.z * distance };
};

/** The position offset by three deltas. */
export const offset = (from: BlockPosition, dx: number, dy: number, dz: number): BlockPosition => ({
    x: from.x + dx,
    y: from.y + dy,
    z: from.z + dz
});

/** Whether two positions name the same block. */
export const samePosition = (a: BlockPosition, b: BlockPosition): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

/** A position as a map key: `x,y,z`. */
export const positionKey = (at: BlockPosition): string => `${at.x},${at.y},${at.z}`;

/** The block at one position: what it is, and the state values its rules read. */
export interface BlockRef {
    /** The namespaced Bedrock block identifier, such as `minecraft:redstone_wire`. */
    readonly name: string;
    /** Every state value the block carries, keyed by state name. */
    readonly states: Readonly<Record<string, BlockStateValue>>;
}

/** A block with no states, which is what most of this package writes. */
export const block = (name: string, states: Readonly<Record<string, BlockStateValue>> = {}): BlockRef => ({
    name,
    states
});

/** Air, the block every system treats as empty. */
export const AIR = block('minecraft:air');

/**
 * The block entity data a system reads or writes.
 *
 * Comparators store their last output here, matching Java's `ComparatorBlockEntity`,
 * and containers report their fill through `analogOutput`.
 */
export interface BlockEntityData {
    /**
     * The analog signal a comparator reads out of this block, 0 to 15.
     *
     * The host computes it from the container's contents; this package only reads
     * it, which is how a comparator reads a chest's fill level without this
     * package knowing what an item is.
     */
    readonly analogOutput?: number;
    /** A comparator's last computed output, Java's `ComparatorBlockEntity.outputSignal`. */
    readonly comparatorOutput?: number;
}

/** The four difficulty names, in the order Java assigns their numeric ids. */
export const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'] as const;

/** One of {@link DIFFICULTIES}. */
export type Difficulty = (typeof DIFFICULTIES)[number];

/** The three weather states. */
export const WEATHER = ['clear', 'rain', 'thunder'] as const;

/** One of {@link WEATHER}. */
export type Weather = (typeof WEATHER)[number];

/** Which of the two Java tick lists a scheduled tick belongs to. */
export type TickKind = 'block' | 'fluid';

/**
 * The world reads and writes the redstone and random tick systems use.
 *
 * The host implements it over its own chunks; {@link createTestWorld} implements
 * it over a map of positions. Tick scheduling lives in `TickScheduler` and the
 * data-driven block content adapter.
 */
export interface WorldAccess {
    /** The block at one position. Outside the loaded world, return air. */
    getBlock(at: BlockPosition): BlockRef;
    /**
     * Replace the block at one position.
     *
     * @param at - Where to write.
     * @param to - The new block.
     * @param notifyNeighbors - Whether the host should run neighbor updates, which
     *   is Java's flag 1 in `setBlockAndUpdate` against the bare write a block
     *   family uses for its own state.
     */
    setBlock(at: BlockPosition, to: BlockRef, notifyNeighbors: boolean): void;
    /** The block entity data at one position, or undefined when there is none. */
    getBlockEntityData(at: BlockPosition): BlockEntityData | undefined;
}
