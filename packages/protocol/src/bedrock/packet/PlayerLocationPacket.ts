import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { PlayerLocationPacketType, playerLocationPacket } from '../wire/definitions/playerLocation';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { PlayerLocationAlternative } from '../wire/definitions/playerLocation';

export { PlayerLocationPacketType };

/** A player's location or hide instruction, addressed by actor id. */
export type PlayerLocation = PlayerLocationAlternative & {
    /** Actor whose location is being sent. */
    targetActorId: bigint;
};

/**
 * Sends a tracked player's position or tells the client to hide that player.
 *
 * Layout at protocols 2193 and 2225: `Target Actor ID` as a ZigZag varint64, then `Location` as a varuint32
 * selector and a `Packet Type` ZigZag varint32. Both discriminators carry the same value.
 * Coordinates include a Vec3; hide has no further fields. The 1.26.50 page prints hide as 0 and the
 * 1.26.60 page as 1; this layout writes 1 at both versions because no capture or enum dump covers
 * the 2193 value.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/player-location-packet/
 */
export default class PlayerLocationPacket extends NetworkPacket<PlayerLocation> {
    public get id(): number {
        return PacketIdentifier.PLAYER_LOCATION;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerLocation): void {
        layoutAt(playerLocationPacket, this.codecProtocol).encode(stream, {
            targetActorId: data.targetActorId,
            location: data
        });
    }

    protected deserializePayload(stream: NetworkBinaryStream): PlayerLocation {
        const { targetActorId, location } = layoutAt(playerLocationPacket, this.codecProtocol).decode(stream);
        return { targetActorId, ...location };
    }
}
