import { describe, expect, it } from 'vitest';
import StopSoundPacket from './StopSoundPacket';

describe('StopSoundPacket', () => {
    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x57]), // Header, packet 87
        Buffer.from([0x05]),
        Buffer.from('music'), // Sound Name
        Buffer.from([0x01]), // Stop All Sounds?
        Buffer.from([0x00]) // Stop Music (Legacy)
    ]);

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new StopSoundPacket(encoded);
        packet.decode();

        expect(packet.soundName).toBe('music');
        expect(packet.stopAllSounds).toBe(true);
        expect(packet.stopMusicLegacy).toBe(false);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new StopSoundPacket();
        packet.soundName = 'music';
        packet.stopAllSounds = true;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
