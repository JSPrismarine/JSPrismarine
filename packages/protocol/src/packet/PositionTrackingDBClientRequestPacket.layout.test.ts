import BinaryStream from '@jsprismarine/binaryutils';
import { positionTrackingDBClientRequestPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('c8d904', 'hex');
const payload = { action: 200, id: -301 };

describe.each([2193, 2225] as const)(
    'the declarative PositionTrackingDBClientRequest layout at protocol %i',
    (protocol) => {
        const layout = layoutAt(positionTrackingDBClientRequestPacket, protocol);

        it('writes the bytes the hand-written encoder wrote', () => {
            const stream = new BinaryStream();
            layout.encode(stream, payload);

            expect(stream.getBuffer()).toEqual(bytes);
        });

        it('reads those bytes back', () => {
            expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
        });
    }
);
