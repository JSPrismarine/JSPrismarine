import { describe, expect, it } from 'vitest';
import HurtArmorPacket from './HurtArmorPacket';

describe('HurtArmorPacket', () => {
    // Header 0x26. Cause 2 zigzags to 4, damage 3 to 6, and the slot bitset 0b1010 is a
    // plain varuint.
    const encoded = Buffer.from([0x26, 0x04, 0x06, 0x0a]);

    it('decodes the cause, damage and slot bitset, consuming the whole buffer', () => {
        const packet = new HurtArmorPacket(encoded);
        packet.decode();

        expect(packet.cause).toBe(2);
        expect(packet.damage).toBe(3);
        expect(packet.armorSlots).toBe(0b1010n);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the damage back to the same bytes', () => {
        const packet = new HurtArmorPacket();
        packet.cause = 2;
        packet.damage = 3;
        packet.armorSlots = 0b1010n;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
