import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, modalFormResponsePacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';
import { ProtocolVersions } from '../ProtocolVersion';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Both optionals carry their presence byte either way round.
 */
const SUBMITTED = Buffer.from('0701075b302c2261225d00', 'hex');
const DISMISSED = Buffer.from('07000101', 'hex');

const submitted = { formId: 7, jsonResponse: '[0,"a"]', formCancelReason: null };
const dismissed = { formId: 7, jsonResponse: null, formCancelReason: 1 };

/** Every protocol the codec registers, so a new one is covered as it lands. */
const PROTOCOLS = Object.values(ProtocolVersions).map((version) => version.protocolVersion);

describe.each(PROTOCOLS)('the declarative ModalFormResponse layout at %i', (protocol) => {
    const layout = layoutAt(modalFormResponsePacket, protocol);

    it('writes the bytes the hand-written encoder wrote for a submitted form', () => {
        const stream = new BinaryStream();
        layout.encode(stream, submitted);

        expect(stream.getBuffer()).toEqual(SUBMITTED);
    });

    it('writes the bytes the hand-written encoder wrote for a dismissed form', () => {
        const stream = new BinaryStream();
        layout.encode(stream, dismissed);

        expect(stream.getBuffer()).toEqual(DISMISSED);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(SUBMITTED))).toEqual(submitted);
        expect(layout.decode(new BinaryStream(DISMISSED))).toEqual(dismissed);
    });
});
