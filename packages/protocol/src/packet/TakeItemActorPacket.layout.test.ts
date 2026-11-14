import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, takeItemActorPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/** The bytes the hand-written encoder produced, recorded before the class moved to the layout. */
const BYTES = Buffer.from('ac020c', 'hex');

const payload = { itemRuntimeEntityId: 300n, takerRuntimeEntityId: 12n };

describe.each([2193, 2225])('the declarative TakeItemActor layout at %i', (version) => {
    const layout = layoutAt(takeItemActorPacket, version);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
