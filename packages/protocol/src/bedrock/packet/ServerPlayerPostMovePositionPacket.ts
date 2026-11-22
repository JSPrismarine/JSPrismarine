import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { serverPlayerPostMovePositionPacket } from '../wire/definitions/serverPlayerPostMovePosition';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { ServerPlayerPostMovePositionPayload } from '../wire/definitions/serverPlayerPostMovePosition';

/** The position the server simulated for its player at the end of movement. */
export type ServerPlayerPostMovePosition = ServerPlayerPostMovePositionPayload;

/**
 * Sends a player's server position to the client at the end of movement. It is used only by
 * debug draw and is omitted when debug draw is unavailable.
 *
 * Protocol 2193 and 2225 layout: `Pos` as a `Vec3` of three little-endian floats.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/server-player-post-move-position-packet/
 */
export default class ServerPlayerPostMovePositionPacket extends NetworkPacket<ServerPlayerPostMovePosition> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ServerPlayerPostMovePositionPacket';
    }

    public get id(): number {
        return PacketIdentifier.SERVER_PLAYER_POST_MOVE_POSITION;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerPlayerPostMovePosition): void {
        layoutAt(serverPlayerPostMovePositionPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerPlayerPostMovePosition {
        return layoutAt(serverPlayerPostMovePositionPacket, this.codecProtocol).decode(stream);
    }
}
