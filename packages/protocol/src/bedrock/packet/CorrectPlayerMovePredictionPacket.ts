import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { correctPlayerMovePredictionPacket } from '../wire/definitions/correctPlayerMovePrediction';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { CorrectPlayerMovePredictionPayload } from '../wire/definitions/correctPlayerMovePrediction';

import { RewindType } from '../wire/definitions/correctPlayerMovePrediction';
export { RewindType };

/** The corrected movement state and tick for the receiving player. */
export type CorrectPlayerMovePrediction = CorrectPlayerMovePredictionPayload;

/**
 * Rewinds a client to a server-authoritative movement state and replays its later inputs.
 *
 * Layout: `PredictionType` (uint8), `Pos` and `Pos Delta` (three little-endian
 * floats each), `Rotation` (two little-endian floats), optional `Vehicle Angular Velocity`
 * (presence boolean and float), `On Ground` (boolean), and `Tick` (varuint64). Rotation and
 * the angular velocity presence byte are present for player corrections too.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/correct-player-move-prediction-packet/
 */
export default class CorrectPlayerMovePredictionPacket extends NetworkPacket<CorrectPlayerMovePrediction> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'CorrectPlayerMovePredictionPacket';
    }

    public get id(): number {
        return PacketIdentifier.CORRECT_PLAYER_MOVE_PREDICTION;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CorrectPlayerMovePrediction): void {
        layoutAt(correctPlayerMovePredictionPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CorrectPlayerMovePrediction {
        return layoutAt(correctPlayerMovePredictionPacket, this.codecProtocol).decode(stream);
    }
}
