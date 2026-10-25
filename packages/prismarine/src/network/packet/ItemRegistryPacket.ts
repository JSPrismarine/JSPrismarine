import { item_components as ItemComponents, item_table as ItemTable } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { ItemData, NetworkBinaryStream } from '@jsprismarine/protocol';

import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

import type { ItemRegistryEntry } from '@jsprismarine/protocol';

/**
 * An empty network NBT compound: TAG_Compound, an empty name, TAG_End.
 *
 * `Item Component Data` is positional, so an item without components still needs one, and the
 * next entry starts right after it. A Bedrock Dedicated Server writes exactly this for the
 * 1998 vanilla items that `@jsprismarine/bedrock-data` has no compound for.
 */
const EMPTY_COMPOUND = Buffer.from([0x0a, 0x00, 0x00]);

/**
 * The item table: every name the client may be shown, and the number it travels as.
 *
 * The docs call this `ItemRegistryPacket` (id 162). It goes out right after `StartGame`.
 * Since 1.21.60 it carries the item definitions that `StartGame` used to carry. A client that
 * does not receive it falls back to its own built-in table, which disagrees with ours for
 * part of the items, so it shows the wrong item for those ids.
 *
 * Every entry is what a Bedrock Dedicated Server 1.26.51.1 sends for the item: its id and
 * component flag from the capture, its `Item Version` from the same dump the components come
 * from. The 31 `DataDriven` items (the bundles, the spears, the trial keys, the apple) travel
 * with the compound the client builds them from; the rest, including 44 `component_based`
 * items the client already knows such as the arrow and the music discs, travel with the empty
 * compound, as they do from a Bedrock Dedicated Server.
 *
 * Wire layout: `Item Data` is a varuint count followed by one `ItemData` per entry:
 * `Item Name` (a `hashed_string`, which travels as an ordinary string), `Item Id` (int16
 * little endian, negative for a block's item form), `Is Component Based` (boolean),
 * `Item Version` (ZigZag varint32 of the docs enum `ItemVersion`: 0 `Legacy`, 1 `DataDriven`,
 * 2 `None`), and `Item Component Data` (network NBT compound with varint lengths, little
 * endian).
 */
export default class ItemRegistryPacket extends DataPacket {
    public static NetID = Identifiers.ItemRegistryPacket;

    /** Built once and kept. The table is identical for every player and every join. */
    private static cached: Buffer | null = null;

    /**
     * The entries to send, or null to send the captured table.
     *
     * Set from the item registry when the content build is on, which is what
     * makes a pack's own item reachable: the captured table names the 1998
     * items a Bedrock Dedicated Server knew and nothing else, so an item this
     * server resolved has to travel from the registry or not at all.
     */
    public entries: readonly ItemRegistryEntry[] | null = null;

    /** Writes `Item Data`, from {@link entries} or from the captured table. */
    public encodePayload(): void {
        this.write(
            this.entries === null ? ItemRegistryPacket.getTable() : ItemRegistryPacket.writeEntries(this.entries)
        );
    }

    /** Writes one `ItemData` per entry, which is the layout the captured table is written in too. */
    private static writeEntries(entries: readonly ItemRegistryEntry[]): Buffer {
        const stream = new NetworkBinaryStream();

        stream.writeUnsignedVarInt(entries.length);
        for (const entry of entries) {
            new ItemData(
                entry.name,
                entry.runtimeId,
                entry.componentBased,
                entry.version,
                entry.componentData
            ).serialize(stream);
        }

        return stream.getBuffer();
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
            stream.writeVarInt(entry.version);
            stream.write(ItemComponents[name] ?? EMPTY_COMPOUND);
        }

        ItemRegistryPacket.cached = stream.getBuffer();
        return ItemRegistryPacket.cached;
    }
}
