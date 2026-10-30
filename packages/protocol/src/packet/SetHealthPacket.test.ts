import { describe, expect, it } from 'vitest';

import SetHealthPacket from './SetHealthPacket';

describe('SetHealthPacket', () => {
    it('writes Health as a ZigZag varint32 and nothing else', () => {
        const packet = new SetHealthPacket({ health: 20 });
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([0x2a, 0x28]);
    });

    it('zigzags a negative health rather than writing five bytes of ones', () => {
        const packet = new SetHealthPacket({ health: -1 });
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([0x2a, 0x01]);
    });

    it('reads Health from a packet buffer', () => {
        const packet = new SetHealthPacket(Buffer.from([0x2a, 0x0c]));
        packet.decode();

        expect(packet.getPacketData()).toEqual({ health: 6 });
    });
});
