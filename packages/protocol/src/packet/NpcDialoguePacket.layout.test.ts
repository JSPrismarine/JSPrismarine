import BinaryStream from '@jsprismarine/binaryutils';
import { npcDialoguePacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from(
    '0000000000010000d9040768c3a96c6c6f320768c3a96c6c6f330768c3a96c6c6f340768c3a96c6c6f35',
    'hex'
);
const payload = {
    npcId: 1099511627776n,
    actionType: -301,
    dialogue: 'héllo2',
    sceneName: 'héllo3',
    npcName: 'héllo4',
    actionJson: 'héllo5'
};

describe('the declarative NpcDialogue layout', () => {
    const layout = layoutAt(npcDialoguePacket, 2193);

    it('writes the bytes the hand-written serializer wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
