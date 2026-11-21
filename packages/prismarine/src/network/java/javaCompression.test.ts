import { describe, expect, it } from 'vitest';

import { compressFrame, decompressFrame } from './javaCompression';

describe('Java compression', () => {
    it('sends a packet under the threshold as is, behind a zero length', () => {
        const packet = Buffer.from([0x01, 0x02]);

        expect([...compressFrame(packet, 256)]).toEqual([0x00, 0x01, 0x02]);
        expect(decompressFrame(compressFrame(packet, 256), 256)).toEqual(packet);
    });

    it('deflates a packet at the threshold or above, behind its length', () => {
        const packet = Buffer.alloc(1000, 7);
        const frame = compressFrame(packet, 256);

        expect([...frame.subarray(0, 2)]).toEqual([0xe8, 0x07]);
        expect(frame.byteLength).toBeLessThan(packet.byteLength);
        expect(decompressFrame(frame, 256)).toEqual(packet);
    });

    it('refuses a compressed frame that names a length below the threshold', () => {
        const frame = compressFrame(Buffer.alloc(300, 1), 256);

        expect(() => decompressFrame(frame, 512)).toThrow(
            'A compressed frame names 300 bytes, outside what threshold 512 allows'
        );
    });
});
