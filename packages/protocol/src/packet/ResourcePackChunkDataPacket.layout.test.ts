import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, resourcePackChunkDataPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The chunk id is above 2^31 and the offset fills seven bytes, so a
 * signed or narrow writer shows up here.
 */
const BYTES = Buffer.from('0a757569645f312e302e30feffffffefcdab896745230104cafebabe', 'hex');

const payload = {
    resourceName: 'uuid_1.0.0',
    chunkId: 0xfffffffe,
    byteOffset: 0x0123456789abcdefn,
    chunkData: Buffer.from('cafebabe', 'hex')
};

describe('the declarative ResourcePackChunkData layout', () => {
    const layout = layoutAt(resourcePackChunkDataPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
