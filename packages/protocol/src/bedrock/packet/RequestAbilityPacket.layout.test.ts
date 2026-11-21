import BinaryStream from '@jsprismarine/binaryutils';
import { requestAbilityPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('d704c70100009040', 'hex');
const payload = { ability: -300, valueType: 199, boolValue: true, floatValue: 4.5 };

// Protocol 2225 (1.26.60) carries the same four fields as 2193 (1.26.50); the packet's page lists no
// change between them.
describe.each([2193, 2225])('the declarative RequestAbility layout at protocol %i', (protocol) => {
    const layout = layoutAt(requestAbilityPacket, protocol);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
