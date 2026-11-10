import BinaryStream from '@jsprismarine/binaryutils';
import { networkSettingsPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('409c419c01c50000b040', 'hex');
const payload = {
    compressionThreshold: 40000,
    compressionAlgorithm: 40001,
    clientThrottlingEnabled: true,
    clientThrottleThreshold: 197,
    clientThrottleScalar: 5.5
};

describe('the declarative NetworkSettings layout', () => {
    const layout = layoutAt(networkSettingsPacket, 2193);

    it('writes the bytes the hand-written serializer wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
