import BinaryStream from '@jsprismarine/binaryutils';
import { clientCacheStatusPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout, one case per value of the single flag.
 */
const CASES = [
    { branch: 'when the client keeps a cache', bytes: Buffer.from('01', 'hex'), payload: { enabled: true } },
    { branch: 'when it does not', bytes: Buffer.from('00', 'hex'), payload: { enabled: false } }
];

describe.each([2193, 2225])('the declarative ClientCacheStatus layout at protocol %i', (protocol) => {
    const layout = layoutAt(clientCacheStatusPacket, protocol);

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
