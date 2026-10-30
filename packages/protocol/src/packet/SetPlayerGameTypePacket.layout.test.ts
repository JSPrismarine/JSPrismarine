import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { setPlayerGameTypePacket } from '../wire/definitions/player';
import { layoutAt } from '../wire/WireLayout';
import type { SetPlayerGameTypePayload } from '../wire/definitions/player';

/** The bytes the hand-written encoder produced before the class moved to the layout. */
const bytes = Buffer.from('02', 'hex');
const payload: SetPlayerGameTypePayload = { gametype: 1 };

describe('the declarative SetPlayerGameType layout', () => {
    const layout = layoutAt(setPlayerGameTypePacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
