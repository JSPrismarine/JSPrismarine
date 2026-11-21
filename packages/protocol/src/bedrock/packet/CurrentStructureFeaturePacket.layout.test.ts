import BinaryStream from '@jsprismarine/binaryutils';
import { currentStructureFeaturePacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';
import { capture } from '../../testing/evidence.test.helper';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('0768c3a96c6c6f30', 'hex');
const payload = { currentStructureFeature: 'héllo0' };

describe('the declarative CurrentStructureFeature layout', () => {
    const layout = layoutAt(currentStructureFeaturePacket, 2193);

    it('writes the bytes the hand-written serializer wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });

    it.each([2193, 2225])('round-trips the Bedrock Dedicated Server capture at protocol %i', (protocol) => {
        const captured = capture(protocol, 0x13a);
        const at = layoutAt(currentStructureFeaturePacket, protocol);
        const stream = new BinaryStream();
        at.encode(stream, at.decode(new BinaryStream(captured)));

        expect(stream.getBuffer()).toEqual(captured);
    });
});
