import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { layoutAt } from '../wire/WireLayout';
import { playerActionPacket } from '../wire/definitions/player';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the layout.
 * Both positions carry a negative component, which is what a signed y is read wrong for.
 */
const BYTES = Buffer.from('0c24020306018001000a', 'hex');

const payload = {
    runtimeEntityId: 12n,
    action: 18,
    blockPosition: { x: 1, y: -2, z: 3 },
    resultPosition: { x: -1, y: 64, z: 0 },
    blockFace: 5
};

describe('the declarative PlayerAction layout', () => {
    const layout = layoutAt(playerActionPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
