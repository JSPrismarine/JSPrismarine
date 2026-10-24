import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SerializedAbilityLayer from './SerializedAbilityLayer';

const floatLE = (value: number): Buffer => {
    const bytes = Buffer.alloc(4);
    bytes.writeFloatLE(value);
    return bytes;
};

// One Buffer per docs field, in wire order. The bitsets carry bit 31 so the test catches a
// signed writer.
const wire = Buffer.concat([
    Buffer.from([0x05, 0x00]), // SerializedLayer: uint16 LE 5 (LoadingScreen)
    Buffer.from([0xff, 0xff, 0x0f, 0x80]), // AbilitiesSet: uint32 LE 0x800fffff
    Buffer.from([0x00, 0x02, 0x08, 0x80]), // AbilityValues: uint32 LE 0x80080200
    floatLE(0.05), // FlySpeed
    floatLE(1), // VerticalFlySpeed
    floatLE(0.1) // WalkSpeed
]);

describe('SerializedAbilityLayer', () => {
    it('serializes the six fields in docs order with unsigned bitsets', () => {
        const stream = new NetworkBinaryStream();
        new SerializedAbilityLayer(5, 0x800fffff, 0x80080200, 0.05, 1, 0.1).serialize(stream);

        expect(stream.getBuffer()).toEqual(wire);
    });

    it('deserializes a hand-built buffer and consumes it all', () => {
        const stream = new NetworkBinaryStream(wire);
        const layer = SerializedAbilityLayer.deserialize(stream);

        expect(layer.layer).toBe(5);
        expect(layer.abilitiesSet).toBe(0x800fffff);
        expect(layer.abilityValues).toBe(0x80080200);
        expect(layer.flySpeed).toBeCloseTo(0.05);
        expect(layer.verticalFlySpeed).toBe(1);
        expect(layer.walkSpeed).toBeCloseTo(0.1);
        expect(stream.feof()).toBe(true);
    });
});
