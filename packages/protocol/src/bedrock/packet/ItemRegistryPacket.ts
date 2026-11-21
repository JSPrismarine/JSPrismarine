import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { itemRegistryPacket } from '../wire/definitions/itemRegistry';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { ProtocolContext } from '../ProtocolContext';
import type { ItemRegistryPayload } from '../wire/definitions/itemRegistry';

/** One `ItemData` entry of `ItemRegistryPacket`. */
export type ItemRegistryEntry = ItemRegistryPayload['items'][number];

/** The decoded `ItemRegistryPacket`: the `Item Data` array in wire order. */
export interface ItemRegistry extends ItemRegistryPayload {
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
 * Wire layout: `Item Data` is a varuint32 count followed by one `ItemData` per entry:
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
        layoutAt(itemRegistryPacket, this.codecProtocol).encode(stream, { items });
    }

    protected deserializePayload(stream: NetworkBinaryStream): ItemRegistry {
        return layoutAt(itemRegistryPacket, this.codecProtocol).decode(stream);
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
