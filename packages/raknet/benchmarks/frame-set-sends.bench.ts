import { test } from 'vitest';
import Frame from '../src/protocol/Frame';
import FrameReliability from '../src/protocol/FrameReliability';
import FrameSet from '../src/protocol/FrameSet';

/** A repeatable frame set with payload buffers already owned by the queued frames. */
const makeFrameSet = (frameCount: number, payloadLength: number): FrameSet => {
    const frameSet = new FrameSet();
    frameSet.sequenceNumber = 0x010203;
    frameSet.frames = Array.from({ length: frameCount }, (_, index) => {
        const frame = new Frame();
        frame.reliability = FrameReliability.RELIABLE_ORDERED;
        frame.reliableIndex = index;
        frame.orderIndex = index;
        frame.orderChannel = 0;
        frame.content = Buffer.allocUnsafe(payloadLength);
        frame.content.fill(index & 0xff);
        return frame;
    });
    return frameSet;
};

for (const frameCount of [1, 4, 16, 32]) {
    test(`frame-set datagram assembly: ${frameCount} frames`, async ({ bench }) => {
        const frameSet = makeFrameSet(frameCount, 512);
        const payloadBytes = frameSet.frames.reduce((total, frame) => total + frame.content.byteLength, 0);
        frameSet.encode();
        const contiguous = frameSet.getBuffer();
        const parts = frameSet.toBuffers();

        if (!Buffer.concat(parts).equals(contiguous)) throw new Error('scatter-gather parts changed datagram bytes');
        console.info(
            `${frameCount} frames: ${contiguous.byteLength} datagram bytes, ${parts.length} send parts, ` +
                `${payloadBytes} payload bytes reused, ${contiguous.byteLength - payloadBytes} header bytes copied`
        );

        await bench('contiguous encode', () => frameSet.encode()).run();
        await bench('scatter-gather parts', () => frameSet.toBuffers()).run();
    });
}
