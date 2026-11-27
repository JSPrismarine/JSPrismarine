import { entity_identifiers } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound } from '@jsprismarine/nbt';

/**
 * The `id` of every `ActorInfo` in an `AvailableActorIdentifiersPacket` payload.
 *
 * @param payload - The payload, as `@jsprismarine/bedrock-data` keeps it; the default protocol's
 *   unless given.
 * @returns The identifiers, such as `minecraft:zombie`.
 */
export const advertisedActorTypes = (payload: Buffer = entity_identifiers): Set<string> => {
    const reader = new NBTReader(new BinaryStream(payload), ByteOrder.LITTLE_ENDIAN);
    reader.setUseVarint(true);
    const idlist = reader.parse().getList('idlist', false) ?? [];

    const ids = new Set<string>();
    for (const entry of idlist) {
        if (entry instanceof NBTTagCompound) ids.add(entry.getString('id', ''));
    }
    return ids;
};
