/**
 * Java's `CollectingNeighborUpdater`, which is what makes a neighbor update an
 * immediate event rather than a scheduled tick.
 *
 * When a block changes, its six neighbors are told in the same call, and a
 * neighbor that changes in response has its own neighbors told before the first
 * block has finished walking its six directions. Java does this without
 * recursion: the first update runs a loop, and every update raised while that
 * loop is running is pushed onto a stack and taken before the outer update
 * continues. This is a transcription of that loop, so the order a chain of
 * torches and dust fires in is Java's.
 */

import type { BlockPosition, Direction } from './world';
import { DIRECTIONS, opposite, relative } from './world';

/**
 * How many chained updates one change may raise before the rest are dropped.
 *
 * Java's `ServerLevel` passes `max-chained-neighbor-updates` from
 * `server.properties`, which defaults to 1000000.
 */
export const MAX_CHAINED_NEIGHBOR_UPDATES = 1_000_000;

/**
 * The order `Block.updateNeighbourShapes` walks, which is Java's
 * `UPDATE_SHAPE_ORDER` and is not `Direction.values()`.
 */
const UPDATE_SHAPE_ORDER = ['west', 'east', 'down', 'up', 'north', 'south'] as const satisfies readonly Direction[];

/** What the updater calls when an update reaches a block. */
export interface NeighborUpdateTarget {
    /** Java's `BlockBehaviour.neighborChanged`: a block next to this one changed. */
    onNeighborChanged(at: BlockPosition, fromBlock: string): void;
    /**
     * Java's `BlockBehaviour.updateShape`: the block across `fromDirection`
     * changed. Only the observer reacts to this, which is the difference
     * between a Java observer and a block update detector.
     */
    onShapeUpdate(at: BlockPosition, fromDirection: Direction): void;
}

/** The update operations a block behavior raises. */
export interface NeighborUpdates {
    /** Tell one block that a neighbor changed. */
    neighborChanged(at: BlockPosition, fromBlock: string): void;
    /** Java's `Level.updateNeighborsAt`: tell all six neighbors of `at`. */
    updateNeighborsAt(at: BlockPosition, fromBlock: string): void;
    /** Java's `Level.updateNeighborsAtExceptFromFacing`: all six but one. */
    updateNeighborsAtExceptFromFacing(at: BlockPosition, fromBlock: string, skip: Direction): void;
    /** Java's `Level.neighborShapeChanged` for all six neighbors of `at`. */
    shapeUpdatesAround(at: BlockPosition): void;
}

interface Job {
    /** Run the next step; false when the job is finished. */
    runNext(): boolean;
}

const singleJob = (run: () => void): Job => {
    let done = false;
    return {
        runNext() {
            if (done) return false;
            done = true;
            run();
            return true;
        }
    };
};

const multiJob = (run: (direction: Direction) => void, skip?: Direction): Job => {
    let index = 0;
    return {
        runNext() {
            while (index < DIRECTIONS.length) {
                const direction = DIRECTIONS[index++]!;
                if (direction === skip) continue;
                run(direction);
                return true;
            }
            return false;
        }
    };
};

/**
 * Build the updater over one target.
 *
 * @param target - What to call when an update reaches a block.
 * @param maxChained - The chain limit, defaulting to Java's 1000000.
 * @returns The update operations block behaviors raise.
 */
export const createNeighborUpdates = (
    target: NeighborUpdateTarget,
    maxChained: number = MAX_CHAINED_NEIGHBOR_UPDATES
): NeighborUpdates => {
    const stack: Job[] = [];
    let addedThisLayer: Job[] = [];
    let count = 0;

    const runUpdates = (): void => {
        try {
            while (stack.length > 0 || addedThisLayer.length > 0) {
                for (let i = addedThisLayer.length - 1; i >= 0; i--) stack.push(addedThisLayer[i]!);
                addedThisLayer = [];

                const next = stack[stack.length - 1]!;
                while (addedThisLayer.length === 0) {
                    if (!next.runNext()) {
                        stack.pop();
                        break;
                    }
                }
            }
        } finally {
            stack.length = 0;
            addedThisLayer = [];
            count = 0;
        }
    };

    const addAndRun = (job: Job): void => {
        const runningAlready = count > 0;
        const tooMany = maxChained >= 0 && count >= maxChained;
        count++;
        if (!tooMany) {
            if (runningAlready) addedThisLayer.push(job);
            else stack.push(job);
        }
        if (!runningAlready) runUpdates();
    };

    return {
        neighborChanged(at, fromBlock) {
            addAndRun(singleJob(() => target.onNeighborChanged(at, fromBlock)));
        },
        updateNeighborsAt(at, fromBlock) {
            addAndRun(multiJob((direction) => target.onNeighborChanged(relative(at, direction), fromBlock)));
        },
        updateNeighborsAtExceptFromFacing(at, fromBlock, skip) {
            addAndRun(multiJob((direction) => target.onNeighborChanged(relative(at, direction), fromBlock), skip));
        },
        shapeUpdatesAround(at) {
            // Java's `updateNeighbourShapes` walks `UPDATE_SHAPE_ORDER` and hands
            // each neighbor the direction back toward the block that changed.
            let index = 0;
            addAndRun({
                runNext() {
                    const direction = UPDATE_SHAPE_ORDER[index++];
                    if (direction === undefined) return false;
                    target.onShapeUpdate(relative(at, direction), opposite(direction));
                    return true;
                }
            });
        }
    };
};
