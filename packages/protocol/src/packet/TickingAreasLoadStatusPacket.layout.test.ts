import BinaryStream from '@jsprismarine/binaryutils';
import { tickingAreasLoadStatusPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('01', 'hex');
const payload = { preload: true };

describe.each([2193, 2225] as const)('the declarative TickingAreasLoadStatus layout at protocol %i', (protocol) => {
    const layout = layoutAt(tickingAreasLoadStatusPacket, protocol);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });

    it('writes a cleared flag as one zero byte', () => {
        const stream = new BinaryStream();
        layout.encode(stream, { preload: false });

        expect(stream.getBuffer()).toEqual(Buffer.from('00', 'hex'));
    });
});
