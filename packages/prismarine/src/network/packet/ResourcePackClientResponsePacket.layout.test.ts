import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, resourcePackClientResponsePacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout, one case per alternative: the only one carrying `Downloading Packs`,
 * the longest name, and the alternative numbered zero.
 */
const CASES = [
    {
        branch: 'for SendPacks, the one alternative with a pack list',
        bytes: Buffer.from('010b646f776e6c6f6164696e67020161026262', 'hex'),
        payload: { response: { status: 2, packIds: ['a', 'bb'] } }
    },
    {
        branch: 'for Completed',
        bytes: Buffer.from('03197265736f757263657061636b737461636b66696e6973686564', 'hex'),
        payload: { response: { status: 4, packIds: [] } }
    },
    {
        branch: 'for Refused, whose alternative index is zero',
        bytes: Buffer.from('000663616e63656c', 'hex'),
        payload: { response: { status: 1, packIds: [] } }
    }
];

describe('the declarative ResourcePackClientResponse layout', () => {
    const layout = layoutAt(resourcePackClientResponsePacket, 2193);

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

    it('refuses a status with no alternative', () => {
        expect(() => layout.encode(new BinaryStream(), { response: { status: 0, packIds: [] } })).toThrow(
            'No resource pack response alternative for status 0'
        );
    });

    it('refuses an alternative index it does not know', () => {
        expect(() => layout.decode(new BinaryStream(Buffer.from('04', 'hex')))).toThrow(
            'Unknown resource pack response alternative 4'
        );
    });
});
