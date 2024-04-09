import type { NetworkBinaryStream } from '../';
import { NetworkPacket, PacketIdentifier } from '../';
import type { ResourcePackResponse } from '@jsprismarine/minecraft';

export interface PacketData {
    response: ResourcePackResponse;
    downloadingPacks: Array<string>;
}

/**
 * Sent to MinecraftGame to complete the resource pack loading process.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/ResourcePackClientResponsePacket.html}
 */
export default class ResourcePackClientResponsePacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.RESOURCE_PACK_CLIENT_RESPONSE;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeByte(packetData.response);
        stream.writeUnsignedShortLE(packetData.downloadingPacks.length);
        for (const pack of packetData.downloadingPacks) {
            stream.writeString(pack);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            response: stream.readByte(),
            downloadingPacks: Array.from({ length: stream.readUnsignedShortLE() }, () => stream.readString())
        };
    }
}
