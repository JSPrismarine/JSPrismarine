import BinaryStream from '@jsprismarine/binaryutils';
import { playerToggleCrafterSlotRequestPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('90eefeff8feefeff8eeefeffc501', 'hex');
const payload = { posX: -70000, posY: -70001, posZ: -70002, slotIndex: 197, isDisabled: true };

describe('the declarative PlayerToggleCrafterSlotRequest layout', () => {
    const layout = layoutAt(playerToggleCrafterSlotRequestPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
