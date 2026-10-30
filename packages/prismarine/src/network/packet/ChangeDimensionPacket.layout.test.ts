import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { changeDimensionPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout, one case per branch of the optional screen id.
 *
 * The dimension is negative because it is a ZigZag varint32, and two position components are
 * negative because a `Vec3` is three signed floats.
 */
const CASES = [
    {
        branch: 'without a loading screen id',
        bytes: Buffer.from('010000c0bf00209643000000c50100', 'hex'),
        payload: {
            dimension: -1,
            position: new Vector3(-1.5, 300.25, -2048),
            respawn: true,
            loadingScreenId: null
        }
    },
    {
        branch: 'with a loading screen id above 2^31',
        bytes: Buffer.from('020000000000000000000000000001efbeadde', 'hex'),
        payload: {
            dimension: 1,
            position: Vector3.ZERO,
            respawn: false,
            loadingScreenId: 0xdeadbeef
        }
    }
];

describe('the declarative ChangeDimension layout', () => {
    const layout = layoutAt(changeDimensionPacket, 2193);

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
