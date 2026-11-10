import BinaryStream from '@jsprismarine/binaryutils';
import { changeMobPropertyPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('ffffffffff3f0768c3a96c6c6f31010768c3a96c6c6f33df040000d040', 'hex');
const payload = {
    actorUniqueId: -1099511627776n,
    propertyName: 'héllo1',
    boolValue: true,
    stringValue: 'héllo3',
    intValue: -304,
    floatValue: 6.5
};

describe('the declarative ChangeMobProperty layout', () => {
    const layout = layoutAt(changeMobPropertyPacket, 2193);

    it('writes the bytes the hand-written serializer wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
