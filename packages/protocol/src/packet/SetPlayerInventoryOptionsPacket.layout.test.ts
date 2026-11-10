import BinaryStream from '@jsprismarine/binaryutils';
import { setPlayerInventoryOptionsPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('d704d90401dd04df04', 'hex');
const payload = { leftTab: -300, rightTab: -301, filtering: true, inventoryLayout: -303, craftingLayout: -304 };

describe('the declarative SetPlayerInventoryOptions layout', () => {
    const layout = layoutAt(setPlayerInventoryOptionsPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
