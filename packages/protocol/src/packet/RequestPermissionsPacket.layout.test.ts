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

describe('the declarative RequestPermissions layout', () => {
    const layout = layoutAt(requestPermissionsPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
