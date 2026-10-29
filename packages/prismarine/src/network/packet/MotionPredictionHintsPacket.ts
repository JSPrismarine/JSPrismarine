import { Vector3 } from '@jsprismarine/math';

import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * The velocity an actor is expected to keep, fed to the client's movement prediction.
 *
 * Bound to the client. It is a `SetActorMotionPacket` plus a ground flag, and vanilla sends
 * it in place of that packet when spatial optimizations hold back the actor's position
 * updates. The client stores the points as the history its prediction component extrapolates
 * from.
 *
 * Wire order at protocol 2193: mRuntimeId as an `ActorRuntimeID` (plain LEB128 varuint64),
 * mMotion as three floats in little-endian byte order, then mOnGround as a boolean.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/motion-prediction-hints-packet/
 */
export default class MotionPredictionHintsPacket extends DataPacket {
    /** mRuntimeId: the actor that is moving. */
    public runtimeId = 0n;

    /** mMotion: the position delta per tick the server calculated. */
    public motion: Vector3 = Vector3.ZERO;

    /** mOnGround: false while the actor is falling or jumping. */
    public onGround = false;

    /** Reads the runtime id, the motion vector, and the ground flag. */
    public decodePayload(): void {
        this.runtimeId = this.readUnsignedVarLong();
        this.motion = NetworkUtil.readVector3(this);
        this.onGround = this.readBoolean();
    }

    /** Writes the runtime id, the motion vector, and the ground flag. */
    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeId);
        NetworkUtil.writeVector3(this, this.motion);
        this.writeBoolean(this.onGround);
    }
}
