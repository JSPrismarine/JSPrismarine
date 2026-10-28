/**
 * The `blocks` group of `ServerWorldAdapter`, as the block and item
 * subsystem owes it.
 *
 * Twelve of the eighteen members of `ContentBlockAccess` belong here: reading,
 * writing, moving, and destroying a block; reading and writing block entity
 * records; neighbor notification; redstone power; and entity-event dispatch. The other
 * six - light, sky light, chunk loading, the surface column, and two biome reads - belong
 * to the world subsystem, which is why this exports the twelve as their own
 * type rather than the whole interface.
 *
 * It is a factory rather than a wired-in object because the composition root
 * assembles the four subsystems' groups into one adapter; this module only
 * knows how to build its own.
 */
import { BLOCK_FACES } from '@jsprismarine/blocks';
import type { BlockStateValue, HookBlock } from '@jsprismarine/blocks';
import {
    MAX_CHAINED_NEIGHBOR_UPDATES,
    bestNeighborSignal,
    isRedstoneConductor,
    opposite,
    relative,
    signalAt,
    strongSignalOf
} from '@jsprismarine/engine-systems';

import type { ContentLookup } from '../content/world/views';
import type {
    BlockDestroyOptions,
    BlockEntityData,
    ContentBlock,
    ContentBlockAccess,
    ContentPosition
} from '../content/world/adapter';

/** The twelve members of `ContentBlockAccess` the block and item subsystem implements. */
export type ContentBlockGroup = Pick<
    ContentBlockAccess,
    | 'get'
    | 'set'
    | 'move'
    | 'destroy'
    | 'data'
    | 'setData'
    | 'notifyNeighbors'
    | 'power'
    | 'signal'
    | 'directSignal'
    | 'isRedstoneConductor'
    | 'executeEntityEvent'
>;

/**
 * Where the blocks of one dimension are kept.
 *
 * Chunk storage answers the read and write directly. Movement is optional for
 * adapters that can carry a block entity without running placement hooks.
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
    /** Moves a block and its block entity without raising placement hooks. */
    move?(from: ContentPosition, to: ContentPosition): void;
    /**
     * Raises a block's `onBreak` and puts what Java's table rolls on the ground, leaving
     * the write to the caller; see {@link ContentBlockAccess.destroy}.
     *
     * Optional because only a storage over a live world can do it: the drops a family makes
     * while the hook runs have to be told apart from the table's own roll, which needs the
     * world those drops go to.
     */
    destroy?(position: ContentPosition, options?: BlockDestroyOptions): boolean;
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
    /** Runs the engine systems when a content block announces that it changed. */
    readonly updateEngineAround?: (at: ContentPosition, block: ContentBlock) => void;
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

interface NeighborNotification {
    readonly at: ContentPosition;
    readonly changed: HookBlock;
    engineUpdated: boolean;
    nextFace: number;
}

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
 * Whether any state of a block reacts to a neighbor changing, by identifier.
 *
 * A neighbor notification is six of these questions per block write, and every block write
 * in the world now asks them; see {@link import('../world/neighborContent')}. Answering by
 * identifier costs one map read, where answering properly costs resolving the state out of
 * its permutations and then a dispatch into an empty table. Most of the palette - stone,
 * dirt, every ore, every log - reacts to nothing, so most writes stop here.
 *
 * Per identifier rather than per state, because a permutation that adds the hook to one
 * state of a block is rare and a false positive only costs the dispatch that would have
 * happened anyway. Held weakly against the build, so a reload drops it.
 */
const reactingBlocks = new WeakMap<object, Map<string, boolean>>();

/** Whether a block identifier has a family that declares `onNeighborChanged`. */
const reactsToNeighbors = (content: ContentLookup, identifier: string): boolean => {
    const built = content();
    let known = reactingBlocks.get(built);
    if (known === undefined) {
        known = new Map();
        reactingBlocks.set(built, known);
    }

    const answered = known.get(identifier);
    if (answered !== undefined) return answered;

    const type = built.blocks.types.get(identifier);
    const reacts = type !== undefined && type.states.some((state) => state.content.hooks.has('onNeighborChanged'));
    known.set(identifier, reacts);
    return reacts;
};

/**
 * Builds the eight block adapter members over one dimension's storage.
 *
 * `set` commits the write before it raises `onPlace`, because the hook is
 * documented to run with the new state already readable, and notifies the
 * neighbors afterwards so a behavior that writes its own state during
 * `onPlace` has done so before anything reads it back.
 *
 * A write that leaves the same block standing raises `onBlockStateChange`
 * instead of `onPlace`, once per state value that moved. That is what the two
 * hooks are documented to mean, and it is also what makes the write
 * terminate: a door opens by rewriting its own `open_bit`, so `onPlace` would
 * call the family that is calling it.
 */
export const createContentBlockGroup = (options: ContentBlockGroupOptions): ContentBlockGroup => {
    const { storage, blockEntities, content, updateEngineAround } = options;
    const dimension = options.dimension ?? 'minecraft:overworld';

    /**
     * How many chained neighbor notifications one write may raise.
     *
     * A behavior reacting to `onNeighborChanged` may write a block, which
     * notifies its neighbors in turn. The explicit stack below keeps that
     * depth-first update order without using the JavaScript call stack.
     */
    let chainedUpdates = 0;
    let dispatching = false;
    const stack: NeighborNotification[] = [];
    let queued: NeighborNotification[] = [];

    const notifyNeighbors = (at: ContentPosition): void => {
        const changed = hookBlockAt(storage, dimension, at);
        if (!changed) return;
        if (chainedUpdates >= MAX_CHAINED_NEIGHBOR_UPDATES) return;

        chainedUpdates++;
        queued.push({ at, changed, engineUpdated: false, nextFace: 0 });
        if (dispatching) return;

        dispatching = true;
        try {
            while (stack.length > 0 || queued.length > 0) {
                for (let i = queued.length - 1; i >= 0; i--) stack.push(queued[i]!);
                queued = [];

                const update = stack.at(-1);
                if (!update) continue;

                if (!update.engineUpdated) {
                    update.engineUpdated = true;
                    updateEngineAround?.(update.at, {
                        identifier: update.changed.identifier,
                        states: update.changed.states
                    });
                    continue;
                }

                const face = BLOCK_FACES[update.nextFace];
                if (face === undefined) {
                    stack.pop();
                    continue;
                }
                update.nextFace++;

                const position = relative(update.at, face);
                const neighbor = storage.at(position);
                if (!neighbor || !reactsToNeighbors(content, neighbor.identifier)) continue;

                const reacting: HookBlock = {
                    identifier: neighbor.identifier,
                    position,
                    dimension,
                    states: neighbor.states
                };
                hooksOf(content, neighbor.identifier, neighbor.states)?.dispatch('onNeighborChanged', {
                    block: reacting,
                    // The face the changed block sits on, read from the neighbor's side.
                    face: opposite(face),
                    neighbor: update.changed
                });
            }
        } finally {
            stack.length = 0;
            queued = [];
            chainedUpdates = 0;
            dispatching = false;
        }
    };

    const destroy = storage.destroy;
    const move = storage.move;

    return {
        get: (at) => storage.at(at),
        ...(move === undefined ? {} : { move }),
        // Passed through rather than reimplemented: the hook, the roll and the ground all
        // belong to the world the storage is over. Absent when the storage cannot do it,
        // which is what makes a family fall back to its own drop.
        destroy: destroy && ((at, options) => destroy(at, options)),
        executeEntityEvent: (at, entity, name) => {
            const block = hookBlockAt(storage, dimension, at);
            if (block === undefined) return;
            hooksOf(content, block.identifier, block.states)?.dispatch('onEntity', {
                block,
                entitySource: entity,
                name
            });
        },
        set: (at, block, withNeighbors, placement) => {
            const previous = hookBlockAt(storage, dimension, at);
            storage.write(at, block);

            const placed: HookBlock = { identifier: block.identifier, position: at, dimension, states: block.states };
            const hooks = hooksOf(content, block.identifier, block.states);

            if (previous?.identifier === block.identifier) {
                // The same block in a different state, which is a door opening or a crop
                // growing rather than a block arriving. `onPlace` would be the wrong hook
                // and it would not terminate: every family that writes its own state writes
                // it from inside `onPlace`.
                for (const [state, newValue] of Object.entries(block.states)) {
                    const previousValue = previous.states[state];
                    if (previousValue === newValue || previousValue === undefined) continue;
                    hooks?.dispatch('onBlockStateChange', { block: placed, state, previousValue, newValue });
                }
            } else {
                hooks?.dispatch('onPlace', {
                    block: placed,
                    previous,
                    placedBy: placement?.placedBy,
                    itemStack: placement?.itemStack,
                    face: placement?.face,
                    faceLocation: placement?.faceLocation
                });
            }

            if (withNeighbors) notifyNeighbors(at);
        },
        notifyNeighbors,
        data: (at) => blockEntities.at(at),
        setData: (at, data) => blockEntities.put(at, data),
        // Java's `Level.getBestNeighborSignal`. The engine world is projected out
        // of the whole adapter, and none of its members reads `blocks.power`, so
        // reading it back through the content closes no loop.
        power: (at) => bestNeighborSignal(content().world.engineWorld, at),
        signal: (at, directionToSource) => signalAt(content().world.engineWorld, at, directionToSource),
        directSignal: (at, directionToSource) => strongSignalOf(content().world.engineWorld, at, directionToSource),
        isRedstoneConductor: (at) => isRedstoneConductor(content().world.engineWorld.getBlock(at))
    };
};
