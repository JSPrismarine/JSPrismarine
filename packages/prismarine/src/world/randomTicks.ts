/**
 * What a random tick does once the engine has decided where one lands.
 *
 * `@jsprismarine/engine-systems` draws the positions and filters them by the Java property
 * table's `random_tick` column, then hands each survivor to a handler keyed by block identifier.
 * The handlers are the behavior families in `@jsprismarine/block-behaviors`, reached through the
 * content world adapter: a crop's growth step, ice melting, a sapling becoming a tree, copper
 * weathering. Without them the draws happen and nothing answers, which is why crops stood still.
 *
 * This is the hottest loop the world has - the engine measured around eighty dispatches a tick on
 * a populated world - so everything that can be worked out once per block is. One handler per
 * block the content declares an `onRandomTick` for, with its resolved type already captured,
 * because the engine's dispatch is a property read on this record.
 */
import type { BlockType } from '@jsprismarine/blocks';
import type { BlockPosition, BlockRef } from '@jsprismarine/engine-systems';
import { bedrockBlockStates } from '@jsprismarine/mapping';

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

/** One block's handler, in the shape `@jsprismarine/engine-systems` calls it. */
type RandomTickHandler = (at: BlockPosition, block: BlockRef) => void;

/**
 * Builds the random tick handlers for one world from the content registries.
 *
 * A block gets a handler when any of its states implements `onRandomTick`. Which state the
 * position holds is read from the block the engine passes, so a crop that has grown since
 * dispatches through the hooks of the state it is in now - and nothing reads the chunk twice.
 * @param {ContentRandomTickOptions} options - The content, the world and where to report a throw.
 * @returns {Readonly<Record<string, RandomTickHandler>>} One entry per randomly ticking block
 * identifier, in the shape `@jsprismarine/engine-systems` reads.
 */
export const contentRandomTickHandlers = (
    options: ContentRandomTickOptions
): Readonly<Record<string, RandomTickHandler>> => {
    const { content, world, report } = options;
    const reported = new Set<string>();

    const dispatch = (identifier: string, type: BlockType, at: BlockPosition, block: BlockRef): void => {
        const live = world();
        if (!live) return;

        // The engine reads Java state words, but the content type is resolved against
        // Bedrock's palette model. Convert before resolving the state and dispatching its hook.
        const states = bedrockBlockStates(identifier, block.states);
        type.state(states).content.hooks.dispatch('onRandomTick', {
            block: { identifier, position: at, dimension: live.getDimension().name, states },
            tick: live.getTicks()
        });
    };

    const handlers: Record<string, RandomTickHandler> = {};
    for (const [identifier, type] of content.blocks.types) {
        if (!type.states.some((state) => state.content.hooks.has('onRandomTick'))) continue;

        handlers[identifier] = (at, block) => {
            try {
                dispatch(identifier, type, at, block);
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
