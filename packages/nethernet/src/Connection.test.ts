import { describe, expect, it } from 'vitest';

import { MAX_MESSAGE_BYTES, Reassembler, SEGMENT_BYTES, segment } from './Connection';

describe('NetherNet segments', () => {
    it('counts down the segments still to come, and joins them back', () => {
        const message = Buffer.alloc(SEGMENT_BYTES * 2 + 5, 9);
        const parts = segment(message);

        expect(parts.map((part) => [part[0], part.byteLength - 1])).toStrictEqual([
            [2, SEGMENT_BYTES],
            [1, SEGMENT_BYTES],
            [0, 5]
        ]);
        const reassembler = new Reassembler();
        expect(parts.map((part) => reassembler.push(part))).toStrictEqual([undefined, undefined, message]);
    });

    it('sends a short message as one segment with a zero count', () => {
        expect(segment(Buffer.from('hi'))).toStrictEqual([Buffer.from([0, 0x68, 0x69])]);
    });

    it('refuses a message longer than 256 segments, or empty', () => {
        expect(() => segment(Buffer.alloc(MAX_MESSAGE_BYTES + 1))).toThrow(RangeError);
        expect(segment(Buffer.alloc(MAX_MESSAGE_BYTES))).toHaveLength(256);
        expect(() => segment(Buffer.alloc(0))).toThrow(RangeError);
    });

    it('refuses a segment whose count does not follow the last one', () => {
        const reassembler = new Reassembler();
        reassembler.push(Buffer.from([2, 1]));

        expect(() => reassembler.push(Buffer.from([0, 1]))).toThrow('where 1 were due');
    });
});
