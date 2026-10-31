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
    /**
     * The world seed.
     *
     * Only the geode reads it, to build a noise field that is the same everywhere in one world
     * and different between worlds.
     */
    readonly seed: bigint;
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
    /**
     * Answers Java's `Biome.getTemperature(pos) < 0.15`, which is the whole of what decides
     * whether `freeze_top_layer` acts.
     *
     * Optional, because biome climate lives in the biome source rather than here. When absent
     * nothing freezes, which is the right answer for a warm world and a visible one for a cold
     * world rather than a silent miss.
     */
    isColdEnoughToSnow?(position: BlockPos): boolean;
    /**
     * Attaches block entity data to a block this package just wrote.
     *
     * Optional, because only six features need it: the two chests, the spawner, the two end
     * gateway kinds and the end podium. A world that cannot store it loses the contents rather
     * than the block.
     */
    setBlockEntity?(position: BlockPos, data: BlockEntityRequest): void;
    /**
     * Places a structure template, which `template` and `fossil` delegate to.
     *
     * Optional, and the seam to `@jsprismarine/structures`: this package names a template and a
     * processor list and does not read NBT. A world that cannot place one reports failure, which
     * propagates through the pipeline the same way an obstructed placement does.
     */
    placeTemplate?(request: TemplateRequest): boolean;
    /**
     * Spawns an entity a feature builds around, which is only the end spike's crystal.
     *
     * Optional, because entities belong to the server rather than to world generation.
     */
    spawnEntity?(identifier: string, position: BlockPos, options?: EntitySpawnOptions): void;
}

/**
 * What a feature declares about an entity it spawns beyond its type and position.
 *
 * The three crystal fields carry Java's `EndSpikeFeature` configuration and the end crystal's
 * synced data to the server, which projects them onto the spawned entity.
 */
export interface EntitySpawnOptions {
    /** The spawn yaw in degrees. Defaults to 0. */
    readonly yaw?: number;
    /** The block an end crystal's beam points at, Java's `crystal_beam_target`. */
    readonly beamTarget?: BlockPos;
    /** Whether an end crystal renders its bedrock base plate. Java's default is true. */
    readonly showBottom?: boolean;
    /** Whether the entity ignores damage, Java's `crystal_invulnerable`. */
    readonly invulnerable?: boolean;
}

/** What a feature asks a world to record on a block it just placed. */
export interface BlockEntityRequest {
    /** The block entity type, for example `minecraft:chest`. */
    readonly id: string;
    /** The loot table to roll when the block is first opened, when there is one. */
    readonly lootTable?: string;
    /** The entity a spawner produces, when the block is a spawner. */
    readonly spawnEntity?: string;
    /** Where an end gateway sends a traveller, when the block is one. */
    readonly exitPortal?: BlockPos;
    /** Whether an end gateway places its own exit platform. */
    readonly exactTeleport?: boolean;
    /**
     * The whole block entity as a structure template saved it, when a template saved one.
     *
     * Typed as `unknown` because this package does not model NBT and depends on no library that
     * does. The server narrows it before reading it.
     */
    readonly saved?: unknown;
    /** The Java block the block entity sits in, which is where Java keeps a banner's color. */
    readonly javaBlock?: string;
}

/**
 * The processors a feature runs its template through.
 *
 * Java's field is either an identifier naming a `worldgen/processor_list` or the list itself,
 * written where the feature stands. The inline form stays `unknown` here, because this package
 * names a chain and does not read one. The world parses whichever form arrives.
 */
export type TemplateProcessors = string | { readonly processors: readonly unknown[] };

/** What a feature asks a world to stamp out of a structure template. */
export interface TemplateRequest {
    /** The template identifier, for example `minecraft:trail_ruins/tower/tower_top`. */
    readonly template: string;
    /** Where the template's origin corner lands. */
    readonly origin: BlockPos;
    /** The quarter turns to apply, 0 through 3. */
    readonly rotation: number;
    /** The mirror to apply before the rotation. */
    readonly mirror: 'none' | 'left_right' | 'front_back';
    /** The processors to run over the template, when the feature carries any. */
    readonly processors?: TemplateProcessors;
    /** The template's own offset, which `template` carries as `offset`. */
    readonly offset?: BlockPos;
    /** Whether the template's project-to-heightmap mode is set, and to which heightmap. */
    readonly projectToHeightmap?: HeightmapType;
    /** Whether air in the template overwrites the world. */
    readonly overwrite?: boolean;
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
    seed: target.seed,
    blocks,
    getBlock: (position) => mapper.toJava(target.getBlock(position)),
    setBlock: (position, state) => target.setBlock(position, mapper.toTarget(state)),
    getHeight: (heightmap, x, z) => target.getHeight(heightmap, x, z),
    getBiome: (position) => target.getBiome(position)
});
