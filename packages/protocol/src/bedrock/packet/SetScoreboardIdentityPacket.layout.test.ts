import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, setScoreboardIdentityPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Both branches of the per-entry presence byte are in here. The ids are
 * negative and one is past what a double holds exactly, because both travel as ZigZag
 * varint64s.
 */
const BYTES = Buffer.from('0102090181808080808080200400', 'hex');

const payload = {
    type: 1,
    entries: [{ scoreboardId: -5n, playerUniqueId: -9007199254740993n }, { scoreboardId: 2n }]
};

describe.each([2193, 2225])('the declarative SetScoreboardIdentity layout at protocol %i', (protocol) => {
    const layout = layoutAt(setScoreboardIdentityPacket, protocol);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
