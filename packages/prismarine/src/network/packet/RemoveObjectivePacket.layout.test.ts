import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, removeObjectivePacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/** The bytes the hand-written encoder produced, recorded before the class moved to the layout. */
const BYTES = Buffer.from('036f626a', 'hex');

const payload = { objectiveName: 'obj' };

describe('the declarative RemoveObjective layout', () => {
    const layout = layoutAt(removeObjectivePacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
