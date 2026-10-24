import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import FeatureRegistryPacket from './FeatureRegistryPacket';

import type { FeatureRegistry } from './FeatureRegistryPacket';

const DATA: FeatureRegistry = {
    features: [
        { name: 'minecraft:oak_tree', binaryJson: '{"a":1}' },
        { name: 'x', binaryJson: '' }
    ]
};

/** `DATA` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xbf, 0x01], // packet id header, 191 as a varuint32
    0x02, // FeaturesDataList count, a varuint32
    ...[0x12, ...Buffer.from('minecraft:oak_tree', 'utf8')], // Feature Name, 18 bytes
    ...[0x07, ...Buffer.from('{"a":1}', 'utf8')], // Binary Json Output, 7 bytes
    ...[0x01, 0x78], // Feature Name "x"
    0x00 // Binary Json Output ""
]);

/** What a dedicated server with no custom features sends: an empty list. */
const EMPTY: FeatureRegistry = { features: [] };

/** `EMPTY` on the wire: the header and a zero count. */
const EMPTY_BYTES = Buffer.from([0xbf, 0x01, 0x00]);

describe('FeatureRegistryPacket', () => {
    it('writes an empty registry as one payload byte', () => {
        const buffer = new FeatureRegistryPacket(EMPTY).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...EMPTY_BYTES]);
    });

    it('reads an empty registry to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const data = new FeatureRegistryPacket().deserialize(stream);

        expect(data).toEqual(EMPTY);
        expect(stream.feof()).toBe(true);
    });

    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new FeatureRegistryPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new FeatureRegistryPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
