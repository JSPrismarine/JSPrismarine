import { describe, expect, it } from 'vitest';
import { netIdFor } from '../codec/v2193';

import Identifiers from '../Identifiers';
import FeatureRegistryPacket from './FeatureRegistryPacket';

/** Two features, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xbf, 0x01], // packet id header, 191 as a varuint32
    0x02, // FeaturesDataList count, a varuint32
    ...[0x12, ...Buffer.from('minecraft:oak_tree', 'utf8')], // Feature Name, 18 bytes
    ...[0x07, ...Buffer.from('{"a":1}', 'utf8')], // Binary Json Output, 7 bytes
    ...[0x01, 0x78], // Feature Name "x"
    0x00 // Binary Json Output ""
]);

/** What a dedicated server with no custom features sends: the header and a zero count. */
const EMPTY_BYTES = Buffer.from([0xbf, 0x01, 0x00]);

describe('FeatureRegistryPacket', () => {
    it('writes an empty registry as one payload byte, by default', () => {
        const packet = new FeatureRegistryPacket();
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([...EMPTY_BYTES]);
    });

    it('reads an empty registry to the end of the buffer', () => {
        const packet = new FeatureRegistryPacket(EMPTY_BYTES);
        packet.decode();

        expect(packet.features).toEqual([]);
        expect(packet.feof()).toBe(true);
    });

    it('writes every field in the order protocol 2193 defines', () => {
        const packet = new FeatureRegistryPacket();
        packet.features = [
            { name: 'minecraft:oak_tree', binaryJson: '{"a":1}' },
            { name: 'x', binaryJson: '' }
        ];
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const packet = new FeatureRegistryPacket(BYTES);
        packet.decode();

        expect(packet.features).toEqual([
            { name: 'minecraft:oak_tree', binaryJson: '{"a":1}' },
            { name: 'x', binaryJson: '' }
        ]);
        expect(packet.feof()).toBe(true);
    });

    it('uses the network id the client expects', () => {
        expect(netIdFor('FeatureRegistryPacket')).toBe(Identifiers.FeatureRegistryPacket);
        expect(netIdFor('FeatureRegistryPacket')).toBe(0xbf);
    });
});
