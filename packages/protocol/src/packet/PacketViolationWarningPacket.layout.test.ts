import BinaryStream from '@jsprismarine/binaryutils';
import { packetViolationWarningPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('d704d904db040768c3a96c6c6f33', 'hex');
const payload = { type: -300, severity: -301, packetId: -302, message: 'héllo3' };

describe('the declarative PacketViolationWarning layout', () => {
    const layout = layoutAt(packetViolationWarningPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
