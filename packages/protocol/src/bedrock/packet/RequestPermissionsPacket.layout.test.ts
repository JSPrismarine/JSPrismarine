import BinaryStream from '@jsprismarine/binaryutils';
import { requestPermissionsPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('0000000000ffffffd904429c', 'hex');
const payload = { targetPlayerUniqueId: -1099511627776n, playerPermissionLevel: -301, customPermissionFlags: 40002 };

describe.each([2193, 2225])('the declarative RequestPermissions layout at protocol %i', (protocol) => {
    const layout = layoutAt(requestPermissionsPacket, protocol);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
