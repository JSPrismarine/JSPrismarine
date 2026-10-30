import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, requestChunkRadiusPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The radius is negative to hold the ZigZag encoding, and the maximum is
 * 255 to hold the byte unsigned.
 */
const BYTES = Buffer.from('17ff', 'hex');

const payload = { radius: -12, maxRadius: 255 };

describe('the declarative RequestChunkRadius layout', () => {
    const layout = layoutAt(requestChunkRadiusPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
