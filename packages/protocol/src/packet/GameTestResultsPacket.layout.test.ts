import BinaryStream from '@jsprismarine/binaryutils';
import { gameTestResultsPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('010768c3a96c6c6f310768c3a96c6c6f32', 'hex');
const payload = { succeeded: true, error: 'héllo1', testName: 'héllo2' };

describe('the declarative GameTestResults layout', () => {
    const layout = layoutAt(gameTestResultsPacket, 2193);

    it('writes the bytes the hand-written serializer wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
