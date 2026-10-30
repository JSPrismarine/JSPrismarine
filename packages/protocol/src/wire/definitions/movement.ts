/**
 * The packets that say where something is and how fast it is going.
 *
 * Layouts follow each packet's docs page at 1.26.51 and are unchanged since protocol 2193.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { vector3 } from '../structureTypes';

import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';

/** `Teleport Data`: why a teleport happened, carried only when the move is a teleport. */
export interface TeleportData {
    /** `Teleportation Cause`. */
    cause: number;
    /** `Source Actor Type`: the actor type that caused the teleport. */
    sourceActorType: number;
}

const teleportData: WireType<TeleportData> = t.custom(
    'TeleportationData',
    (stream, value) => {
        t.li32.write(stream, value.cause);
        t.li32.write(stream, value.sourceActorType);
    },
    (stream) => ({ cause: t.li32.read(stream), sourceActorType: t.li32.read(stream) })
);

/**
 * An angle as the single byte the movement packets carry it in.
 *
 * The wire unit is a 256th of a turn, so the conversion is lossy in both directions, and the
 * rounding and the mask are load-bearing: angles accumulate freely either side of `[0, 360)`
 * and the raw division would hand `writeByte` a fraction or a number out of range.
 */
export const byteRotation: WireType<number> = t.custom(
    'byte rotation',
    (stream, value) => t.uint8.write(stream, Math.round(value / (360 / 256)) & 0xff),
    (stream) => t.uint8.read(stream) * (360 / 256)
);

/** The `MovePlayerPacket` field list. */
export const movePlayerPacket = definePacket('MovePlayerPacket', {
    /** `Player Runtime ID`. */
    runtimeEntityId: t.varuint64,
    /** `Position`. */
    position: vector3,
    /** `Rotation` pitch. */
    pitch: t.lf32,
    /** `Rotation` yaw. */
    yaw: t.lf32,
    /** `Y-Head Rotation`. */
    headYaw: t.lf32,
    /** `Position Mode`: 0 Normal, 1 Respawn, 2 Teleport, 3 OnlyHeadRot. */
    mode: t.uint8,
    /** `On Ground`. */
    onGround: t.bool,
    /** `Riding Runtime ID`. */
    ridingEntityRuntimeId: t.varuint64,
    /** `Teleport Data`, set only when the mode is Teleport. */
    teleportData: t.optional(teleportData),
    /** `Tick`. */
    tick: t.varuint64
});

/** What `MovePlayerPacket` carries. */
export type MovePlayerPayload = PayloadOf<typeof movePlayerPacket>;

/** The `MoveActorAbsolutePacket` field list, one `MoveActorAbsoluteData`. */
export const moveActorAbsolutePacket = definePacket('MoveActorAbsolutePacket', {
    /** `ActorRuntimeID`. */
    runtimeEntityId: t.varuint64,
    /** `Header`: on ground 0x01, teleport 0x02, force move local 0x04, force completion 0x08. */
    flags: t.uint8,
    /** `Position`. */
    position: vector3,
    /** `Rotation X`, the pitch, in degrees. */
    pitch: byteRotation,
    /** `Rotation Y`, the body yaw, in degrees. */
    yaw: byteRotation,
    /** `Rotation Y Head`, the head yaw, in degrees. */
    headYaw: byteRotation
});

/** What `MoveActorAbsolutePacket` carries. */
export type MoveActorAbsolutePayload = PayloadOf<typeof moveActorAbsolutePacket>;

/** The `SetActorMotionPacket` field list. */
export const setActorMotionPacket = definePacket('SetActorMotionPacket', {
    /** `Target Runtime ID`. */
    runtimeEntityId: t.varuint64,
    /** `Motion`. */
    motion: vector3,
    /** `Tick`, a `PlayerInputTick`. */
    tick: t.varuint64
});

/** What `SetActorMotionPacket` carries. */
export type SetActorMotionPayload = PayloadOf<typeof setActorMotionPacket>;
