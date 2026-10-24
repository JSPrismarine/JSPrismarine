import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SubChunkPos from './SubChunkPos';

/** (-3, 4, 100) as three little-endian int32s. */
const BYTES = Buffer.from([0xfd, 0xff, 0xff, 0xff, 0x04, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00]);

describe('SubChunkPos', () => {
    it('writes X, Y, Z as little-endian int32s', () => {
        const stream = new NetworkBinaryStream();
        new SubChunkPos(-3, 4, 100).serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const pos = SubChunkPos.deserialize(stream);

        expect(pos).toEqual(new SubChunkPos(-3, 4, 100));
        expect(stream.feof()).toBe(true);
    });
});
