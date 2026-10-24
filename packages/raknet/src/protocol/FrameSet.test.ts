import { describe, expect, it } from 'vitest';

import BitFlags from './BitFlags';
import Frame from './Frame';
import FrameReliability from './FrameReliability';
import FrameSet from './FrameSet';

/** A one-frame datagram as the Bedrock client sends it, with the sequence number 0x000102. */
const datagram = (header: number): Buffer =>
    Buffer.from([
        header,
        0x02,
        0x01,
        0x00, // sequence number, little endian
        FrameReliability.RELIABLE_ORDERED << 5,
        0x00,
        0x10, // 16 bits of content
        0x05,
        0x00,
        0x00, // reliable index
        0x07,
        0x00,
        0x00, // order index
        0x00, // order channel
        0xfe,
        0x99
    ]);

describe('FrameSet', () => {
    it('decodes a datagram the same whatever congestion control hints it carries', () => {
        // The client tags its datagrams 0x84 while in slow start and 0x8c when it has more
        // queued behind them. Neither bit changes what follows the header.
        for (const header of [
            BitFlags.VALID,
            BitFlags.VALID | BitFlags.NEEDS_B_AND_AS,
            BitFlags.VALID | BitFlags.CONTINUOUS_SEND | BitFlags.NEEDS_B_AND_AS
        ]) {
            const frameSet = new FrameSet(datagram(header));
            frameSet.decode();

            expect(frameSet.sequenceNumber).toBe(0x000102);
            expect(frameSet.frames).toHaveLength(1);
            const frame = frameSet.frames[0]!;
            expect(frame.reliability).toBe(FrameReliability.RELIABLE_ORDERED);
            expect(frame.reliableIndex).toBe(5);
            expect(frame.orderIndex).toBe(7);
            expect(frame.content).toEqual(Buffer.from([0xfe, 0x99]));
        }
    });

    it('sends a plain valid header, with no hints set', () => {
        const frame = new Frame();
        frame.reliability = FrameReliability.RELIABLE_ORDERED;
        frame.reliableIndex = 5;
        frame.orderIndex = 7;
        frame.orderChannel = 0;
        frame.content = Buffer.from([0xfe, 0x99]);

        const frameSet = new FrameSet();
        frameSet.sequenceNumber = 0x000102;
        frameSet.frames = [frame];
        frameSet.encode();

        expect(frameSet.getBuffer()).toEqual(datagram(BitFlags.VALID));
    });
});
