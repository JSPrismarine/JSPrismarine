import { CommandPermissionLevel, Gametype, PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import type { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import { stub } from '../testing/stub.test.helper';
import type ClientConnection from './ClientConnection';
import type DataPacket from './packet/DataPacket';
import UpdateAbilitiesPacket, { AbilityLayerFlag, AbilityLayerType } from './packet/UpdateAbilitiesPacket';
import PlayerSession from './PlayerSession';

/**
 * The one `BASE` layer `sendAbilities` builds. Every `AbilitiesIndex` bit is named so the
 * client replaces its state, the three speed bits mark their floats as applying, and the
 * values follow the game mode and op state.
 */

const floatLE = (value: number): Buffer => {
    const bytes = Buffer.alloc(4);
    bytes.writeFloatLE(value);
    return bytes;
};

/** A session whose connection records what goes out, speaking for `player`. */
const sessionFor = (player: Player) => {
    const sent: DataPacket[] = [];
    const connection = stub<ClientConnection>({
        sendDataPacket: async (packet) => void sent.push(packet)
    });
    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), { connection, player });
    return { session, sent };
};

const playerIn = ({
    gamemode,
    op = false,
    flying = false,
    canFly = false
}: {
    gamemode: Gametype;
    op?: boolean;
    flying?: boolean;
    canFly?: boolean;
}) =>
    stub<Player>({
        gamemode,
        getRuntimeId: () => 7n,
        isOp: () => op,
        isFlying: () => flying,
        metadata: stub<Metadata>({ canFly })
    });

/** All twenty `AbilitiesIndex` bits, 0 through 19. */
const EVERY_ABILITY = 0x000fffff;

describe('PlayerSession.sendAbilities', () => {
    it('sends a survival player one base layer naming every ability', async () => {
        const { session, sent } = sessionFor(playerIn({ gamemode: Gametype.SURVIVAL }));

        await session.sendAbilities();

        expect(sent).toHaveLength(1);
        const packet = sent[0];
        if (!(packet instanceof UpdateAbilitiesPacket)) throw new Error('expected UpdateAbilitiesPacket');
        expect(packet.targetActorUniqueId).toBe(7n);
        expect(packet.playerPermission).toBe(PlayerPermissionLevel.MEMBER);
        expect(packet.commandPermission).toBe(CommandPermissionLevel.ANY);
        expect(packet.abilityLayers).toHaveLength(1);

        const layer = packet.abilityLayers[0]!;
        expect(layer.layerType).toBe(AbilityLayerType.BASE);
        expect(layer.layerFlags.size).toBe(AbilityLayerFlag.ABILITY_COUNT);
        // Build, Mine, DoorsAndSwitches, OpenContainers, AttackPlayers, AttackMobs.
        expect(layer.getEncodedFlags()).toEqual({ flagsHash: EVERY_ABILITY, valuesHash: 0x3f });
        expect(layer.walkSpeed).toBe(0.1);
        expect(layer.flySpeed).toBe(0.05);
        expect(layer.verticalFlySpeed).toBe(1);
    });

    it('writes the survival layer as the bytes the docs lay out', async () => {
        const { session, sent } = sessionFor(playerIn({ gamemode: Gametype.SURVIVAL }));

        await session.sendAbilities();
        const packet = sent[0]!;
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.concat([
                Buffer.from([0xbb, 0x01]), // header: varuint 187
                Buffer.from([0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Target Player Raw Id: int64 LE 7
                Buffer.from([0x01]), // Player Permissions: int8 Member
                Buffer.from([0x00]), // Command Permissions: uint8 Any
                Buffer.from([0x01]), // Layers: varuint32 count 1
                Buffer.from([0x01, 0x00]), // SerializedLayer: uint16 LE Base
                Buffer.from([0xff, 0xff, 0x0f, 0x00]), // AbilitiesSet: bits 0 through 19
                Buffer.from([0x3f, 0x00, 0x00, 0x00]), // AbilityValues: bits 0 through 5
                floatLE(0.05), // FlySpeed
                floatLE(1), // VerticalFlySpeed
                floatLE(0.1) // WalkSpeed
            ])
        );
    });

    it('grants a flying creative operator the op, flight and instabuild bits', async () => {
        const { session, sent } = sessionFor(playerIn({ gamemode: Gametype.CREATIVE, op: true, flying: true }));

        await session.sendAbilities();

        const packet = sent[0];
        if (!(packet instanceof UpdateAbilitiesPacket)) throw new Error('expected UpdateAbilitiesPacket');
        expect(packet.playerPermission).toBe(PlayerPermissionLevel.OPERATOR);
        expect(packet.commandPermission).toBe(CommandPermissionLevel.GAME_DIRECTORS);
        // The survival six plus OperatorCommands, Teleport, Invulnerable, Flying, MayFly,
        // Instabuild.
        expect(packet.abilityLayers[0]!.getEncodedFlags()).toEqual({ flagsHash: EVERY_ABILITY, valuesHash: 0xfff });
    });

    it('withholds interaction from a spectator and marks them flying through walls', async () => {
        const { session, sent } = sessionFor(playerIn({ gamemode: Gametype.SPECTATOR }));

        await session.sendAbilities();

        const packet = sent[0];
        if (!(packet instanceof UpdateAbilitiesPacket)) throw new Error('expected UpdateAbilitiesPacket');
        // Invulnerable, Flying, MayFly, NoClip.
        expect(packet.abilityLayers[0]!.getEncodedFlags()).toEqual({
            flagsHash: EVERY_ABILITY,
            valuesHash: (1 << 8) | (1 << 9) | (1 << 10) | (1 << 17)
        });
    });
});
