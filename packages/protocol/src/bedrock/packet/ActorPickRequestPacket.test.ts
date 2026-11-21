import { describe, expect, it } from 'vitest';
import ActorPickRequestPacket from './ActorPickRequestPacket';

describe('ActorPickRequestPacket', () => {
    it('decodes the fixed int64 id, the slot count, and the flag, consuming the whole buffer', () => {
        // Header 0x23. Id -2 as int64 LE. 3 slots. With data.
        const packet = new ActorPickRequestPacket(
            Buffer.from([0x23, 0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x03, 0x01])
        );
        packet.decode();

        expect(packet.actorId).toBe(-2n);
        expect(packet.maxSlots).toBe(3);
        expect(packet.withData).toBe(true);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new ActorPickRequestPacket();
        packet.actorId = 5n;
        packet.maxSlots = 3;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x23, 0x05, 0, 0, 0, 0, 0, 0, 0, 0x03, 0x00]));
    });
});
