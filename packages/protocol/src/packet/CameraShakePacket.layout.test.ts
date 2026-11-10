import BinaryStream from '@jsprismarine/binaryutils';
import { cameraShakePacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('0000c03f00002040c6c5', 'hex');
const payload = { intensity: 1.5, seconds: 2.5, shakeType: 198, shakeAction: 197 };

describe('the declarative CameraShake layout', () => {
    const layout = layoutAt(cameraShakePacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
