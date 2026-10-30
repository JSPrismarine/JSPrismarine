import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, setPlayerGameTypePacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/** The bytes the hand-written encoder produced, recorded before the class moved to the layout. */
const BYTES = Buffer.from('02', 'hex');

const payload = { gametype: 1 };

describe('the declarative SetPlayerGameType layout', () => {
    const layout = layoutAt(setPlayerGameTypePacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
