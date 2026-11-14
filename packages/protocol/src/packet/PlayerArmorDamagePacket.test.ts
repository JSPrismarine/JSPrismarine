import { describe, expect, it } from 'vitest';

import { ArmorSlot } from '@jsprismarine/minecraft';
import PlayerArmorDamagePacket from './PlayerArmorDamagePacket';

// Packet id 149 as a varuint.
const HEADER = [0x95, 0x01];

const PAIRS = [
    0x02, // two pairs
    0x00,
    0x05,
    0x00, // Head, damage 5 as an int16 little-endian
    0x08,
    0xff,
    0xff // Body ZigZag encoded, damage -1
];

describe('PlayerArmorDamagePacket', () => {
    it('writes the pair count, each slot as a ZigZag varint32 and each damage as an int16', () => {
        const packet = new PlayerArmorDamagePacket();
        packet.armorSlotAndDamagePairs = [
            { armorSlot: ArmorSlot.HEAD, damage: 5 },
            { armorSlot: ArmorSlot.BODY, damage: -1 }
        ];
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, ...PAIRS]));
    });

    it('writes no pairs as a zero count', () => {
        const packet = new PlayerArmorDamagePacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0x00]));
    });

    it('reads both pairs and consumes the whole buffer', () => {
        const packet = new PlayerArmorDamagePacket();
        packet.setReadBuffer(Buffer.from([...HEADER, ...PAIRS]));
        packet.decode();

        expect(packet.armorSlotAndDamagePairs).toEqual([
            { armorSlot: ArmorSlot.HEAD, damage: 5 },
            { armorSlot: ArmorSlot.BODY, damage: -1 }
        ]);
        expect(packet.feof()).toBe(true);
    });

    it.each([2193, 2225])('writes and reads the same bytes at protocol %i', (protocol) => {
        const encoded = new PlayerArmorDamagePacket();
        encoded.codecProtocol = protocol;
        encoded.armorSlotAndDamagePairs = [
            { armorSlot: ArmorSlot.HEAD, damage: 5 },
            { armorSlot: ArmorSlot.BODY, damage: -1 }
        ];
        encoded.encode();
        expect(encoded.getBuffer()).toEqual(Buffer.from([...HEADER, ...PAIRS]));

        const decoded = new PlayerArmorDamagePacket();
        decoded.codecProtocol = protocol;
        decoded.setReadBuffer(encoded.getBuffer());
        decoded.decode();
        expect(decoded.armorSlotAndDamagePairs).toEqual(encoded.armorSlotAndDamagePairs);
        expect(decoded.feof()).toBe(true);
    });
});
