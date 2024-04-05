import { NetworkPacket, PacketIdentifier, NetworkBinaryStream } from '../';

interface PacketData {
    handshakeWebToken: string;
}

/**
 * Sent from the server at the end of the login packet.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/ServerToClientHandshakePacket.html}
 */
export default class ServerToClientHandshake extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.SERVER_TO_CLIENT_HANDSHAKE;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeString(packetData.handshakeWebToken);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            handshakeWebToken: stream.readString()
        };
    }
}
