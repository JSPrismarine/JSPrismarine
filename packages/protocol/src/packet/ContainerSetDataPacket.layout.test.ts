import BinaryStream from '@jsprismarine/binaryutils';
import { containerSetDataPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/** The bytes the hand-written encoder produced, recorded before the class moved to the layout. */
const BYTES = Buffer.from('02029003', 'hex');

const payload = { containerId: 2, id: 1, value: 200 };

describe.each([2193, 2225])('the declarative ContainerSetData layout at protocol %i', (protocol) => {
    const layout = layoutAt(containerSetDataPacket, protocol);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });

    it('zigzags a negative value', () => {
        const stream = new BinaryStream();
        layout.encode(stream, { containerId: 1, id: 0, value: -5 });

        expect(stream.getBuffer()).toEqual(Buffer.from([0x01, 0x00, 0x09]));
    });
});
