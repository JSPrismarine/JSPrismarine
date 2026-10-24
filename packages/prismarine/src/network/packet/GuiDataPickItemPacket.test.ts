import { describe, expect, it } from 'vitest';
import GuiDataPickItemPacket from './GuiDataPickItemPacket';

describe('GuiDataPickItemPacket', () => {
    // Header 0x36. "stone" after its length, an empty effect line, and slot 4 as a
    // little-endian int32.
    const encoded = Buffer.from([0x36, 0x05, 0x73, 0x74, 0x6f, 0x6e, 0x65, 0x00, 0x04, 0x00, 0x00, 0x00]);

    it('decodes both lines and the slot, consuming the whole buffer', () => {
        const packet = new GuiDataPickItemPacket(encoded);
        packet.decode();

        expect(packet.itemName).toBe('stone');
        expect(packet.itemEffectName).toBe('');
        expect(packet.slot).toBe(4);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the popup back to the same bytes', () => {
        const packet = new GuiDataPickItemPacket();
        packet.itemName = 'stone';
        packet.slot = 4;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
