import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { setPlayerGameTypePacket } from '../wire/definitions/player';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { SetPlayerGameTypePayload } from '../wire/definitions/player';

/**
 * Carries the game type chosen by the client, or the authoritative game type sent back by the
 * server. `Player Game Type` is a ZigZag varint32; decoded values stay numeric so the server
 * can reject values that do not name a supported game type.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-player-game-type-packet/
 */
export default class SetPlayerGameTypePacket extends NetworkPacket<SetPlayerGameTypePayload> {
    public get id(): number {
        return PacketIdentifier.SET_PLAYER_GAME_TYPE;
    }

    public constructor(packetData?: SetPlayerGameTypePayload | Buffer | null, buffer?: Buffer) {
        super(
            Buffer.isBuffer(packetData) ? null : (packetData ?? null),
            Buffer.isBuffer(packetData) ? packetData : buffer
        );
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SetPlayerGameTypePayload): void {
        layoutAt(setPlayerGameTypePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SetPlayerGameTypePayload {
        return layoutAt(setPlayerGameTypePacket, this.codecProtocol).decode(stream);
    }
}
