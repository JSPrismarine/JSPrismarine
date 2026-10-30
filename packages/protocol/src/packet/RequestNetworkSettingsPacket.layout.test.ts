import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, requestNetworkSettingsPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The negative case pins the field as a signed big endian int32: a varint
 * or a little-endian word would reorder the bytes, and an unsigned read would hand back
 * 4294967295 instead.
 */
const CASES = [
    {
        branch: 'for the protocol this server speaks',
        bytes: Buffer.from('00000891', 'hex'),
        payload: { protocolVersion: 2193 }
    },
    { branch: 'for a negative version', bytes: Buffer.from('ffffffff', 'hex'), payload: { protocolVersion: -1 } }
];

describe('the declarative RequestNetworkSettings layout', () => {
    const layout = layoutAt(requestNetworkSettingsPacket, 2193);

    for (const { branch, bytes, payload } of CASES) {
        it(`writes the bytes the hand-written encoder wrote ${branch}`, () => {
            const stream = new BinaryStream();
            layout.encode(stream, payload);

            expect(stream.getBuffer()).toEqual(bytes);
        });

        it(`reads those bytes back ${branch}`, () => {
            expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
        });
    }
});
