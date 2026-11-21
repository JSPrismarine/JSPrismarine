import { Gametype } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { PositionMode, SetTimePacket, TextPacketType } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import ContainerClosePacket from '@jsprismarine/protocol/bedrock/packet/ContainerClosePacket';
import MovePlayerPacket from '@jsprismarine/protocol/bedrock/packet/MovePlayerPacket';
import PlayerListPacket from '@jsprismarine/protocol/bedrock/packet/PlayerListPacket';
import { PlayerListAction } from '@jsprismarine/protocol/bedrock/wire/structures/PlayerListEntry';
import Skin from '@jsprismarine/protocol/bedrock/wire/structures/skin/Skin';
import UUID from '@jsprismarine/protocol/bedrock/wire/structures/UUID';
import SetDefaultGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetDefaultGameTypePacket';
import SetPlayerGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetPlayerGameTypePacket';
import TextPacket from '@jsprismarine/protocol/bedrock/packet/TextPacket';
import UpdateAdventureSettingsPacket from '@jsprismarine/protocol/bedrock/packet/UpdateAdventureSettingsPacket';
import UpdatePlayerGameTypePacket from '@jsprismarine/protocol/bedrock/packet/UpdatePlayerGameTypePacket';
import { describe, expect, it } from 'vitest';

import { BedrockPresenter } from './BedrockPresenter';

/** A presenter over a connection that keeps what it was asked to send. */
const presenter = () => {
    const sent: NetworkPacket[] = [];
    return { sent, presenter: new BedrockPresenter({ sendDataPacket: async (packet) => void sent.push(packet) }) };
};

describe('BedrockPresenter', () => {
    it('sends the time of day', async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.sendTime(6000);

        const [packet] = sent;
        if (!(packet instanceof SetTimePacket)) throw new Error('expected SetTimePacket');
        expect(sent).toHaveLength(1);
        expect(packet.getPacketData()).toEqual({ time: 6000 });
    });

    it("sends the client's own game mode", async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.sendGamemode(Gametype.CREATIVE);

        const [packet] = sent;
        if (!(packet instanceof SetPlayerGameTypePacket)) throw new Error('expected SetPlayerGameTypePacket');
        expect(packet.getPacketData()).toEqual({ gametype: Gametype.CREATIVE });
    });

    it("sends the server's default game mode", async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.sendDefaultGameMode(Gametype.ADVENTURE);

        expect(sent[0]).toBeInstanceOf(SetDefaultGameTypePacket);
        expect(sent[0]).toMatchObject({ gamemode: Gametype.ADVENTURE });
    });

    it('answers a close with the id and type the client sent, never as server initiated', async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.containerClosed(3, 7);

        expect(sent[0]).toBeInstanceOf(ContainerClosePacket);
        expect(sent[0]).toMatchObject({ containerId: 3, containerType: 7, serverInitiatedClose: false });
    });

    it('sends a JSON text object as the one Text type the client parses one in', async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.sendMessage({
            message: '{"rawtext":[{"text":"hi"}]}',
            kind: 'rawText',
            parameters: [],
            needsTranslation: false,
            sourceName: '',
            xuid: ''
        });

        const [packet] = sent;
        if (!(packet instanceof TextPacket)) throw new Error('expected TextPacket');
        expect(packet.getPacketData()).toMatchObject({ type: TextPacketType.TextObject, filtered: '' });
    });

    it('sends a translation with its key and parameters', async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.sendMessage({
            message: 'chat.type.achievement',
            kind: 'translation',
            parameters: ['Steve', 'Stone Age'],
            needsTranslation: true,
            sourceName: '',
            xuid: ''
        });

        const [packet] = sent;
        if (!(packet instanceof TextPacket)) throw new Error('expected TextPacket');
        expect(packet.getPacketData()).toMatchObject({
            type: TextPacketType.Translate,
            message: 'chat.type.achievement',
            parameters: ['Steve', 'Stone Age'],
            needsTranslation: true
        });
    });

    it("sends another player's game mode with the tick it was given", async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.sendPlayerGameMode(9n, Gametype.SPECTATOR, 42n);

        const [packet] = sent;
        if (!(packet instanceof UpdatePlayerGameTypePacket)) throw new Error('expected UpdatePlayerGameTypePacket');
        expect(packet.getPacketData()).toEqual({ playerGameType: Gametype.SPECTATOR, targetPlayer: 9n, tick: 42n });
    });

    it('freezes the world for a spectator and leaves it alone for a survival player', async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.sendInteractionSettings(Gametype.SPECTATOR);
        await bedrock.sendInteractionSettings(Gametype.SURVIVAL);

        const [spectator, survival] = sent;
        if (!(spectator instanceof UpdateAdventureSettingsPacket)) throw new Error('expected UpdateAdventureSettings');
        if (!(survival instanceof UpdateAdventureSettingsPacket)) throw new Error('expected UpdateAdventureSettings');
        expect(spectator.getPacketData()).toMatchObject({
            worldImmutable: true,
            noAttackingPlayers: true,
            noAttackingMobs: true
        });
        expect(survival.getPacketData()).toMatchObject({
            worldImmutable: false,
            noAttackingPlayers: false,
            noAttackingMobs: false
        });
    });

    it('turns only the head of a player in a vehicle, with no teleport data', async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.sendMove({
            runtimeId: 4n,
            position: new Vector3(1, 65.62, 1),
            pitch: 0,
            yaw: 90,
            headYaw: 90,
            onGround: false,
            mode: 'headRotation',
            inputTick: 0n
        });

        const [packet] = sent;
        if (!(packet instanceof MovePlayerPacket)) throw new Error('expected MovePlayerPacket');
        expect(packet.getPacketData()).toMatchObject({
            runtimeEntityId: 4n,
            mode: PositionMode.OnlyHeadRot,
            teleportData: null,
            tick: 0n
        });
    });

    it('lists every player in one Add, neither as a teacher nor as the host', async () => {
        const { sent, presenter: bedrock } = presenter();
        const listed = (name: string, runtimeId: bigint) => ({
            uuid: UUID.fromRandom(),
            runtimeId,
            name,
            xuid: '',
            platformChatId: '',
            buildPlatform: 7,
            skin: new Skin()
        });

        await bedrock.sendPlayerList([listed('Steve', 1n), listed('Alex', 2n)]);

        const [packet] = sent;
        if (!(packet instanceof PlayerListPacket)) throw new Error('expected PlayerListPacket');
        expect(packet.type).toBe(PlayerListAction.TYPE_ADD);
        expect(
            packet.entries.map((entry) => [entry.getName(), entry.getRuntimeId(), entry.isTeacher(), entry.isHost()])
        ).toEqual([
            ['Steve', 1n, false, false],
            ['Alex', 2n, false, false]
        ]);
    });
});
