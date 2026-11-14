import BinaryStream from '@jsprismarine/binaryutils';
import { mapCreateLockedCopyPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Both ids are negative, so a wrong signedness or varint form changes the
 * bytes.
 */
const bytes = Buffer.from('ffffffffff3f818080808040', 'hex');
const payload = { originalMapId: -1099511627776n, newMapId: -1099511627777n };

describe.each([2193, 2225])('the declarative MapCreateLockedCopy layout at protocol %i', (protocol) => {
    const layout = layoutAt(mapCreateLockedCopyPacket, protocol);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
