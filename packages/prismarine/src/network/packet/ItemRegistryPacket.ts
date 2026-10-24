import { item_table as ItemTable } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound, NBTWriter } from '@jsprismarine/nbt';

import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * The `Item Version` of every entry we send, from the docs enum `ItemVersion`
 * (0 `Legacy`, 1 `DataDriven`, 2 `None`).
 *
 * We send `DataDriven` with an empty `Item Component Data` compound for every entry. The
 * captured item table (`required_item_list.json` in `@jsprismarine/bedrock-data`, written by
 * `packages/client/tools/capture-server-data.mjs`) records no per-item version or components,
 * and the client accepts that.
 */
const ENTRY_VERSION = 1;

/**
 * The item table: every name the client may be shown, and the number it travels as.
 *
 * The docs call this `ItemRegistryPacket` (id 162). It goes out right after `StartGame`.
 * Since 1.21.60 it carries the item definitions that `StartGame` used to carry. A client that
 * does not receive it falls back to its own built-in table, which disagrees with ours for
 * part of the items, so it shows the wrong item for those ids.
 *
 * Wire layout: `Item Data` is a varuint count followed by one `ItemData` per entry:
 * `Item Name` (a `hashed_string`, which travels as an ordinary string), `Item Id` (int16
 * little endian, negative for a block's item form), `Is Component Based` (boolean),
 * `Item Version` (varint32, see {@link ENTRY_VERSION}), and `Item Component Data` (network
 * NBT compound with varint lengths, little endian).
 */
export default class ItemRegistryPacket extends DataPacket {
    public static NetID = Identifiers.ItemRegistryPacket;

    /** Built once and kept. The table is identical for every player and every join. */
    private static cached: Buffer | null = null;

    /** Writes `Item Data`, which is the same bytes for every player; see {@link getTable}. */
    public encodePayload(): void {
        this.write(ItemRegistryPacket.getTable());
    }

    private static getTable(): Buffer {
        if (ItemRegistryPacket.cached) return ItemRegistryPacket.cached;

        const stream = new BinaryStream();
        const entries = Object.entries(ItemTable);

        stream.writeUnsignedVarInt(entries.length);
        for (const [name, entry] of entries) {
            NetworkUtil.writeString(stream, name);
            stream.writeShortLE(entry.runtime_id);
            stream.writeBoolean(entry.component_based);
            stream.writeVarInt(ENTRY_VERSION);

            // This server has no components, but the compound is positional. An empty one is
            // three bytes (0x0a 0x00 0x00) and the next entry starts right after it.
            const components = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
            components.setUseVarint(true);
            components.writeCompound(new NBTTagCompound());
        }

        ItemRegistryPacket.cached = stream.getBuffer();
        return ItemRegistryPacket.cached;
    }
}
