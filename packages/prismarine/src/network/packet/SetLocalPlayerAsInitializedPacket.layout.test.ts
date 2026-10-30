import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, setLocalPlayerAsInitializedPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The runtime id needs six varint bytes, so a 32-bit writer truncates it.
 */
const BYTES = Buffer.from('ffffffffff0f', 'hex');

const payload = { runtimeEntityId: 0x7fffffffffn };

describe('the declarative SetLocalPlayerAsInitialized layout', () => {
    const layout = layoutAt(setLocalPlayerAsInitializedPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
