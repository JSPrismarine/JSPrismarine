import { describe, expect, it } from 'vitest';
import SetLastHurtByPacket from './SetLastHurtByPacket';

describe('SetLastHurtByPacket', () => {
    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x60]), // Header, packet 96
        Buffer.from([0x50]) // LastHurtBy: varint32 40 (Creeper) zigzags to 80
    ]);

    it('decodes the actor type and consumes the whole buffer', () => {
        const packet = new SetLastHurtByPacket(encoded);
        packet.decode();

        expect(packet.lastHurtBy).toBe(40);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new SetLastHurtByPacket();
        packet.lastHurtBy = 40;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
