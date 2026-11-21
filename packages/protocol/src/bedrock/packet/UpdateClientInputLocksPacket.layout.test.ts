import BinaryStream from '@jsprismarine/binaryutils';
import { updateClientInputLocksPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('ac02', 'hex');
const payload = { locks: 300 };

describe.each([2193, 2225])('the declarative UpdateClientInputLocks layout at protocol %i', (protocol) => {
    const layout = layoutAt(updateClientInputLocksPacket, protocol);

    it('writes the bytes the hand-written serializer wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
