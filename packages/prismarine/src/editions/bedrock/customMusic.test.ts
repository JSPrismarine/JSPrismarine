import { describe, expect, it } from 'vitest';

import { customMusicPacket } from './customMusic';

/** The packets BDS 1.26.60.6 sent a joined client for `Player` music calls, header included. */
const BDS = {
    /** `playMusic('music.game', { fade: 1, loop: true, volume: 0.5 })` */
    play: '7cda1d050b666164655365636f6e64730000803f010a7265706561744d6f6465010809747261636b4e616d650a6d757369632e67616d650506766f6c756d650000003f00',
    /** `queueMusic('record.13', { fade: 2, loop: false, volume: 0.25 })` */
    queue: '7cd81d050b666164655365636f6e647300000040010a7265706561744d6f6465000809747261636b4e616d65097265636f72642e31330506766f6c756d650000803e00',
    /** `stopMusic()` */
    stop: '7cdc1d050b666164655365636f6e64730000000000'
};

const hexOf = (packet: ReturnType<typeof customMusicPacket>): string => {
    packet.encode();
    return packet.getBuffer().toString('hex');
};

describe('customMusicPacket', () => {
    it('writes a played track as BDS does', () => {
        expect(
            hexOf(customMusicPacket({ action: 'play', track: 'music.game', volume: 0.5, fade: 1, loop: true }))
        ).toBe(BDS.play);
    });

    it('writes a queued track as BDS does', () => {
        expect(
            hexOf(customMusicPacket({ action: 'queue', track: 'record.13', volume: 0.25, fade: 2, loop: false }))
        ).toBe(BDS.queue);
    });

    it('writes a stop as BDS does', () => {
        expect(hexOf(customMusicPacket({ action: 'stop' }))).toBe(BDS.stop);
    });
});
