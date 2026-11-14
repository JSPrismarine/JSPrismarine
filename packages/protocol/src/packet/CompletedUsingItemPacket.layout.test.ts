import BinaryStream from '@jsprismarine/binaryutils';
import { completedUsingItemPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('d4fe8feefeff', 'hex');
const payload = { itemId: -300, itemUseMethod: -70001 };

describe.each([2193, 2225])('the declarative CompletedUsingItem layout at protocol %i', (protocol) => {
    const layout = layoutAt(completedUsingItemPacket, protocol);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
