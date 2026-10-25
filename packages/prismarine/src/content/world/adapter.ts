/**
 * The one world interface the server implements for the content packages.
 *
 * Nine packages each declare their own injected world: `WorldActions` in
 * `@jsprismarine/block-behaviors` and again, differently, in
 * `@jsprismarine/item-behaviors`, `BlockLightView` in `@jsprismarine/lighting`,
 * `WorldAccess` in `@jsprismarine/engine-systems`, `SpawnWorld` in
 * `@jsprismarine/spawning`, `FeatureWorld` in `@jsprismarine/features`,
 * `GoalWorld` and `EntityActuator` for `@jsprismarine/entity-goals`,
 * `BrainWorld` in `@jsprismarine/entity-brains`, and `CommandHost` in
 * `@jsprismarine/commands`. They overlap heavily: all nine want the block at
 * a position, six want the world clock, five want a random draw.
 *
 * So the server implements this one interface and
 * {@link import('./views').contentWorldViews} projects the nine out of it.
 * A subsystem that has not supplied its group yet leaves the group out, and
 * every projected member that needed it throws {@link
 * import('./notWired').NotWiredError} naming the subsystem that owes it.
 */
import type { BlockStateValue } from '@jsprismarine/blocks';
import type { BlockEntityData, BlockProperties } from '@jsprismarine/block-behaviors';
import type { CommandHost } from '@jsprismarine/commands';
import type { Difficulty, TickKind, Weather } from '@jsprismarine/engine-systems';
import type { EntityActuator, EntityInstance } from '@jsprismarine/entities';
import type { FeatureWorld } from '@jsprismarine/features';
import type { BrainWorld } from '@jsprismarine/entity-brains';
import type { GoalWorld } from '@jsprismarine/entity-goals';
import type { RandomSource } from '@jsprismarine/predicates';
import type { SpawnSiteFlag } from '@jsprismarine/spawning';

import type {
    BlockPlacement,
    EffectApplication,
    EnvironmentState,
    HolderSet,
    ItemSource,
    ItemWorldAction,
    SourceState
} from '@jsprismarine/item-behaviors';

export type { BlockEntityData, BlockProperties, Difficulty, RandomSource, TickKind, Weather };

/** An integer block position in world coordinates, within one dimension. */
export interface ContentPosition {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** A block as the content packages read one: what it is, and the state values its rules read. */
export interface ContentBlock {
    /** The namespaced Bedrock block identifier, such as `minecraft:oak_stairs`. */
    readonly identifier: string;
    /** Every state value the block carries, keyed by state name. */
    readonly states: Readonly<Record<string, BlockStateValue>>;
}

/** One entity as the content packages see one. */
export interface ContentEntity {
    /** The runtime id, unique for the length of the session. */
    readonly id: number;
    /** The namespaced entity identifier, such as `minecraft:zombie`. */
    readonly identifier: string;
    readonly position: ContentPosition;
}

/** An item stack leaving a block or an entity. */
export interface ContentItemDrop {
    /** The namespaced Bedrock item identifier. */
    readonly identifier: string;
    readonly count: number;
}

/** Reads and writes the blocks of one dimension. */
export interface ContentBlockAccess {
    /** The block at a position, or undefined when its chunk is not loaded. */
    get(at: ContentPosition): ContentBlock | undefined;
    /**
     * Replaces the block at a position.
     *
     * @param block - The whole block, not a patch; absent states take the block's defaults.
     * @param notifyNeighbors - Whether to run the neighbor updates the write causes. This is
     *   Java's flag 1 in `setBlockAndUpdate` against the bare write a diode uses for its own
     *   state, and both callers exist, so it has no default.
     */
    set(at: ContentPosition, block: ContentBlock, notifyNeighbors: boolean): void;
    /** Tells the six neighbors of a position that it changed. */
    notifyNeighbors(at: ContentPosition): void;
    /** A block entity's stored data, or undefined when the position has none. */
    data(at: ContentPosition): BlockEntityData | undefined;
    /** Replaces a block entity's data whole. */
    setData(at: ContentPosition, data: BlockEntityData): void;
    /** The light level at a position, 0 to 15, as the growth, melt and spawn rules read it. */
    light(at: ContentPosition): number;
    /** The redstone power reaching a position, 0 to 15. */
    power(at: ContentPosition): number;
    /** Whether the chunk holding a position is loaded. */
    isLoaded(at: ContentPosition): boolean;
    /**
     * The lowest y an entity may stand on in one column, which is the position the surface
     * spawn pass tries. Undefined when the column is not loaded.
     */
    surfaceY(x: number, z: number): number | undefined;
    /** The biome identifier at a position, or undefined when the chunk is not loaded. */
    biome(at: ContentPosition): string | undefined;
    /** The biome tags at a position, which is what a spawn rule's `has_biome_tag` compares. */
    biomeTags(at: ContentPosition): readonly string[];
}

/** Spawns, removes and counts the entities of one dimension. */
export interface ContentEntityAccess {
    /** Every entity whose position is inside the block at a position. */
    at(position: ContentPosition): readonly ContentEntity[];
    /** Every entity within a radius of a position, nearest first. */
    near(center: ContentPosition, radius: number): readonly ContentEntity[];
    /** Every player in the dimension. */
    players(): readonly ContentEntity[];
    /**
     * Spawns an entity.
     *
     * @param data - The entity's own stored data, such as the block a falling block carries.
     * @returns The runtime id {@link ContentEntityAccess.remove} takes.
     */
    spawn(identifier: string, at: ContentPosition, data?: BlockEntityData): number;
    /** Removes an entity by its runtime id. */
    remove(id: number): void;
    /** Drops an item stack as an entity at a position. */
    drop(at: ContentPosition, item: ContentItemDrop): void;
    /** How many entities of one type stand within a radius of a position. */
    countOfType(identifier: string, at: ContentPosition, radius: number): number;
}

/** Plays the things a content package emits but never reads back. */
export interface ContentEffectSink {
    /** Plays a sound event, such as `block.door.open`. */
    playSound(at: ContentPosition, sound: string): void;
    /** Emits a particle effect, such as `minecraft:crop_growth_emitter`. */
    spawnParticle(at: ContentPosition, particle: string): void;
    /** Emits a game event, which is what a warden's vibration listener hears. */
    emitGameEvent(event: string, at: ContentPosition, sourceId?: number): void;
}

/** The two scheduled tick lists, block and fluid. */
export interface ContentTickScheduler {
    /**
     * Schedules a tick, ignored when one is already queued for the same position and type.
     *
     * @param delay - Game ticks from now, at least 1.
     * @param priority - Java's `TickPriority`, -3 through 3, defaulting to 0.
     */
    schedule(kind: TickKind, at: ContentPosition, type: string, delay: number, priority?: number): void;
    /** Whether a tick is already queued for this position and type. */
    isScheduled(kind: TickKind, at: ContentPosition, type: string): boolean;
    /** Whether a queued tick is in the batch the current game tick will run. */
    runsThisTick(kind: TickKind, at: ContentPosition, type: string): boolean;
}

/** What one dimension is, and what its clock and weather say. */
export interface ContentLevelFacts {
    /** The namespaced dimension identifier, such as `minecraft:overworld`. */
    readonly dimension: string;
    /** The lowest block y, inclusive. The overworld is -64. */
    readonly minY: number;
    /** One past the highest block y. The overworld is 320, the nether 128. */
    readonly maxY: number;
    /** Whether the dimension has a sky, which the nether and the end do not. */
    readonly hasSkyLight: boolean;
    /** The sea level, which worldgen's `relative_to_sea_level` anchors resolve against. */
    readonly seaLevel: number;
    /** The world seed. */
    readonly seed: bigint;
    /** Ticks since the world was created. */
    gameTime(): number;
    /** Ticks into the current day, 0 to 23999. */
    dayTime(): number;
    difficulty(): Difficulty;
    weather(): Weather;
    /** Whether rain is falling on a position, which needs the host's heightmap. */
    isRainingAt(at: ContentPosition): boolean;
    /** The world spawn point, which a compass points at. */
    spawnPosition(): ContentPosition;
}

/**
 * The item-behavior half of the world, which no other package asks for.
 *
 * Kept apart from the core groups because every member is about an item in a
 * hand rather than about a place in the world, and because
 * `@jsprismarine/item-behaviors` is the one package whose effects arrive as
 * one tagged union instead of as methods.
 */
export interface ContentItemAccess {
    /** Everything a behavior reads about the entity using the item. */
    stateOf(source: ItemSource): SourceState;
    /** Everything a behavior reads about the world around it. */
    environment(): EnvironmentState;
    /** The entity an interaction landed on, or undefined when it landed on a block or nothing. */
    targetOf(source: ItemSource): ItemSource | undefined;
    /** Whether an identifier is in a holder set, resolving `#tag`, single and list forms alike. */
    includes(set: HolderSet, member: string): boolean;
    /**
     * What a `minecraft:block_transformer` turns a block into: the axe's stripping, the
     * shovel's path and the hoe's tilling.
     *
     * @returns The replacement, or undefined when the transformer has no rule for the block.
     */
    transform(transformer: string, block: ContentBlock): BlockPlacement | undefined;
    /**
     * The effects one potion identifier applies. Java keeps this table in code, in `Potions`,
     * so the server answers rather than the item package.
     */
    effectsOf(potion: string): readonly EffectApplication[];
    /** Does one thing to the world. */
    perform(action: ItemWorldAction): void;
}

/** The facts a spawn rule asks for that nothing else does. */
export interface ContentSpawnAccess {
    /** A boolean fact about one position, named by the spawn rule component that reads it. */
    site(flag: SpawnSiteFlag, at: ContentPosition): boolean;
    /** How many entities of one population pool stand in the spawn region now. */
    poolCount(pool: string): number;
    /** Whether a named mob event, such as `minecraft:pillager_patrols_event`, is running. */
    mobEventActive(event: string): boolean;
    /**
     * How far a position is from the nearest village border, negative inside it and undefined
     * when no village is near.
     */
    villageBorderDistance?(at: ContentPosition): number | undefined;
}

/** The per-entity AI seams, which need an entity index the content packages never see. */
export interface ContentAiAccess {
    /** The goal world for one entity, or undefined when the entity runs no goals. */
    goalWorld(entity: EntityInstance): GoalWorld | undefined;
    /** The navigation and look control for one entity. */
    actuator(entity: EntityInstance): EntityActuator;
    /** The level the twenty Java brain mobs read. */
    brainWorld(): BrainWorld;
}

/** What a feature decorating one chunk reads and writes. */
export interface ContentGenerationAccess {
    /**
     * The world a feature decorates, for one chunk.
     *
     * Generation time, not live world: the chunk is still being built, the states are Java
     * states rather than Bedrock ones, and the region is gone once decoration finishes. That
     * is why it is a factory here rather than a member of the live adapter.
     */
    featureWorld(chunkX: number, chunkZ: number): FeatureWorld;
}

/**
 * Everything the content packages do to one dimension.
 *
 * The six required groups are the facts and effects more than one package
 * asks for. The five optional groups each serve exactly one package and are
 * left out until their owning subsystem supplies them; see
 * {@link import('./notWired').CONTENT_AREAS} for who owns which.
 */
export interface ServerWorldAdapter {
    readonly level: ContentLevelFacts;
    readonly blocks: ContentBlockAccess;
    readonly entities: ContentEntityAccess;
    readonly effects: ContentEffectSink;
    readonly ticks: ContentTickScheduler;
    /** Where every chance a content package rolls comes from, so a test can seed it. */
    readonly random: RandomSource;
    /** Owned by the blocks and items subsystem. */
    readonly items?: ContentItemAccess;
    /** Owned by the entities subsystem. */
    readonly spawning?: ContentSpawnAccess;
    /** Owned by the entities subsystem. */
    readonly ai?: ContentAiAccess;
    /** Owned by the world subsystem. */
    readonly generation?: ContentGenerationAccess;
    /**
     * Owned by the command subsystem; see
     * {@link import('../../command/host').serverCommandHost}.
     *
     * The real interface rather than a structural stand-in: this package takes
     * the dependency now that the command layer is wired. Nothing projects the
     * group yet, so no content behavior can run a command - which is the one
     * direction the command layer deliberately does not open until a behavior
     * asks for it.
     */
    readonly commands?: CommandHost;
}

/**
 * The dimensions the content packages can reach.
 *
 * A behavior resolves the dimension of the thing it acts on once per event,
 * so the one portal family that looks at the other side can, without every
 * other family paying for a dimension argument.
 */
export interface ServerWorldSource {
    /** The adapter for one dimension, such as `minecraft:overworld`. */
    at(dimension: string): ServerWorldAdapter;
}

/** Presents one adapter as a {@link ServerWorldSource} with a single dimension. */
export const singleDimension = (adapter: ServerWorldAdapter): ServerWorldSource => ({ at: () => adapter });
