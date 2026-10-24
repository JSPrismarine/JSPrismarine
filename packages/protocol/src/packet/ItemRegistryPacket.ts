import type { NBTTagCompound } from '@jsprismarine/nbt';

import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import ItemData from '../structure/ItemData';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** One `ItemData` entry of `ItemRegistryPacket`. */
export interface ItemRegistryEntry {
    /** `Item Name`, e.g. `minecraft:stick`. */
    name: string;
    /** `Item Id`, an int16. Negative for a block's item form. */
    runtimeId: number;
    /** `Is Component Based`. True when components define the item instead of client built-ins. */
    componentBased: boolean;
    /** `Item Version` from the docs enum `ItemVersion`: 0 `Legacy`, 1 `DataDriven`, 2 `None`. */
    version: number;
    /**
     * `Item Component Data`, the compound that defines a component-based item. A reader always
     * fills it. A writer may leave it out for an item with no components, which writes the
     * empty compound the field still requires.
     */
    componentData?: NBTTagCompound;
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
 * Wire layout: `Item Data` is a varuint32 count followed by one {@link ItemData} per entry:
 * `Item Name` (a `hashed_string`, which travels as an ordinary string), `Item Id` (int16
 * little endian), `Is Component Based` (boolean), `Item Version` (ZigZag varint32,
 * `ItemVersion` enum), and `Item Component Data` (network NBT compound with varint lengths,
 * little endian).
 */
export default class ItemRegistryPacket extends NetworkPacket<ItemRegistry> {
    public get id(): number {
        return PacketIdentifier.ITEM_REGISTRY;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ItemRegistry): void {
        stream.writeUnsignedVarInt(data.items.length);
        for (const item of data.items) {
            new ItemData(item.name, item.runtimeId, item.componentBased, item.version, item.componentData).serialize(
                stream
            );
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): ItemRegistry {
        const items: ItemRegistryEntry[] = [];

        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            const data = ItemData.deserialize(stream);
            items.push({
                name: data.itemName,
                runtimeId: data.itemId,
                componentBased: data.componentBased,
                version: data.version,
                componentData: data.componentData
            });
        }

        return { items };
    }
}
