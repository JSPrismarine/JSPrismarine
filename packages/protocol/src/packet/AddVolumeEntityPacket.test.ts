import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import AddVolumeEntityPacket from './AddVolumeEntityPacket';

import type { AddVolumeEntity } from './AddVolumeEntityPacket';

const components = new NBTTagCompound('');
components.addValue('fog_identifier', new Types.StringVal('minecraft:fog_default'));

const DATA: AddVolumeEntity = {
    entityNetworkId: 300,
    components,
    jsonIdentifier: 'custom:fog_volume',
    instanceName: 'fog_1',
    minBounds: new BlockPos(-16, 0, -16),
    maxBounds: new BlockPos(15, 64, 15),
    dimension: 1,
    engineVersion: '1.26.51'
};

/** A string as the protocol writes it: a varuint32 byte length, then UTF-8. */
const str = (text: string): number[] => [text.length, ...Buffer.from(text, 'utf8')];

/** `DATA` on the wire, header byte included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xa6, 0x01], // packet id header: 166 as a varuint32
    ...[0xac, 0x02], // Entity Network Id: 300 as a varuint32
    0x0a, // Components: TAG_Compound
    0x00, // root name, a varuint32 length of 0
    0x08, // TAG_String
    ...str('fog_identifier'), // entry name
    ...str('minecraft:fog_default'), // entry value
    0x00, // TAG_End
    ...str('custom:fog_volume'), // JSON Identifier
    ...str('fog_1'), // Instance Name
    ...[0x1f, 0x00, 0x1f], // Min Bounds: ZigZag(-16), ZigZag(0), ZigZag(-16)
    ...[0x1e, 0x80, 0x01, 0x1e], // Max Bounds: ZigZag(15), ZigZag(64) = 128, ZigZag(15)
    0x02, // Dimension Type: ZigZag(1), the Nether
    ...str('1.26.51') // Engine Version
]);

describe('AddVolumeEntityPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new AddVolumeEntityPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new AddVolumeEntityPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(data.components.getString('fog_identifier', '')).toBe('minecraft:fog_default');
        expect(stream.feof()).toBe(true);
    });

    it('round-trips through its own serializer', () => {
        const buffer = new AddVolumeEntityPacket(DATA).serialize(new NetworkBinaryStream());
        const data = new AddVolumeEntityPacket().deserialize(new NetworkBinaryStream(buffer));

        expect(data).toEqual(DATA);
    });
});
