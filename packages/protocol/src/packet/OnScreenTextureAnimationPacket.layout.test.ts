import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, onScreenTextureAnimationPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The high case fills all four bytes, so a signed read would hand back
 * -2 and a big endian one would reverse them.
 */
const CASES = [
    {
        branch: 'for an effect id in the top of the range',
        bytes: Buffer.from('feffffff', 'hex'),
        payload: { animationType: 0xfffffffe }
    },
    { branch: 'for the first effect', bytes: Buffer.from('01000000', 'hex'), payload: { animationType: 1 } }
];

describe('the declarative OnScreenTextureAnimation layout', () => {
    const layout = layoutAt(onScreenTextureAnimationPacket, 2193);

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
