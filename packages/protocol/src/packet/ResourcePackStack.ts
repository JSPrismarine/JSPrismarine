import { Experiments, NetworkBinaryStream, NetworkPacket, PacketIdentifier } from '../';
import { StackPack } from '@jsprismarine/minecraft';

interface PacketData {
    texturePackRequired: boolean;
    baseGameVersion: string;
    addonList: Array<StackPack>;
    texturePackList: Array<StackPack>;
    experiments: Experiments;
}

/**
 * This is sent to the client in response to a ResourcePackClientResponsePacket which is fired when MinecraftGame starts.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/ResourcePackStackPacket.html}
 */
export default class ResourcePackStackPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.RESOURCE_PACK_STACK;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeBoolean(packetData.texturePackRequired);
        stream.writeUnsignedVarInt(packetData.addonList.length);
        for (const addon of packetData.addonList) {
            stream.writeString(addon.id);
            stream.writeString(addon.version);
            stream.writeString(addon.subpackName);
        }
        stream.writeUnsignedVarInt(packetData.texturePackList.length);
        for (const texturePack of packetData.texturePackList) {
            stream.writeString(texturePack.id);
            stream.writeString(texturePack.version);
            stream.writeString(texturePack.subpackName);
        }
        stream.writeString(packetData.baseGameVersion);
        packetData.experiments.serialize(stream);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            texturePackRequired: stream.readBoolean(),
            baseGameVersion: stream.readString(),
            addonList: Array.from({ length: stream.readUnsignedVarInt() }, () => ({
                id: stream.readString(),
                version: stream.readString(),
                subpackName: stream.readString()
            })),
            texturePackList: Array.from({ length: stream.readUnsignedVarInt() }, () => ({
                id: stream.readString(),
                version: stream.readString(),
                subpackName: stream.readString()
            })),
            experiments: Experiments.deserialize(stream)
        };
    }
}
