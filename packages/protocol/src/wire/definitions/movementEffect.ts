/**
 * `MovementEffectPacket`: gives the client the exact duration of a client-predicted movement
 * effect, for example the glide boost a firework rocket starts.
 *
 * Protocol 2193 layout, in wire order: `Target Runtime ID` as a varuint64, `Effect ID` as a
 * ZigZag varint32 holding a {@link MovementEffectType}, `Effect Duration` as a ZigZag
 * varint32, then `Tick` as a varuint64.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `MovementEffectType` enum behind `Effect ID`, numbered as the docs and gophertunnel list it. */
export enum MovementEffectType {
    /** The boost a firework rocket gives a gliding player. */
    GLIDE_BOOST = 0,
    /** The speed boost from swimming near a dolphin. */
    DOLPHIN_BOOST = 1,
    /** The upward boost from a geyser. */
    GEYSER_BOOST = 2
}

/** The fields of a `MovementEffectPacket`, in wire order. */
export const movementEffectPacket = definePacket('MovementEffectPacket', {
    /** `Target Runtime ID` of the actor the effect applies to. */
    targetRuntimeId: t.varuint64,
    /** `Effect ID`, which effect to apply. */
    effectType: t.enumOf<MovementEffectType>(t.varint32),
    /** `Effect Duration` in ticks. */
    effectDuration: t.varint32,
    /**
     * `Tick`: the most recently processed `PlayerInputTick` from the target player's
     * `PlayerAuthInputPacket`, or from the one controlling a client-predicted vehicle. Zero for
     * other actors.
     */
    tick: t.varuint64
});

/** Payload carried by `MovementEffectPacket`. */
export type MovementEffectPayload = PayloadOf<typeof movementEffectPacket>;
