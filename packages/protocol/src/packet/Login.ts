import { NetworkPacket, PacketIdentifier, NetworkBinaryStream } from '../';

interface PacketData {
    clientNetworkVersion: number;
    connectionRequest: string;
}

/**
 * Sent once from client to server at login.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/LoginPacket.html}
 */
export default class LoginPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.LOGIN;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeUnsignedVarInt(packetData.clientNetworkVersion);
        stream.writeString(packetData.connectionRequest);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            clientNetworkVersion: stream.readInt(),
            connectionRequest: stream.readString()
        };
    }
}
