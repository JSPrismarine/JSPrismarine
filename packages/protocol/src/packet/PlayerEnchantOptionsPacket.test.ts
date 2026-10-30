import { describe, expect, it } from 'vitest';
import NetworkBinaryStream from '../NetworkBinaryStream';
import PlayerEnchantOptionsPacket, { EnchantType } from './PlayerEnchantOptionsPacket';

const OPTION = {
    cost: 5,
    enchants: {
        slot: 1,
        equipActivatedEnchants: [{ enchantType: EnchantType.PROTECTION, enchantLevel: 2 }],
        heldActivatedEnchants: [],
        selfActivatedEnchants: [{ enchantType: EnchantType.SHARPNESS, enchantLevel: 1 }]
    },
    enchantName: 'abc',
    enchantNetId: 7
};

const OPTION_BYTES = [
    0x05, // Cost.
    0x01,
    0x00,
    0x00,
    0x00, // Slot, int32 little-endian.
    0x01,
    0x00,
    0x02, // One equip-activated enchant: Protection at level 2.
    0x00, // No held-activated enchants.
    0x01,
    0x09,
    0x01, // One self-activated enchant: Sharpness at level 1.
    0x03,
    0x61,
    0x62,
    0x63, // Enchant Name "abc".
    0x07 // Enchant Net Id.
];

describe('PlayerEnchantOptionsPacket', () => {
    it('writes the option count, then cost, enchants, name, and net id', () => {
        const packet = new PlayerEnchantOptionsPacket({ options: [OPTION] });

        expect(packet.serialize(new NetworkBinaryStream())).toEqual(Buffer.from([0x92, 0x01, 0x01, ...OPTION_BYTES]));
    });

    it('writes an empty option list as a zero count, which clears the table', () => {
        const packet = new PlayerEnchantOptionsPacket({ options: [] });

        expect(packet.serialize(new NetworkBinaryStream())).toEqual(Buffer.from([0x92, 0x01, 0x00]));
    });

    it('reads one option and consumes the whole buffer', () => {
        const stream = new NetworkBinaryStream(Buffer.from([0x92, 0x01, 0x01, ...OPTION_BYTES]));
        const data = new PlayerEnchantOptionsPacket().deserialize(stream);

        expect(data.options).toEqual([OPTION]);
        expect(stream.feof()).toBe(true);
    });
});
