import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';
import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';

/** The docs enum `ItemVersion`, which tells the client how to treat an `ItemData` entry. */
export enum ItemVersion {
    /** A built-in item the client already knows. */
    LEGACY = 0,
    /** An item defined by the components in `Item Component Data`. */
    DATA_DRIVEN = 1,
    /** No version. */
    NONE = 2
}

/**
 * One entry of `ItemRegistryPacket`: an item name and the id it travels as.
 *
 * Wire layout, in docs order: `Item Name` (string), `Item Id` (int16 little endian, negative
 * for a block's item form), `Is Component Based` (boolean), `Item Version` (varint32
 * {@link ItemVersion}) and `Item Component Data` (a network NBT compound: little endian with
 * varint lengths).
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/item-data/}
 */
export default class ItemData extends NetworkStructure {
    private componentDataBuffer: Buffer | undefined;
    public componentData: NBTTagCompound;

    /**
     * Creates an entry.
     * @param itemName - `Item Name`, such as `minecraft:stick`.
     * @param itemId - `Item Id`, an int16. Negative for a block's item form.
     * @param componentBased - `Is Component Based`, true when components define the item.
     * @param version - `Item Version`.
     * @param componentData - `Item Component Data` as a compound or captured network-NBT bytes.
     *   Defaults to an empty compound.
     */
    public constructor(
        public itemName: string,
        public itemId: number,
        public componentBased: boolean,
        public version: ItemVersion,
        componentData: NBTTagCompound | Buffer = new NBTTagCompound()
    ) {
        super();
        this.componentData = new NBTTagCompound();
        if (Buffer.isBuffer(componentData)) this.componentDataBuffer = componentData;
        else this.componentData = componentData;
    }

    /** Writes the five fields in docs order. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeString(this.itemName);
        stream.writeShortLE(this.itemId);
        stream.writeBoolean(this.componentBased);
        stream.writeVarInt(this.version);
        if (this.componentDataBuffer !== undefined) stream.write(this.componentDataBuffer);
        else this.componentData.writeToStream(stream, ByteOrder.LITTLE_ENDIAN, true);
    }

    /** Reads the five fields in docs order. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.itemName = stream.readString();
        this.itemId = stream.readShortLE();
        this.componentBased = stream.readBoolean();
        this.version = stream.readVarInt();
        this.componentData = NBTTagCompound.readFromStream(stream, ByteOrder.LITTLE_ENDIAN, true);
        this.componentDataBuffer = undefined;
    }
}
