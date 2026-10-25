/**
 * The block hook map and the event objects its handlers receive.
 *
 * The names copy Mojang's `BlockCustomComponent` so a future script host can
 * forward a hook straight to a pack's JavaScript without a translation table.
 * The event objects are structural and name only what a handler reads, so the
 * server's own `Player`, `Entity` and `World` classes are assignable to them
 * without this package depending on the server.
 */

/** A block position in world coordinates, with integer components. */
export interface BlockPosition {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** The six faces a placement, interaction or neighbor update can come from. */
export const BLOCK_FACES = ['down', 'up', 'north', 'south', 'west', 'east'] as const;

/** One of {@link BLOCK_FACES}. */
export type BlockFace = (typeof BLOCK_FACES)[number];

/** A block state value as the palette holds it; booleans travel as 0 and 1 on the wire. */
export type BlockStateValue = string | number | boolean;

/**
 * The block a hook fires for: where it is, what it is, and the state values a
 * permutation condition reads.
 */
export interface HookBlock {
    /** The namespaced block identifier, such as `minecraft:oak_stairs`. */
    readonly identifier: string;
    readonly position: BlockPosition;
    /** The dimension the block is in, such as `minecraft:overworld`. */
    readonly dimension: string;
    /** Every state value the block carries, keyed by state name. */
    readonly states: Readonly<Record<string, BlockStateValue>>;
}

/** An entity or player as a block hook sees one. */
export interface HookActor {
    /** The namespaced entity identifier, such as `minecraft:player`. */
    readonly identifier: string;
    readonly position: BlockPosition;
}

/** What every block hook receives: the block the hook fired for. */
export interface BlockEvent {
    readonly block: HookBlock;
}

/** A block was placed. */
export interface BlockPlaceEvent extends BlockEvent {
    /** What the position held before, which a replaceable block overwrote. */
    readonly previous: HookBlock | undefined;
    /** Who placed it, absent for a placement the world itself performed. */
    readonly placedBy: HookActor | undefined;
}

/** A block was broken. */
export interface BlockBreakEvent extends BlockEvent {
    /** The block as it was before breaking, which the drop rules read. */
    readonly brokenBlock: HookBlock;
    /** Who broke it, absent for a break the world itself performed. */
    readonly brokenBy: HookActor | undefined;
}

/** A block next to this one changed. */
export interface BlockNeighborChangedEvent extends BlockEvent {
    /** The face the changed neighbor sits on. */
    readonly face: BlockFace;
    readonly neighbor: HookBlock;
}

/** A scheduled or random tick reached the block. */
export interface BlockTickEvent extends BlockEvent {
    /** The world tick counter when the hook fired. */
    readonly tick: number;
}

/** A player used the block. */
export interface BlockPlayerInteractEvent extends BlockEvent {
    readonly player: HookActor;
    /** The face the player clicked, absent when the interaction has no face. */
    readonly face: BlockFace | undefined;
    /** Where on the face the click landed, each component in [0, 1]. */
    readonly faceLocation: BlockPosition | undefined;
}

/** An entity walked onto the block. */
export interface BlockStepOnEvent extends BlockEvent {
    readonly entity: HookActor;
}

/** An entity landed on the block after falling at least the component's distance. */
export interface BlockEntityFallOnEvent extends BlockEvent {
    readonly entity: HookActor;
    /** How far the entity fell, in blocks. */
    readonly fallDistance: number;
}

/** The redstone power reaching the block changed. */
export interface BlockRedstoneUpdateEvent extends BlockEvent {
    /** The power now reaching the block, 0 to 15. */
    readonly power: number;
}

/** One of the block's own state values changed in place. */
export interface BlockStateChangeEvent extends BlockEvent {
    /** The state that changed. */
    readonly state: string;
    readonly previousValue: BlockStateValue;
    readonly newValue: BlockStateValue;
}

/**
 * The hook map `@jsprismarine/content` dispatches for blocks.
 *
 * A component never implements one of these. Components carry parameters and
 * declare which hooks their parameters can reach; behaviors carry the code.
 * That split is the seam the behavior families are written against.
 */
export interface BlockHooks {
    /** Runs after the block is placed and its state is committed. */
    onPlace: (event: BlockPlaceEvent) => void;
    /** Runs after the block is removed, with the broken block still readable. */
    onBreak: (event: BlockBreakEvent) => void;
    /** Runs when a neighboring position changes, once per changed face. */
    onNeighborChanged: (event: BlockNeighborChangedEvent) => void;
    /** Runs on a random tick, for a block the random tick table includes. */
    onRandomTick: (event: BlockTickEvent) => void;
    /** Runs on the interval `minecraft:tick` declares. */
    onTick: (event: BlockTickEvent) => void;
    /**
     * Runs when a player uses the block.
     *
     * @returns True when the handler consumed the interaction, which stops
     *   later handlers and the default item use; undefined to decline.
     */
    onPlayerInteract: (event: BlockPlayerInteractEvent) => boolean | undefined;
    /** Runs when an entity's feet enter the block's position. */
    onStepOn: (event: BlockStepOnEvent) => void;
    /** Runs when an entity lands on the block, for a block with `minecraft:entity_fall_on`. */
    onEntityFallOn: (event: BlockEntityFallOnEvent) => void;
    /** Runs when the redstone power reaching the block changes. */
    onRedstoneUpdate: (event: BlockRedstoneUpdateEvent) => void;
    /** Runs when one of the block's own state values changes in place. */
    onBlockStateChange: (event: BlockStateChangeEvent) => void;
}

/**
 * Every hook name, in the order the package documents them. The type test
 * beside this declaration fails when {@link BlockHooks} gains a hook the list
 * does not, so the two cannot drift.
 */
export const BLOCK_HOOK_NAMES = [
    'onPlace',
    'onBreak',
    'onNeighborChanged',
    'onRandomTick',
    'onTick',
    'onPlayerInteract',
    'onStepOn',
    'onEntityFallOn',
    'onRedstoneUpdate',
    'onBlockStateChange'
] as const satisfies readonly (keyof BlockHooks)[];

/** One of {@link BLOCK_HOOK_NAMES}. */
export type BlockHookName = (typeof BLOCK_HOOK_NAMES)[number];
