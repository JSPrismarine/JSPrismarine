import { describe, expect, it } from 'vitest';
import BlockPosition from '../../world/BlockPosition';
import BlockEventPacket from './BlockEventPacket';

describe('BlockEventPacket', () => {
    // Header 0x1a. Position 1, 2, 3 zigzags to 2, 4, 6. Event type 1 zigzags to 2 and event
    // value -1 to 1: a chest closing.
    const encoded = Buffer.from([0x1a, 0x02, 0x04, 0x06, 0x02, 0x01]);

    it('decodes the position and the event pair, consuming the whole buffer', () => {
        const packet = new BlockEventPacket(encoded);
        packet.decode();

        expect(packet.blockPosition).toEqual(new BlockPosition(1, 2, 3));
        expect(packet.eventType).toBe(1);
        expect(packet.eventValue).toBe(-1);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the event back to the same bytes', () => {
        const packet = new BlockEventPacket();
        packet.blockPosition = new BlockPosition(1, 2, 3);
        packet.eventType = 1;
        packet.eventValue = -1;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
