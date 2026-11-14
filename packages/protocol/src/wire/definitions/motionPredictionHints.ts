/**
 * `MotionPredictionHintsPacket`: seeds the client's movement prediction for an actor.
 *
 * Protocol 2193 layout: `mRuntimeId` as an unsigned varint64, `mMotion` as three little-endian
 * floats, then `mOnGround` as a boolean.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/motion-prediction-hints-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { vec3Structure } from '../structureTypes';

import type { PayloadOf } from '../define';

/** The fields that describe one actor's motion and ground state. */
export const motionPredictionHintsPacket = definePacket('MotionPredictionHintsPacket', {
    /** `Runtime ID`: runtime id of the actor whose motion is being described, an unsigned varint64. */
    runtimeId: t.varuint64,
    /** `Motion`: velocity in blocks per tick, as three little-endian floats. */
    motion: vec3Structure,
    /** `On Ground`: whether the actor is currently touching the ground. */
    onGround: t.bool
});

/** Actor movement state used to seed the client's prediction history. */
export type MotionPredictionHintsPayload = PayloadOf<typeof motionPredictionHintsPacket>;
