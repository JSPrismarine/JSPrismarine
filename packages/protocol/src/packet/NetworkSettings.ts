import type NetworkBinaryStream from '../NetworkBinaryStream';
import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

export interface PacketData {
    compressionThreshold: 0 | 1;
    compressionAlgorithm: number;
    clientThrottleEnabled: boolean;
    clientThrottleThreshold: number;
    clientThrottleScalar: number;
}

/**
 * Sends tunable options from host to client (compression threshold and algorithm)
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/NetworkSettingsPacket.html}
 */
export class NetworkSettingsPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.NETWORK_SETTINGS;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeUnsignedShortLE(packetData.compressionThreshold);
        stream.writeUnsignedShortLE(packetData.compressionAlgorithm);
        stream.writeBoolean(packetData.clientThrottleEnabled);
        stream.writeByte(packetData.clientThrottleThreshold);
        stream.writeFloatLE(packetData.clientThrottleScalar);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            compressionThreshold: stream.readUnsignedShortLE() ? 1 : 0,
            compressionAlgorithm: stream.readUnsignedShortLE(),
            clientThrottleEnabled: stream.readBoolean(),
            clientThrottleThreshold: stream.readByte(),
            clientThrottleScalar: stream.readFloatLE()
        };
    }
}
