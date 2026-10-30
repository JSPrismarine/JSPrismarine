import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, serverSettingsRequestPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The hand-written class wrote no payload at all, which is what the empty field list has to
 * keep doing: one stray byte here and the next packet in the batch decodes from the wrong
 * offset.
 */
describe('the declarative ServerSettingsRequest layout', () => {
    const layout = layoutAt(serverSettingsRequestPacket, 2193);

    it('writes the no bytes the hand-written encoder wrote', () => {
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
