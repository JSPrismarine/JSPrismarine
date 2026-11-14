/**
 * `PlayerLocationPacket`: sends a tracked player's position or tells the client to hide that
 * player.
 *
 * Layout at protocols 2193 and 2225: `Target Actor ID` as a ZigZag varint64, then `Location` as a varuint32
 * selector and a `Packet Type` ZigZag varint32. Both discriminators carry the same value.
 * Coordinates include a Vec3; hide has no further fields. The 1.26.50 page prints hide as 0 and the
 * 1.26.60 page as 1; this layout writes 1 at both versions because no capture or enum dump covers
 * the 2193 value.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/player-location-packet/
 */
import Vec3 from '../../structure/Vec3';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The two alternatives in a player location update. */
export enum PlayerLocationPacketType {
    /** A player position follows. */
    PLAYER_LOCATION_COORDINATES = 0,
    /** The player should be hidden; no position follows. */
    PLAYER_LOCATION_HIDE = 1
}

/** What a player location update says about its actor: a position, or an instruction to hide it. */
export type PlayerLocationAlternative =
    | {
          /** Coordinate update discriminator. */
          packetType: PlayerLocationPacketType.PLAYER_LOCATION_COORDINATES;
          /** Position of the player. */
          position: Vec3;
      }
    | {
          /** Hide discriminator. */
          packetType: PlayerLocationPacketType.PLAYER_LOCATION_HIDE;
          /** Hide carries no coordinates. */
          position: null;
      };

/**
 * `Location` and `Packet Type`: the selector and the type, then a Vec3 only for coordinates.
 *
 * The position's presence depends on the discriminator, and both discriminators must agree, so
 * the two fields and the tail travel as one wire type.
 */
const alternative = t.custom<PlayerLocationAlternative>(
    'PlayerLocationAlternative',
    (stream, value) => {
        stream.writeUnsignedVarInt(value.packetType);
        stream.writeVarInt(value.packetType);
        if (value.packetType === PlayerLocationPacketType.PLAYER_LOCATION_COORDINATES) value.position.serialize(stream);
    },
    (stream) => {
        const selector = stream.readUnsignedVarInt();
        const packetType = stream.readVarInt();
        if (selector !== packetType)
            throw new Error(`Player location selector ${selector} does not match type ${packetType}`);

        switch (selector) {
            case PlayerLocationPacketType.PLAYER_LOCATION_COORDINATES: {
                const position = new Vec3(0, 0, 0);
                position.deserialize(stream);
                return { packetType, position };
            }
            case PlayerLocationPacketType.PLAYER_LOCATION_HIDE:
                return { packetType, position: null };
            default:
                throw new Error(`Unknown player location alternative ${selector}`);
        }
    }
);

/** The fields sent when the server reports where a tracked player is, or hides it. */
export const playerLocationPacket = definePacket('PlayerLocationPacket', {
    /** `Target Actor ID`: the actor whose location is being sent, as a ZigZag varint64. */
    targetActorId: t.varint64,
    /** `Location` selector, `Packet Type`, and the position that only coordinates carry. */
    location: alternative
});

/** Payload carried by `PlayerLocationPacket`, as the definition lays it out on the wire. */
export type PlayerLocationWirePayload = PayloadOf<typeof playerLocationPacket>;
