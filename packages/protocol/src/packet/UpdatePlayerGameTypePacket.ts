import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { updatePlayerGameTypePacket } from '../wire/definitions/player';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { UpdatePlayerGameTypePayload } from '../wire/definitions/player';

/**
 * Tells clients that a player's game type changed. The server sends it to every client because
 * each client caches the game type and permission flags of every player it knows about.
 *
 * The payload contains `Player Game Type` as a ZigZag varint32, `Target player` as a signed
 * varint64, and `Tick` as a varuint64 input tick. For the receiving player's own movement, the
 * tick lets the client reconcile predicted movement; zero is accepted for other players.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-player-game-type-packet/
 */
export default class UpdatePlayerGameTypePacket extends NetworkPacket<UpdatePlayerGameTypePayload> {
    public get id(): number {
        return PacketIdentifier.UPDATE_PLAYER_GAME_TYPE;
    }

    public constructor(packetData?: UpdatePlayerGameTypePayload | Buffer | null, buffer?: Buffer) {
        super(
            Buffer.isBuffer(packetData) ? null : (packetData ?? null),
            Buffer.isBuffer(packetData) ? packetData : buffer
        );
    }

    protected serializePayload(stream: NetworkBinaryStream, data: UpdatePlayerGameTypePayload): void {
        layoutAt(updatePlayerGameTypePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): UpdatePlayerGameTypePayload {
        return layoutAt(updatePlayerGameTypePacket, this.codecProtocol).decode(stream);
    }
}
