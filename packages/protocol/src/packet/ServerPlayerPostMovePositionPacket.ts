import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import Vec3 from '../structure/Vec3';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The position the server simulated for its player at the end of movement. */
export interface ServerPlayerPostMovePosition {
    /** Pos, encoded as three little-endian floats. */
    pos: Vec3;
}

/**
 * Sends a player's server position to the client at the end of movement. It is used only by
 * debug draw and is omitted when debug draw is unavailable.
 *
 * Protocol 2193 layout: `Pos` as a {@link Vec3} of three little-endian floats.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/server-player-post-move-position-packet/
 */
export default class ServerPlayerPostMovePositionPacket extends NetworkPacket<ServerPlayerPostMovePosition> {
    public get id(): number {
        return PacketIdentifier.SERVER_PLAYER_POST_MOVE_POSITION;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerPlayerPostMovePosition): void {
        data.pos.serialize(stream);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerPlayerPostMovePosition {
        const pos = new Vec3(0, 0, 0);
        pos.deserialize(stream);
        return { pos };
    }
}
