import { describe, expect, it } from 'vitest';
import { netIdFor } from '../codec/v2193';

import Identifiers from '../Identifiers';
import ResourcePacksInfoPacket from './ResourcePacksInfoPacket';

import type { ResourcePackEntry } from './ResourcePacksInfoPacket';

/** A uuid of all zeroes and an empty version: this world came from no template. */
const NO_WORLD_TEMPLATE = [...Array.from({ length: 16 }, () => 0x00), 0x00];

const ENTRY: ResourcePackEntry = {
    id: { uuidMostSignificant: 0x0102030405060708n, uuidLeastSignificant: 0x090a0b0c0d0e0f10n, version: '1.0.0' },
    size: 1234n,
    contentKey: 'k',
    subPackName: '',
    contentIdentity: 'id',
    hasScripts: true,
    isAddonPack: false,
    isRayTracingCapable: true,
    cdnUrl: 'https://cdn.example/pack.zip'
};

/** `ENTRY` as a `PackInfoData`, written by hand in the order the docs list its fields. */
const ENTRY_BYTES = [
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
];

/** The whole payload for one pack with every top-level flag off and no world template. */
const ONE_PACK_PAYLOAD = [0x00, 0x00, 0x00, 0x00, ...NO_WORLD_TEMPLATE, 0x01, ...ENTRY_BYTES];

describe('network', () => {
    describe('packet', () => {
        describe('ResourcePacksInfoPacket', () => {
            const encode = (mutate: (pk: ResourcePacksInfoPacket) => void = () => {}) => {
                const pk = new ResourcePacksInfoPacket();
                pk.resourcePackRequired = false;
                pk.hasAddonPacks = false;
                pk.hasScripts = false;
                mutate(pk);
                pk.encode();
                return pk.getBuffer();
            };

            it('encodes exactly the fields protocol 2193 defines', () => {
                const payload = encode().subarray(1); // drop the packet id header

                expect([...payload]).toEqual([
                    0x00, // Resource Pack Required
                    0x00, // Has Addon Packs
                    0x00, // Has Scripts
                    0x00, // Force Disable Vibrant Visuals
                    ...NO_WORLD_TEMPLATE, // World Template Id And Version
                    0x00 // Resource Packs count, a varuint32
                ]);
            });

            it('carries the flags it is given', () => {
                const payload = encode((pk) => {
                    pk.resourcePackRequired = true;
                    pk.hasAddonPacks = false;
                    pk.hasScripts = true;
                }).subarray(1);

                expect([...payload]).toEqual([0x01, 0x00, 0x01, 0x00, ...NO_WORLD_TEMPLATE, 0x00]);
            });

            it('writes Force Disable Vibrant Visuals as the fourth byte', () => {
                const payload = encode((pk) => {
                    pk.forceDisableVibrantVisuals = true;
                }).subarray(1);

                expect([...payload]).toEqual([0x00, 0x00, 0x00, 0x01, ...NO_WORLD_TEMPLATE, 0x00]);
            });

            it('writes the world template as two little-endian uuid halves and a version', () => {
                const payload = encode((pk) => {
                    pk.worldTemplate = ENTRY.id;
                }).subarray(1);

                expect([...payload]).toEqual([0x00, 0x00, 0x00, 0x00, ...ENTRY_BYTES.slice(0, 22), 0x00]);
            });

            it('writes every field of a pack entry in docs order', () => {
                const payload = encode((pk) => {
                    pk.resourcePackEntries = [ENTRY];
                }).subarray(1);

                expect([...payload]).toEqual(ONE_PACK_PAYLOAD);
            });

            it('reads a hand-built buffer to its end', () => {
                const pk = new ResourcePacksInfoPacket();
                pk.setReadBuffer(Buffer.from([0x06, ...ONE_PACK_PAYLOAD]));
                pk.decode();

                expect(pk.resourcePackRequired).toBe(false);
                expect(pk.hasAddonPacks).toBe(false);
                expect(pk.hasScripts).toBe(false);
                expect(pk.forceDisableVibrantVisuals).toBe(false);
                expect(pk.worldTemplate).toEqual({ uuidMostSignificant: 0n, uuidLeastSignificant: 0n, version: '' });
                expect(pk.resourcePackEntries).toEqual([ENTRY]);
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(netIdFor('ResourcePacksInfoPacket')).toBe(Identifiers.ResourcePacksInfoPacket);
                expect(netIdFor('ResourcePacksInfoPacket')).toBe(0x06);
            });
        });
    });
});
