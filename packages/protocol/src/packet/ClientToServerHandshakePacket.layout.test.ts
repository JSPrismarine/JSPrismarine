import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { clientToServerHandshakePacket } from '../wire/definitions/clientToServerHandshake';
import { layoutAt } from '../wire/WireLayout';

/**
 * The hand-written serializer wrote no payload at all, which is what the empty field list has
 * to keep doing: one stray byte here and the first encrypted batch is a byte long, which a
 * client reads as a packet it does not know.
 */
describe('the declarative ClientToServerHandshake layout', () => {
    const layout = layoutAt(clientToServerHandshakePacket, 2193);

    it('writes the no bytes the hand-written serializer wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, {});

        expect(stream.getWriteIndex()).toBe(0);
    });

    it('reads an empty payload without consuming anything', () => {
        const stream = new BinaryStream(Buffer.from('ff', 'hex'));

        expect(layout.decode(stream)).toEqual({});
        expect(stream.getReadIndex()).toBe(0);
    });
});
