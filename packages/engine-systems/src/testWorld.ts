/**
 * A small voxel world that satisfies {@link WorldAccess}.
 *
 * It exists so the engine systems can be tested as they run in the server: real
 * circuits, real block states, and real fire. Positions live in a map, so the world
 * is unbounded in x and z and bounded in y by `minY` and `maxY`. Nothing here is
 * a mock; every call does the thing a chunk would do.
 */

import { TickScheduler } from './scheduler';
import type {
    BlockEntityData,
    BlockPosition,
    BlockRef,
    BlockRemoval,
    BlockStateValue,
    Difficulty,
    Dimension,
    TickKind,
    WorldAccess,
    Weather
} from './world';
import { AIR, positionKey } from './world';

/** A sound the world was asked to play. */
export interface PlayedSound {
    readonly at: BlockPosition;
    readonly sound: string;
}

/** A block the world was asked to take out, and what it was asked to leave behind. */
export interface DestroyedBlock {
    readonly at: BlockPosition;
    /** What stood there, read before the replacement was written. */
    readonly block: BlockRef;
    readonly removal: BlockRemoval;
}

/** A block the world was asked to carry from one position to another. */
export interface MovedBlock {
    readonly from: BlockPosition;
    readonly to: BlockPosition;
}

/** A block the world was asked to write with neighbor notification. */
export interface BlockUpdate {
    readonly at: BlockPosition;
    readonly to: BlockRef;
}

/** How to build a {@link TestWorld}. */
export interface TestWorldOptions {
    difficulty?: Difficulty;
    weather?: Weather;
    dimension?: Dimension;
    minY?: number;
    maxY?: number;
    /** The random source, defaulting to one that always returns 0. */
    randomInt?: (bound: number) => number;
    /** The float source, defaulting to one that always returns 0. */
    randomFloat?: () => number;
}

/** The world a test drives, with the observation helpers a test needs. */
export interface TestWorld extends WorldAccess {
    /** The scheduler the world queues into, so a test can drain it. */
    readonly scheduler: TickScheduler;
    /** Write a block without running any update, which is how a test builds a circuit. */
    place(at: BlockPosition, to: BlockRef): void;
    /** Write the same block over a run of positions along one axis. */
    placeLine(from: BlockPosition, axis: 'x' | 'y' | 'z', length: number, to: BlockRef): void;
    /** The block identifier at one position. */
    nameAt(at: BlockPosition): string;
    /** One state value at one position. */
    stateAt(at: BlockPosition, state: string): BlockStateValue | undefined;
    /** Every sound played so far, oldest first. */
    readonly sounds: readonly PlayedSound[];
    /** Every block taken out so far, oldest first. */
    readonly destroyed: readonly DestroyedBlock[];
    /** Every block carried from one position to another so far, oldest first. */
    readonly moved: readonly MovedBlock[];
    /** Every notifying write so far, oldest first. */
    readonly updates: readonly BlockUpdate[];
    /** Install the handler a notifying `setBlock` runs, which is where the engine hooks in. */
    onBlockUpdated(handler: (at: BlockPosition, to: BlockRef) => void): void;
    /** Move the clock without running a tick. */
    setGameTime(tick: number): void;
    /** Replace the random source mid-test. */
    setRandomInt(randomInt: (bound: number) => number): void;
    /** Replace the float source mid-test. */
    setRandomFloat(randomFloat: () => number): void;
    setDifficulty(difficulty: Difficulty): void;
    setWeather(weather: Weather): void;
    /**
     * Advance the clock by one game tick and run every tick due on it.
     *
     * @param run - Called once per due tick, which is where the engine dispatches.
     * @returns How many ticks ran.
     */
    runGameTick(run: (kind: TickKind, at: BlockPosition, type: string) => void): number;
}

/**
 * Build a world for tests.
 *
 * @param options - Difficulty, weather, dimension, height bounds and the random source.
 * @returns A world that satisfies {@link WorldAccess}, plus the test helpers.
 * @example
 * ```typescript
 * const world = createTestWorld();
 * world.place({ x: 0, y: 0, z: 0 }, block('minecraft:stone'));
 * ```
 */
export const createTestWorld = (options: TestWorldOptions = {}): TestWorld => {
    const blocks = new Map<string, BlockRef>();
    const blockEntities = new Map<string, BlockEntityData>();
    const scheduler = new TickScheduler();
    const sounds: PlayedSound[] = [];
    const destroyed: DestroyedBlock[] = [];
    const moved: MovedBlock[] = [];
    const updates: BlockUpdate[] = [];

    let difficulty: Difficulty = options.difficulty ?? 'normal';
    let weather: Weather = options.weather ?? 'clear';
    let randomInt = options.randomInt ?? (() => 0);
    let randomFloat = options.randomFloat ?? (() => 0);
    let gameTime = 0;
    let blockUpdated: (at: BlockPosition, to: BlockRef) => void = () => {};

    const dimension: Dimension = options.dimension ?? 'overworld';
    const minY = options.minY ?? -64;
    const maxY = options.maxY ?? 319;

    const getBlock = (at: BlockPosition): BlockRef => {
        if (at.y < minY || at.y > maxY) return AIR;
        return blocks.get(positionKey(at)) ?? AIR;
    };

    const place = (at: BlockPosition, to: BlockRef): void => {
        if (to.name === AIR.name) blocks.delete(positionKey(at));
        else blocks.set(positionKey(at), to);
    };

    const world: TestWorld = {
        scheduler,
        sounds,
        destroyed,
        moved,
        updates,
        place,
        placeLine(from, axis, length, to) {
            for (let i = 0; i < length; i++) {
                place({ ...from, [axis]: from[axis] + i }, to);
            }
        },
        nameAt: (at) => getBlock(at).name,
        stateAt: (at, state) => getBlock(at).states[state],
        onBlockUpdated(handler) {
            blockUpdated = handler;
        },
        setGameTime(tick) {
            gameTime = tick;
        },
        setRandomInt(next) {
            randomInt = next;
        },
        setRandomFloat(next) {
            randomFloat = next;
        },
        setDifficulty(next) {
            difficulty = next;
        },
        setWeather(next) {
            weather = next;
        },
        runGameTick(run) {
            gameTime += 1;
            return scheduler.tick(gameTime, (kind, tick) => run(kind, tick.at, tick.type));
        },

        getBlock,
        setBlock(at, to, notifyNeighbors) {
            place(at, to);
            if (to.name === AIR.name) blockEntities.delete(positionKey(at));
            if (notifyNeighbors) {
                updates.push({ at, to });
                blockUpdated(at, to);
            }
        },
        getBlockEntityData: (at) => blockEntities.get(positionKey(at)),
        setBlockEntityData(at, data) {
            blockEntities.set(positionKey(at), data);
        },
        scheduleTick(kind, at, type, delay, priority) {
            scheduler.list(kind).schedule(at, type, gameTime + delay, priority);
        },
        hasScheduledTick: (kind, at, type) => scheduler.list(kind).hasScheduledTick(at, type),
        willTickThisTick: (kind, at, type) => scheduler.list(kind).willTickThisTick(at, type),
        // The host's job on a real server: raise the break hooks, roll the loot and write
        // what stands in the block's place. Here it records the call and writes, because
        // what the systems are tested on is which blocks they ask to have taken out.
        destroyBlock(at, removal) {
            destroyed.push({ at, block: getBlock(at), removal });
            world.setBlock(at, removal.replacement ?? AIR, removal.notifyNeighbors ?? true);
        },
        moveBlock(from, to) {
            moved.push({ from, to });

            const carried = blockEntities.get(positionKey(from));
            const state = getBlock(from);
            world.setBlock(from, AIR, false);
            world.setBlock(to, state, false);
            if (carried !== undefined) blockEntities.set(positionKey(to), carried);
        },
        playSound(at, sound) {
            sounds.push({ at, sound });
        },
        getDifficulty: () => difficulty,
        getWeather: () => weather,
        isRainingAt(at) {
            if (weather === 'clear') return false;
            for (let y = at.y + 1; y <= maxY; y++) {
                if (getBlock({ x: at.x, y, z: at.z }).name !== AIR.name) return false;
            }
            return true;
        },
        getDimension: () => dimension,
        getGameTime: () => gameTime,
        randomInt: (bound) => randomInt(bound),
        randomFloat: () => randomFloat(),
        getMinY: () => minY,
        getMaxY: () => maxY
    };

    return world;
};
