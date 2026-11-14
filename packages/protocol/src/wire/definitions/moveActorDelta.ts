/**
 * `MoveActorDeltaPacket`: moves a non-player actor, sending only the components that changed.
 *
 * Despite the name the positions and rotations are absolute. Each of the six components is an
 * optional: a presence byte, then the value when present. The runtime id and the tick count are
 * unsigned varuint64s, and the four flags are booleans. The docs type a rotation as int8; it is
 * read here as the same byte unsigned, so the angle comes back in `[0, 360)`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/move-actor-delta-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** Degrees per step of the single byte a rotation is packed into. */
const DEGREES_PER_STEP = 360 / 256;

/**
 * A rotation packed into one byte, 360 / 256 degrees per step.
 *
 * Writing rounds and wraps, because angles accumulate past 360 and below 0 and the byte has to
 * stay in range.
 */
const packedRotation = t.custom<number>(
    'PackedRotation',
    (s, degrees) => s.writeByte(Math.round(degrees / DEGREES_PER_STEP) & 0xff),
    (s) => s.readByte() * DEGREES_PER_STEP
);

/** The fields sent when one non-player actor moves. */
export const moveActorDeltaPacket = definePacket('MoveActorDeltaPacket', {
    /** `Actor Runtime ID`: the actor being moved. */
    runtimeEntityId: t.varuint64,
    /** `New Position X`: left out when X did not change. */
    positionX: t.present(t.lf32),
    /** `New Position Y`: left out when Y did not change. */
    positionY: t.present(t.lf32),
    /** `New Position Z`: left out when Z did not change. */
    positionZ: t.present(t.lf32),
    /** `Rotation X`: the pitch in degrees, left out when it did not change. */
    pitch: t.present(packedRotation),
    /** `Rotation Y`: the body yaw in degrees, left out when it did not change. */
    yaw: t.present(packedRotation),
    /** `Rotation Y Head`: the head yaw in degrees, left out when it did not change. */
    headYaw: t.present(packedRotation),
    /** `Is On Ground`: the actor stands on something rather than falling. */
    isOnGround: t.bool,
    /** `Force Move`: snap the actor to the new position instead of interpolating. */
    forceMove: t.bool,
    /** `Force Move Local Entity`: snap an actor the receiver owns locally. */
    forceMoveLocalEntity: t.bool,
    /** `Force Completion`: finish any movement in progress before applying this one. */
    forceCompletion: t.bool,
    /** `Ticks`: the ticks the client spreads the interpolation over. */
    ticks: t.varuint64
});

/** Payload carried by `MoveActorDeltaPacket`. */
export type MoveActorDeltaPayload = PayloadOf<typeof moveActorDeltaPacket>;
