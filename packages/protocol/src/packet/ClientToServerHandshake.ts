import { NetworkPacket, PacketIdentifier, NetworkBinaryStream } from '../';

/**
 * Sets up encryption and authenticates in educational version once at level startup from client.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/ClientToServerHandshakePacket.html}
 */
export default class ClientToServerHandshake extends NetworkPacket<void> {
    get id(): number {
        return PacketIdentifier.CLIENT_TO_SERVER_HANDSHAKE;
    }

    protected serializePayload(stream: NetworkBinaryStream): void {
        void stream;
    }

    protected deserializePayload(stream: NetworkBinaryStream): void {
        void stream;
    }
}
