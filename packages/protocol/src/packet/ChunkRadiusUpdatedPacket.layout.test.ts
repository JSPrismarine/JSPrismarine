import BinaryStream from '@jsprismarine/binaryutils';
import { chunkRadiusUpdatedPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';
import { capture } from '../testing/evidence.test.helper';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('d704', 'hex');
const payload = { radius: -300 };

describe('the declarative ChunkRadiusUpdated layout', () => {
    for (const protocol of [2193, 2225]) {
        describe(`at protocol ${protocol}`, () => {
            const layout = layoutAt(chunkRadiusUpdatedPacket, protocol);

            it('writes the bytes the hand-written serializer wrote', () => {
                const stream = new BinaryStream();
                layout.encode(stream, payload);

                expect(stream.getBuffer()).toEqual(bytes);
            });

            it('reads those bytes back', () => {
                expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
            });

            it('re-encodes the real server capture to the same bytes', () => {
                const real = capture(protocol, 0x46);
                const stream = new BinaryStream();
                layout.encode(stream, layout.decode(new BinaryStream(real)));

                expect(stream.getBuffer()).toEqual(real);
            });
        });
    }
});
