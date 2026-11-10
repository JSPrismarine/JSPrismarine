import BinaryStream from '@jsprismarine/binaryutils';
import { serverboundLoadingScreenPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/** The bytes the hand-written serializer produced, recorded before the class moved to the layout. */
const CASES = [
    {
        branch: 'with a screen id',
        bytes: Buffer.from('0401005ed0b2', 'hex'),
        payload: { loadingScreenType: 2, loadingScreenId: 3000000000 }
    },
    {
        branch: 'without one',
        bytes: Buffer.from('0200', 'hex'),
        payload: { loadingScreenType: 1, loadingScreenId: null }
    }
];

describe('the declarative ServerboundLoadingScreen layout', () => {
    const layout = layoutAt(serverboundLoadingScreenPacket, 2193);

    for (const { branch, bytes, payload } of CASES) {
        it(`writes the bytes the hand-written serializer wrote ${branch}`, () => {
            const stream = new BinaryStream();
            layout.encode(stream, payload);

            expect(stream.getBuffer()).toEqual(bytes);
        });

        it(`reads those bytes back ${branch}`, () => {
            expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
        });
    }
});
