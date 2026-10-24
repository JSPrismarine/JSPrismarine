import { describe, expect, it } from 'vitest';
import TickingAreasLoadStatusPacket from './TickingAreasLoadStatusPacket';

describe('TickingAreasLoadStatusPacket', () => {
    it('decodes the preload flag, consuming the whole buffer', () => {
        // Header: id 179 is 0xb3 0x01. The flag is a single byte.
        const packet = new TickingAreasLoadStatusPacket(Buffer.from([0xb3, 0x01, 0x01]));
        packet.decode();

        expect(packet.preload).toBe(true);
        expect(packet.feof()).toBe(true);
    });

    it('encodes a cleared flag as a zero byte', () => {
        const packet = new TickingAreasLoadStatusPacket();
        packet.preload = false;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0xb3, 0x01, 0x00]));
    });
});
