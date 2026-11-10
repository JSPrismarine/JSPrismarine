import BinaryStream from '@jsprismarine/binaryutils';
import { unlockedRecipesPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/** The bytes the hand-written serializer produced, recorded before the class moved to the layout. */
const CASES = [
    {
        branch: 'with two recipes',
        bytes: Buffer.from('020000000201610362c3a9', 'hex'),
        payload: { type: 2, recipes: ['a', 'bé'] }
    }
];

describe('the declarative UnlockedRecipes layout', () => {
    const layout = layoutAt(unlockedRecipesPacket, 2193);

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
