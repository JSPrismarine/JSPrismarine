import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { addPlayerPacket } from '../wire/definitions/addPlayer';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { AddPlayerPayload } from '../wire/definitions/addPlayer';

/**
 * Introduces a player actor to the other players' clients.
 *
 * The 2193 payload contains identity, display name, runtime id, chat id, position and velocity,
 * rotation, carried item, game type, actor metadata, synchronized properties, abilities, actor
 * links, device id, and build platform. Protocol 2225 adds optional passenger block data before
 * the device id; the declarative layout selects that field by protocol version.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/add-player-packet/
 */
export default class AddPlayerPacket extends NetworkPacket<AddPlayerPayload> {
    /** Accepts payload data for sending or an encoded buffer for decoding. */
    public constructor(packetData?: AddPlayerPayload | Buffer | null, buffer?: Buffer) {
        if (Buffer.isBuffer(packetData)) {
            super(null, packetData);
        } else {
            super(packetData ?? null, buffer);
        }
    }

    public get id(): number {
        return PacketIdentifier.ADD_PLAYER;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: AddPlayerPayload): void {
        layoutAt(addPlayerPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): AddPlayerPayload {
        return layoutAt(addPlayerPacket, this.codecProtocol).decode(stream);
    }
}
