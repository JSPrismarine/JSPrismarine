import BinaryStream from '@jsprismarine/binaryutils';
import { addBehaviorTreePacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('0768c3a96c6c6f30', 'hex');
const payload = { behaviorTreeStructure: 'héllo0' };

describe('the declarative AddBehaviorTree layout', () => {
    const layout = layoutAt(addBehaviorTreePacket, 2193);

    it('writes the bytes the hand-written serializer wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
