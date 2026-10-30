import BinaryStream from '@jsprismarine/binaryutils';
import { containerSetDataPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/** The bytes the hand-written encoder produced, recorded before the class moved to the layout. */
const BYTES = Buffer.from('02029003', 'hex');

const payload = { containerId: 2, id: 1, value: 200 };

describe('the declarative ContainerSetData layout', () => {
    const layout = layoutAt(containerSetDataPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
