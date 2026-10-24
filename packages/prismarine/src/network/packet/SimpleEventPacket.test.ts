import { describe, expect, it } from 'vitest';
import SimpleEventPacket, { SimpleEventSubtype } from './SimpleEventPacket';

describe('SimpleEventPacket', () => {
    // Header 0x40, then the subtype as a little-endian uint16: two bytes, not one.
    const encoded = Buffer.from([0x40, 0x02, 0x00]);

    it('decodes the subtype, consuming the whole buffer', () => {
        const packet = new SimpleEventPacket(encoded);
        packet.decode();

        expect(packet.type).toBe(SimpleEventSubtype.DisableCommands);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the subtype back to the same bytes', () => {
        const packet = new SimpleEventPacket();
        packet.type = SimpleEventSubtype.DisableCommands;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
