import type {
    EntityInstance,
    EntityPosition,
    FilterEntityView,
    FilterItemView,
    ShareablesParams
} from '@jsprismarine/entities';

import type { NavigationView } from './navigation/view';

/**
 * What a goal needs from the world beyond `EntityActuator`.
 *
 * `EntityActuator` in `@jsprismarine/entities` covers position, movement and
 * look control. The 170 vanilla goals also attack, search for blocks, pick up
 * items, mount, trade, breed and teleport, and nothing in the entity runtime
 * reaches any of that. This is the second seam the server implements.
 *
 * Every member is optional, which follows the convention `FilterEntityView`
 * sets: a goal whose world cannot answer a member it needs refuses to start
 * rather than throwing, so a server brings the seam up a member at a time and
 * the goals that already work keep working.
 */

/** One other entity a goal can see, compare a filter against, or act on. */
export interface GoalMob {
    /** A stable identity, so a goal can tell two candidates apart between ticks. */
    readonly id: string | number;
    /** Where it is now. */
    position(): EntityPosition;
    /** Where its eyes are, when the world can provide that detail. */
    lookPosition?(): EntityPosition;
    /** Its filter view, which is what an `entity_types` filter evaluates against as `other`. */
    view(): FilterEntityView;
    /** Its entity type, such as `minecraft:villager_v2`. */
    identifier?(): string | undefined;
    /** What it holds in its main hand, for tempt, beg, barter and the item goals. */
    heldItem?(): string | undefined;
    /** Its inventory, when the world can read it, for data-driven item sharing. */
    inventory?(): readonly string[];
    /** Its active item-sharing rules, when it has `minecraft:shareables`. */
    shareables?(): ShareablesParams | undefined;
    /** Its current health, for the attack goals that stop at a threshold. */
    health?(): number | undefined;
    /** What it is attacking, which is what the owner-revenge goals read. */
    target?(): GoalMob | undefined;
    /** Who last damaged it, which is what `owner_hurt_by_target` reads. */
    lastDamager?(): GoalMob | undefined;
}

/** One item stack lying in the world, as the pickup goals read it. */
export interface GoalItem {
    readonly id: string | number;
    position(): EntityPosition;
    /** The item identifier, such as `minecraft:wheat`. */
    identifier(): string;
    /** How many items the stack holds. */
    count(): number;
    /** Item tags, auxiliary data, and components for shareable item rules. */
    readonly filterView?: FilterItemView;
}

/** Item behavior selected from `minecraft:shareables` during pickup. */
export interface GoalPickupOptions {
    /** Whether a piglin should admire the item after taking it. */
    readonly admire: boolean;
    /** Whether a piglin should barter for the item after taking it. */
    readonly barter: boolean;
    /** Whether the item should become the carried item for `eat_carried_item`. */
    readonly consumeItem: boolean;
}

/** One block a block search found. */
export interface GoalBlock {
    readonly position: EntityPosition;
    /** The block identifier, such as `minecraft:farmland`. */
    readonly identifier: string;
}

/** What a goal searches the world for, as the block-seeking goals describe it. */
export interface BlockQuery {
    /** Identifiers to match; an empty or absent list matches every block. */
    readonly identifiers?: readonly string[];
    /** How far to look horizontally, in blocks. */
    readonly range: number;
    /** How far to look vertically, in blocks. */
    readonly height: number;
}

/** What one entity did to this one, as the hurt and revenge goals read it. */
export interface GoalDamage {
    /** Who dealt it, or undefined when the source was not an entity. */
    readonly mob: GoalMob | undefined;
    /** The damage cause, such as `entity_attack`. */
    readonly cause: string;
    /** How much damage this source has dealt in total. */
    readonly total: number;
}

/**
 * The world seam the goals act through.
 *
 * A server supplies one of these per entity through
 * {@link VanillaGoalOptions.world}.
 */
export interface GoalWorld {
    /** The blocks around the entity, which is what the path finder reads. */
    navigation?(): NavigationView | undefined;
    /**
     * Every matching entity within the radius, nearest first.
     *
     * When supplied, `families` is a candidate hint: return entities in any
     * listed family, and include every entity that could match those families.
     */
    mobs?(radius: number, families?: readonly string[]): readonly GoalMob[];
    /** Every player within the radius, nearest first. */
    players?(radius: number): readonly GoalMob[];
    /** Every item stack lying within the radius, nearest first. */
    items?(radius: number): readonly GoalItem[];
    /** Every block matching the query, nearest first. */
    blocks?(query: BlockQuery): readonly GoalBlock[];
    /** Whether the entity has line of sight to the mob, for `must_see`. */
    canSee?(mob: GoalMob): boolean;
    /** Whether Java's combat target rules allow this mob to be selected or retained. */
    isAttackable?(mob: GoalMob): boolean;
    /** The entity's current attack target. */
    target?(): GoalMob | undefined;
    /** Sets or clears the attack target, which is what the targeting goals exist to do. */
    setTarget?(mob: GoalMob | undefined): void;
    /** Who has damaged the entity, oldest first, with the running total each has dealt. */
    damagers?(): readonly GoalDamage[];
    /** Who last pushed the entity, for `minecraft:behavior.target_when_pushed`. */
    lastPusher?(): GoalMob | undefined;
    /** The entity's owner, for the tamed-pet goals. */
    owner?(): GoalMob | undefined;
    /** The entity the entity rides. */
    vehicle?(): GoalMob | undefined;
    /** Who rides the entity. */
    riders?(): readonly GoalMob[];
    /** The entity's home position, from `minecraft:home` or a `set_home_position` event. */
    home?(): EntityPosition | undefined;
    /** Records a home position. */
    setHome?(position: EntityPosition | undefined): void;
    /**
     * The nearest point of interest of a type, such as `village`, `bed`,
     * `work`, `bell` or the `poi_type` a goal names.
     */
    poi?(type: string, radius: number): EntityPosition | undefined;
    /** Deals the entity's melee damage to the mob. */
    attack?(mob: GoalMob): void;
    /** Fires the entity's projectile at the mob. */
    shoot?(mob: GoalMob, projectile: string | undefined): void;
    /** Knocks the mob away from the entity. */
    knockback?(mob: GoalMob, horizontal: number, vertical: number): void;
    /** Adds to the entity's own velocity, for the leap, charge and ram goals. */
    push?(velocity: EntityPosition): void;
    /** Moves the entity at once, for the teleport goals. */
    teleportTo?(position: EntityPosition): void;
    /** Removes the entity, for the timed end of the dragon death animation. */
    removeSelf?(): void;
    /** Puts the entity on the mob as a rider. */
    mount?(mob: GoalMob): void;
    /** Takes the entity off whatever it rides. */
    dismount?(): void;
    /** Takes up to `count` items from the stack into the entity's inventory or hand. */
    pickUp?(item: GoalItem, count?: number, options?: GoalPickupOptions): void;
    /** Drops an item at a position, or at the entity when none is given. */
    dropItem?(identifier: string, position: EntityPosition | undefined): void;
    /** Hands items to another entity, for the sharing and gift goals. */
    giveItem?(mob: GoalMob, identifier: string, count?: number): void;
    /** What the entity holds in its main hand. */
    carriedItem?(): string | undefined;
    /** Puts an item in the entity's main hand, or empties it. */
    setCarriedItem?(identifier: string | undefined): void;
    /** The entity's inventory contents, for the item and trade goals. */
    inventory?(): readonly string[];
    /** Replaces a block, for the place, plant, compost and egg goals. */
    setBlock?(position: EntityPosition, identifier: string): void;
    /** Breaks a block, for the eat, harvest and dig goals. */
    breakBlock?(position: EntityPosition): void;
    /** Creates another entity, for the summon and lay goals. */
    spawn?(identifier: string, position: EntityPosition, event: string | undefined): void;
    /** Plays one of the entity's sound events. */
    playSound?(name: string): void;
    /** Opens the trade screen with a player. */
    openTrade?(player: GoalMob): void;
    /** Whether a player is trading with the entity now. */
    tradingPlayer?(): GoalMob | undefined;
    /** Sets the sitting flag, which the sit goals hold while they run. */
    setSitting?(sitting: boolean): void;
    /** Sets the sleeping flag, which the sleep and nap goals hold while they run. */
    setSleeping?(sleeping: boolean): void;
    /** Rolls a loot table at a position, for the goals that drop a table's contents. */
    dropLoot?(table: string, position: EntityPosition): void;
    /** Detonates the entity, for `minecraft:behavior.swell`. */
    explode?(): void;
    /** Fires an entity event on another entity, which `trigger` with a target does. */
    trigger?(event: string, target: string): void;
    /** Whether the entity can breed with the mob now. */
    canBreedWith?(mob: GoalMob): boolean;
    /** Whether this entity's active breeding data lets it look for a mate now. */
    isReadyToBreed?(): boolean;
    /** Produces the offspring of a successful breeding. */
    breedWith?(mob: GoalMob): void;
    /** Records what the goal met and could not carry out. */
    report?(message: string): void;
}

/** A world that answers nothing, which is what a goal gets when the server supplies none. */
export const emptyGoalWorld: GoalWorld = {};

/** Resolves the world seam for one entity. */
export type GoalWorldSource = (entity: EntityInstance) => GoalWorld | undefined;
