import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import Vec3 from '../structure/Vec3';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** Actor movement state used to seed the client's prediction history. */
export interface MotionPredictionHints {
    /** Runtime id of the actor whose motion is being described. */
    runtimeId: bigint;
    /** Velocity in blocks per tick. */
    motion: Vec3;
    /** Whether the actor is currently touching the ground. */
    onGround: boolean;
}

/**
 * Seeds the client's movement prediction for an actor whose ordinary position updates are
 * spatially optimized. The packet supplies the same motion and ground state as
 * `SetActorMotionPacket`, alongside the actor's runtime id.
 *
 * Protocol 2193 layout: `mRuntimeId` as an unsigned varint64, `mMotion` as three little-endian
 * floats, then `mOnGround` as a boolean.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/motion-prediction-hints-packet/
 */
export default class MotionPredictionHintsPacket extends NetworkPacket<MotionPredictionHints> {
    public get id(): number {
        return PacketIdentifier.MOTION_PREDICTION_HINTS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: MotionPredictionHints): void {
        stream.writeUnsignedVarLong(data.runtimeId);
        data.motion.serialize(stream);
        stream.writeBoolean(data.onGround);
    }

    protected deserializePayload(stream: NetworkBinaryStream): MotionPredictionHints {
        const runtimeId = stream.readUnsignedVarLong();
        const motion = new Vec3(0, 0, 0);
        motion.deserialize(stream);
        return { runtimeId, motion, onGround: stream.readBoolean() };
    }
}
