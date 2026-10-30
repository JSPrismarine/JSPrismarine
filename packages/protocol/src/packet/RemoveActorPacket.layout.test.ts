import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, removeActorPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The id is negative because unique ids of server-owned actors are, and
 * a plain varint would write a ten-byte number for one.
 */
const BYTES = Buffer.from('a313', 'hex');

describe('the declarative RemoveActor layout', () => {
    const layout = layoutAt(removeActorPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, { uniqueEntityId: -1234n });

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual({ uniqueEntityId: -1234n });
    });
});
