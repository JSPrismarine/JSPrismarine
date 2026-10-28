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
import type { FilterEntityView } from '@jsprismarine/entities';
import type { StatusEffectInput } from '../StatusEffect';
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
    /** A live player's full entity-filter view, or undefined when the player has left. */
    playerView?(id: number): FilterEntityView | undefined;
    /** Stable identity of a player runtime id, or undefined when it names no player. */
    playerIdentityOf?(id: number): string | undefined;
    /** Current runtime id of a stable player identity, or undefined while that player is offline. */
    playerIdForIdentity?(identity: string): number | undefined;
    /** Drops an item stack as an entity at a position. */
    drop(at: ContentPosition, item: ContentItemDrop): void;
    /**
     * Raises a block's `onBreak` and puts what it yields on the ground.
     *
     * The write is still the caller's: this is the half of a destruction the runtime cannot
     * do itself. Raising the hook is what spills a chest a creeper blew up, and the drops a
     * family makes while it runs have to be told apart from the loot table's own roll,
     * which needs the world those drops go to. `src/world/blockDestroy.ts` is the one place
     * that knows how.
     *
     * Call it before writing over the block, because a family reads the block entity it is
     * about to lose.
     *
     * Left out by a host with no live world behind it, which makes the caller roll the
     * table itself and leave the hook unraised, the way it did before this existed.
     *
     * @param dropsBlock - Whether the block yields anything of itself, which is the
     *   `doTileDrops` game rule. It still spills what it was holding either way.
     * @returns True when the host took the drops, so the caller owes nothing more for them.
     */
    destroyBlock?(
        at: ContentPosition,
        options: { explosionRadius?: number; dropsBlock?: boolean; sourceId?: number }
    ): boolean;
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
    /** Applies a data-defined melee effect to a live entity or player. */
    applyStatusEffect?(id: number, effect: StatusEffectInput): void;
    /** Applies an effect and reports whether its active state changed. */
    applyStatusEffectIfChanged?(id: number, effect: StatusEffectInput): boolean;
    /** Removes one effect from a live entity or player. */
    removeStatusEffect?(id: number, identifier: string): boolean;
    /** Deals damage to an entity with the projectile and its owner preserved as the source. */
    hurtByProjectile?(id: number, amount: number, projectileId: number, ownerId: number | undefined): void;
    /**
     * Sends the hurt animation and entity-attributed sound for one runtime-applied hit.
     * @param id - The data-driven entity's runtime id.
     */
    hurtFeedback?(id: number): void;
    /** Applies projectile knockback to an entity outside the data-driven index. */
    knockback?(id: number, directionX: number, directionZ: number, strength: number): void;
    /** Whether a named mob event, such as `minecraft:pillager_patrols_event`, is running. */
    mobEventActive(event: string): boolean;
    /**
     * How far a position is from the nearest village border, negative inside
     * it and undefined when no village is near. Left out by a server with no
     * village index, which makes `minecraft:player_in_village_filter` refuse
     * rather than match everywhere.
     */
    villageBorderDistance?(at: ContentPosition): number | undefined;
    /** Whether Java structure spawn data reserves this type at one position. */
    structureSpawnOverrideAt?(identifier: string, at: ContentPosition): boolean | undefined;
}
