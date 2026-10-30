import { describe, expect, it } from 'vitest';
import CameraPacket from './CameraPacket';

describe('CameraPacket', () => {
    // Header 0x49. Camera id 5 zigzags to 10 and the target player id -3 to 5.
    const encoded = Buffer.from([0x49, 0x0a, 0x05]);

    it('decodes both ids, consuming the whole buffer', () => {
        const packet = new CameraPacket(encoded);
        packet.decode();

        expect(packet.cameraId).toBe(5n);
        expect(packet.targetPlayerId).toBe(-3n);
        expect(packet.feof()).toBe(true);
    });

    it('encodes both ids back to the same bytes', () => {
        const packet = new CameraPacket();
        packet.cameraId = 5n;
        packet.targetPlayerId = -3n;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
