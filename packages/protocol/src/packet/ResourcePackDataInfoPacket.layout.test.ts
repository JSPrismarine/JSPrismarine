import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, resourcePackDataInfoPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The chunk count is above 2^31 and the file size fills seven bytes, so
 * a signed or narrow writer shows up here.
 */
const BYTES = Buffer.from('0a757569645f312e302e3000001000fdffffffefcdab896745230104deadbeef0106', 'hex');

const payload = {
    resourceName: 'uuid_1.0.0',
    chunkSize: 1048576,
    numberOfChunks: 0xfffffffd,
    fileSize: 0x0123456789abcdefn,
    fileHash: Buffer.from('deadbeef', 'hex'),
    isPremiumPack: true,
    packType: 6
};

describe('the declarative ResourcePackDataInfo layout', () => {
    const layout = layoutAt(resourcePackDataInfoPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
