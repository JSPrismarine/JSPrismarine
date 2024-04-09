import type { NetworkBinaryStream } from '../';
import { NetworkPacket, PacketIdentifier } from '../';
import type { BehaviorPack, ResourcePack } from '@jsprismarine/minecraft';

interface PacketData {
    resourcePackRequired: boolean;
    hasAddonPacks: boolean;
    hasScripts: boolean;
    forceServerPackEnabled: boolean;
    behaviorPacks: Array<BehaviorPack>;
    resourcePacks: Array<ResourcePack>;
    cdnURLs: Array<[string, string]>;
}

/**
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/ResourcePacksInfoPacket.html}
 */
export default class ResourcePacksInfoPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.RESOURCE_PACKS_INFO;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeBoolean(packetData.resourcePackRequired);
        stream.writeBoolean(packetData.hasAddonPacks);
        stream.writeBoolean(packetData.hasScripts);
        stream.writeBoolean(packetData.forceServerPackEnabled);
        stream.writeUnsignedShortLE(packetData.behaviorPacks.length);
        for (const behaviorPack of packetData.behaviorPacks) {
            stream.writeString(behaviorPack.id);
            stream.writeString(behaviorPack.version);
            stream.writeUnsignedLongLE(behaviorPack.size);
            stream.writeString(behaviorPack.contentKey);
            stream.writeString(behaviorPack.subpackName);
            stream.writeString(behaviorPack.contentId);
            stream.writeBoolean(behaviorPack.scripting);
        }
        stream.writeUnsignedShortLE(packetData.resourcePacks.length);
        for (const resourcePack of packetData.resourcePacks) {
            stream.writeString(resourcePack.id);
            stream.writeString(resourcePack.version);
            stream.writeUnsignedLongLE(resourcePack.size);
            stream.writeString(resourcePack.contentKey);
            stream.writeString(resourcePack.subpackName);
            stream.writeString(resourcePack.contentId);
            stream.writeBoolean(resourcePack.scripting);
            stream.writeBoolean(resourcePack.rayTracingCapable);
        }
        stream.writeUnsignedVarInt(packetData.cdnURLs.length);
        for (const [url, hash] of packetData.cdnURLs) {
            stream.writeString(url);
            stream.writeString(hash);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            resourcePackRequired: stream.readBoolean(),
            hasAddonPacks: stream.readBoolean(),
            hasScripts: stream.readBoolean(),
            forceServerPackEnabled: stream.readBoolean(),
            behaviorPacks: Array.from({ length: stream.readUnsignedShortLE() }, () => ({
                id: stream.readString(),
                version: stream.readString(),
                size: stream.readUnsignedLongLE(),
                contentKey: stream.readString(),
                subpackName: stream.readString(),
                contentId: stream.readString(),
                scripting: stream.readBoolean()
            })),
            resourcePacks: Array.from({ length: stream.readUnsignedShortLE() }, () => ({
                id: stream.readString(),
                version: stream.readString(),
                size: stream.readUnsignedLongLE(),
                contentKey: stream.readString(),
                subpackName: stream.readString(),
                contentId: stream.readString(),
                scripting: stream.readBoolean(),
                rayTracingCapable: stream.readBoolean()
            })),
            cdnURLs: Array.from({ length: stream.readUnsignedVarInt() }, () => [
                stream.readString(),
                stream.readString()
            ])
        };
    }
}
