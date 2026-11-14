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

/** `SubClientLoginNotBound` (150, ZigZag 300, varint `ac 02`), the member 2225 added, then `Skip Message`. */
const SUB_CLIENT_LOGIN_NOT_BOUND = {
    branch: 'for the member 2225 added',
    bytes: Buffer.from('ac0201', 'hex'),
    payload: { reason: 150, messages: { skipMessage: true, message: '', filteredMessage: '' } }
};

describe.each([2193, 2225] as const)('the declarative Disconnect layout at %i', (protocol) => {
    const layout = layoutAt(disconnectPacket, protocol);

    for (const { branch, bytes, payload } of [...CASES, SUB_CLIENT_LOGIN_NOT_BOUND]) {
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
