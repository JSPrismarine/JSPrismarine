/**
 * Redstone power-change hooks for resolved block content.
 *
 * The engine reports neighbor updates in the order its signal system computes
 * them. This bridge compares the new power with the previous value, then
 * dispatches the active state's `onRedstoneUpdate` hook when it changed.
 */
import type { BlockRef, BlockPosition } from '@jsprismarine/engine-systems';
import { SCHEDULED_TICK_BLOCKS } from '@jsprismarine/engine-systems';

import type { ServerContent } from '../content/ServerContent';
import type { World } from './World';

/** The content, live world, and error reporter needed by the redstone bridge. */
export interface ContentRedstoneUpdateOptions {
    /** Resolved block types and their hook tables. */
    readonly content: ServerContent;
    /** The world to read at dispatch time. */
    readonly world: () => World | undefined;
    /** Where a failing hook is reported once per block identifier. */
    readonly report: (identifier: string, error: unknown) => void;
}

/** The power-change dispatcher and the cache invalidation the world lifecycle needs. */
export interface ContentRedstoneUpdateHandlers {
    /** Dispatches a changed power reading when the live block has a content hook. */
    dispatch(at: BlockPosition, block: BlockRef, power: number): boolean;
    /** Clears the cached reading after a block at this position changes. */
    forgetPosition(at: BlockPosition): void;
    /** Clears every cached reading in a chunk that unloads. */
    forgetChunk(chunkX: number, chunkZ: number): void;
}

const chunkKey = (at: BlockPosition): string => `${at.x >> 4},${at.z >> 4}`;
const positionKey = (at: BlockPosition): string => `${at.x},${at.y},${at.z}`;

/**
 * Builds the redstone hook dispatcher for one world's resolved content.
 *
 * Power readings are scoped to loaded chunks and discarded when a block
 * changes or its chunk unloads, so a long-running world does not retain every
 * redstone consumer it has ever loaded.
 *
 * @param options - The content, live world, and error reporter.
 * @returns A dispatcher and its world-lifecycle invalidation methods.
 */
export const contentRedstoneUpdateHandlers = (options: ContentRedstoneUpdateOptions): ContentRedstoneUpdateHandlers => {
    const { content, world, report } = options;
    const reported = new Set<string>();
    const powerByChunk = new Map<string, Map<string, number>>();
    const dispatching = new Set<string>();
    const engineOwned = new Set(SCHEDULED_TICK_BLOCKS);

    return {
        dispatch(at, block, power) {
            const live = world();
            if (live === undefined) return false;
            const stored = live.loadedBlockAt(at.x, at.y, at.z);
            if (stored === undefined || stored.name !== block.name) return false;

            const type = content.blocks.types.get(block.name);
            if (type === undefined) return false;
            const state = type.state(stored.states);
            const hooks = state.content.hooks;
            if (!hooks.has('onRedstoneUpdate')) return false;

            const chunk = chunkKey(at);
            const positions = powerByChunk.get(chunk) ?? new Map<string, number>();
            const key = positionKey(at);
            const previous = positions.get(key);
            positions.set(key, power);
            powerByChunk.set(chunk, positions);
            if (previous === power || (previous === undefined && power === 0)) return false;

            dispatching.add(key);
            try {
                hooks.dispatch('onRedstoneUpdate', {
                    block: {
                        identifier: block.name,
                        position: at,
                        dimension: live.getDimension().name,
                        states: state.values
                    },
                    power
                });
            } catch (error: unknown) {
                if (!reported.has(block.name)) {
                    reported.add(block.name);
                    report(block.name, error);
                }
            } finally {
                dispatching.delete(key);
                // A hook may swap the block's identifier, which clears this cache entry. Keep
                // the edge just handled so the paired state does not replay it recursively.
                positions.set(key, power);
            }

            // The data family declares this hook for repeaters and comparators, but
            // their scheduled transition still belongs to the engine until parity lands.
            return !engineOwned.has(block.name);
        },
        forgetPosition(at) {
            const key = positionKey(at);
            if (!dispatching.has(key)) powerByChunk.get(chunkKey(at))?.delete(key);
        },
        forgetChunk(chunkX, chunkZ) {
            powerByChunk.delete(`${chunkX},${chunkZ}`);
        }
    };
};
