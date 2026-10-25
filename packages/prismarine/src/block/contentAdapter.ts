/**
 * The `blocks` group of `ServerWorldAdapter`, as the block and item
 * subsystem owes it.
 *
 * Six of the eleven members of `ContentBlockAccess` belong here: the two that
 * read and write a block, the two that read and write a block entity record,
 * the neighbor notification, and the redstone power reaching a position. The
 * other five - light, chunk loading, the surface column and the two biome
 * reads - belong to the world subsystem, which is why this exports the six as
 * their own type rather than the whole interface.
 *
 * It is a factory rather than a wired-in object because the composition root
 * assembles the four subsystems' groups into one adapter; this module only
 * knows how to build its own.
 */
import { BLOCK_FACES } from '@jsprismarine/blocks';
import type { BlockStateValue, HookBlock } from '@jsprismarine/blocks';
import { MAX_CHAINED_NEIGHBOR_UPDATES, bestNeighborSignal, opposite, relative } from '@jsprismarine/engine-systems';

import type { ContentLookup } from '../content/world/views';
import type { BlockEntityData, ContentBlock, ContentBlockAccess, ContentPosition } from '../content/world/adapter';

/** The six members of `ContentBlockAccess` the block and item subsystem implements. */
export type ContentBlockGroup = Pick<
    ContentBlockAccess,
    'get' | 'set' | 'data' | 'setData' | 'notifyNeighbors' | 'power'
>;

/**
 * Where the blocks of one dimension are kept.
 *
 * Two members, both unconditional: the chunk storage the world subsystem owns
 * already answers both, and keeping the port this narrow is what lets the
 * hook dispatch, the neighbor walk and the power read below be tested against
 * a plain map.
 */
export interface BlockStorageAccess {
    /** The block at a position, or undefined when the chunk holding it is not loaded. */
    at(position: ContentPosition): ContentBlock | undefined;
    /**
     * Writes a block, raising no hook and notifying no neighbor.
     *
     * {@link createContentBlockGroup} layers both of those on top, so a
     * storage that does either as well would do it twice.
     */
    write(position: ContentPosition, block: ContentBlock): void;
}

/** The block entity records of one dimension, which `data` and `setData` read and write. */
export interface BlockEntityStore {
    /** The record at a position, or undefined when the position carries none. */
    at(position: ContentPosition): BlockEntityData | undefined;
    /** Replaces the record at a position whole. */
    put(position: ContentPosition, data: BlockEntityData): void;
}

/** What {@link createContentBlockGroup} is built over. */
export interface ContentBlockGroupOptions {
    readonly storage: BlockStorageAccess;
    readonly blockEntities: BlockEntityStore;
    /**
     * The built content, read at call time.
     *
     * The content is built around this adapter, so it does not exist when the
     * group is constructed. Same reason `contentWorldViews` takes a lookup.
     */
    readonly content: ContentLookup;
    /** The dimension this group covers, which the block hooks carry. */
    readonly dimension?: string;
}

/** The block as a hook reads one, or undefined when the position is unloaded. */
const hookBlockAt = (
    storage: BlockStorageAccess,
    dimension: string,
    position: ContentPosition
): HookBlock | undefined => {
    const block = storage.at(position);
    return block && { identifier: block.identifier, position, dimension, states: block.states };
};

/**
 * The hook table of a block, or undefined when the content has no such state.
 *
 * A block the palette does not carry has no behaviors to run, which is the
 * ordinary case for a pack that declares a block the server's palette predates
 * rather than programmer error, so it returns nothing instead of throwing.
 */
const hooksOf = (content: ContentLookup, identifier: string, states: Readonly<Record<string, BlockStateValue>>) => {
    const type = content().blocks.types.get(identifier);
    if (!type) return undefined;
    return type.state(states).content.hooks;
};

/**
 * Builds the six block adapter members over one dimension's storage.
 *
 * `set` commits the write before it raises `onPlace`, because the hook is
 * documented to run with the new state already readable, and notifies the
 * neighbors afterwards so a behavior that writes its own state during
 * `onPlace` has done so before anything reads it back.
 */
export const createContentBlockGroup = (options: ContentBlockGroupOptions): ContentBlockGroup => {
    const { storage, blockEntities, content } = options;
    const dimension = options.dimension ?? 'minecraft:overworld';

    /**
     * How many nested neighbor notifications are still allowed.
     *
     * A behavior reacting to `onNeighborChanged` may write a block, which
     * notifies its neighbors in turn, and a redstone loop does that forever.
     * Java bounds the same recursion at 1000000 updates; the budget here is
     * `@jsprismarine/engine-systems`'s own constant rather than a second copy
     * of the number.
     */
    let budget = MAX_CHAINED_NEIGHBOR_UPDATES;

    const notifyNeighbors = (at: ContentPosition): void => {
        const changed = hookBlockAt(storage, dimension, at);
        if (!changed) return;
        if (budget <= 0) return;

        budget--;
        try {
            for (const face of BLOCK_FACES) {
                const position = relative(at, face);
                const neighbor = hookBlockAt(storage, dimension, position);
                if (!neighbor) continue;

                hooksOf(content, neighbor.identifier, neighbor.states)?.dispatch('onNeighborChanged', {
                    block: neighbor,
                    // The face the changed block sits on, read from the neighbor's side.
                    face: opposite(face),
                    neighbor: changed
                });
            }
        } finally {
            budget++;
        }
    };

    return {
        get: (at) => storage.at(at),
        set: (at, block, withNeighbors) => {
            const previous = hookBlockAt(storage, dimension, at);
            storage.write(at, block);

            hooksOf(content, block.identifier, block.states)?.dispatch('onPlace', {
                block: { identifier: block.identifier, position: at, dimension, states: block.states },
                previous,
                // A write through the adapter is a placement the world itself
                // performed; the three fields a player's placement carries have
                // no value here and the hook declares all three optional.
                placedBy: undefined,
                itemStack: undefined,
                face: undefined,
                faceLocation: undefined
            });

            if (withNeighbors) notifyNeighbors(at);
        },
        notifyNeighbors,
        data: (at) => blockEntities.at(at),
        setData: (at, data) => blockEntities.put(at, data),
        // Java's `Level.getBestNeighborSignal`. The engine world is projected out
        // of the whole adapter, and none of its members reads `blocks.power`, so
        // reading it back through the content closes no loop.
        power: (at) => bestNeighborSignal(content().world.engineWorld, at)
    };
};
