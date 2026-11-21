import BinaryStream from '@jsprismarine/binaryutils';
import { actorPickRequestPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('0000000000ffffffc701', 'hex');
const payload = { actorId: -1099511627776n, maxSlots: 199, withData: true };

describe('the declarative ActorPickRequest layout', () => {
    const layout = layoutAt(actorPickRequestPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
