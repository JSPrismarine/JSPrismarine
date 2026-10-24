import { describe, expect, it } from 'vitest';
import UpdateClientOptionsPacket, { GraphicsMode } from './UpdateClientOptionsPacket';

describe('UpdateClientOptionsPacket', () => {
    // Header: id 323 as LEB128 is 0xc3 0x02.
    it('decodes both optionals when present and consumes the whole buffer', () => {
        const packet = new UpdateClientOptionsPacket(Buffer.from([0xc3, 0x02, 0x01, 0x02, 0x01, 0x01]));
        packet.decode();

        expect(packet.graphicsMode).toBe(GraphicsMode.Advanced);
        expect(packet.filterProfanity).toBe(true);
        expect(packet.feof()).toBe(true);
    });

    it('decodes an absent graphics mode alongside a present filter', () => {
        const packet = new UpdateClientOptionsPacket(Buffer.from([0xc3, 0x02, 0x00, 0x01, 0x00]));
        packet.decode();

        expect(packet.graphicsMode).toBeNull();
        expect(packet.filterProfanity).toBe(false);
        expect(packet.feof()).toBe(true);
    });

    it('encodes presence bytes before each value', () => {
        const packet = new UpdateClientOptionsPacket();
        packet.graphicsMode = GraphicsMode.Fancy;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0xc3, 0x02, 0x01, 0x01, 0x00]));
    });
});
