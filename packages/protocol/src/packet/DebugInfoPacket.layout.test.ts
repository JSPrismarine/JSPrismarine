import BinaryStream from '@jsprismarine/binaryutils';
import { debugInfoPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('ffffffffff3f0768c3a96c6c6f31', 'hex');
const payload = { actorId: -1099511627776n, data: 'héllo1' };

describe('the declarative DebugInfo layout', () => {
    const layout = layoutAt(debugInfoPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
