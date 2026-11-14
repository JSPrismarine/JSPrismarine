import BinaryStream from '@jsprismarine/binaryutils';
import { lessonProgressPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('d704d9040768c3a96c6c6f32', 'hex');
const payload = { action: -300, score: -301, activityId: 'héllo2' };

describe('the declarative LessonProgress layout', () => {
    // 1.26.60 records no change to this packet, so both versions share one layout.
    describe.each([2193, 2225])('at protocol %i', (protocol) => {
        const layout = layoutAt(lessonProgressPacket, protocol);

        it('writes the bytes the hand-written serializer wrote', () => {
            const stream = new BinaryStream();
            layout.encode(stream, payload);

            expect(stream.getBuffer()).toEqual(bytes);
        });

        it('reads those bytes back', () => {
            expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
        });
    });
});
