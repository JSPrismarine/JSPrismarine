import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { ChunkPos } from './ChunkPos';

describe('ChunkPos', () => {
    it('writes X then Z as ZigZag varint32s', () => {
        const stream = new NetworkBinaryStream();
        new ChunkPos(-3, 64).serialize(stream);

        // ZigZag(-3) = 5, ZigZag(64) = 128 = 0x80 0x01.
        expect([...stream.getBuffer()]).toEqual([0x05, 0x80, 0x01]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(Buffer.from([0x05, 0x80, 0x01]));
        const pos = new ChunkPos(0, 0);
        pos.deserialize(stream);

        expect([pos.cx, pos.cz]).toEqual([-3, 64]);
        expect(stream.feof()).toBe(true);
    });
});
