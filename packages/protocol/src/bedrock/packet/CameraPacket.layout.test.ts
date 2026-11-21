import BinaryStream from '@jsprismarine/binaryutils';
import { cameraPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Both ids are ZigZag varint64 (the spec's `ActorUniqueID`), so the negative
 * values prove the signedness and the varint form. The 1.26.50 and 1.26.60 pages list the same
 * two fields, so both versions write the same bytes.
 */
const bytes = Buffer.from('ffffffffff3f818080808040', 'hex');
const payload = { cameraId: -1099511627776n, targetPlayerId: -1099511627777n };

describe.each([2193, 2225])('the declarative Camera layout at %i', (protocol) => {
    const layout = layoutAt(cameraPacket, protocol);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
