import type { BlockState, Direction, FluidKind } from './BlockState';

/** A block position in world coordinates. */
export interface BlockPos {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** Builds a position. */
export const pos = (x: number, y: number, z: number): BlockPos => ({ x, y, z });

/** Returns `origin` moved by a delta. */
export const offset = (origin: BlockPos, dx: number, dy: number, dz: number): BlockPos => ({
    x: origin.x + dx,
    y: origin.y + dy,
    z: origin.z + dz
});

/** Returns `origin` with a different y. */
export const atY = (origin: BlockPos, y: number): BlockPos => ({ x: origin.x, y, z: origin.z });

/** The canonical text key for a position, which the test world uses to index its store. */
export const posKey = (position: BlockPos): string => `${position.x},${position.y},${position.z}`;

/**
 * The six heightmaps Java Edition keeps, named as the placement JSON spells them.
 *
 * The three `_WG` and `OCEAN_FLOOR`/`WORLD_SURFACE` pairs differ only in when they are computed,
 * so a generator that decorates a chunk once can answer both from the same column scan.
 */
export type HeightmapType =
    | 'WORLD_SURFACE_WG'
    | 'WORLD_SURFACE'
    | 'OCEAN_FLOOR_WG'
    | 'OCEAN_FLOOR'
    | 'MOTION_BLOCKING'
    | 'MOTION_BLOCKING_NO_LEAVES';

/**
 * The facts about a block state that do not depend on where it sits.
 *
 * This is a separate seam from {@link FeatureWorld} because the answers are pure and shared: a
 * server builds one oracle from its block registry and tag tables and reuses it for every chunk,
 * while a world adapter is created per decorated region. A feature reaches it through
 * {@link FeatureWorld.blocks}, so a feature still takes one object.
 */
export interface BlockOracle {
    /** Answers Java's `BlockState.isAir()`. */
    isAir(state: BlockState): boolean;
    /** Answers Java's `BlockState.isSolid()`: the block occupies its whole cell and blocks motion. */
    isSolid(state: BlockState): boolean;
    /** Answers Java's `BlockState.isFaceSturdy(level, pos, direction)` for a full face. */
    isSturdy(state: BlockState, direction: Direction): boolean;
    /** Answers Java's `BlockState.canBeReplaced()`, which decides whether a feature may overwrite it. */
    isReplaceable(state: BlockState): boolean;
    /** Returns the fluid the state holds, counting both source blocks and waterlogging. */
    fluid(state: BlockState): FluidKind;
    /**
     * Answers whether the state is in a block tag.
     *
     * @param tag - The tag identifier with no leading `#`, for example `minecraft:logs`.
     */
    hasTag(state: BlockState, tag: string): boolean;
    /** Answers Java's `BlockState.canSurvive(level, pos)` for the `would_survive` predicate. */
    canSurvive(world: FeatureWorld, position: BlockPos, state: BlockState): boolean;
    /**
     * Answers Java's `isUnobstructed`: whether a block-shaped box at the position collides with
     * no entity. Optional, because decoration has no entity list and no vanilla feature asks.
     * When absent the `unobstructed` predicate passes.
     */
    isUnobstructed?(world: FeatureWorld, position: BlockPos): boolean;
    /**
     * Lists the blocks in a tag. Optional, because only the `random_block` state provider needs
     * to enumerate rather than test, and a server that cannot answer gets Java's empty-set
     * behavior: the provider places nothing.
     */
    tagMembers?(tag: string): readonly string[];
}

/**
 * Everything a feature may do to the world it decorates.
 *
 * This is the package's only outward seam. Features never see a chunk, a section, a palette or a
 * Bedrock identifier: they read and write Java block states through these seven members, so the
 * server's storage, its Java-to-Bedrock mapping and its chunk lifetime stay on the other side.
 * {@link import('./TestFeatureWorld').TestFeatureWorld} is the in-memory adapter the tests use.
 *
 * Writes are expected to succeed or be dropped silently, as Java's `WorldGenLevel.setBlock` does
 * outside the region being generated; a feature treats {@link setBlock} as advisory and reads back
 * when it needs to know.
 */
export interface FeatureWorld {
    /** The lowest y the dimension generates, Java's `getMinY()`. */
    readonly minY: number;
    /** The number of y levels the dimension generates, Java's `getHeight()`. */
    readonly height: number;
    /** The dimension's sea level, which `relative_to_sea_level` anchors resolve against. */
    readonly seaLevel: number;
    /** The static block facts, shared across worlds. */
    readonly blocks: BlockOracle;
    /** Returns the state at a position, or air outside the generated region. */
    getBlock(position: BlockPos): BlockState;
    /** Writes a state. Returns whether the write landed. */
    setBlock(position: BlockPos, state: BlockState): boolean;
    /** Returns the first y above the topmost block matching the heightmap's predicate. */
    getHeight(heightmap: HeightmapType, x: number, z: number): number;
    /** Returns the biome identifier at a position. */
    getBiome(position: BlockPos): string;
}

/** Answers whether `y` is outside the dimension's generated range. */
export const isOutsideBuildHeight = (world: FeatureWorld, y: number): boolean =>
    y < world.minY || y >= world.minY + world.height;

/**
 * Translates the Java block states a feature writes into whatever the target world stores.
 *
 * A server supplies `@jsprismarine/mapping`'s Java-to-Bedrock function here. Nothing in this
 * package knows that two editions exist.
 */
export type BlockStateMapper<Target> = {
    /** Converts a Java state into the target world's state type. */
    toTarget(state: BlockState): Target;
    /** Converts a target state back into Java, so predicates and reads keep working. */
    toJava(state: Target): BlockState;
};

/** A world that stores some other state type, which {@link translatingWorld} adapts. */
export interface TargetWorld<Target> extends Omit<FeatureWorld, 'getBlock' | 'setBlock' | 'blocks'> {
    getBlock(position: BlockPos): Target;
    setBlock(position: BlockPos, state: Target): boolean;
}

/**
 * Wraps a world that stores non-Java states so features can write Java states into it.
 *
 * This is the injection point the plan's section 5 asks for: the mapping table is applied once, at
 * the seam, rather than inside every feature.
 */
export const translatingWorld = <Target>(
    target: TargetWorld<Target>,
    mapper: BlockStateMapper<Target>,
    blocks: BlockOracle
): FeatureWorld => ({
    minY: target.minY,
    height: target.height,
    seaLevel: target.seaLevel,
    blocks,
    getBlock: (position) => mapper.toJava(target.getBlock(position)),
    setBlock: (position, state) => target.setBlock(position, mapper.toTarget(state)),
    getHeight: (heightmap, x, z) => target.getHeight(heightmap, x, z),
    getBiome: (position) => target.getBiome(position)
});
