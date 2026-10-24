import type { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/** The two forms of a player location update. */
export enum PlayerLocationType {
    /** Coordinates follow. */
    Coordinates = 0,
    /** Hide the player; no coordinates follow. */
    Hide = 1
}

/**
 * Position of a player outside simulation distance, or a request to hide one.
 *
 * Wire layout at protocol 2193: Target Actor ID as a ZigZag varint64, then the Location as a
 * `oneOf`: a varuint32 selector, then the alternative, which itself starts with Packet Type as
 * a ZigZag varint32 carrying the same value. The Coordinates alternative continues with
 * Position as three float LE; Hide carries nothing more. The selector and the packet type
 * are both on the wire, which is also how gophertunnel writes it.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/player-location-packet/
 */
export default class PlayerLocationPacket extends DataPacket {
    public static NetID = Identifiers.PlayerLocationPacket;

    /** Unique id of the player whose location is updated or hidden. */
    public targetActorId = 0n;

    public packetType = PlayerLocationType.Hide;

    /** The tracked player's position, or `null` for a hide. */
    public position: Vector3 | null = null;

    /** Reads the target, the selector and type, and the position when there is one. */
    public decodePayload(): void {
        this.targetActorId = this.readVarLong();
        const selector = this.readUnsignedVarInt();
        this.packetType = this.readVarInt();

        switch (selector) {
            case PlayerLocationType.Coordinates:
                this.position = NetworkUtil.readVector3(this);
                break;
            case PlayerLocationType.Hide:
                this.position = null;
                break;
            default:
                throw new Error(`Unknown player location alternative ${selector}`);
        }
    }

    /** Writes the target, the selector and type, and the position for a coordinates update. */
    public encodePayload(): void {
        this.writeVarLong(this.targetActorId);
        this.writeUnsignedVarInt(this.packetType);
        this.writeVarInt(this.packetType);
        if (this.packetType === PlayerLocationType.Coordinates) NetworkUtil.writeVector3(this, this.position);
    }
}
