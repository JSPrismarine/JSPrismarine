/**
 * What a random tick does once the engine has decided where one lands.
 *
 * `@jsprismarine/engine-systems` draws the positions and filters them by the Java property
 * table's `random_tick` column, then hands each survivor to a handler keyed by block identifier.
 * The handlers are the behavior families in `@jsprismarine/block-behaviors`, reached through the
 * content world adapter: a crop's growth step, ice melting, a sapling becoming a tree, copper
 * weathering. Without them the draws happen and nothing answers, which is why crops stood still.
 *
 * One handler per block the content declares an `onRandomTick` for, rather than one that looks
 * every block up, because the engine's dispatch is a property read on this record.
 */
import type { WorldActions } from '@jsprismarine/block-behaviors';
import type { BlockPosition } from '@jsprismarine/engine-systems';

import type { ServerContent } from '../content/ServerContent';
import type { World } from './World';

/** What {@link contentRandomTickHandlers} needs to reach a live world. */
export interface ContentRandomTickOptions {
    /** The built content, which owns both the hooks and the world they act through. */
    readonly content: ServerContent;
    /**
     * The world the ticks land in, read at call time.
     *
     * A world's handlers are built as part of constructing it, so the world does not exist yet;
     * every handler runs long afterwards, from the world tick.
     */
    readonly world: () => World | undefined;
    /** Where a handler that threw is reported. One line per block identifier, not per tick. */
    readonly report: (identifier: string, error: unknown) => void;
}

/**
 * Builds the random tick handlers for one world from the content registries.
 *
 * A block gets a handler when any of its states implements `onRandomTick`. Which state the
 * position actually holds is read when the tick lands, so a crop that has grown since dispatches
 * through the hooks of the state it is in now.
 * @param {ContentRandomTickOptions} options - The content, the world and where to report a throw.
 * @returns {Readonly<Record<string, (at: BlockPosition) => void>>} One entry per randomly ticking
 * block identifier, in the shape `@jsprismarine/engine-systems` reads.
 */
export const contentRandomTickHandlers = (
    options: ContentRandomTickOptions
): Readonly<Record<string, (at: BlockPosition) => void>> => {
    const { content, world, report } = options;
    const reported = new Set<string>();

    /**
     * The block actions of this world's dimension, resolved once.
     *
     * `blockWorld.at` builds a fresh projection on every call, and a chunk tick asks for one per
     * randomly ticking block it draws - so resolving it per tick allocated the whole seam's worth
     * of closures hundreds of times a second. A world keeps its dimension for its whole life.
     */
    let actions: WorldActions | undefined;

    const dispatch = (identifier: string, at: BlockPosition): void => {
        const live = world();
        if (!live) return;

        actions ??= content.world.blockWorld.at(live.getDimension().name);
        const block = actions.getBlock(at);
        // The engine read the block before choosing this handler, so a mismatch means a behavior
        // reached earlier in the same tick replaced it. The block that is there now is not this
        // one's business.
        if (block === undefined || block.identifier !== identifier) return;

        content.blocks.types
            .get(identifier)
            ?.state(block.states)
            .content.hooks.dispatch('onRandomTick', { block, tick: live.getTicks() });
    };

    const handlers: Record<string, (at: BlockPosition) => void> = {};
    for (const [identifier, type] of content.blocks.types) {
        if (!type.states.some((state) => state.content.hooks.has('onRandomTick'))) continue;

        handlers[identifier] = (at) => {
            try {
                dispatch(identifier, at);
            } catch (error: unknown) {
                // A family that throws would otherwise take the world tick with it, and a tick
                // that dies stops the clock, the weather and every other block in the world.
                if (reported.has(identifier)) return;
                reported.add(identifier);
                report(identifier, error);
            }
        };
    }

    return handlers;
};
