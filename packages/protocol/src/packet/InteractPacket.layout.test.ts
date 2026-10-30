import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { interactPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The layout must still produce exactly these, with and without the
 * optional position.
 */
const WITH_POSITION = Buffer.from('042a010000c03f000010c000004040', 'hex');
const WITHOUT_POSITION = Buffer.from('060700', 'hex');

describe('the declarative Interact layout', () => {
    const layout = layoutAt(interactPacket, 2193);

    it('writes the bytes the hand-written encoder wrote, position and all', () => {
        const stream = new BinaryStream();
        layout.encode(stream, { action: 4, target: 42n, position: new Vector3(1.5, -2.25, 3) });

        expect(stream.getBuffer()).toEqual(WITH_POSITION);
    });

    it('writes a bare presence byte when there is no position', () => {
        const stream = new BinaryStream();
        layout.encode(stream, { action: 6, target: 7n, position: null });

        expect(stream.getBuffer()).toEqual(WITHOUT_POSITION);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(WITH_POSITION))).toEqual({
            action: 4,
            target: 42n,
            position: new Vector3(1.5, -2.25, 3)
        });
        expect(layout.decode(new BinaryStream(WITHOUT_POSITION))).toEqual({
            action: 6,
            target: 7n,
            position: null
        });
    });
});
