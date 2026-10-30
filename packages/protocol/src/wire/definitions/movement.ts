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
