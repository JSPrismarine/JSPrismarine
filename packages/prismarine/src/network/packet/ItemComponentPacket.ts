import { item_table as ItemTable } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { NBTTagCompound, NBTWriter } from '@jsprismarine/nbt';

import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * The version tag on an entry, telling the client how to read the components that follow.
 *
 * `1` is the shape every current client understands. It is not the protocol version and it
 * does not move with it.
 */
const ENTRY_VERSION = 1;

/**
 * The item table: every name the client may be shown, and the number it travels as.
 *
 * This packet used to carry only the components of custom items while the definitions rode in
 * `StartGame`. At 1.21.60 they swapped: the definitions moved here and `StartGame` lost them,
 * so a server that still writes them there sends seventeen hundred entries where the client
 * expects a correlation id, and one that leaves this empty gives the client nothing to resolve
 * a single item id against.
 *
 * What an item network id *means* is decided here. Sent empty - as it was - the client falls
 * back to its own built-in table, which agrees with this server for some items and quietly
 * disagrees for the rest: an oak log goes out under whatever item shares its legacy block id.
 */
export default class ItemComponentPacket extends DataPacket {
    public static NetID = Identifiers.ItemComponentPacket;

    /** Built once and kept: two thousand entries, identical for every player and every join. */
    private static cached: Buffer | null = null;

    public encodePayload(): void {
        this.write(ItemComponentPacket.getTable());
    }

    private static getTable(): Buffer {
        if (ItemComponentPacket.cached) return ItemComponentPacket.cached;

        const stream = new BinaryStream();
        const entries = Object.entries(ItemTable) as Array<[string, (typeof ItemTable)[string]]>;

        stream.writeUnsignedVarInt(entries.length);
        for (const [name, entry] of entries) {
            NetworkUtil.writeString(stream, name);
            stream.writeShortLE(entry.runtime_id);
            stream.writeBoolean(entry.component_based);
            stream.writeVarInt(ENTRY_VERSION);

            // The components themselves, which this server has none of. An empty compound is
            // still three bytes and still has to be there - the entry after it is read from
            // wherever this one stops.
            const components = new NBTWriter(stream, 1);
            components.setUseVarint(true);
            components.writeCompound(new NBTTagCompound());
        }

        ItemComponentPacket.cached = stream.getBuffer();
        return ItemComponentPacket.cached;
    }
}
