import { describe, expect, it } from 'vitest';
import ShowProfilePacket from './ShowProfilePacket';

// Header: id 104 is 0x68. The XUID "25" is a varuint length of 2 then the two ASCII digits.
const BYTES = Buffer.from([0x68, 0x02, 0x32, 0x35]);

describe('ShowProfilePacket', () => {
    it('decodes the XUID string, consuming the whole buffer', () => {
        const packet = new ShowProfilePacket(BYTES);
        packet.decode();

        expect(packet.xuid).toBe('25');
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new ShowProfilePacket();
        packet.xuid = '25';
        packet.encode();

        expect(packet.getBuffer()).toEqual(BYTES);
    });
});
