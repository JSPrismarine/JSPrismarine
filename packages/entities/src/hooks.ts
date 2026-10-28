import type { Filter } from '@jsprismarine/packs';

import type { EntityInstance } from './entityInstance';
import type { EventTarget, VibrationKind } from './events';
import type { FilterBlockView, FilterEntityView } from './filterContext';

/**
 * The hook map `@jsprismarine/content` dispatches for this domain, and the
 * seams a component implementation writes against.
 */

/** How many server ticks there are in one second, which is how component bodies write durations. */
export const TICKS_PER_SECOND = 20;

/** A position in the world, as the navigation seam passes one. */
export interface EntityPosition {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** One request to spread an entity's anger to nearby matching entities. */
export interface EntityAngerBroadcast {
    /** Maximum distance from the broadcaster, in blocks. */
    readonly range: number;
    /** Filters evaluated with the broadcaster as caller and each candidate as `other`. */
    readonly filters?: Filter;
    /** Families that receive the broadcast; omitted means the broadcaster's entity type. */
    readonly targets?: readonly string[];
    /** The entity that caused the broadcast, which candidates may target. */
    readonly target?: FilterEntityView;
}

/** One block break an active `minecraft:block_sensor` can inspect. */
export interface EntityBlockBreakEvent {
    /** The block that was removed. */
    readonly block: FilterBlockView;
    /** The block's integer world position. */
    readonly position: EntityPosition;
    /** The player or entity that caused the break, when the runtime knows it. */
    readonly source?: FilterEntityView;
}

/** One block state as an entity component reads it from the world. */
export interface EntityBlockState {
    /** The namespaced block identifier. */
    readonly identifier: string;
    /** The block's state values. */
    readonly states: Readonly<Record<string, string | number | boolean>>;
}

/** A Bedrock equipment slot watched by `minecraft:on_equipment_changed`. */
export type EntityEquipmentSlot =
    | 'slot.armor.body'
    | 'slot.armor.chest'
    | 'slot.armor.feet'
    | 'slot.armor.head'
    | 'slot.armor.legs'
    | 'slot.weapon.mainhand'
    | 'slot.weapon.offhand';

/**
 * What a goal does to the entity it runs on.
 *
 * This is the navigation and look-control seam. The package ships no
 * implementation: a caller supplies one, and the reference goals prove the
 * scheduler against a recording double in the tests.
 */
export interface EntityActuator {
    /** Where the entity is now. */
    position(): EntityPosition;
    /** Paths toward a position at a multiple of the entity's `minecraft:movement` speed. */
    moveTo(position: EntityPosition, speedMultiplier: number): void;
    /** Abandons the current path. */
    stopMoving(): void;
    /** Points the head at a position. */
    lookAt(position: EntityPosition): void;
    /** Makes the entity jump once. */
    jump(): void;
    /** A reachable position within the box around the entity, or undefined when the navigator finds none. */
    randomTarget(xzDistance: number, yDistance: number): EntityPosition | undefined;
    /** The position of the nearest player within the distance, or undefined when there is none. */
    nearestPlayer(maxDistance: number): EntityPosition | undefined;
}

/**
 * What an event action asks of the world outside this package.
 *
 * Three of the nine actions need nothing here: `set_home_position` and
 * `stop_movement` go through {@link EntityActuator}, and `reset_target` moves
 * state the entity owns. The six below leave the package, and an action whose
 * member a caller leaves out is reported rather than silently dropped.
 */
export interface EntityEffects {
    /** Plays a sound at the entity; the name is the pack's own, such as `saddle`. */
    playSound?(entity: EntityInstance, sound: string): void;
    emitParticle?(entity: EntityInstance, particle: string): void;
    /** Emits a game-event vibration sculk sensors and wardens listen for. */
    emitVibration?(entity: EntityInstance, vibration: VibrationKind): void;
    /**
     * Runs one command with the named subject as its executor.
     *
     * @param target - Whom the command runs as, `self` when the body names none.
     */
    queueCommand?(entity: EntityInstance, command: string, target: EventTarget): void;
    /** Drops what the entity carries in one slot, such as `slot.weapon.mainhand`. */
    dropItem?(entity: EntityInstance, slot: string): void;
    /** Fires a block event on the block at the entity's home position. */
    executeEventOnBlock?(entity: EntityInstance, position: EntityPosition, event: string): void;
}

/** One entity or item a data component asks the world to create. */
export type EntitySpawnRequest =
    | {
          readonly kind: 'entity';
          readonly identifier: string;
          readonly count: number;
          readonly cause: 'born' | 'spawned';
          readonly event?: string;
          readonly shouldLeash: boolean;
          readonly sound?: string;
      }
    | {
          readonly kind: 'item';
          readonly identifier: string;
          readonly count: number;
          readonly itemEvent?: { readonly event: string; readonly target: EventTarget };
          readonly sound?: string;
      };

/** One incoming damage event, as `minecraft:damage_sensor` and the hurt triggers read it. */
export interface DamageEvent {
    /** The damage cause, such as `fall` or `entity_attack`. */
    readonly cause: string;
    /** The damage before any component changes it. */
    readonly amount: number;
    /**
     * Who dealt the damage, which the `damager` and `other` filter subjects
     * read and `minecraft:on_hurt_by_player` tests for the player family.
     */
    readonly damager?: FilterEntityView;
}

/** What a damage hook decides about one damage event. */
export interface DamageOutcome {
    /** The damage to apply; zero means the entity takes none. */
    readonly amount: number;
    /** Events to fire as a result, applied on the entity's next tick. */
    readonly events?: readonly string[];
}

/**
 * The causes `minecraft:fire_immune` turns aside.
 *
 * Bedrock writes the component as an empty marker, so the cause list is the
 * whole of what it means. `magma` is the block's own cause and is listed
 * separately from `fire`, which is why both are here.
 */
export const FIRE_DAMAGE_CAUSES: readonly string[] = [
    'campfire',
    'fire',
    'fire_tick',
    'lava',
    'magma',
    'soul_campfire'
];

/** The causes `minecraft:freezing_immune` turns aside. */
export const FREEZING_DAMAGE_CAUSES: readonly string[] = ['freezing'];

/** What one damage event did to the entity. */
export interface DamageResult {
    /** The damage applied after every component had its say; never negative. */
    readonly amount: number;
    /** The health left, or undefined when the entity declares no `minecraft:health`. */
    readonly health?: number;
    /** Whether the damage took the entity to zero health. */
    readonly died: boolean;
    /** The events the damage queued, in the order they were raised. */
    readonly events: readonly string[];
}

/** A Bedrock loot table whose items a successful interaction adds to the player's inventory. */
export interface EntityAddItemsRequest {
    /** The pack-relative Bedrock loot-table path. */
    readonly table: string;
}

/** Items a successful data-defined interaction asks the host to drop. */
export interface EntitySpawnItemsRequest extends EntityAddItemsRequest {
    /** Vertical offset from the entity's feet, in blocks. */
    readonly yOffset: number;
}

/** Repairs the item in one of the entity's inventory or equipment slots. */
export interface EntityRepairItemRequest {
    /** Durability restored, which must be greater than zero. */
    readonly amount: number;
    /** The entity slot to repair, or undefined when the interaction names none. */
    readonly slot?: string;
}

/** The result of a successful or failed `minecraft:tameable` item attempt. */
export interface EntityTameInteractionEffect {
    /** Whether the component's probability roll tamed the entity. */
    readonly succeeded: boolean;
    /** The event to raise after the host records the new owner. */
    readonly event?: string;
    /** The target named by `tame_event`; omitted events do not need a target. */
    readonly target?: EventTarget;
}

/** Body timers that determine whether an item can start a stateful interaction. */
export interface EntityItemInteractionState {
    /** Ticks remaining in the entity's current love state. */
    readonly loveTicks?: number;
    /** Ticks remaining before the entity may breed again. */
    readonly breedCooldown?: number;
    /** The spawn egg being used, with its resolved offspring type. */
    readonly spawnEgg?: {
        readonly identifier: string;
        readonly offspringIdentifier: string;
    };
}

/** The effects requested by a data-defined item interaction. */
export interface EntityItemInteractionEffect {
    /** Health gained, or lost when negative, when the interaction succeeds. */
    readonly healthAmount?: number;
    /** Loot to add to the player's inventory when the interaction succeeds. */
    readonly addItems?: EntityAddItemsRequest;
    /** Durability removed from the held item when the interaction succeeds. */
    readonly hurtItem?: number;
    /** The item the used stack becomes, when the interaction transforms it. */
    readonly resultItem?: string;
    /** The transformed item's auxiliary value, such as a filled bucket's variant. */
    readonly resultItemData?: number;
    /** Whether the live inventory should consume one item from the held stack. */
    readonly consumeItem?: boolean;
    /** A Bedrock loot table and drop offset to run as part of a successful interaction. */
    readonly spawnItems?: EntitySpawnItemsRequest;
    /** Sounds the world plays when this interaction succeeds. */
    readonly playSounds?: readonly string[];
    /** Game-event vibration the world emits when this interaction succeeds. */
    readonly vibration?: string;
    /** The entity item slot to repair and the amount of durability to restore. */
    readonly repairEntityItem?: EntityRepairItemRequest;
    /** Whether the entity should offer its main-hand item to an empty player hand. */
    readonly takeItem?: boolean;
    /** Whether the entity should enter its love state. */
    readonly breed?: boolean;
    /** The offspring type to spawn when a matching spawn egg is used on this entity. */
    readonly spawnOffspring?: string;
    /** The result of a data-defined taming attempt. */
    readonly tame?: EntityTameInteractionEffect;
    /** Whether the entity should admire the offered item after the interaction. */
    readonly admire?: boolean;
    /** Whether the entity should barter for the offered item after the interaction. */
    readonly barter?: boolean;
    /** Whether the interacting player should swing, which defaults to true. */
    readonly swing?: boolean;
    /** The named particle effect emitted when the interaction starts. */
    readonly particleOnStart?: {
        readonly particleType: string;
        readonly yOffset: number;
        readonly offsetTowardsInteractor: boolean;
    };
    /** The inventory or equipment slot that receives the held item. */
    readonly equipItemSlot?: string;
    /** The entity slot whose item is dropped when this interaction succeeds. */
    readonly dropItemSlot?: string;
    /** Vertical offset for an item dropped from an entity slot. */
    readonly dropItemYOffset?: number;
    /** Whether the entity takes the held item into its main hand. */
    readonly giveItem?: boolean;
}

/**
 * The hooks an entity component may implement.
 *
 * `onInitialize` and `onRemove` are what make component groups a state
 * machine: adding a group initializes its components, re-adding an active
 * group initializes them again, and removing a group removes them whole
 * rather than restoring what they replaced.
 */
export interface EntityHooks {
    /** Runs when the component becomes active, and again each time its group is re-added. */
    onInitialize: (entity: EntityInstance) => void;
    /** Runs when the component stops being active because its group was removed. */
    onRemove: (entity: EntityInstance) => void;
    /** Runs once per server tick while the component is active. */
    onTick: (entity: EntityInstance) => void;
    /** Runs when a nearby entity with the same type broadcasts anger. */
    onFriendlyAnger: (entity: EntityInstance) => void;
    /** Runs when a block breaks near the entity. */
    onBlockBroken: (entity: EntityInstance, event: EntityBlockBreakEvent) => void;
    /** Runs when an item is placed into or removed from a default equipment slot. */
    onEquipmentChanged: (entity: EntityInstance, slot: EntityEquipmentSlot, equipped: boolean) => void;
    /** Runs when the entity attacks another entity. */
    onAttack: (entity: EntityInstance, target: FilterEntityView) => void;
    /** Decides what one damage event does; the first handler that answers wins. */
    onDamage: (entity: EntityInstance, damage: DamageEvent) => DamageOutcome | undefined;
    /** Observes the result after sensors, immunities, and health changes without altering it. */
    onDamageProcessed: (entity: EntityInstance, damage: DamageEvent, result: DamageResult) => void;
    /** Applies one held item; the first handler that answers wins. */
    onInteractWithItem: (
        entity: EntityInstance,
        itemIdentifier: string,
        other?: FilterEntityView,
        state?: EntityItemInteractionState
    ) => boolean | EntityItemInteractionEffect | undefined;
}
