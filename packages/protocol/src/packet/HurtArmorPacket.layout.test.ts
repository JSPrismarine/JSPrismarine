import BinaryStream from '@jsprismarine/binaryutils';
import { hurtArmorPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Both signed fields carry negative values, so a wrong signedness or varint form changes
 * the bytes. 1.26.50 and 1.26.60 print the same layout, so both versions share them.
 */
const bytes = Buffer.from('d704d904828080808020', 'hex');
const payload = { cause: -300, damage: -301, armorSlots: 1099511627778n };

describe.each([2193, 2225])('the declarative HurtArmor layout at protocol %i', (version) => {
    const layout = layoutAt(hurtArmorPacket, version);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
