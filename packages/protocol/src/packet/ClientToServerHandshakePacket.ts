import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { clientToServerHandshakePacket } from '../wire/definitions/clientToServerHandshake';
import { protocolVersion } from '../wire/versions/v2193';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { ClientToServerHandshakePayload } from '../wire/definitions/clientToServerHandshake';

/** Nothing. The packet arriving at all is the whole message. */
export type ClientToServerHandshake = ClientToServerHandshakePayload;

/**
 * The definition carries no version gate, so it resolves to the same frozen layout at every
 * protocol; the oldest supported version stands in for the packet class, which does not know
 * its session's protocol.
 */
const layout = () => layoutAt(clientToServerHandshakePacket, protocolVersion);

/**
 * The client's answer to `ServerToClientHandshake`: nothing after the packet header, sent
 * encrypted.
 *
 * The wire layout is the `clientToServerHandshakePacket` definition in `wire/definitions`,
 * which has no fields.
 *
 * It says only that the client derived the key and turned encryption on. The server learns
 * that by decrypting the batch and checking its checksum, so the packet carries its meaning
 * by arriving readable rather than by its contents. A client sends it only after receiving
 * `ServerToClientHandshake`, so a server that skipped the handshake must not wait for it.
 */
export default class ClientToServerHandshakePacket extends NetworkPacket<ClientToServerHandshake> {
    public get id(): number {
        return PacketIdentifier.CLIENT_TO_SERVER_HANDSHAKE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientToServerHandshake): void {
        layout().encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientToServerHandshake {
        return layout().decode(stream);
    }
}
