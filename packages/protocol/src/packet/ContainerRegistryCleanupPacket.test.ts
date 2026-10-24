import { ContainerUiId } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import FullContainerName from '../structure/FullContainerName';
import ContainerRegistryCleanupPacket from './ContainerRegistryCleanupPacket';

import type { ContainerRegistryCleanup } from './ContainerRegistryCleanupPacket';

const DATA: ContainerRegistryCleanup = {
    removedContainers: [
        new FullContainerName(ContainerUiId.DYNAMIC_CONTAINER, 0x01020304),
        new FullContainerName(ContainerUiId.BARREL_CONTAINER, null)
    ]
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xbd, 0x02], // packet id header, 317 as a varuint32
    0x02, // Removed Containers count, a varuint32
    0x3f, // Container Name: DynamicContainer
    0x01, // Dynamic ID present
    ...[0x04, 0x03, 0x02, 0x01], // Dynamic ID 0x01020304, little-endian uint32
    0x3a, // Container Name: BarrelContainer
    0x00 // Dynamic ID absent
]);

/** An empty cleanup: the header and a zero count. */
const EMPTY_BYTES = Buffer.from([0xbd, 0x02, 0x00]);

describe('ContainerRegistryCleanupPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new ContainerRegistryCleanupPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ContainerRegistryCleanupPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes an empty list as a single zero count byte', () => {
        const buffer = new ContainerRegistryCleanupPacket({ removedContainers: [] }).serialize(
            new NetworkBinaryStream()
        );

        expect([...buffer]).toEqual([...EMPTY_BYTES]);
    });

    it('reads an empty list', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const data = new ContainerRegistryCleanupPacket().deserialize(stream);

        expect(data).toEqual({ removedContainers: [] });
        expect(stream.feof()).toBe(true);
    });
});
