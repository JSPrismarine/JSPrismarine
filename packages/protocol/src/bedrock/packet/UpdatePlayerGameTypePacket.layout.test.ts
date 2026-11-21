import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { updatePlayerGameTypePacket } from '../wire/definitions/player';
import { layoutAt } from '../../wire/WireLayout';
import type { UpdatePlayerGameTypePayload } from '../wire/definitions/player';

/** The bytes the hand-written encoder produced; the negative target ID exercises ZigZag encoding. */
const bytes = Buffer.from('04054d', 'hex');
const payload: UpdatePlayerGameTypePayload = { playerGameType: 2, targetPlayer: -3n, tick: 77n };

describe.each([2193, 2225])('the declarative UpdatePlayerGameType layout at protocol %i', (protocol) => {
    const layout = layoutAt(updatePlayerGameTypePacket, protocol);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
