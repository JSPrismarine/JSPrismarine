import type { NetworkBinaryStream } from '../';
import { NetworkStructure } from '../';
import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';

interface ItemInstanceUserDataConfig {
    canPlaceOnBlocks?: Array<string>;
    canDestroyBlocks?: Array<string>;
    dataSerializationVersion?: number;
}

/**
 * Represents a network structure of a item instance user data.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/ItemInstanceUserData.html}
 */
export default class ItemInstanceUserData extends NetworkStructure {
    // Blocks that the item can be placed on.
    public canPlaceOnBlocks: Array<string>;
    // Blocks that the item can destroy.
    public canDestroyBlocks: Array<string>;
    public dataSerializationVersion: number;

    private readonly CURRENT_ENCODE_VERSION = 1;

    /**
     * Creates a new instance of the ItemInstanceUserData class.
     * @param dataSerializationMarker - The data serialization marker.
     * @param dataSerializationVersion - The data serialization version.
     * @param userDataTag - The user nbt data tag.
     * @param config - The configuration options for the user data.
     */
    public constructor(
        public dataSerializationMarker: number,
        public userDataTag: NBTTagCompound,
        config: ItemInstanceUserDataConfig = {}
    ) {
        super();
        this.canPlaceOnBlocks = config.canPlaceOnBlocks ?? [];
        this.canDestroyBlocks = config.canDestroyBlocks ?? [];
        this.dataSerializationVersion = config.dataSerializationVersion ?? this.CURRENT_ENCODE_VERSION;
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeShortLE(this.dataSerializationMarker);
        stream.writeByte(this.dataSerializationVersion);
        this.userDataTag.writeToStream(stream, ByteOrder.LITTLE_ENDIAN, true);
        stream.writeUnsignedIntLE(this.canPlaceOnBlocks.length);
        for (const block of this.canPlaceOnBlocks) {
            stream.writeString(block);
        }
        stream.writeUnsignedIntLE(this.canDestroyBlocks.length);
        for (const block of this.canDestroyBlocks) {
            stream.writeString(block);
        }
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.dataSerializationMarker = stream.readShortLE();
        this.dataSerializationVersion = stream.readByte();
        this.userDataTag = NBTTagCompound.readFromStream(stream, ByteOrder.LITTLE_ENDIAN, true);
        const canPlaceOnBlocksLength = stream.readUnsignedIntLE();
        for (let i = 0; i < canPlaceOnBlocksLength; i++) {
            this.canPlaceOnBlocks.push(stream.readString());
        }
        const canDestroyBlocksLength = stream.readUnsignedIntLE();
        for (let i = 0; i < canDestroyBlocksLength; i++) {
            this.canDestroyBlocks.push(stream.readString());
        }
    }
}
