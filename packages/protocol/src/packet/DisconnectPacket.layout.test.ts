import BinaryStream from '@jsprismarine/binaryutils';
import { disconnectPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout, one case per alternative of the `oneOf` tail. `Reason` is 149
 * (`UnsupportedTransport`, the highest member) so a plain varint instead of the ZigZag one
 * would show, and the message carries a multi-byte character so a character count standing in
 * for a byte count would too.
 */
const CASES = [
    {
        branch: 'when the messages travel',
        bytes: Buffer.from('aa02000e4b69636b65643a20c2a7636279650b4b69636b65643a202a2a2a', 'hex'),
        payload: {
            reason: 149,
            messages: { skipMessage: false, message: 'Kicked: §cbye', filteredMessage: 'Kicked: ***' }
        }
    },
    {
        branch: 'when the message is skipped',
        bytes: Buffer.from('0201', 'hex'),
        payload: { reason: 1, messages: { skipMessage: true, message: '', filteredMessage: '' } }
    }
];

describe('the declarative Disconnect layout', () => {
    const layout = layoutAt(disconnectPacket, 2193);

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
