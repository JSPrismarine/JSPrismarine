/**
 * Scheduled ticks that resolve to data-driven block hooks.
 *
 * The world scheduler also serves `@jsprismarine/engine-systems`, which keeps
 * fallback handlers for blocks without a resolved content hook. This table
 * routes each scheduled block tick to its active content state first, so a
 * family can own the block's behavior without a second hardcoded dispatch.
 */
import type { BlockType } from '@jsprismarine/blocks';
import type { BlockPosition } from '@jsprismarine/engine-systems';
import { SCHEDULED_TICK_BLOCKS } from '@jsprismarine/engine-systems';

import type { ServerContent } from '../content/ServerContent';
import type { World } from './World';

/** The data needed to connect resolved block hooks to one world's scheduler. */
export interface ContentBlockTickOptions {
    /** The built content, which owns the block types and their hook tables. */
    readonly content: ServerContent;
    /** The world the ticks land in, read when the handler runs. */
    readonly world: () => World | undefined;
    /** Where a handler that throws is reported, once per block identifier. */
    readonly report: (identifier: string, error: unknown) => void;
}

/** One block's scheduled hook, returning whether content handled the tick. */
type BlockTickHandler = (at: BlockPosition) => boolean;

/**
 * Builds the scheduled block tick handlers for the resolved content.
 *
 * A handler is registered when any state implements `onTick`, unless the
 * engine still owns that block's scheduled behavior. It checks the active
 * state at dispatch time. An outdated tick for a block that has since changed
 * is left for the engine fallback to ignore.
 *
 * @param options - The content, world, and error reporting callback.
 * @returns One handler for each migrated block type with an `onTick` implementation.
 */
export const contentBlockTickHandlers = (
    options: ContentBlockTickOptions
): Readonly<Record<string, BlockTickHandler>> => {
    const { content, world, report } = options;
    const reported = new Set<string>();
    const engineOwned = new Set(SCHEDULED_TICK_BLOCKS);
    const handlers: Record<string, BlockTickHandler> = {};

    const dispatch = (identifier: string, type: BlockType, at: BlockPosition): boolean => {
        const live = world();
        if (!live) return false;

        const stored = live.loadedBlockAt(at.x, at.y, at.z);
        if (stored === undefined || stored.name !== identifier) return false;

        const state = type.state(stored.states);
        const hooks = state.content.hooks;
        if (!hooks.has('onTick')) return false;

        hooks.dispatch('onTick', {
            block: {
                identifier,
                position: at,
                dimension: live.getDimension().name,
                states: state.values
            },
            tick: live.getTicks()
        });
        return true;
    };

    for (const [identifier, type] of content.blocks.types) {
        // Repeaters, comparators, and fire still have engine-owned scheduled
        // behavior. Keep those paths until their family handlers have parity.
        if (engineOwned.has(identifier)) continue;
        if (!type.states.some((state) => state.content.hooks.has('onTick'))) continue;

        handlers[identifier] = (at) => {
            try {
                return dispatch(identifier, type, at);
            } catch (error: unknown) {
                if (!reported.has(identifier)) {
                    reported.add(identifier);
                    report(identifier, error);
                }
                return true;
            }
        };
    }

    return handlers;
};
