import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { actorEventPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The presence byte of `Fire At Position` is the load-bearing one: a
 * packet a byte short takes the connection down with it.
 */
const WITH_POSITION = Buffer.from('63020d010000003f00008042000050c0', 'hex');
const WITHOUT_POSITION = Buffer.from('01390000', 'hex');

describe('the declarative ActorEvent layout', () => {
    const layout = layoutAt(actorEventPacket, 2193);

    it('writes the bytes the hand-written encoder wrote, position and all', () => {
        const stream = new BinaryStream();
        layout.encode(stream, {
            runtimeEntityId: 99n,
            event: 2,
            data: -7,
            fireAtPosition: new Vector3(0.5, 64, -3.25)
        });

        expect(stream.getBuffer()).toEqual(WITH_POSITION);
    });

    it('still writes the presence byte when no position follows', () => {
        const stream = new BinaryStream();
        layout.encode(stream, { runtimeEntityId: 1n, event: 57, data: 0, fireAtPosition: null });

        expect(stream.getBuffer()).toEqual(WITHOUT_POSITION);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(WITH_POSITION))).toEqual({
            runtimeEntityId: 99n,
            event: 2,
            data: -7,
            fireAtPosition: new Vector3(0.5, 64, -3.25)
        });
        expect(layout.decode(new BinaryStream(WITHOUT_POSITION))).toEqual({
            runtimeEntityId: 1n,
            event: 57,
            data: 0,
            fireAtPosition: null
        });
    });
});
