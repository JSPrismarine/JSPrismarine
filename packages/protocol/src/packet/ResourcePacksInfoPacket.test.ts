import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ResourcePacksInfoPacket from './ResourcePacksInfoPacket';

import type { ResourcePacksInfo } from './ResourcePacksInfoPacket';

const DATA: ResourcePacksInfo = {
    resourcePackRequired: true,
    hasAddonPacks: false,
    hasScripts: true,
    forceDisableVibrantVisuals: true,
    worldTemplate: { uuidMostSignificant: 0n, uuidLeastSignificant: 0n, version: '' },
    packs: [
        {
            id: {
                uuidMostSignificant: 0x0102030405060708n,
                uuidLeastSignificant: 0x090a0b0c0d0e0f10n,
                version: '1.0.0'
            },
            sizeBytes: 1234n,
            contentKey: 'k',
            subPackName: '',
            contentIdentity: 'id',
            hasScripts: true,
            isAddonPack: false,
            isRayTracingCapable: true,
            cdnUrl: 'https://cdn.example/pack.zip'
        }
    ]
};

/** `DATA` on the wire, header byte included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    0x06, // packet id header
    0x01, // Resource Pack Required
    0x00, // Has Addon Packs
    0x01, // Has Scripts
    0x01, // Force Disable Vibrant Visuals
    ...Array.from({ length: 16 }, () => 0x00), // World Template Id And Version: an all-zero uuid
    0x00, // and an empty version
    0x01, // Resource Packs count, a varuint32
    ...[0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01], // Most Significant Bits, little-endian uint64
    ...[0x10, 0x0f, 0x0e, 0x0d, 0x0c, 0x0b, 0x0a, 0x09], // Least Significant Bits, little-endian uint64
    ...[0x05, 0x31, 0x2e, 0x30, 0x2e, 0x30], // Pack Version "1.0.0"
    ...[0xd2, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // Pack Size 1234, little-endian uint64
    ...[0x01, 0x6b], // Content Key "k"
    0x00, // Subpack Name ""
    ...[0x02, 0x69, 0x64], // Content Identity "id"
    0x01, // Has Scripts
    0x00, // Is Addon Pack
    0x01, // Is Ray Tracing Capable
    ...[0x1c, ...Buffer.from('https://cdn.example/pack.zip', 'utf8')] // CDN URL, 28 bytes
]);

describe('ResourcePacksInfoPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new ResourcePacksInfoPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ResourcePacksInfoPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
