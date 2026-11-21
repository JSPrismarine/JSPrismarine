import BinaryStream from '@jsprismarine/binaryutils';
import { serverStatsPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('0000c03f00002040', 'hex');
const payload = { serverTime: 1.5, networkTime: 2.5 };

describe.each([2193, 2225])('the declarative ServerStats layout at protocol %i', (version) => {
    const layout = layoutAt(serverStatsPacket, version);

    it('writes the bytes the hand-written serializer wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
