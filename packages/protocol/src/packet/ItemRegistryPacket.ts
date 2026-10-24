import { ByteOrder, NBTReader } from '@jsprismarine/nbt';

import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** One `ItemData` entry of `ItemRegistryPacket`, without its `Item Component Data`. */
export interface ItemRegistryEntry {
    /** `Item Name`, e.g. `minecraft:stick`. */
    name: string;
    /** `Item Id`, an int16. Negative for a block's item form. */
    runtimeId: number;
    /** `Is Component Based`. True when components define the item instead of client built-ins. */
    componentBased: boolean;
    /** `Item Version` from the docs enum `ItemVersion`: 0 `Legacy`, 1 `DataDriven`, 2 `None`. */
    version: number;
}

/** The decoded `ItemRegistryPacket`: the `Item Data` array in wire order. */
export interface ItemRegistry {
    /** One entry per item the server declared, in the order the server sent them. */
    items: ItemRegistryEntry[];
}

/**
 * Every item the client may be told about, and the number each travels as.
 *
 * Docs packet 162, sent right after `StartGame`. Since 1.21.60 it carries the item
 * definitions that `StartGame` used to carry. A client that does not receive it cannot
 * resolve a single item id.
 *
 * Wire layout: `Item Data` is a varuint32 count followed by one `ItemData` per entry:
 * `Item Name` (string), `Item Id` (int16 little endian), `Is Component Based` (boolean),
 * `Item Version` (varint32, `ItemVersion` enum), and `Item Component Data` (network NBT
 * compound with varint lengths, little endian).
 *
 * This packet reads the component compound and drops it. The tree describes how a custom
 * item behaves, which the client package does not need. It still has to be read, because the
 * next entry starts where the compound ends.
 */
export default class ItemRegistryPacket extends NetworkPacket<ItemRegistry> {
    public get id(): number {
        return PacketIdentifier.ITEM_REGISTRY;
    }

    protected serializePayload(): void {
        throw new Error('ItemRegistryPacket is decode-only: the component trees are not modeled');
    }

    protected deserializePayload(stream: NetworkBinaryStream): ItemRegistry {
        const items: ItemRegistryEntry[] = [];

        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            const name = stream.readString();
            const runtimeId = stream.readShortLE();
            const componentBased = stream.readBoolean();
            const version = stream.readVarInt();

            // Read for its length, not its contents, in the network dialect with varint
            // string lengths. The same compound in the other encoding is three bytes longer,
            // so a reader on the wrong one walks into the next entry's name.
            const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
            reader.setUseVarint(true);
            reader.parse();

            items.push({ name, runtimeId, componentBased, version });
        }

        return { items };
    }
}
