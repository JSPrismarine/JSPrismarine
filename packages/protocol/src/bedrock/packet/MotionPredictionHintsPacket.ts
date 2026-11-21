import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { motionPredictionHintsPacket } from '../wire/definitions/motionPredictionHints';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { MotionPredictionHintsPayload } from '../wire/definitions/motionPredictionHints';

/** Actor movement state used to seed the client's prediction history. */
export type MotionPredictionHints = MotionPredictionHintsPayload;

/**
 * Seeds the client's movement prediction for an actor whose ordinary position updates are
 * spatially optimized. The packet supplies the same motion and ground state as
 * `SetActorMotionPacket`, alongside the actor's runtime id.
 *
 * Protocol 2193 layout: `mRuntimeId` as an unsigned varint64, `mMotion` as three little-endian
 * floats, then `mOnGround` as a boolean.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/motion-prediction-hints-packet/
 */
export default class MotionPredictionHintsPacket extends NetworkPacket<MotionPredictionHints> {
    public get id(): number {
        return PacketIdentifier.MOTION_PREDICTION_HINTS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: MotionPredictionHints): void {
        layoutAt(motionPredictionHintsPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): MotionPredictionHints {
        return layoutAt(motionPredictionHintsPacket, this.codecProtocol).decode(stream);
    }
}
