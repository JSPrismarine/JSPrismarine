import BinaryStream from '@jsprismarine/binaryutils';
import { cameraShakePacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Intensity and Seconds are little-endian floats, and the two uint8 fields
 * carry values above 127, so a signed read or a wider field changes the bytes.
 */
const bytes = Buffer.from('0000c03f00002040c6c5', 'hex');
const payload = { intensity: 1.5, seconds: 2.5, shakeType: 198, shakeAction: 197 };

describe.each([2193, 2225] as const)('the declarative CameraShake layout at protocol %i', (version) => {
    const layout = layoutAt(cameraShakePacket, version);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
