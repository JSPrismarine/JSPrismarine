import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import Vec3 from '../structure/Vec3';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The two alternatives in a player location update. */
export enum PlayerLocationPacketType {
    /** A player position follows. */
    PLAYER_LOCATION_COORDINATES = 0,
    /** The player should be hidden; no position follows. */
    PLAYER_LOCATION_HIDE = 1
}

/** A player's location or hide instruction, addressed by actor id. */
export type PlayerLocation =
    | {
          /** Actor whose location is being sent. */
          targetActorId: bigint;
          /** Coordinate update discriminator. */
          packetType: PlayerLocationPacketType.PLAYER_LOCATION_COORDINATES;
          /** Position of the player. */
          position: Vec3;
      }
    | {
          /** Actor whose location is being sent. */
          targetActorId: bigint;
          /** Hide discriminator. */
          packetType: PlayerLocationPacketType.PLAYER_LOCATION_HIDE;
          /** Hide carries no coordinates. */
          position: null;
      };

/**
 * Sends a tracked player's position or tells the client to hide that player.
 *
 * Protocol 2193 layout: `Target Actor ID` as a ZigZag varint64, then `Location` as a varuint32
 * selector and a `Packet Type` ZigZag varint32. Both discriminators carry the same value.
 * Coordinates include a Vec3; hide has no further fields.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/player-location-packet/
 */
export default class PlayerLocationPacket extends NetworkPacket<PlayerLocation> {
    public get id(): number {
        return PacketIdentifier.PLAYER_LOCATION;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerLocation): void {
        stream.writeVarLong(data.targetActorId);
        stream.writeUnsignedVarInt(data.packetType);
        stream.writeVarInt(data.packetType);
        if (data.packetType === PlayerLocationPacketType.PLAYER_LOCATION_COORDINATES) data.position.serialize(stream);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PlayerLocation {
        const targetActorId = stream.readVarLong();
        const selector = stream.readUnsignedVarInt();
        const packetType = stream.readVarInt();
        if (selector !== packetType)
            throw new Error(`Player location selector ${selector} does not match type ${packetType}`);

        switch (selector) {
            case PlayerLocationPacketType.PLAYER_LOCATION_COORDINATES: {
                const position = new Vec3(0, 0, 0);
                position.deserialize(stream);
                return { targetActorId, packetType, position };
            }
            case PlayerLocationPacketType.PLAYER_LOCATION_HIDE:
                return { targetActorId, packetType, position: null };
            default:
                throw new Error(`Unknown player location alternative ${selector}`);
        }
    }
}
