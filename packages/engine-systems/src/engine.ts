/**
 * The world update queue and random tick driver over one world.
 *
 * Block behavior belongs to the content hooks. This module coordinates the
 * neighbor updates those hooks raise and reports the resulting redstone power
 * to the content bridge.
 */

import type { NeighborUpdates } from './neighborUpdates';
import { MAX_CHAINED_NEIGHBOR_UPDATES, createNeighborUpdates } from './neighborUpdates';
import type { BlockRandomPositions, SectionOrigin } from './randomTick';
import { DEFAULT_RANDOM_TICK_SPEED, runRandomTicks } from './randomTick';
import { bestNeighborSignal } from './signal';
import type { BlockPosition, BlockRef, WorldAccess } from './world';

/** How to build an {@link Engine}. */
export interface EngineOptions {
    /** The neighbor update chain limit, defaulting to Java's 1000000. */
    maxChainedNeighborUpdates?: number;
    /**
     * What to run when neighbor updates may have changed a block's redstone
     * power. The content bridge compares the new value with the previous one
     * before dispatching `onRedstoneUpdate`.
     */
    onRedstoneUpdate?: (at: BlockPosition, block: BlockRef, power: number) => void;
    /**
     * Whether an update at this position can reach a redstone hook. Returning false skips the
     * neighbor power scan; omitted predicates keep the default behavior.
     */
    shouldComputeRedstoneUpdate?: (at: BlockPosition, block: BlockRef) => boolean;
    /**
     * What to run when a random tick lands on a block, keyed by identifier.
     *
     * The engine supplies the draws; the handler owns the block behavior. The
     * block is passed with the position so the handler can reuse this read.
     */
    randomTickHandlers?: Readonly<Record<string, (at: BlockPosition, block: BlockRef) => void>>;
}

/** What a host calls to run the engine. */
export interface Engine {
    /** The update operations, exposed so a host can raise one directly. */
    readonly updates: NeighborUpdates;
    /** Write a block and run its six neighbor updates. */
    setBlockAndUpdate(at: BlockPosition, to: BlockRef): void;
    /** Run neighbor and redstone updates after the host has already written the changed block. */
    updateAround(at: BlockPosition, changedBlockName: string): void;
    /**
     * Run one chunk tick's random ticks.
     *
     * @param positions - The draw source, shared across the world.
     * @param sections - The randomly ticking sections of the chunk.
     * @param tickSpeed - `random_tick_speed`, Java's 3 by default.
     * @returns How many positions were ticked.
     */
    runRandomTicks(positions: BlockRandomPositions, sections: readonly SectionOrigin[], tickSpeed?: number): number;
}

/**
 * Build the engine over one world.
 *
 * @param world - The world the systems read and write.
 * @param options - The game rules and content hooks the host fills in.
 * @example
 * ```typescript
 * const world = createTestWorld();
 * const engine = createEngine(world);
 * engine.setBlockAndUpdate({ x: 0, y: 0, z: 0 }, { name: 'minecraft:stone', states: {} });
 * ```
 */
export const createEngine = (world: WorldAccess, options: EngineOptions = {}): Engine => {
    const randomTickHandlers = options.randomTickHandlers ?? {};

    const reportRedstoneUpdate = (at: BlockPosition): void => {
        if (options.onRedstoneUpdate === undefined) return;
        const block = world.getBlock(at);
        if (options.shouldComputeRedstoneUpdate?.(at, block) === false) return;
        options.onRedstoneUpdate(at, block, bestNeighborSignal(world, at));
    };

    const updates: NeighborUpdates = createNeighborUpdates(
        {
            onNeighborChanged: reportRedstoneUpdate
        },
        options.maxChainedNeighborUpdates ?? MAX_CHAINED_NEIGHBOR_UPDATES
    );

    const updateAround = (at: BlockPosition, changedBlockName: string): void => {
        updates.updateNeighborsAt(at, changedBlockName);
        reportRedstoneUpdate(at);
    };

    const setBlockAndUpdate = (at: BlockPosition, to: BlockRef): void => {
        world.setBlock(at, to, false);
        updateAround(at, to.name);
    };

    return {
        updates,
        setBlockAndUpdate,
        updateAround,
        runRandomTicks(positions, sections, tickSpeed = DEFAULT_RANDOM_TICK_SPEED) {
            return runRandomTicks(
                world,
                positions,
                sections,
                (at, block) => {
                    const handler = randomTickHandlers[block.name];
                    if (handler !== undefined) handler(at, block);
                },
                tickSpeed
            );
        }
    };
};
