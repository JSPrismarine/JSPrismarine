import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import SpawnParticleEffectPacket from './SpawnParticleEffectPacket';

const EFFECT_NAME = 'minecraft:heart_particle';

const ENCODED = Buffer.concat([
    Buffer.from([0x76]), // Header: id 118 as LEB128.
    Buffer.from([0x00]), // Dimension Id.
    Buffer.from([0x01]), // Actor Id -1 as a ZigZag varint64.
    Buffer.from([0x00, 0x00, 0x80, 0x3f]), // Position X 1.
    Buffer.from([0x00, 0x00, 0x00, 0x40]), // Position Y 2.
    Buffer.from([0x00, 0x00, 0x40, 0x40]), // Position Z 3.
    Buffer.from([EFFECT_NAME.length]),
    Buffer.from(EFFECT_NAME, 'utf8'),
    Buffer.from([0x00]) // Molang Variables absent.
]);

describe('SpawnParticleEffectPacket', () => {
    it('encodes the dimension, the actor, the position and an absent variable map', () => {
        const packet = Object.assign(new SpawnParticleEffectPacket(), {
            dimensionId: 0,
            actorId: -1n,
            position: new Vector3(1, 2, 3),
            effectName: EFFECT_NAME
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new SpawnParticleEffectPacket(ENCODED);
        packet.decode();

        expect(packet.dimensionId).toBe(0);
        expect(packet.actorId).toBe(-1n);
        expect(packet.position).toEqual(new Vector3(1, 2, 3));
        expect(packet.effectName).toBe(EFFECT_NAME);
        expect(packet.molangVariables).toBeUndefined();
        expect(packet.feof()).toBe(true);
    });

    it('writes the variable map behind its presence byte when one is set', () => {
        const packet = Object.assign(new SpawnParticleEffectPacket(), {
            actorId: 0n,
            effectName: '',
            molangVariables: '[]'
        });
        packet.encode();

        expect(packet.getBuffer().subarray(-4)).toEqual(Buffer.from([0x01, 0x02, 0x5b, 0x5d]));
    });
});
