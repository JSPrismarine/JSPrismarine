import type { EntityInstance } from './entityInstance';
import type { EventTarget, VibrationKind } from './events';
import type { FilterEntityView } from './filterContext';

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

/** Items a successful data-defined interaction asks the host to drop. */
export interface EntitySpawnItemsRequest {
    /** The pack-relative Bedrock loot-table path. */
    readonly table: string;
    /** Vertical offset from the entity's feet, in blocks. */
    readonly yOffset: number;
}

/** The effects requested by a successful data-defined interaction. */
export interface EntityItemInteractionEffect {
    /** Health gained, or lost when negative, when the interaction succeeds. */
    readonly healthAmount?: number;
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
    /** Decides what one damage event does; the first handler that answers wins. */
    onDamage: (entity: EntityInstance, damage: DamageEvent) => DamageOutcome | undefined;
    /** Observes the result after sensors, immunities, and health changes without altering it. */
    onDamageProcessed: (entity: EntityInstance, damage: DamageEvent, result: DamageResult) => void;
    /** Applies one held item; the first handler that answers wins. */
    onInteractWithItem: (
        entity: EntityInstance,
        itemIdentifier: string,
        other?: FilterEntityView
    ) => boolean | EntityItemInteractionEffect | undefined;
}
