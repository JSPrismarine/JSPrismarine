import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, showCreditsPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. A runtime id above 2^31 spreads over five varint bytes, so a 32-bit
 * read would truncate it, and `Finished` encodes as 0x02 rather than 0x01 because the state
 * is a ZigZag varint and not a plain one.
 */
const CASES = [
    {
        branch: 'when the credits finish',
        bytes: Buffer.from('effdb6f50d02', 'hex'),
        payload: { playerRuntimeId: 0xdeadbeefn, creditsState: 1 }
    },
    {
        branch: 'when they start',
        bytes: Buffer.from('0000', 'hex'),
        payload: { playerRuntimeId: 0n, creditsState: 0 }
    }
];

describe('the declarative ShowCredits layout', () => {
    const layout = layoutAt(showCreditsPacket, 2193);

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
