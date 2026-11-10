import BinaryStream from '@jsprismarine/binaryutils';
import { animateEntityPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/** The bytes the hand-written serializer produced, recorded before the class moved to the layout. */
const CASES = [
    {
        branch: 'with runtime ids',
        bytes: Buffer.from('0368c3a9016e016590eefeff01630000c03f0280808080802007', 'hex'),
        payload: {
            animation: 'hé',
            nextState: 'n',
            stopExpression: 'e',
            stopExpressionVersion: -70000,
            controller: 'c',
            blendOutTime: 1.5,
            runtimeIds: [2n ** 40n, 7n]
        }
    },
    {
        branch: 'with no runtime ids',
        bytes: Buffer.from('0368c3a9016e016590eefeff01630000c03f00', 'hex'),
        payload: {
            animation: 'hé',
            nextState: 'n',
            stopExpression: 'e',
            stopExpressionVersion: -70000,
            controller: 'c',
            blendOutTime: 1.5,
            runtimeIds: []
        }
    }
];

describe('the declarative AnimateEntity layout', () => {
    const layout = layoutAt(animateEntityPacket, 2193);

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
