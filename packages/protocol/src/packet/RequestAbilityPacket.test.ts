import { AbilityLayerFlag } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';
import RequestAbilityPacket, { RequestAbilityValueType } from './RequestAbilityPacket';

describe('RequestAbilityPacket', () => {
    // Header: id 184 as LEB128 is 0xb8 0x01.
    it('decodes a flight toggle and consumes the whole buffer', () => {
        // Ability 9 (Flying) zigzags to 18. Type 1 (Bool). true. Float 0.
        const packet = new RequestAbilityPacket(Buffer.from([0xb8, 0x01, 0x12, 0x01, 0x01, 0, 0, 0, 0]));
        packet.decode();

        expect(packet.ability).toBe(AbilityLayerFlag.FLYING);
        expect(packet.valueType).toBe(RequestAbilityValueType.Bool);
        expect(packet.boolValue).toBe(true);
        expect(packet.floatValue).toBe(0);
        expect(packet.feof()).toBe(true);
    });

    it('decodes a float request', () => {
        // Ability 13 (FlySpeed) zigzags to 26. Type 2 (Float). false. 0.5f is 0x3f000000.
        const packet = new RequestAbilityPacket(Buffer.from([0xb8, 0x01, 0x1a, 0x02, 0x00, 0x00, 0x00, 0x00, 0x3f]));
        packet.decode();

        expect(packet.ability).toBe(AbilityLayerFlag.FLY_SPEED);
        expect(packet.valueType).toBe(RequestAbilityValueType.Float);
        expect(packet.boolValue).toBe(false);
        expect(packet.floatValue).toBe(0.5);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new RequestAbilityPacket();
        packet.ability = AbilityLayerFlag.FLYING;
        packet.valueType = RequestAbilityValueType.Bool;
        packet.boolValue = true;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0xb8, 0x01, 0x12, 0x01, 0x01, 0, 0, 0, 0]));
    });
});
