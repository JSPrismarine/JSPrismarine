import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, modalFormRequestPacket, ProtocolVersions } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/** The bytes the hand-written encoder produced, recorded before the class moved to the layout. */
const BYTES = Buffer.from('070f7b2274797065223a22666f726d227d', 'hex');

const payload = { formId: 7, formUiJson: '{"type":"form"}' };

/** Every protocol the codec registers, so a new one is covered as it lands. */
const PROTOCOLS = Object.values(ProtocolVersions).map((version) => version.protocolVersion);

describe.each(PROTOCOLS)('the declarative ModalFormRequest layout at protocol %i', (protocol) => {
    const layout = layoutAt(modalFormRequestPacket, protocol);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
