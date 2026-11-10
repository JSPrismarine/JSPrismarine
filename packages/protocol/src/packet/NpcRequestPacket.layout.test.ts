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

describe('the declarative NpcRequest layout', () => {
    const layout = layoutAt(npcRequestPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
