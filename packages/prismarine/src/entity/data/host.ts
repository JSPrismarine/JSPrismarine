/**
 * What the data-driven entity runtime reads from the rest of the server.
 *
 * The entity subsystem owns three of the eleven groups of
 * `ServerWorldAdapter`: `entities`, `spawning` and `ai`. It cannot build them
 * out of nothing, because a spawn site is a fact about blocks and a player is
 * not in the entity index, so it takes the groups the other three subsystems
 * own as its input and returns its own three. The assembly step then spreads
 * one over the other.
 *
 * Nothing here is optional with a default. A fact the runtime cannot establish
 * is reported as absent rather than guessed, which is the same rule
 * `src/content/world/notWired.ts` applies at the other seam.
 */
import type {
    ContentBlockAccess,
    ContentEffectSink,
    ContentEntity,
    ContentItemDrop,
    ContentLevelFacts,
    ContentPosition,
    RandomSource
} from '../../content/world/adapter';

/** One item stack lying in the world, as the pickup goals read it. */
export interface ContentItemEntity {
    /** The runtime id, which is what {@link EntityHostFacts.takeItem} takes. */
    readonly id: number;
    readonly position: ContentPosition;
    readonly item: ContentItemDrop;
}

/** The groups the blocks, world and network subsystems own, as the entity runtime reads them. */
export interface EntityWorldFacts {
    readonly level: ContentLevelFacts;
    readonly blocks: ContentBlockAccess;
    readonly effects: ContentEffectSink;
    readonly random: RandomSource;
}

/**
 * The facts about entities that the data-driven index does not hold.
 *
 * Players are the server's, not the runtime's: a `Player` is driven by a
 * network session rather than by a component set, so it never enters the
 * entity index and has to be asked for. Item drops are the item subsystem's
 * for the same reason.
 */
export interface EntityHostFacts {
    /** Every player in the dimension. */
    players(): readonly ContentEntity[];
    /** Drops an item stack as an entity at a position. */
    drop(at: ContentPosition, item: ContentItemDrop): void;
    /**
     * Every item stack lying in the dimension.
     *
     * Left out by a server whose item entities are not indexed, which makes
     * the pickup goals find nothing rather than find a guess.
     */
    items?(): readonly ContentItemEntity[];
    /**
     * Takes one item entity out of the world.
     *
     * @returns What it held, or undefined when nothing of that id is lying
     *   there, which is what two mobs reaching for the same stack get.
     */
    takeItem?(id: number): ContentItemDrop | undefined;
    /** Whether a named mob event, such as `minecraft:pillager_patrols_event`, is running. */
    mobEventActive(event: string): boolean;
    /**
     * How far a position is from the nearest village border, negative inside
     * it and undefined when no village is near. Left out by a server with no
     * village index, which makes `minecraft:player_in_village_filter` refuse
     * rather than match everywhere.
     */
    villageBorderDistance?(at: ContentPosition): number | undefined;
}
