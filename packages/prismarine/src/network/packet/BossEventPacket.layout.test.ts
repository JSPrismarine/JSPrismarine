import BinaryStream from '@jsprismarine/binaryutils';
import { bossEventPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The target is negative because it is a ZigZag varint64, which a plain
 * varint would write as a ten-byte number instead of one byte.
 */
const BYTES = Buffer.from('0d0404626f737301660000003f0602', 'hex');

const payload = {
    targetActorId: -7n,
    eventType: 4,
    name: 'boss',
    filteredName: 'f',
    healthPercent: 0.5,
    color: 6,
    overlay: 2
};

describe('the declarative BossEvent layout', () => {
    const layout = layoutAt(bossEventPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
