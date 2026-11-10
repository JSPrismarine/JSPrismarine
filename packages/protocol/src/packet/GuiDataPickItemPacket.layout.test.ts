import BinaryStream from '@jsprismarine/binaryutils';
import { guiDataPickItemPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('0768c3a96c6c6f300768c3a96c6c6f318eeefeff', 'hex');
const payload = { itemName: 'héllo0', itemEffectName: 'héllo1', slot: -70002 };

describe('the declarative GuiDataPickItem layout', () => {
    const layout = layoutAt(guiDataPickItemPacket, 2193);

    it('writes the bytes the hand-written serializer wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
