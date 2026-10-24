import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ClientboundTextureShiftPacket, { TextureShiftAction } from './ClientboundTextureShiftPacket';

import type { ClientboundTextureShift } from './ClientboundTextureShiftPacket';

const DATA: ClientboundTextureShift = {
    action: TextureShiftAction.Start,
    collectionName: 'cave',
    fromStep: 'a',
    toStep: 'b',
    allSteps: ['a', 'b'],
    currentLengthInTicks: 300n,
    totalLengthInTicks: 1n << 32n,
    enabled: true
};

/** `DATA` on the wire, both header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xd0, 0x02], // packet id header, varuint32 336
    0x02, // Action ID: Start
    ...[0x04, 0x63, 0x61, 0x76, 0x65], // Collection Name "cave"
    ...[0x01, 0x61], // From Step "a"
    ...[0x01, 0x62], // To Step "b"
    0x02, // All Steps count, a varuint32
    ...[0x01, 0x61], // All Steps[0] "a"
    ...[0x01, 0x62], // All Steps[1] "b"
    ...[0xac, 0x02], // Current Length In Ticks: varuint64 300
    ...[0x80, 0x80, 0x80, 0x80, 0x10], // Total Length In Ticks: varuint64 2^32
    0x01 // Enabled
]);

describe('ClientboundTextureShiftPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new ClientboundTextureShiftPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ClientboundTextureShiftPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
