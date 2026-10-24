import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import RecordStartedPacket from './RecordStartedPacket';

import type { RecordStarted } from './RecordStartedPacket';

const DATA: RecordStarted = {
    position: new BlockPos(-3, 64, 1000),
    serverSoundHandle: 0x0102030405060708n
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xe0, 0x02], // packet id header: 352 as a varuint32
    0x05, // Block Position X -3, ZigZag varint32
    ...[0x80, 0x01], // Block Position Y 64, ZigZag varint32 (128)
    ...[0xd0, 0x0f], // Block Position Z 1000, ZigZag varint32 (2000)
    ...[0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01] // Server Sound Handle, little-endian uint64
]);

describe('RecordStartedPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new RecordStartedPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new RecordStartedPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
