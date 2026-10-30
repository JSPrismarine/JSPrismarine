import { describe, expect, it } from 'vitest';
import MobEffectPacket, { MobEffectEvent } from './MobEffectPacket';

describe('MobEffectPacket', () => {
    // Header 0x1c. Runtime id 128 needs two varuint bytes, the event is Add, effect 5
    // zigzags to 10, amplifier -1 to 1, duration 600 to 1200, and the tick is 300.
    const encoded = Buffer.from([0x1c, 0x80, 0x01, 0x01, 0x0a, 0x01, 0x01, 0xb0, 0x09, 0xac, 0x02, 0x00]);

    it('decodes every field, consuming the whole buffer', () => {
        const packet = new MobEffectPacket(encoded);
        packet.decode();

        expect(packet.targetRuntimeId).toBe(128n);
        expect(packet.eventId).toBe(MobEffectEvent.Add);
        expect(packet.effectId).toBe(5);
        expect(packet.effectAmplifier).toBe(-1);
        expect(packet.showParticles).toBe(true);
        expect(packet.effectDurationTicks).toBe(600);
        expect(packet.tick).toBe(300n);
        expect(packet.ambient).toBe(false);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the effect back to the same bytes', () => {
        const packet = new MobEffectPacket();
        packet.targetRuntimeId = 128n;
        packet.eventId = MobEffectEvent.Add;
        packet.effectId = 5;
        packet.effectAmplifier = -1;
        packet.showParticles = true;
        packet.effectDurationTicks = 600;
        packet.tick = 300n;
        packet.ambient = false;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
