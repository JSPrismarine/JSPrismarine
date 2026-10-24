import { describe, expect, it } from 'vitest';

import PlayerEnchantOptionsPacket, { EnchantType } from './PlayerEnchantOptionsPacket';

// Packet id 146 as a varuint.
const HEADER = [0x92, 0x01];

const OPTION = {
    cost: 5,
    enchants: {
        slot: 1,
        equipActivatedEnchants: [{ enchantType: EnchantType.Protection, enchantLevel: 2 }],
        heldActivatedEnchants: [],
        selfActivatedEnchants: [{ enchantType: EnchantType.Sharpness, enchantLevel: 1 }]
    },
    enchantName: 'abc',
    enchantNetId: 7
};

const OPTION_BYTES = [
    0x05, // Cost
    0x01,
    0x00,
    0x00,
    0x00, // Slot, int32 little-endian
    0x01,
    0x00,
    0x02, // one equip activated enchant: Protection at level 2
    0x00, // no held activated enchants
    0x01,
    0x09,
    0x01, // one self activated enchant: Sharpness at level 1
    0x03,
    0x61,
    0x62,
    0x63, // Enchant Name "abc"
    0x07 // Enchant Net Id
];

describe('PlayerEnchantOptionsPacket', () => {
    it('writes the option count, then the cost, slot, three enchant lists, name and net id', () => {
        const packet = new PlayerEnchantOptionsPacket();
        packet.options = [OPTION];
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0x01, ...OPTION_BYTES]));
    });

    it('writes an empty option list as a zero count, which clears the table', () => {
        const packet = new PlayerEnchantOptionsPacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0x00]));
    });

    it('reads one option and consumes the whole buffer', () => {
        const packet = new PlayerEnchantOptionsPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, 0x01, ...OPTION_BYTES]));
        packet.decode();

        expect(packet.options).toEqual([OPTION]);
        expect(packet.feof()).toBe(true);
    });
});
