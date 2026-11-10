/**
 * The eye of ender in flight, as an entity of the store, transcribed from Java 26.3's `EyeOfEnder`.
 *
 * Bedrock has no entity file for `minecraft:eye_of_ender_signal`, so the entity overlay's built-in
 * definition supplies its type and its numbers, in `jsprismarine:eye_of_ender_signal`. There is
 * little to it: the eye carries no health and hits nothing. It flies toward a point for eighty
 * ticks and then either drops as the item it was or shatters, and the only random in it is which
 * of the two, rolled once when it is thrown.
 *
 * Where it flies, how long it has flown, whether it survives and the stack it drops are component
 * state, and its speed is the body's logged velocity, so every write is logged and an update that
 * throws is undone. The definition is transient, so the eye is never saved: a restored one would
 * have no thrower and four seconds of flight are not worth a record.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { isRecord } from '@jsprismarine/entities';
import type { ComponentStateRecord } from '@jsprismarine/entities/componentState';
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';
import { LevelEvent } from '@jsprismarine/minecraft';

import type { StoredItemStack } from '../../inventory/persistence';
import { isStoredItemStack } from '../../inventory/persistence';
import type { DataEntity } from './DataEntity';
import { isStackState, stackRecord } from './droppedItems';
import type { SpawnOptions } from './scene';

/** The type of every eye of ender in flight. */
export const EYE_OF_ENDER_SIGNAL = 'minecraft:eye_of_ender_signal';

/** The host component that makes a data entity an eye of ender in flight, and holds its tuning. */
export const EYE_OF_ENDER_SIGNAL_COMPONENT = 'jsprismarine:eye_of_ender_signal';

/**
 * The sound of the eye breaking. Java has its own `entity.ender_eye.death`; Bedrock does not, and
 * an actor `DEATH` sound for an entity its sound tables never mention falls back to the player's
 * hurt sound, so the break is named outright, as vanilla Bedrock spells it.
 */
const BREAK_SOUND = 'block.itemframe.break';

/** A point in the world as component state holds it. */
const isPoint = (value: unknown): value is ComponentStateRecord =>
    isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number' && typeof value.z === 'number';

/** One eye's state: where it flies, ticks flown, whether it drops at the end, and what it drops. */
export const eyeState = defineComponentState(EYE_OF_ENDER_SIGNAL_COMPONENT, {
    target: isPoint,
    life: stateField.number,
    survives: stateField.boolean,
    stack: isStackState
});

/** One eye's state, read back. */
export interface EyeView {
    readonly target: EntityPosition;
    readonly life: number;
    readonly survives: boolean;
    readonly stack: StoredItemStack;
}

/** The numbers of `jsprismarine:eye_of_ender_signal`. */
export interface EyeTuning {
    /**
     * Past this many horizontal blocks the eye flies toward a point this far along the way and
     * {@link EyeTuning.tooFarSignalHeight} up, rather than toward the stronghold itself. The eye
     * points the way, it does not travel it.
     */
    readonly tooFarDistance: number;
    /** How far above its throw point a far-flying eye settles. */
    readonly tooFarSignalHeight: number;
    /** Ticks of flight before the eye drops or shatters; Java discards it once `life` passes 80. */
    readonly lifetime: number;
    /** How much of the way from the current speed to the remaining distance one tick closes. */
    readonly speedLerp: number;
    /** Within a block of the target, the speed and the climb are both scaled by this each tick. */
    readonly nearTargetDamping: number;
    /** How much of the way from the current climb to a block a tick one tick closes. */
    readonly verticalLerp: number;
    /** Java rolls `random.nextInt(5) > 0` to survive, so one throw in five shatters. */
    readonly shatterRolls: number;
}

const TUNING_FIELDS = {
    tooFarDistance: 'too_far_distance',
    tooFarSignalHeight: 'too_far_signal_height',
    lifetime: 'lifetime',
    speedLerp: 'speed_lerp',
    nearTargetDamping: 'near_target_damping',
    verticalLerp: 'vertical_lerp',
    shatterRolls: 'shatter_rolls'
} as const satisfies Record<keyof EyeTuning, string>;

const tunings = new WeakMap<object, EyeTuning>();

/**
 * The tuning an eye's definition declares.
 * @throws {TypeError} When the component leaves a number out, which fails the update that asked.
 */
export const eyeTuningOf = (entity: DataEntity): EyeTuning => {
    const params = entity.instance.componentParams(EYE_OF_ENDER_SIGNAL_COMPONENT);
    if (!isRecord(params))
        throw new TypeError(`${entity.identifier} has no ${EYE_OF_ENDER_SIGNAL_COMPONENT} component`);
    const cached = tunings.get(params);
    if (cached !== undefined) return cached;

    const number = (key: string): number => {
        const value = params[key];
        if (typeof value !== 'number')
            throw new TypeError(`${EYE_OF_ENDER_SIGNAL_COMPONENT} needs a number for ${key}`);
        return value;
    };
    const read: EyeTuning = {
        tooFarDistance: number(TUNING_FIELDS.tooFarDistance),
        tooFarSignalHeight: number(TUNING_FIELDS.tooFarSignalHeight),
        lifetime: number(TUNING_FIELDS.lifetime),
        speedLerp: number(TUNING_FIELDS.speedLerp),
        nearTargetDamping: number(TUNING_FIELDS.nearTargetDamping),
        verticalLerp: number(TUNING_FIELDS.verticalLerp),
        shatterRolls: number(TUNING_FIELDS.shatterRolls)
    };
    tunings.set(params, read);
    return read;
};

/** Whether a data entity is an eye of ender this system runs. */
export const isEyeOfEnderSignal = (entity: DataEntity): boolean =>
    entity.instance.hasComponent(EYE_OF_ENDER_SIGNAL_COMPONENT);

/** An eye's state, or undefined when the entity holds none. */
export const eyeViewOf = (entity: DataEntity): EyeView | undefined => {
    const state = entity.instance.componentState.get(eyeState);
    if (state === undefined || !isStoredItemStack(state.stack) || !isPoint(state.target)) return undefined;
    const { x, y, z } = state.target;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return undefined;
    return { target: { x, y, z }, life: state.life, survives: state.survives, stack: state.stack };
};

/** Writes an eye's state through the one logged write. */
const writeView = (entity: DataEntity, view: EyeView): void => {
    const { target } = view;
    entity.instance.componentState.set(eyeState, {
        target: { x: target.x, y: target.y, z: target.z },
        life: view.life,
        survives: view.survives,
        stack: stackRecord(view.stack)
    });
};

/**
 * Java's `signalTo`: beyond {@link EyeTuning.tooFarDistance} horizontal blocks the eye aims at a
 * point that far along the way and {@link EyeTuning.tooFarSignalHeight} up, so a player sees a
 * direction. Within it the eye aims at the point itself, whose y is the stronghold's, and sinks
 * toward it.
 */
const signalTarget = (from: EntityPosition, target: EntityPosition, tuning: EyeTuning): EntityPosition => {
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= tuning.tooFarDistance) return target;
    return {
        x: from.x + (dx / distance) * tuning.tooFarDistance,
        y: from.y + tuning.tooFarSignalHeight,
        z: from.z + (dz / distance) * tuning.tooFarDistance
    };
};

/**
 * Java's `EyeOfEnder.updateDeltaMovement`: the next velocity, from the one the eye has, where the
 * tick is carrying it, and where it is going.
 *
 * Horizontally the speed eases toward the distance left, so the eye starts slowly, covers the
 * ground, and brakes at the point. Vertically the climb eases toward one block a tick upward while
 * the eye is below the point and downward once it is above, which is what makes it hover there
 * rather than sail past.
 */
const nextMotion = (
    motion: EntityPosition,
    next: EntityPosition,
    target: EntityPosition,
    tuning: EyeTuning
): EntityPosition => {
    const toX = target.x - next.x;
    const toZ = target.z - next.z;
    const distance = Math.hypot(toX, toZ);
    const horizontal = Math.hypot(motion.x, motion.z);

    let speed = horizontal + tuning.speedLerp * (distance - horizontal);
    let climb = motion.y;
    if (distance < 1) {
        speed *= tuning.nearTargetDamping;
        climb *= tuning.nearTargetDamping;
    }

    const wasBelow = next.y - motion.y < target.y;
    const up = wasBelow ? 1 : -1;
    const scale = distance === 0 ? 0 : speed / distance;

    return { x: toX * scale, y: climb + (up - climb) * tuning.verticalLerp, z: toZ * scale };
};

/** What {@link EyeOfEnderSignals} needs from the runtime and the server behind it. */
export interface EyeOfEnderSignalsHost {
    /** Creates one entity of the store, as `EntityRuntime.spawn` does. */
    spawn(identifier: string, at: EntityPosition, options: SpawnOptions): DataEntity | undefined;
    /** Takes an entity out of the store. */
    remove(id: number, reason: string): void;
    /** A number in [0, 1), rolled once per throw for the shatter. */
    random(): number;
    /** Plays a named sound at an exact point. */
    playSoundAt(at: EntityPosition, sound: string): void;
    /** Plays a level event at a point, such as the burst of an eye that shatters. */
    levelEvent(at: EntityPosition, event: number, data: number): void;
    /** Puts a stack on the ground where it lies. */
    drop(at: EntityPosition, stack: StoredItemStack): void;
}

/** The eyes of ender of one runtime, and the system that flies each of them once a tick. */
export class EyeOfEnderSignals {
    public constructor(private readonly host: EyeOfEnderSignalsHost) {}

    /**
     * Throws an eye from a point toward a stronghold, with the shatter rolled now, as Java rolls it.
     * @param from - Where the eye starts, in the middle of the thrower's body.
     * @param target - Where the stronghold starts, in blocks.
     * @param stack - The stack that drops when the eye survives, which is the eye thrown.
     * @returns The eye, or undefined when the content declares no eye of ender.
     */
    public launch(from: EntityPosition, target: EntityPosition, stack: StoredItemStack): DataEntity | undefined {
        const entity = this.host.spawn(EYE_OF_ENDER_SIGNAL, from, {
            prepare: (prepared) => {
                if (!isEyeOfEnderSignal(prepared)) return;
                const tuning = eyeTuningOf(prepared);
                writeView(prepared, {
                    target: signalTarget(from, target, tuning),
                    life: 0,
                    survives: Math.floor(this.host.random() * tuning.shatterRolls) > 0,
                    stack
                });
            }
        });
        // A pack's own eye of ender without the host component has nowhere to fly.
        if (entity !== undefined && !isEyeOfEnderSignal(entity)) {
            this.host.remove(entity.id, 'invalid_spawn_data');
            return undefined;
        }
        return entity;
    }

    /** Whether an entity is either no eye or one with a flight, so it may enter the world. */
    public isValid(entity: DataEntity): boolean {
        return !isEyeOfEnderSignal(entity) || eyeViewOf(entity) !== undefined;
    }

    /**
     * One tick of flight, Java's `EyeOfEnder.tick` in its order: the move by the velocity the eye
     * had, the next velocity from where it now is, and once `life` passes the lifetime the break
     * sound, the discard, and the drop or the burst.
     */
    public update(entity: DataEntity): void {
        const view = eyeViewOf(entity);
        if (view === undefined) {
            this.host.remove(entity.id, 'invalid_spawn_data');
            return;
        }
        const tuning = eyeTuningOf(entity);

        const here = entity.position;
        const motion = entity.body.velocity;
        const next = { x: here.x + motion.x, y: here.y + motion.y, z: here.z + motion.z };
        entity.body.velocity = nextMotion(motion, next, view.target, tuning);
        entity.position = next;

        const life = view.life + 1;
        writeView(entity, { ...view, life });
        if (life <= tuning.lifetime) return;

        this.host.playSoundAt(next, BREAK_SOUND);
        this.host.remove(entity.id, 'discarded');
        if (view.survives) this.host.drop(next, view.stack);
        else this.host.levelEvent(next, LevelEvent.PARTICLES_EYE_OF_ENDER_DEATH, 0);
    }
}
