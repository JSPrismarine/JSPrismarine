/**
 * The flap game event a flying mob sends, after Java 26.3's `Entity.processFlappingMovement`.
 *
 * Java's `Entity.move` runs `applyMovementEmissionAndPlaySound` after every move of an entity that
 * is no passenger. With air under its feet that calls `processFlappingMovement`, which sends
 * `GameEvent.FLAP` whenever the class's `isFlapping` holds; sculk sensors and wardens hear it. The
 * ender dragon is `noPhysics`, so `EnderDragon.aiStep` calls `processFlappingMovement` itself, and
 * the vex, also `noPhysics` while it ticks, never reaches it. Bedrock writes which types flap as
 * `minecraft:game_event_movement_tracking`'s `emit_flap`; when they flap is each Java class's own
 * `isFlapping`, kept in {@link JAVA_FLAPPING}.
 *
 * @javaSee Entity.move
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { isRecord } from '@jsprismarine/entities';
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';
import { dragonPhaseState, isSittingDragonPhase } from '@jsprismarine/entity-goals/goals/dragonPhases';

import type { DataEntity } from './DataEntity';

/** The Bedrock component whose `emit_flap` lets a type send flap game events. */
const MOVEMENT_TRACKING = 'minecraft:game_event_movement_tracking';

/** The game event a flap sends. */
export const FLAP_EVENT = 'minecraft:flap';

/** `Entity.applyMovementEmissionAndPlaySound` counts this share of each move into `flyDist`. */
const FLY_DISTANCE_SCALE = 0.6;

/** `Entity.getOnPos` reads the block this far under the feet. */
const ON_POS_DEPTH = 0.2;

/**
 * When a Java class's `isFlapping` holds.
 *
 * - `airborne`: `Allay.isFlapping`, off the ground.
 * - `ticks`: every `every` ticks, counted from an offset of `offsetPerId` times the entity's id,
 *   as `Bat.TICKS_PER_FLAP` (10), `Bee.TICKS_PER_FLAP` (`Mth.ceil(180 / 120.32113)`, 2, and only
 *   off the ground) and `Phantom.TICKS_PER_FLAP` (`Mth.ceil(180 / 7.448451)`, 25, offset by
 *   `getUniqueFlapTickOffset`, its id times 3) count them.
 * - `distance`: `Chicken` and `Parrot`, once `flyDist` passes `nextFlap`, which `onFlap` moves on
 *   by half the flap speed.
 * - `wingbeat`: `EnderDragon`, when the cosine of its flap time crosses -0.3 upwards.
 */
type JavaFlapping =
    | { readonly kind: 'airborne' }
    | { readonly kind: 'ticks'; readonly every: number; readonly offsetPerId: number; readonly airborne: boolean }
    | { readonly kind: 'distance' }
    | { readonly kind: 'wingbeat' };

/** The Java rule each Bedrock type that flaps runs by. */
const JAVA_FLAPPING: Readonly<Record<string, JavaFlapping>> = {
    'minecraft:allay': { kind: 'airborne' },
    'minecraft:bat': { kind: 'ticks', every: 10, offsetPerId: 0, airborne: false },
    'minecraft:bee': { kind: 'ticks', every: 2, offsetPerId: 0, airborne: true },
    'minecraft:phantom': { kind: 'ticks', every: 25, offsetPerId: 3, airborne: false },
    'minecraft:chicken': { kind: 'distance' },
    'minecraft:parrot': { kind: 'distance' },
    'minecraft:ender_dragon': { kind: 'wingbeat' }
};

/** `Chicken.nextFlap` and `Parrot.nextFlap` start at 1. */
const FIRST_FLAP_DISTANCE = 1;

/** `Chicken.aiStep` and `Parrot.calculateFlapping` move the flap speed by 4 or -1, times 0.3. */
const FLAP_SPEED_RISE = 4 * 0.3;
const FLAP_SPEED_FALL = -1 * 0.3;

/** `EnderDragon.isFlapping`: the cosine its flap time crosses upwards. */
const WINGBEAT_COSINE = -0.3;

/** `EnderDragon.aiStep` adds 0.1 to a sitting dragon's flap time. */
const SITTING_WINGBEAT = 0.1;

/** What one flapping mob carries between ticks. Java does not save any of it. */
const flappingState = defineComponentState(
    'jsprismarine:flapping',
    {
        ticks: stateField.number,
        flyDist: stateField.number,
        nextFlap: stateField.number,
        flapSpeed: stateField.number,
        flapTime: stateField.number,
        oFlapTime: stateField.number
    },
    { saved: false }
);

/** What the flap rule reads of the world. */
export interface FlappingHost {
    /** Whether the block at a position is air. */
    isAir(at: EntityPosition): boolean;
    /** Whether the entity rides another. */
    isPassenger(entity: DataEntity): boolean;
    emit(entity: DataEntity): void;
}

/** The Java rule a data entity flaps by, or undefined when its type sends no flap. */
const flappingOf = (entity: DataEntity): JavaFlapping | undefined => {
    const params = entity.instance.componentParams(MOVEMENT_TRACKING);
    if (!isRecord(params) || params['emit_flap'] !== true) return undefined;
    return JAVA_FLAPPING[entity.identifier];
};

/**
 * Runs one tick of a flying mob's flapping after its move: the distance it flew, and the flap
 * game event when its Java class flaps.
 * @param from - Where the entity stood before this tick's move.
 */
export const updateFlapping = (entity: DataEntity, from: EntityPosition, host: FlappingHost): void => {
    const rule = flappingOf(entity);
    if (rule === undefined) return;
    const state = entity.instance.componentState.get(flappingState) ?? {
        ticks: 0,
        flyDist: 0,
        nextFlap: FIRST_FLAP_DISTANCE,
        flapSpeed: 0,
        flapTime: 0,
        oFlapTime: 0
    };
    const { position, body } = entity;
    const onGround = body.conditions.has('on_ground');
    const ticks = state.ticks + 1;
    const moved = Math.hypot(position.x - from.x, position.y - from.y, position.z - from.z);
    const flyDist = state.flyDist + moved * FLY_DISTANCE_SCALE;
    let { nextFlap, flapSpeed, flapTime, oFlapTime } = state;

    if (rule.kind === 'wingbeat') {
        // `EnderDragon.aiStep` flaps before it moves its flap time on, from its last tick's speed.
        if (Math.cos(oFlapTime * Math.PI * 2) <= WINGBEAT_COSINE && Math.cos(flapTime * Math.PI * 2) >= WINGBEAT_COSINE)
            host.emit(entity);
        oFlapTime = flapTime;
        const phase = entity.instance.componentState.get(dragonPhaseState)?.phase;
        const velocity = body.velocity;
        const flight = (0.2 / (Math.hypot(velocity.x, velocity.z) * 10 + 1)) * 2 ** velocity.y;
        flapTime += phase !== undefined && isSittingDragonPhase(phase) ? SITTING_WINGBEAT : flight;
    } else if (
        !host.isPassenger(entity) &&
        host.isAir({ x: position.x, y: position.y - ON_POS_DEPTH, z: position.z })
    ) {
        let flaps = false;
        if (rule.kind === 'airborne') flaps = !onGround;
        else if (rule.kind === 'ticks')
            flaps = (!rule.airborne || !onGround) && (entity.id * rule.offsetPerId + ticks) % rule.every === 0;
        else if (flyDist > nextFlap) {
            flaps = true;
            nextFlap = flyDist + flapSpeed / 2;
        }
        if (flaps) host.emit(entity);
    }
    if (rule.kind === 'distance')
        flapSpeed = Math.min(
            1,
            Math.max(0, flapSpeed + (onGround || host.isPassenger(entity) ? FLAP_SPEED_FALL : FLAP_SPEED_RISE))
        );

    entity.instance.componentState.set(flappingState, { ticks, flyDist, nextFlap, flapSpeed, flapTime, oFlapTime });
};
