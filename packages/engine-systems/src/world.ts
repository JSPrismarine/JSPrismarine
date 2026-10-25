/**
 * The one seam every system in this package reads and writes the world through.
 *
 * Redstone, fluids, fire, random ticking and explosions never touch a chunk, a
 * palette or a block entity directly. They call {@link WorldAccess}, so a test
 * drives a whole circuit with a small voxel double and the server implements the
 * interface once.
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
 * at the first 15, and `PistonStructureResolver.addBranchingBlocks` walks it to
 * find the blocks a slime block drags. Both results depend on the order.
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

/** The four difficulties and their Java ids, which fire spread multiplies by 7. */
export const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'] as const;

/** One of {@link DIFFICULTIES}. */
export type Difficulty = (typeof DIFFICULTIES)[number];

/** The Java difficulty id, 0 for peaceful through 3 for hard. */
export const difficultyId = (difficulty: Difficulty): number => DIFFICULTIES.indexOf(difficulty);

/** The three weather states the fire and fluid rules read. */
export const WEATHER = ['clear', 'rain', 'thunder'] as const;

/** One of {@link WEATHER}. */
export type Weather = (typeof WEATHER)[number];

/** The three vanilla dimensions, which set the lava flow rate and the infinite fire source. */
export const DIMENSIONS = ['overworld', 'nether', 'the_end'] as const;

/** One of {@link DIMENSIONS}. */
export type Dimension = (typeof DIMENSIONS)[number];

/** Which of the two Java tick lists a scheduled tick belongs to. */
export type TickKind = 'block' | 'fluid';

/** Where an item stack came to rest, and what it is. */
export interface DroppedItem {
    /** The namespaced Bedrock item identifier. */
    readonly identifier: string;
    readonly count: number;
}

/**
 * Everything the systems read and write.
 *
 * The host implements it over its own chunks; {@link createTestWorld} implements
 * it over a map of positions. Scheduling goes through here rather than through a
 * scheduler the caller holds, so a system never needs both objects.
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
     *   is Java's flag 1 in `setBlockAndUpdate` against the bare `setBlock(…, 2)`
     *   a diode uses for its own state.
     */
    setBlock(at: BlockPosition, to: BlockRef, notifyNeighbors: boolean): void;
    /** The block entity data at one position, or undefined when there is none. */
    getBlockEntityData(at: BlockPosition): BlockEntityData | undefined;
    /** Write block entity data at one position. */
    setBlockEntityData(at: BlockPosition, data: BlockEntityData): void;
    /**
     * Schedule a tick, ignored when one is already scheduled for the same
     * position and type. Java's `LevelChunkTicks.schedule` dedupes the same way.
     *
     * @param kind - Which tick list to schedule into.
     * @param at - The position the tick fires for.
     * @param type - The block or fluid identifier the tick belongs to.
     * @param delay - How many game ticks from now.
     * @param priority - The tick priority; see `TICK_PRIORITIES`.
     */
    scheduleTick(kind: TickKind, at: BlockPosition, type: string, delay: number, priority?: number): void;
    /** Whether a tick is already queued for this position and type. */
    hasScheduledTick(kind: TickKind, at: BlockPosition, type: string): boolean;
    /** Whether a queued tick is in the batch the current game tick will run. */
    willTickThisTick(kind: TickKind, at: BlockPosition, type: string): boolean;
    /** Drop an item stack at one position, which a destroyed pushed block does. */
    spawnItem(at: BlockPosition, item: DroppedItem): void;
    /** Play a sound at one position, named by its Bedrock sound event. */
    playSound(at: BlockPosition, sound: string): void;
    /** The world difficulty, which fire spread reads. */
    getDifficulty(): Difficulty;
    /** The current weather, which fire burnout and extinguishing read. */
    getWeather(): Weather;
    /** Whether rain is falling on one position, which needs the host's heightmap. */
    isRainingAt(at: BlockPosition): boolean;
    /** The dimension, which sets the lava flow rate and the infinite fire source. */
    getDimension(): Dimension;
    /** The current game time in ticks, which the scheduler counts from. */
    getGameTime(): number;
    /**
     * A random integer in `[0, bound)`, from the host's world random.
     *
     * Fire spread, lava spread delay and the random tick driver all draw from
     * it, so a test gets a deterministic run by injecting a seeded source.
     */
    randomInt(bound: number): number;
    /** A random float in `[0, 1)`, Java's `RandomSource.nextFloat`. */
    randomFloat(): number;
    /** The lowest y the world holds, which bounds piston pushes and fluid flow. */
    getMinY(): number;
    /** The highest y the world holds. */
    getMaxY(): number;
}
