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
}
