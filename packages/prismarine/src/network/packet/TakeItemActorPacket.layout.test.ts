import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, takeItemActorPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/** The bytes the hand-written encoder produced, recorded before the class moved to the layout. */
const BYTES = Buffer.from('ac020c', 'hex');

const payload = { itemRuntimeEntityId: 300n, takerRuntimeEntityId: 12n };

describe('the declarative TakeItemActor layout', () => {
    const layout = layoutAt(takeItemActorPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
