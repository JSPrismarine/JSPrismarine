import { describe, expect, it } from 'vitest';

import { framed, MAX_TCP_FRAME, TcpFrameReader } from './tcpFrames';

describe('TcpFrameReader', () => {
    it('reads back what framed wrote, however the stream splits it', () => {
        const frames = [Buffer.from([0x00]), Buffer.alloc(300, 7), Buffer.from('status')];
        const stream = Buffer.concat(frames.map(framed));

        // One byte at a time, which splits every length and every body.
        const reader = new TcpFrameReader();
        const read: Buffer[] = [];
        for (const byte of stream) {
            const result = reader.push(Buffer.from([byte]));
            if ('malformed' in result) throw new Error(result.malformed);
            read.push(...result.frames);
        }

        expect(read).toEqual(frames);
    });

    it('returns every frame one chunk completes, and keeps the rest', () => {
        const reader = new TcpFrameReader();
        const stream = Buffer.concat([framed(Buffer.from('a')), framed(Buffer.from('bc')), framed(Buffer.from('def'))]);

        const first = reader.push(stream.subarray(0, stream.byteLength - 2));
        const second = reader.push(stream.subarray(stream.byteLength - 2));

        expect(first).toEqual({ frames: [Buffer.from('a'), Buffer.from('bc')] });
        expect(second).toEqual({ frames: [Buffer.from('def')] });
    });

    it('writes a two-byte length for a frame past 127 bytes', () => {
        expect([...framed(Buffer.alloc(300)).subarray(0, 2)]).toEqual([0xac, 0x02]);
    });

    it('refuses a length longer than three bytes rather than waiting for more than it allows', () => {
        const reader = new TcpFrameReader();

        expect(reader.push(Buffer.from([0x80, 0x80, 0x80, 0x01]))).toEqual({
            malformed: 'a frame length longer than 3 bytes'
        });
    });

    it('takes the longest frame three length bytes can name', () => {
        const reader = new TcpFrameReader();
        const frame = Buffer.alloc(MAX_TCP_FRAME, 1);

        const result = reader.push(framed(frame));

        expect('frames' in result && result.frames[0]?.byteLength).toBe(MAX_TCP_FRAME);
    });
});
