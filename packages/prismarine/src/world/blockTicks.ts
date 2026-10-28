/**
 * Scheduled ticks that resolve to data-driven block hooks.
 *
 * The world scheduler is shared by block and fluid ticks, while resolved
 * content owns every scheduled block behavior. This table routes each tick to
 * the active block state when it declares `onTick`.
 */
import type { BlockType } from '@jsprismarine/blocks';
import type { BlockPosition } from '@jsprismarine/engine-systems';

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

/** One block's scheduled hook. */
type BlockTickHandler = (at: BlockPosition) => void;

/**
 * Builds the scheduled block tick handlers for the resolved content.
 *
 * A handler is registered when any state implements `onTick`. It checks the
 * active state at dispatch time, so an outdated tick for a block that has
 * since changed is ignored.
 *
 * @param options - The content, world, and error reporting callback.
 * @returns One handler for each migrated block type with an `onTick` implementation.
 */
export const contentBlockTickHandlers = (
    options: ContentBlockTickOptions
): Readonly<Record<string, BlockTickHandler>> => {
    const { content, world, report } = options;
    const reported = new Set<string>();
    const handlers: Record<string, BlockTickHandler> = {};

    const dispatch = (identifier: string, type: BlockType, at: BlockPosition): void => {
        const live = world();
        if (!live) return;

        const stored = live.loadedBlockAt(at.x, at.y, at.z);
        if (stored === undefined || stored.name !== identifier) return;

        const state = type.state(stored.states);
        const hooks = state.content.hooks;
        if (!hooks.has('onTick')) return;

        hooks.dispatch('onTick', {
            block: {
                identifier,
                position: at,
                dimension: live.getDimension().name,
                states: state.values
            },
            tick: live.getTicks()
        });
    };

    for (const [identifier, type] of content.blocks.types) {
        if (!type.states.some((state) => state.content.hooks.has('onTick'))) continue;

        handlers[identifier] = (at) => {
            try {
                return dispatch(identifier, type, at);
            } catch (error: unknown) {
                if (!reported.has(identifier)) {
                    reported.add(identifier);
                    report(identifier, error);
                }
            }
        };
    }

    return handlers;
};
