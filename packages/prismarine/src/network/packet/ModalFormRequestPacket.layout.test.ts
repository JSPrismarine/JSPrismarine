import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, modalFormRequestPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/** The bytes the hand-written encoder produced, recorded before the class moved to the layout. */
const BYTES = Buffer.from('070f7b2274797065223a22666f726d227d', 'hex');

const payload = { formId: 7, formUiJson: '{"type":"form"}' };

describe('the declarative ModalFormRequest layout', () => {
    const layout = layoutAt(modalFormRequestPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
