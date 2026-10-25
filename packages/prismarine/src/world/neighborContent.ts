/**
 * Telling a block's neighbors that it changed, for every write rather than for the content's
 * own writes only.
 *
 * `createContentBlockGroup().set` has always raised `onNeighborChanged` around what it
 * wrote, and nothing else did. So a block a blast, a piston, a fluid or a command took out
 * never reached the six families standing around it: the torch on its side stayed hanging,
 * the rail kept its shape and the redstone beside it kept its power. This is the other half,
 * raised from {@link import('./World').World} itself.
 *
 * It runs on the hot path, so the cost is guarded twice. A server with no content build
 * returns here, and `createContentBlockGroup` skips the dispatch for a neighbor whose
 * families declare no `onNeighborChanged` at all, which is most of the palette.
 */
import type { ContentPosition } from '../content/world/adapter';
import type { ServerContent } from '../content/ServerContent';

/** The little of a world the notification reads. */
export interface NeighborWorld {
    /** The dimension, whose adapter holds the blocks the hooks are raised on. */
    getDimension(): { readonly name: string };
    getServer(): {
        getContent(): ServerContent | undefined;
        getLogger(): { error(error: unknown): void };
    };
}

/**
 * Tells the six blocks around a position that it changed.
 *
 * Does nothing on a server with no content build. A behavior that throws is logged rather
 * than allowed to abandon the write that caused it, because the block is already in the
 * world by the time the neighbors hear about it and a half-applied tick is worse than a
 * neighbor that did not react.
 */
export const notifyContentNeighbors = (world: NeighborWorld, at: ContentPosition): void => {
    const server = world.getServer();
    const content = server.getContent();
    if (content === undefined) return;

    try {
        content.world.blockWorld.at(world.getDimension().name).notifyNeighbors(at);
    } catch (error: unknown) {
        server.getLogger().error(error);
    }
};
