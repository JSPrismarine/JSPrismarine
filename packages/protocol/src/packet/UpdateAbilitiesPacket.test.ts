import { CommandPermissionLevel, PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { netIdFor } from '@jsprismarine/protocol/wire/versions/v2193';
import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import UpdateAbilitiesPacket, { AbilityLayer, AbilityLayerFlag, AbilityLayerType } from './UpdateAbilitiesPacket';

// Flags in bit order. BUILD (0) true, FLYING (9) false, MAY_FLY (10) true, FLY_SPEED (13) and
// WALK_SPEED (14) present with no value bit, MUTED (15) false.
const flags = new Map<AbilityLayerFlag, boolean>([
    [AbilityLayerFlag.BUILD, true],
    [AbilityLayerFlag.FLYING, false],
    [AbilityLayerFlag.MAY_FLY, true],
    [AbilityLayerFlag.FLY_SPEED, true],
    [AbilityLayerFlag.WALK_SPEED, true],
    [AbilityLayerFlag.MUTED, false]
]);

const floatLE = (value: number): Buffer => {
    const bytes = Buffer.alloc(4);
    bytes.writeFloatLE(value);
    return bytes;
};

// One Buffer per docs field, in wire order.
const wire = Buffer.concat([
    Buffer.from([0xbb, 0x01]), // header: varuint 187
    Buffer.from([0xd2, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Target Player Raw Id: int64 LE 1234
    Buffer.from([0x02]), // Player Permissions: int8 Operator
    Buffer.from([0x01]), // Command Permissions: uint8 GameDirectors
    Buffer.from([0x01]), // Layers: varuint32 count 1
    Buffer.from([0x01, 0x00]), // SerializedLayer: uint16 LE BASE
    Buffer.from([0x01, 0xe6, 0x00, 0x00]), // AbilitiesSet: bits 0, 9, 10, 13, 14, 15 = 0x0000e601
    Buffer.from([0x01, 0x04, 0x00, 0x00]), // AbilityValues: bits 0, 10 = 0x00000401
    floatLE(0.05), // FlySpeed
    floatLE(1), // VerticalFlySpeed
    floatLE(0.1) // WalkSpeed
]);

describe('network', () => {
    describe('packet', () => {
        describe('UpdateAbilitiesPacket', () => {
            it('uses the network id the client expects', () => {
                expect(netIdFor('UpdateAbilitiesPacket')).toBe(PacketIdentifier.UPDATE_ABILITIES);
                expect(netIdFor('UpdateAbilitiesPacket')).toBe(187);
            });

            it('writes the abilities data and one layer in docs order', () => {
                const layer = new AbilityLayer();
                layer.layerType = AbilityLayerType.BASE;
                layer.layerFlags = flags;
                layer.flySpeed = 0.05;
                layer.verticalFlySpeed = 1;
                layer.walkSpeed = 0.1;

                const pk = new UpdateAbilitiesPacket();
                pk.targetActorUniqueId = 1234n;
                pk.playerPermission = PlayerPermissionLevel.OPERATOR;
                pk.commandPermission = CommandPermissionLevel.GAME_DIRECTORS;
                pk.abilityLayers = [layer];
                pk.encode();

                expect(pk.getBuffer()).toEqual(wire);
            });

            it('reads a hand-built buffer back into the same layer and consumes it all', () => {
                const pk = new UpdateAbilitiesPacket();
                pk.setReadBuffer(wire);
                pk.decode();

                expect(pk.targetActorUniqueId).toBe(1234n);
                expect(pk.playerPermission).toBe(PlayerPermissionLevel.OPERATOR);
                expect(pk.commandPermission).toBe(CommandPermissionLevel.GAME_DIRECTORS);
                expect(pk.abilityLayers).toHaveLength(1);

                const layer = pk.abilityLayers[0];
                expect(layer?.layerType).toBe(AbilityLayerType.BASE);
                expect(layer?.layerFlags).toEqual(flags);
                expect(layer?.flySpeed).toBeCloseTo(0.05);
                expect(layer?.verticalFlySpeed).toBe(1);
                expect(layer?.walkSpeed).toBeCloseTo(0.1);
                expect(pk.feof()).toBe(true);
            });

            it('keeps bit 31 unsigned in both bitsets', () => {
                const layer = new AbilityLayer();
                layer.setEncodedFlags(0x80000000, 0x80000000);

                expect([...layer.layerFlags]).toEqual([[31, true]]);
                expect(layer.getEncodedFlags()).toEqual({ flagsHash: 0x80000000, valuesHash: 0x80000000 });
            });
        });
    });
});
