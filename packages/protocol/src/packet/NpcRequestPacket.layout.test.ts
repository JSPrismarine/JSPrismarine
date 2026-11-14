import BinaryStream from '@jsprismarine/binaryutils';
import { npcRequestPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('808080808020c70768c3a96c6c6f32c50768c3a96c6c6f34', 'hex');
const payload = {
    npcRuntimeId: 1099511627776n,
    requestType: 199,
    actions: 'héllo2',
    actionIndex: 197,
    sceneName: 'héllo4'
};

describe.each([2193, 2225])('the declarative NpcRequest layout at protocol %i', (protocol) => {
    const layout = layoutAt(npcRequestPacket, protocol);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
