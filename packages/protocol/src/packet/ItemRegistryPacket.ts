import type { NBTTagCompound } from '@jsprismarine/nbt';

import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import ItemData from '../structure/ItemData';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { ProtocolContext } from '../ProtocolContext';

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
    /** Already encoded network NBT from a captured item table; written byte for byte. */
    componentDataBuffer?: Buffer;
}

/** The decoded `ItemRegistryPacket`: the `Item Data` array in wire order. */
export interface ItemRegistry {
    /** One entry per item the server declared, in the order the server sent them. */
    items: ItemRegistryEntry[];
    /** Whether to use the injected vanilla item table instead of the explicit entries. */
    useContextItemData?: boolean;
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
    /** Creates a registry packet, defaulting to the connection's injected vanilla item table. */
    public constructor(packetData?: ItemRegistry) {
        super(packetData ?? { items: [], useContextItemData: true });
    }

    public get id(): number {
        return PacketIdentifier.ITEM_REGISTRY;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ItemRegistry, context?: ProtocolContext): void {
        const items = data.useContextItemData ? ItemRegistryPacket.entriesFrom(context?.itemData) : data.items;
        stream.writeUnsignedVarInt(items.length);
        for (const item of items) {
            new ItemData(
                item.name,
                item.runtimeId,
                item.componentBased,
                item.version,
                item.componentDataBuffer ?? item.componentData
            ).serialize(stream);
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

    /** Builds registry entries from the item data injected by the server for this connection. */
    private static entriesFrom(itemData: ProtocolContext['itemData']): ItemRegistryEntry[] {
        if (itemData === undefined) return [];

        return Object.entries(itemData.table).map(([name, item]) => ({
            name,
            runtimeId: item.runtime_id,
            componentBased: item.component_based,
            version: item.version,
            componentDataBuffer: itemData.components[name]
        }));
    }
}
