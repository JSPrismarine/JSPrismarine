import { describe, expect, it } from 'vitest';
import ServerboundLoadingScreenPacket, { ServerboundLoadingScreenPacketType } from './ServerboundLoadingScreenPacket';

describe('ServerboundLoadingScreenPacket', () => {
    // Header: id 312 as LEB128 is 0xb8 0x02.
    it('decodes a start with no id and consumes the whole buffer', () => {
        // Type 1 zigzags to 2. Presence byte 0.
        const packet = new ServerboundLoadingScreenPacket(Buffer.from([0xb8, 0x02, 0x02, 0x00]));
        packet.decode();

        expect(packet.loadingScreenType).toBe(ServerboundLoadingScreenPacketType.StartLoadingScreen);
        expect(packet.loadingScreenId).toBeNull();
        expect(packet.feof()).toBe(true);
    });

    it('decodes an end with an id as a presence byte and a uint32 LE', () => {
        // Type 2 zigzags to 4. Presence byte 1, then 0x01020304 little endian.
        const packet = new ServerboundLoadingScreenPacket(
            Buffer.from([0xb8, 0x02, 0x04, 0x01, 0x04, 0x03, 0x02, 0x01])
        );
        packet.decode();

        expect(packet.loadingScreenType).toBe(ServerboundLoadingScreenPacketType.EndLoadingScreen);
        expect(packet.loadingScreenId).toBe(0x01020304);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes it decodes', () => {
        const packet = new ServerboundLoadingScreenPacket();
        packet.loadingScreenType = ServerboundLoadingScreenPacketType.EndLoadingScreen;
        packet.loadingScreenId = 7;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0xb8, 0x02, 0x04, 0x01, 0x07, 0x00, 0x00, 0x00]));
    });
});
