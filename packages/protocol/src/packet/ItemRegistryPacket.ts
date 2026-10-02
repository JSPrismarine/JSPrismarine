import { ByteOrder, NBTReader } from '@jsprismarine/nbt';

import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export interface ItemRegistryEntry {
    /** The name the client knows it by, e.g. `minecraft:stick`. */
    name: string;
    /** The number it travels as. Negative for a block's item form. */
    runtimeId: number;
    /** Whether the item is defined by components rather than being one the client has built in. */
    componentBased: boolean;
    /** Which shape the client should read the components in. */
    version: number;
}

export interface ItemRegistry {
    items: ItemRegistryEntry[];
}

/**
 * Every item the client may be told about, and the number each travels as.
 *
 * This is the item table. Up to 1.21.60 it rode along in `StartGame` and this packet carried
 * only the components of custom items; now the definitions are here and `StartGame` has none
 * of them. A client that does not receive it cannot resolve a single item id.
 *
 * The components themselves are read and dropped. They are an NBT tree per entry describing
 * how a custom item behaves, which matters to a client that has to render and use one - and
 * not at all to a server that only needs the name and the number. Reading past them is not
 * optional even so: they are positional, so the entry after a skipped tree would be read from
 * the middle of it.
 */
export default class ItemRegistryPacket extends NetworkPacket<ItemRegistry> {
    public get id(): number {
        return PacketIdentifier.ITEM_REGISTRY;
    }

    protected serializePayload(): void {
        throw new Error('ItemRegistryPacket is decode-only: the component trees are not modelled');
    }

    protected deserializePayload(stream: NetworkBinaryStream): ItemRegistry {
        const items: ItemRegistryEntry[] = [];

        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            const name = stream.readString();
            const runtimeId = stream.readShortLE();
            const componentBased = stream.readBoolean();
            const version = stream.readVarInt();

            // Read for its length, not its contents - and read in the network dialect, whose
            // string lengths are varints. The same compound in the other encoding is three
            // bytes longer, so a reader on the wrong one walks into the next entry's name.
            const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
            reader.setUseVarint(true);
            reader.parse();

            items.push({ name, runtimeId, componentBased, version });
        }

        return { items };
    }
}
