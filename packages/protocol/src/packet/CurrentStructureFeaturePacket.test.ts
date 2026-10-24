import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import CurrentStructureFeaturePacket from './CurrentStructureFeaturePacket';

import type { CurrentStructureFeature } from './CurrentStructureFeaturePacket';

const DATA: CurrentStructureFeature = { currentStructureFeature: 'minecraft:village' };

/** `DATA` on the wire, header included. */
const BYTES = Buffer.from([
    ...[0xba, 0x02], // packet id header: 314 as a varuint32
    ...[0x11, ...Buffer.from('minecraft:village', 'utf8')] // Current Structure Feature, 17 bytes
]);

/** A player outside every structure: the header and an empty string. */
const NONE: CurrentStructureFeature = { currentStructureFeature: '' };
const NONE_BYTES = Buffer.from([0xba, 0x02, 0x00]);

describe('CurrentStructureFeaturePacket', () => {
    it('writes the structure identifier as a length-prefixed string', () => {
        const buffer = new CurrentStructureFeaturePacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new CurrentStructureFeaturePacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes no structure as a single zero byte after the header', () => {
        const buffer = new CurrentStructureFeaturePacket(NONE).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...NONE_BYTES]);
    });

    it('reads no structure back as an empty string', () => {
        const stream = new NetworkBinaryStream(NONE_BYTES);

        expect(new CurrentStructureFeaturePacket().deserialize(stream)).toEqual(NONE);
        expect(stream.feof()).toBe(true);
    });
});
