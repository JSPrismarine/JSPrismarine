import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import TrimDataPacket from './TrimDataPacket';

import type { TrimData } from './TrimDataPacket';

const DATA: TrimData = {
    patterns: [{ itemName: 'minecraft:sentry_armor_trim_smithing_template', patternId: 'sentry' }],
    materials: [{ materialId: 'quartz', color: '§h', itemName: 'minecraft:quartz' }]
};

/** `DATA` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xae, 0x02], // packet id header, 302 as a varuint32
    0x01, // TrimPattern List count, a varuint32
    ...[0x2d, ...Buffer.from('minecraft:sentry_armor_trim_smithing_template', 'utf8')], // Item Name, 45 bytes
    ...[0x06, ...Buffer.from('sentry', 'utf8')], // Pattern Id
    0x01, // TrimMaterial List count, a varuint32
    ...[0x06, ...Buffer.from('quartz', 'utf8')], // Material Id
    ...[0x03, 0xc2, 0xa7, 0x68], // Color "§h", three UTF-8 bytes
    ...[0x10, ...Buffer.from('minecraft:quartz', 'utf8')] // Item Name, 16 bytes
]);

/** No patterns and no materials: the header, then two zero counts. */
const EMPTY: TrimData = { patterns: [], materials: [] };
const EMPTY_BYTES = Buffer.from([0xae, 0x02, 0x00, 0x00]);

describe('TrimDataPacket', () => {
    it('writes empty lists as two zero counts', () => {
        const buffer = new TrimDataPacket(EMPTY).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...EMPTY_BYTES]);
    });

    it('reads empty lists to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const data = new TrimDataPacket().deserialize(stream);

        expect(data).toEqual(EMPTY);
        expect(stream.feof()).toBe(true);
    });

    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new TrimDataPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new TrimDataPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips several entries per list', () => {
        const data: TrimData = {
            patterns: [
                { itemName: 'minecraft:coast_armor_trim_smithing_template', patternId: 'coast' },
                { itemName: 'minecraft:dune_armor_trim_smithing_template', patternId: 'dune' }
            ],
            materials: [
                { materialId: 'iron', color: '§i', itemName: 'minecraft:iron_ingot' },
                { materialId: 'gold', color: '§p', itemName: 'minecraft:gold_ingot' },
                { materialId: 'emerald', color: '§q', itemName: 'minecraft:emerald' }
            ]
        };
        const buffer = new TrimDataPacket(data).serialize(new NetworkBinaryStream());
        const stream = new NetworkBinaryStream(buffer);

        expect(new TrimDataPacket().deserialize(stream)).toEqual(data);
        expect(stream.feof()).toBe(true);
    });
});
