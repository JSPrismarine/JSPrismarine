import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SubChunkPosOffset from './SubChunkPosOffset';

/** (-1, 2, -128) as three signed bytes. */
const BYTES = Buffer.from([0xff, 0x02, 0x80]);

describe('SubChunkPosOffset', () => {
    it('writes X, Y, Z as signed bytes', () => {
        const stream = new NetworkBinaryStream();
        new SubChunkPosOffset(-1, 2, -128).serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const offset = SubChunkPosOffset.deserialize(stream);

        expect(offset).toEqual(new SubChunkPosOffset(-1, 2, -128));
        expect(stream.feof()).toBe(true);
    });
});
