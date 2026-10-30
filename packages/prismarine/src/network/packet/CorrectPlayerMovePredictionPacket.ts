import { Vector3 } from '@jsprismarine/math';

import { NetworkUtil } from '../NetworkUtil';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/** What the correction applies to, as the PredictionType uint8 numbers it. */
export enum RewindType {
    Player = 0,
    Vehicle = 1
}

/**
 * The correction a server-authoritative server sends when a client's movement simulation has
 * drifted too far from its own.
 *
 * Bound to the client, and only under the rewind movement mode. The receiving player is the
 * target, so no actor id is on the wire. The client rewinds to Tick, replaces its state with
 * Pos and Pos Delta, and replays the inputs it has made since. Correcting through
 * `MovePlayerPacket` instead is allowed and looks worse.
 *
 * Wire order at protocol 2193: PredictionType as a uint8 (see {@link RewindType}), Pos and
 * Pos Delta as three floats each in little-endian byte order, Rotation as two floats,
 * VehicleAngularVelocity as an optional float (a presence byte, then the float when it is
 * set), On Ground as a boolean, and Tick as a `PlayerInputTick` (plain LEB128 varuint64).
 *
 * Rotation and VehicleAngularVelocity carry a vehicle's state. Both are still on the wire for
 * a Player correction: Rotation is written as two floats either way, and
 * VehicleAngularVelocity contributes its presence byte. A reader that skips the presence byte
 * for player corrections takes it for the ground flag.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/correct-player-move-prediction-packet/
 */
export default class CorrectPlayerMovePredictionPacket extends FieldNetworkPacket {
    /** PredictionType: whether the player or the vehicle they ride is being corrected. */
    public predictionType: RewindType = RewindType.Player;

    /** Pos: the position the client should have ended the corrected tick at. */
    public pos: Vector3 = Vector3.ZERO;

    /** Pos Delta: the velocity the client should have ended the corrected tick with. */
    public posDelta: Vector3 = Vector3.ZERO;

    /** Rotation X: the vehicle's corrected rotation, meaningful for a Vehicle correction. */
    public rotationX = 0;

    /** Rotation Y: the vehicle's corrected rotation, meaningful for a Vehicle correction. */
    public rotationY = 0;

    /** VehicleAngularVelocity: the vehicle's angular velocity, or null when it is absent. */
    public vehicleAngularVelocity: number | null = null;

    /** On Ground: whether the target was on the ground at the corrected tick. */
    public onGround = false;

    /** Tick: the input tick being corrected, matching one the client sent. */
    public tick = 0n;

    /** Reads the prediction type, the corrected state, and the tick. */
    public decodePayload(): void {
        this.predictionType = this.readByte();
        this.pos = NetworkUtil.readVector3(this);
        this.posDelta = NetworkUtil.readVector3(this);
        this.rotationX = this.readFloatLE();
        this.rotationY = this.readFloatLE();
        this.vehicleAngularVelocity = this.readBoolean() ? this.readFloatLE() : null;
        this.onGround = this.readBoolean();
        this.tick = this.readUnsignedVarLong();
    }

    /** Writes the prediction type, the corrected state, and the tick. */
    public encodePayload(): void {
        this.writeByte(this.predictionType);
        NetworkUtil.writeVector3(this, this.pos);
        NetworkUtil.writeVector3(this, this.posDelta);
        this.writeFloatLE(this.rotationX);
        this.writeFloatLE(this.rotationY);

        this.writeBoolean(this.vehicleAngularVelocity !== null);
        if (this.vehicleAngularVelocity !== null) {
            this.writeFloatLE(this.vehicleAngularVelocity);
        }

        this.writeBoolean(this.onGround);
        this.writeUnsignedVarLong(this.tick);
    }
}
