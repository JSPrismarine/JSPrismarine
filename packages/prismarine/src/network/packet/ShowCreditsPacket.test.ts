import { describe, expect, it } from 'vitest';
import ShowCreditsPacket, { CreditsState } from './ShowCreditsPacket';

describe('ShowCreditsPacket', () => {
    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x4b]), // Header, packet 75
        Buffer.from([0xac, 0x02]), // Player Runtime ID: varuint64 300
        Buffer.from([0x02]) // Credits State: varint32 1 zigzags to 2
    ]);

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new ShowCreditsPacket(encoded);
        packet.decode();

        expect(packet.playerRuntimeId).toBe(300n);
        expect(packet.creditsState).toBe(CreditsState.End);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new ShowCreditsPacket();
        packet.playerRuntimeId = 300n;
        packet.creditsState = CreditsState.End;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
