import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader } from '@jsprismarine/nbt';
import ItemRegistryPacket from '@jsprismarine/protocol/packet/ItemRegistryPacket';
import { netIdFor } from '@jsprismarine/protocol/wire/versions/v2193';
import { itemDataForProtocol } from '@jsprismarine/prismarine/network/codec/itemData';

/**
 * The item numbering a session speaking `protocolVersion` is sent: the server's own
 * `ItemRegistryPacket` for that version, decoded name by name.
 *
 * The registry is server-authoritative, so a session sent the wrong table is not a refused join
 * and nothing else fails loudly when the per-version wiring breaks.
 * @param protocolVersion - The protocol the session negotiated.
 * @returns Each item name and the runtime id it travels as.
 * @throws When the packet carries another id or bytes past its entries.
 */
export const itemRegistrySentAt = (protocolVersion: number): Map<string, number> => {
    const packet = new ItemRegistryPacket();
    packet.encode({ protocolVersion, itemData: itemDataForProtocol(protocolVersion) });

    const stream = new BinaryStream(packet.getBuffer());
    const id = stream.readUnsignedVarInt();
    if (id !== netIdFor('ItemRegistryPacket')) throw new Error(`ItemRegistryPacket encoded with id ${id}`);

    const sent = new Map<string, number>();
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        const length = stream.readUnsignedVarInt();
        const name = stream.read(length).toString('utf-8');
        const runtimeId = stream.readShortLE();
        stream.readBoolean();
        stream.readVarInt();
        // The positional component compound, read past rather than parsed.
        const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(true);
        reader.parse();
        sent.set(name, runtimeId);
    }

    if (!stream.feof()) throw new Error('ItemRegistryPacket carries bytes past its entries');
    return sent;
};
