import BinaryStream from '@jsprismarine/binaryutils';
import { partyDestinationCookieResponsePacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('0768c3a96c6c6f3000', 'hex');
const payload = { cookie: 'héllo0', accepted: false };

describe.each([2193, 2225] as const)('the declarative PartyDestinationCookieResponse layout at %i', (protocol) => {
    const layout = layoutAt(partyDestinationCookieResponsePacket, protocol);

    it('writes the bytes the hand-written serializer wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
