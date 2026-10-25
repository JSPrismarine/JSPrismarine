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
     * Takes a block out of the world through the server's own destruction path.
     *
     * The runtime cannot do this itself: raising the block's `onBreak` is what spills a
     * chest a creeper blew up, and the drops a family makes while that hook runs have to
     * be told apart from the loot table's own roll, which needs the world the drops go to.
     * `src/world/blockDestroy.ts` is the one place that knows how.
     *
     * Left out by a host with no live world behind it, which makes the caller roll the
     * table itself and leave the hook unraised, the way it did before this existed.
     *
     * @param dropsBlock - Whether the block yields anything of itself, which is the
     *   `doTileDrops` game rule. It still spills what it was holding either way.
     * @returns True when the host took the block out.
     */
    destroyBlock?(at: ContentPosition, options: { explosionRadius?: number; dropsBlock?: boolean }): boolean;
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
    /**
     * Deals damage to something the entity index does not hold.
     *
     * A player is the case that matters: a zombie's `melee_attack` goal names
     * its target by runtime id, and a player's id belongs to the server's own
     * entity list rather than to this index. Left out by a server that cannot
     * route damage, which makes a mob swing and connect with nothing rather
     * than silently pretending it hit.
     *
     * @param id - The runtime id of whatever is being hurt.
     * @param sourceId - The runtime id of the entity answerable for the blow.
     */
    hurt?(id: number, amount: number, cause: string, sourceId: number | undefined): void;
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
