import { describe, expect, it } from 'vitest';
import OnScreenTextureAnimationPacket from './OnScreenTextureAnimationPacket';

// Header: id 130 is 0x82 0x01. The effect id is a uint32 little endian, so 0x12345678
// goes out low byte first.
const BYTES = Buffer.from([0x82, 0x01, 0x78, 0x56, 0x34, 0x12]);

describe('OnScreenTextureAnimationPacket', () => {
    it('decodes the effect id as a little endian uint32, consuming the whole buffer', () => {
        const packet = new OnScreenTextureAnimationPacket(BYTES);
        packet.decode();

        expect(packet.animationType).toBe(0x12345678);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new OnScreenTextureAnimationPacket();
        packet.animationType = 0x12345678;
        packet.encode();

        expect(packet.getBuffer()).toEqual(BYTES);
    });
});
