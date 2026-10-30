import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, resourcePackChunkRequestPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The chunk index is negative to hold the field signed: an unsigned
 * reader hands back 4294967291.
 */
const BYTES = Buffer.from('0a757569645f312e302e30fbffffff', 'hex');

const payload = { resourceName: 'uuid_1.0.0', chunk: -5 };

describe('the declarative ResourcePackChunkRequest layout', () => {
    const layout = layoutAt(resourcePackChunkRequestPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
