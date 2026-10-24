import { CommandPermissionLevel, PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SerializedAbilitiesData from './SerializedAbilitiesData';
import SerializedAbilityLayer from './SerializedAbilityLayer';

const floatLE = (value: number): Buffer => {
    const bytes = Buffer.alloc(4);
    bytes.writeFloatLE(value);
    return bytes;
};

// One Buffer per docs field, in wire order.
const wire = Buffer.concat([
    Buffer.from([0x2a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Target Player Raw Id: int64 LE 42
    Buffer.from([0x02]), // Player Permissions: int8 Operator
    Buffer.from([0x02]), // Command Permissions: uint8 Admin
    Buffer.from([0x01]), // Layers: varuint32 count 1
    Buffer.from([0x01, 0x00]), // SerializedLayer: uint16 LE 1
    Buffer.from([0x01, 0xe6, 0x00, 0x00]), // AbilitiesSet: uint32 LE 0x0000e601
    Buffer.from([0x01, 0x04, 0x00, 0x00]), // AbilityValues: uint32 LE 0x00000401
    floatLE(0.05), // FlySpeed
    floatLE(1), // VerticalFlySpeed
    floatLE(0.1) // WalkSpeed
]);

const sample = (): SerializedAbilitiesData =>
    new SerializedAbilitiesData(42n, PlayerPermissionLevel.OPERATOR, CommandPermissionLevel.ADMIN, [
        new SerializedAbilityLayer(1, 0xe601, 0x0401, 0.05, 1, 0.1)
    ]);

describe('SerializedAbilitiesData', () => {
    it('serializes the header and one layer in docs order', () => {
        const stream = new NetworkBinaryStream();
        sample().serialize(stream);

        expect(stream.getBuffer()).toEqual(wire);
    });

    it('deserializes a hand-built buffer and consumes it all', () => {
        const stream = new NetworkBinaryStream(wire);
        const data = SerializedAbilitiesData.deserialize(stream);

        expect(data.targetPlayerRawId).toBe(42n);
        expect(data.mPlayerPermissions).toBe(PlayerPermissionLevel.OPERATOR);
        expect(data.mCommandPermissions).toBe(CommandPermissionLevel.ADMIN);
        expect(data.layers).toHaveLength(1);

        const layer = data.layers[0];
        expect(layer).toBeInstanceOf(SerializedAbilityLayer);
        expect(layer?.layer).toBe(1);
        expect(layer?.abilitiesSet).toBe(0xe601);
        expect(layer?.abilityValues).toBe(0x0401);
        expect(layer?.flySpeed).toBeCloseTo(0.05);
        expect(layer?.verticalFlySpeed).toBe(1);
        expect(layer?.walkSpeed).toBeCloseTo(0.1);
        expect(stream.feof()).toBe(true);
    });

    it('reads Player Permissions as a signed byte', () => {
        // The docs type the field as int8. A 0xff byte is -1, not 255.
        const bytes = Buffer.concat([wire.subarray(0, 8), Buffer.from([0xff, 0x00, 0x00])]);
        const data = SerializedAbilitiesData.deserialize(new NetworkBinaryStream(bytes));

        expect(data.mPlayerPermissions).toBe(-1);
        expect(data.layers).toEqual([]);

        const stream = new NetworkBinaryStream();
        data.serialize(stream);
        expect(stream.getBuffer()).toEqual(bytes);
    });
});
