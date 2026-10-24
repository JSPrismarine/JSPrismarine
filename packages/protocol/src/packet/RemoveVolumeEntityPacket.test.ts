import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import RemoveVolumeEntityPacket from './RemoveVolumeEntityPacket';

import type { RemoveVolumeEntity } from './RemoveVolumeEntityPacket';

const DATA: RemoveVolumeEntity = {
    entityNetworkId: 300,
    dimension: 1
};

/** `DATA` on the wire, header byte included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xa7, 0x01], // packet id header: 167 as a varuint32
    ...[0xac, 0x02], // Entity Network Id: 300 as a varuint32
    0x02 // Dimension Type: ZigZag(1), the Nether
]);

describe('RemoveVolumeEntityPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new RemoveVolumeEntityPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new RemoveVolumeEntityPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips through its own serializer', () => {
        const buffer = new RemoveVolumeEntityPacket(DATA).serialize(new NetworkBinaryStream());
        const data = new RemoveVolumeEntityPacket().deserialize(new NetworkBinaryStream(buffer));

        expect(data).toEqual(DATA);
    });
});
