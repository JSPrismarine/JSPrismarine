import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, mobEffectPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The amplifier and the duration are negative because both are ZigZag
 * varints, which a plain varint would get wrong, and the tick is large enough to need five
 * bytes of varint.
 */
const BYTES = Buffer.from('d209020a050101eaadc0e52401', 'hex');

const payload = {
    targetRuntimeId: 1234n,
    eventId: 2,
    effectId: 5,
    effectAmplifier: -3,
    showParticles: true,
    effectDurationTicks: -1,
    tick: 9876543210n,
    ambient: true
};

describe('the declarative MobEffect layout', () => {
    const layout = layoutAt(mobEffectPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
