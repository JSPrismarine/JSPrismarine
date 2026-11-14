import BinaryStream from '@jsprismarine/binaryutils';
import { setLastHurtByPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('d704', 'hex');
const payload = { lastHurtBy: -300 };

describe('the declarative SetLastHurtBy layout', () => {
    // 1.26.60 adds ActorType members, not fields: both versions write the same bytes.
    it.each([2193, 2225])('writes the bytes the hand-written encoder wrote at %i', (version) => {
        const stream = new BinaryStream();
        layoutAt(setLastHurtByPacket, version).encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it.each([2193, 2225])('reads those bytes back at %i', (version) => {
        expect(layoutAt(setLastHurtByPacket, version).decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
