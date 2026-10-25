import { entity_identifiers } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { FallingBlock, writtenEntities } from './Entities';

/** The `id` of every `ActorInfo` the server advertises in `AvailableActorIdentifiersPacket`. */
const advertisedActorTypes = (): Set<string> => {
    const reader = new NBTReader(new BinaryStream(entity_identifiers), ByteOrder.LITTLE_ENDIAN);
    reader.setUseVarint(true);
    const idlist = reader.parse().getList('idlist', false) ?? [];

    const ids = new Set<string>();
    for (const entry of idlist) {
        if (entry instanceof NBTTagCompound) ids.add(entry.getString('id', ''));
    }
    return ids;
};

describe('Entities', () => {
    it('spawns every written entity under a minecraft: type the client was told about', () => {
        // `AddActorPacket` names the actor by its type string, and the client only draws a
        // type it found in `AvailableActorIdentifiersPacket`. A type outside that list is an
        // invisible entity on the client, with no error on either side. `evoker_illager`,
        // `chalkboard`, `moving_block` and `shield` were all sent this way.
        const advertised = advertisedActorTypes();

        const unknown = [...writtenEntities().values(), FallingBlock]
            .filter((written) => !advertised.has(written.MOB_ID))
            .map((written) => `${written.name} spawns as ${written.MOB_ID}`);

        expect(unknown).toEqual([]);
    });
});
