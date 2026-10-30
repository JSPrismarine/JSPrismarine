import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, updatePlayerGameTypePacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the layout.
 * The target player is negative, so its ZigZag encoding is what a plain varint reads wrong.
 */
const BYTES = Buffer.from('04054d', 'hex');

const payload = { playerGameType: 2, targetPlayer: -3n, tick: 77n };

describe('the declarative UpdatePlayerGameType layout', () => {
    const layout = layoutAt(updatePlayerGameTypePacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
