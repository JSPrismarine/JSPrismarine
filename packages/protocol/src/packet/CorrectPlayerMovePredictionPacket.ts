import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import Vec3 from '../structure/Vec3';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** What the movement correction rewinds, as the `PredictionType` byte numbers it. */
export enum RewindType {
    Player = 0,
    Vehicle = 1
}

/** The corrected movement state and tick for the receiving player. */
export interface CorrectPlayerMovePrediction {
    /** Whether the player or its vehicle is being corrected. */
    predictionType: RewindType;
    /** Position the client should have reached at the corrected tick. */
    pos: Vec3;
    /** Velocity the client should have reached at the corrected tick. */
    posDelta: Vec3;
    /** First rotation component; meaningful for a vehicle correction. */
    rotationX: number;
    /** Second rotation component; meaningful for a vehicle correction. */
    rotationY: number;
    /** Vehicle angular velocity, or `null` when the optional field is absent. */
    vehicleAngularVelocity: number | null;
    /** Whether the corrected state is on the ground. */
    onGround: boolean;
    /** Input tick the client should rewind to. */
    tick: bigint;
}

/**
 * Rewinds a client to a server-authoritative movement state and replays its later inputs.
 *
 * Protocol 2193 layout: `PredictionType` (uint8), `Pos` and `Pos Delta` (three little-endian
 * floats each), `Rotation` (two little-endian floats), optional `Vehicle Angular Velocity`
 * (presence boolean and float), `On Ground` (boolean), and `Tick` (varuint64). Rotation and
 * the angular velocity presence byte are present for player corrections too.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/correct-player-move-prediction-packet/
 */
export default class CorrectPlayerMovePredictionPacket extends NetworkPacket<CorrectPlayerMovePrediction> {
    public get id(): number {
        return PacketIdentifier.CORRECT_PLAYER_MOVE_PREDICTION;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CorrectPlayerMovePrediction): void {
        stream.writeByte(data.predictionType);
        data.pos.serialize(stream);
        data.posDelta.serialize(stream);
        stream.writeFloatLE(data.rotationX);
        stream.writeFloatLE(data.rotationY);
        stream.writeBoolean(data.vehicleAngularVelocity !== null);
        if (data.vehicleAngularVelocity !== null) stream.writeFloatLE(data.vehicleAngularVelocity);
        stream.writeBoolean(data.onGround);
        stream.writeUnsignedVarLong(data.tick);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CorrectPlayerMovePrediction {
        const predictionType: RewindType = stream.readByte();
        const pos = new Vec3(0, 0, 0);
        pos.deserialize(stream);
        const posDelta = new Vec3(0, 0, 0);
        posDelta.deserialize(stream);
        const rotationX = stream.readFloatLE();
        const rotationY = stream.readFloatLE();
        const vehicleAngularVelocity = stream.readBoolean() ? stream.readFloatLE() : null;
        const onGround = stream.readBoolean();
        const tick = stream.readUnsignedVarLong();
        return { predictionType, pos, posDelta, rotationX, rotationY, vehicleAngularVelocity, onGround, tick };
    }
}
