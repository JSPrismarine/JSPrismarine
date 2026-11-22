import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { clientMovementPredictionSyncPacket } from '../wire/definitions/clientMovementPredictionSync';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { ClientMovementPredictionSyncPayload } from '../wire/definitions/clientMovementPredictionSync';

/** The movement inputs the client predicts an actor with. */
export type ClientMovementPredictionSync = ClientMovementPredictionSyncPayload;

/**
 * The client's view of the movement inputs it predicts with, sent after it has applied a
 * server correction under server-authoritative movement.
 *
 * Wire layout at protocol 2193: Actor Data Flag as a bit set written seven bits per byte with
 * a continuation bit, like a LEB128 varint of unbounded width; Actor Bounding Box as three
 * float LE (scale, width, height); Movement Attributes as nine float LE (movement speed,
 * underwater speed, lava speed, jump strength, health, hunger, friction modifier, bounciness,
 * air drag modifier); Actor Unique ID as a ZigZag varint64; Actor Flying State as a boolean.
 * Mojang's page leaves `MovementAttributesComponent` empty; the nine floats are what
 * gophertunnel reads at 2193.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/client-movement-prediction-sync-packet/
 */
export default class ClientMovementPredictionSyncPacket extends NetworkPacket<ClientMovementPredictionSync> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ClientMovementPredictionSyncPacket';
    }

    /** Accepts payload data for sending or an encoded buffer for decoding. */
    public constructor(packetData?: ClientMovementPredictionSync | Buffer | null, buffer?: Buffer) {
        if (Buffer.isBuffer(packetData)) {
            super(null, packetData);
        } else {
            super(packetData ?? null, buffer);
        }
    }

    public get id(): number {
        return PacketIdentifier.CLIENT_MOVEMENT_PREDICTION_SYNC;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientMovementPredictionSync): void {
        layoutAt(clientMovementPredictionSyncPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientMovementPredictionSync {
        return layoutAt(clientMovementPredictionSyncPacket, this.codecProtocol).decode(stream);
    }
}
