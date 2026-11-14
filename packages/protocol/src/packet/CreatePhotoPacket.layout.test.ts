import BinaryStream from '@jsprismarine/binaryutils';
import { createPhotoPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('00000000000100000768c3a96c6c6f310768c3a96c6c6f32', 'hex');
const payload = { rawId: 1099511627776n, photoName: 'héllo1', photoItemName: 'héllo2' };

/** The 1.26.50 (2193) and 1.26.60 (2225) pages list the same three fields and record no change. */
describe.each([2193, 2225])('the declarative CreatePhoto layout at %i', (protocol) => {
    const layout = layoutAt(createPhotoPacket, protocol);

    it('writes the bytes the hand-written serializer wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
