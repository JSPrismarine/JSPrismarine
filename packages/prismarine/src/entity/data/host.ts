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
import type { EntityPosition, FilterEntityView, FilterItemView } from '@jsprismarine/entities';
import type { VillagerRaidEffect, VillagerRaidState } from '@jsprismarine/entity-brains';
import type { StatusEffectInput } from '../StatusEffect';
import type { DataEntity } from './DataEntity';
import type { DamageIntent } from './damagePipeline';
import type { DamageMitigation } from './damageStages';
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
    /** Tags, auxiliary data, and components the entity pickup rules read. */
    readonly filterView?: FilterItemView;
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
    /** One player in the dimension by runtime id, when the host can index players directly. */
    playerById?(id: number): ContentEntity | undefined;
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
     * Item stacks whose horizontal positions may be inside a pickup radius.
     *
     * The runtime still applies the exact three-dimensional radius and nearest-first ordering.
     * A live host can use its spatial index here; hosts without one retain {@link items}.
     */
    itemsNear?(center: ContentPosition, radius: number): readonly ContentItemEntity[];
    /**
     * Takes items from one item entity, removing it when the whole stack was taken.
     *
     * @param id - The runtime id of the dropped stack.
     * @param count - The maximum number to take, or all items when omitted.
     * @returns What was taken, or undefined when nothing of that id is lying
     *   there, which is what two mobs reaching for the same stack get.
     */
    takeItem?(id: number, count?: number): ContentItemDrop | undefined;
    /**
     * Gives a dropped stack to a player: the inventory, the take animation and the advancement.
     *
     * @param playerId - The runtime id of the player taking it.
     * @param itemId - The runtime id of the dropped stack, which the take animation names.
     * @param item - The stack.
     * @returns How many of the stack's items did not fit. Left out, nothing is ever taken.
     */
    givePlayerItem?(playerId: number, itemId: number, item: ContentItemDrop): number;
    /** Tells clients that a dropped stack now holds `count` items, after a merge or a partial take. */
    itemStackChanged?(itemId: number, count: number): void;
    /**
     * The item a store player holds in its main hand, by identifier, or undefined for an empty
     * hand. Left out by a host that keeps no inventory for store players, such as a test's.
     */
    heldItemOf?(playerId: number): string | undefined;
    /**
     * Finishes a store player's meal: the item in hand runs `onConsume`, which feeds the player
     * and hands back what the meal leaves. Left out, a finished meal does nothing.
     */
    finishMeal?(playerId: number, item: string): void;
    /**
     * Plays a named sound at an exact point, for an entity rather than a block, which
     * `ContentEffectSink.playSound` centers on.
     */
    playSoundAt?(at: ContentPosition, sound: string): void;
    /** Plays a level event at a point, such as the burst of an eye of ender that shatters. */
    levelEvent?(at: ContentPosition, event: number, data: number): void;
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
    hurt?(id: number, amount: number, cause: string, sourceId: number | undefined, deathMessageOverride?: string): void;
    /** Plays the attack sound for a data-driven entity. */
    attackSound?(id: number): void;
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
    /**
     * Asks a player's client to take an impulse, such as a blow's shove. The client owns a
     * player's movement (ADR 0008), so the store logs the impulse and moves nothing, and the
     * client moves the player and reports where it went.
     * @param id - The player's runtime id.
     * @param impulse - The impulse, in blocks per tick.
     */
    playerImpulse?(id: number, impulse: EntityPosition): void;
    /**
     * Announces that an entity's data-defined death hold began, so clients play the long
     * death animation. Only the ender dragon's `minecraft:behavior.dragondeath` starts one.
     * @param id - The data-driven entity's runtime id.
     */
    startDeathAnimation?(id: number): void;
    /** Applies projectile knockback to an entity outside the data-driven index. */
    knockback?(id: number, directionX: number, directionZ: number, strength: number): void;
    /** Hurts an external target, then applies the warden's three-dimensional impulse if it lands. */
    applySonicBoom?(id: number, amount: number, sourceId: number, impulse: ContentPosition): void;
    /** The raid facts at a position, supplied by the world raid owner. */
    villagerRaidStateAt?(at: ContentPosition): VillagerRaidState | undefined;
    /** Performs a world-owned effect requested by a villager raid behavior. */
    villagerRaidEffect?(id: number, effect: VillagerRaidEffect): void;
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
    /** What a data-driven entity wears against one blow: armor points, toughness and protection. */
    damageMitigation?(target: DataEntity, intent: DamageIntent): DamageMitigation | undefined;
    /**
     * Hears every committed blow on a data-driven entity, after its health changed and before a
     * death it caused removes it. The host raises its damage and death events and its advancement
     * triggers from here.
     */
    damageCommitted?(commit: DamageCommit): void;
}

/** One committed blow, as {@link EntityHostFacts.damageCommitted} hears it. */
export interface DamageCommit {
    /** The entity that was hit, still in the store. */
    readonly target: DataEntity;
    /** The intent as the guards left it. */
    readonly intent: DamageIntent;
    /** The blow after the grace period and before armor, which Java's `DamagePredicate` calls dealt. */
    readonly dealt: number;
    /** What came off the health. */
    readonly taken: number;
    /** Whether the blow killed the entity. */
    readonly died: boolean;
}
