import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import NoiseAlignment, { NoiseAlignmentType } from './NoiseAlignment';

/** An alignment on the wire: type minLocalTransitionEnd, value 300. */
const ALIGNMENT = Buffer.from([
    0x00, // type minLocalTransitionEnd
    ...[0xac, 0x02] // value 300, varuint32
]);

describe('NoiseAlignment', () => {
    it('writes the type byte then the varuint value', () => {
        const stream = new NetworkBinaryStream();
        new NoiseAlignment(NoiseAlignmentType.MIN_LOCAL_TRANSITION_END, 300).serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...ALIGNMENT]);
    });

    it('writes two zero bytes by default', () => {
        const stream = new NetworkBinaryStream();
        new NoiseAlignment().serialize(stream);

        expect([...stream.getBuffer()]).toEqual([0x00, 0x00]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(ALIGNMENT);
        const alignment = NoiseAlignment.deserialize(stream);

        expect(alignment).toEqual(new NoiseAlignment(NoiseAlignmentType.MIN_LOCAL_TRANSITION_END, 300));
        expect(stream.feof()).toBe(true);
    });
});
