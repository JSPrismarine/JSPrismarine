import { Difficulty, Gametype, LevelEvent, TitleType } from '@jsprismarine/minecraft';
import LevelEventPacket from '@jsprismarine/protocol/bedrock/packet/LevelEventPacket';
import TransferPacket from '@jsprismarine/protocol/bedrock/packet/TransferPacket';
import { TakeItemActorPacket } from '@jsprismarine/protocol';
import SetDifficultyPacket from '@jsprismarine/protocol/bedrock/packet/SetDifficultyPacket';
import SetSpawnPositionPacket, {
    SpawnPositionType
} from '@jsprismarine/protocol/bedrock/packet/SetSpawnPositionPacket';
import { Vector3 } from '@jsprismarine/math';
import {
    ObjectiveSortOrder,
    PositionMode,
    RemoveObjectivePacket,
    ScorePacketEntryAction,
    SetDisplayObjectivePacket,
    SetScorePacket,
    SetTimePacket,
    TextPacketType
} from '@jsprismarine/protocol';
import SetTitlePacket from '@jsprismarine/protocol/bedrock/packet/SetTitlePacket';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import BossEventPacket, {
    BossBarColor,
    BossBarOverlay,
    BossEventUpdateType
} from '@jsprismarine/protocol/bedrock/packet/BossEventPacket';
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

        await bedrock.sendTime({ dayTime: 6000, gameTime: 30_000, advancing: true });

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

    it('sends each boss bar change as a BossEvent that fills every field', async () => {
        const { sent, presenter: bedrock } = presenter();
        const bar = {
            id: 1,
            actorUniqueId: 42n,
            title: 'Ender Dragon',
            progress: 0.5,
            color: 'rebeccaPurple',
            style: 'notched10'
        } as const;

        await bedrock.showBossBar('add', bar);
        await bedrock.showBossBar('progress', bar);
        await bedrock.showBossBar('name', bar);
        await bedrock.showBossBar('remove', bar);

        const events = sent.filter((packet) => packet instanceof BossEventPacket);
        expect(events.map((event) => event.eventType)).toEqual([
            BossEventUpdateType.Add,
            BossEventUpdateType.UpdatePercent,
            BossEventUpdateType.UpdateName,
            BossEventUpdateType.Remove
        ]);
        for (const event of events) {
            expect(event).toMatchObject({
                targetActorId: 42n,
                name: 'Ender Dragon',
                filteredName: '',
                healthPercent: 0.5,
                color: BossBarColor.RebeccaPurple,
                overlay: BossBarOverlay.Notched10
            });
        }
    });

    it('sends a title as SetTitle, picking the text object type for a rawtext title', async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.showTitle({ kind: 'title', text: '{"rawtext":[]}', raw: true });
        await bedrock.showTitle({ kind: 'actionbar', text: 'hi' });
        await bedrock.showTitle({ kind: 'times', fadeIn: 1, stay: 2, fadeOut: 3 });

        const titles = sent.filter((packet) => packet instanceof SetTitlePacket);
        expect(titles.map(({ titleType }) => titleType)).toEqual([
            TitleType.TITLE_TEXT_OBJECT,
            TitleType.ACTIONBAR,
            TitleType.TIMES
        ]);
        expect(titles[1]?.titleText).toBe('hi');
        expect([titles[2]?.fadeInTime, titles[2]?.stayTime, titles[2]?.fadeOutTime]).toEqual([1, 2, 3]);
    });

    it('draws a slot as its header and every score, and sends score changes and removals', async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.showDisplaySlot('sidebar', {
            name: 'kills',
            displayName: 'Kills',
            criterion: 'dummy',
            sortOrder: 'descending',
            scores: [{ holder: 'Steve', identity: 1n, value: 3 }]
        });
        await bedrock.showDisplaySlot('list', undefined);
        await bedrock.showScore('kills', { holder: 'Steve', identity: 1n }, undefined);
        await bedrock.removeObjective('kills');

        const [header, scores, cleared, reset, removed] = sent;
        expect(header).toBeInstanceOf(SetDisplayObjectivePacket);
        expect(header).toMatchObject({
            displaySlotName: 'sidebar',
            objectiveName: 'kills',
            objectiveDisplayName: 'Kills',
            sortOrder: ObjectiveSortOrder.Descending
        });
        expect(scores).toBeInstanceOf(SetScorePacket);
        expect(scores).toMatchObject({
            entries: [
                {
                    action: ScorePacketEntryAction.ChangeFakePlayer,
                    scoreboardId: 1n,
                    objectiveName: 'kills',
                    scoreValue: 3,
                    fakePlayerName: 'Steve'
                }
            ]
        });
        expect(cleared).toMatchObject({ displaySlotName: 'list' });
        expect(reset).toMatchObject({
            entries: [{ action: ScorePacketEntryAction.Remove, scoreboardId: 1n, objectiveName: 'kills' }]
        });
        expect(removed).toBeInstanceOf(RemoveObjectivePacket);
        expect(sent).toHaveLength(5);
    });

    it('sends the weather as level events, the stops first for a client that may hold any', async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.showWeather(undefined, 'thunder');
        await bedrock.showWeather('thunder', 'clear');

        expect(
            sent.map((packet) => (packet instanceof LevelEventPacket ? packet.getPacketData()?.eventId : packet))
        ).toEqual([
            LevelEvent.STOP_THUNDERSTORM,
            LevelEvent.STOP_RAINING,
            LevelEvent.START_RAINING,
            LevelEvent.START_THUNDERSTORM,
            LevelEvent.STOP_THUNDERSTORM,
            LevelEvent.STOP_RAINING
        ]);
    });

    it('sends the difficulty and the world spawn, and nothing for the tick rate', async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.showDifficulty(Difficulty.HARD);
        await bedrock.showWorldSpawn({
            dimension: { id: 'minecraft:the_nether', bedrockId: 1 },
            position: { x: 1, y: 2, z: 3 },
            yaw: 0
        });
        await bedrock.showTicking();
        await bedrock.showTickStep();

        const [difficulty, spawn] = sent;
        expect(difficulty).toBeInstanceOf(SetDifficultyPacket);
        if (!(spawn instanceof SetSpawnPositionPacket)) throw new Error('expected SetSpawnPositionPacket');
        expect(spawn.getPacketData()).toMatchObject({ type: SpawnPositionType.WorldSpawn, dimension: 1 });
        expect(sent).toHaveLength(2);
    });

    it('sends a transfer as Transfer, keeping the world loaded until the other server sends its own', async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.transfer('play.example.org', 19_132);

        const [transfer] = sent;
        if (!(transfer instanceof TransferPacket)) throw new Error('expected TransferPacket');
        expect(transfer.getPacketData()).toMatchObject({
            address: 'play.example.org',
            port: 19_132,
            reloadWorld: false
        });
    });

    it('sends a pickup as TakeItemActor, and leaves experience to the attributes', async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.showPickUp(20n, 7n);
        await bedrock.showExperience();

        const [take] = sent;
        if (!(take instanceof TakeItemActorPacket)) throw new Error('expected TakeItemActorPacket');
        expect([take.itemRuntimeEntityId, take.takerRuntimeEntityId]).toEqual([20n, 7n]);
        expect(sent).toHaveLength(1);
    });
});
