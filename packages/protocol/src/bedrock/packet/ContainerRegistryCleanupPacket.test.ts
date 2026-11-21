import { ContainerUiId } from '@jsprismarine/minecraft';
import { ContainerUiId as ContainerUiId2193 } from '@jsprismarine/minecraft/generated/v2193/ContainerUiId';
import { ContainerUiId as ContainerUiId2225 } from '@jsprismarine/minecraft/generated/v2225/ContainerUiId';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
import FullContainerName from '../structure/FullContainerName';
import ContainerRegistryCleanupPacket from './ContainerRegistryCleanupPacket';

import type { ContainerRegistryCleanup } from './ContainerRegistryCleanupPacket';
import { enumDumpMembers } from '../../testing/evidence.test.helper';

/** Member names compared without case, underscores or a trailing `Container`: the generated enum drops it from a few names. */
const compact = (name: string): string =>
    name
        .replaceAll('_', '')
        .replace(/container$/i, '')
        .toLowerCase();

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

    it.each([
        ['2193', ContainerUiId2193],
        ['2225', ContainerUiId2225]
    ])('numbers Container Name at protocol %s the way the pinned game dump does', (_protocol, generated) => {
        const dump = enumDumpMembers('ContainerEnumName');

        expect(dump).toHaveLength(67);
        for (const { name, value } of dump) {
            // A numeric enum maps its values back to their member names.
            expect(compact(generated[value] ?? ''), name).toBe(compact(name));
        }
    });

    it.each([2193, 2225])('writes and reads the same bytes at protocol %i', (protocol) => {
        const packet = new ContainerRegistryCleanupPacket(DATA);
        packet.codecProtocol = protocol;
        expect([...packet.serialize(new NetworkBinaryStream())]).toEqual([...BYTES]);

        const reader = new ContainerRegistryCleanupPacket();
        reader.codecProtocol = protocol;
        const stream = new NetworkBinaryStream(BYTES);
        expect(reader.deserialize(stream)).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('adds the four reserved container names at protocol 2225 only', () => {
        expect(ContainerUiId2225.RESERVED_CONTAINER_A).toBe(67);
        expect(ContainerUiId2225.RESERVED_CONTAINER_D).toBe(70);
        expect('RESERVED_CONTAINER_A' in ContainerUiId2193).toBe(false);
    });
});
