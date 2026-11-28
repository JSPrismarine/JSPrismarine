import { Difficulty, Gametype, LevelEvent, TitleType } from '@jsprismarine/minecraft';
import LevelEventPacket from '@jsprismarine/protocol/bedrock/packet/LevelEventPacket';
import TransferPacket from '@jsprismarine/protocol/bedrock/packet/TransferPacket';
import { TakeItemActorPacket } from '@jsprismarine/protocol';
import UnlockedRecipesPacket, {
    UnlockedRecipesType
} from '@jsprismarine/protocol/bedrock/packet/UnlockedRecipesPacket';
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

import { PlayerRespawnState } from '@jsprismarine/minecraft';
import ActorEventPacket, { ActorEvent } from '@jsprismarine/protocol/bedrock/packet/ActorEventPacket';
import DeathInfoPacket from '@jsprismarine/protocol/bedrock/packet/DeathInfoPacket';
import RespawnPacket from '@jsprismarine/protocol/bedrock/packet/RespawnPacket';
import ChangeDimensionPacket from '@jsprismarine/protocol/bedrock/packet/ChangeDimensionPacket';
import PlayerActionPacket from '@jsprismarine/protocol/bedrock/packet/PlayerActionPacket';
import { PlayerActionType } from '@jsprismarine/protocol';
import SetActorMotionPacket from '@jsprismarine/protocol/bedrock/packet/SetActorMotionPacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/bedrock/packet/UpdateAttributesPacket';
import { Attribute, AttributeIds } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import { SetHealthPacket } from '@jsprismarine/protocol';

import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';
import ContainerOpenPacket from '@jsprismarine/protocol/bedrock/packet/ContainerOpenPacket';
import InventoryContentPacket from '@jsprismarine/protocol/bedrock/packet/InventoryContentPacket';
import HumanInventory from '../../../inventory/HumanInventory';
import { WindowIds } from '../../../inventory/WindowIds';
import { WindowTypes } from '../../../inventory/WindowTypes';

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

    it('names a recipe book change by the entries each recipe went out as', async () => {
        const sent: NetworkPacket[] = [];
        const entries: Readonly<Record<string, readonly string[]>> = {
            'minecraft:torch': ['minecraft:torch'],
            'minecraft:shulker_box_coloring': [
                'minecraft:shulker_box_coloring',
                'minecraft:shulker_box_coloring_from_x'
            ]
        };
        const bedrock = new BedrockPresenter(
            { sendDataPacket: async (packet) => void sent.push(packet) },
            (recipe) => entries[recipe] ?? []
        );

        await bedrock.showRecipeBook({
            kind: 'initial',
            recipes: ['minecraft:torch', 'minecraft:shulker_box_coloring']
        });
        // A recipe outside the book, such as a stonecutter one, names no entry, so this sends nothing.
        await bedrock.showRecipeBook({ kind: 'unlocked', recipes: ['minecraft:stone_slab_from_stonecutting'] });
        await bedrock.showRecipeBook({ kind: 'locked', recipes: ['minecraft:torch'] });

        expect(
            sent.map((packet) => (packet instanceof UnlockedRecipesPacket ? packet.getPacketData() : packet))
        ).toEqual([
            {
                type: UnlockedRecipesType.INITIALLY_UNLOCKED_RECIPES,
                recipes: ['minecraft:torch', 'minecraft:shulker_box_coloring', 'minecraft:shulker_box_coloring_from_x']
            },
            { type: UnlockedRecipesType.REMOVE_UNLOCKED_RECIPES, recipes: ['minecraft:torch'] }
        ]);
    });

    it('sends an empty book at join, so a new player starts from none', async () => {
        const { sent, presenter: bedrock } = presenter();

        await bedrock.showRecipeBook({ kind: 'initial', recipes: [] });

        const [book] = sent;
        if (!(book instanceof UnlockedRecipesPacket)) throw new Error('expected UnlockedRecipesPacket');
        expect(book.getPacketData()).toEqual({ type: UnlockedRecipesType.INITIALLY_UNLOCKED_RECIPES, recipes: [] });
    });

    describe("the player's own state", () => {
        /** A presenter for player 7, whose client last sent input tick 42. */
        const player7 = () => {
            const sent: NetworkPacket[] = [];
            const bedrock = new BedrockPresenter(
                { sendDataPacket: async (packet) => void sent.push(packet) },
                undefined,
                {
                    runtimeId: 7n,
                    lastInputTick: () => 42n
                }
            );
            return { sent, bedrock };
        };
        const health = () => new Attribute({ name: AttributeIds.Health, min: 0, max: 20, def: 20, value: 7 });

        it("stamps the client's last input tick on the player's own attributes and motion, and zero on another's", async () => {
            const { sent, bedrock } = player7();

            await bedrock.showAttributes(7n, [health()]);
            await bedrock.showAttributes(8n, [health()]);
            await bedrock.showMotion({ x: 0, y: 0.4, z: 0 });

            const ticks = sent.map((packet) =>
                packet instanceof UpdateAttributesPacket || packet instanceof SetActorMotionPacket
                    ? packet.tick
                    : undefined
            );
            expect(ticks).toEqual([42n, 0n, 42n]);
        });

        it('opens the death screen with the cause, then where the player will come back', async () => {
            const { sent, bedrock } = player7();

            await bedrock.showDeath({
                key: 'death.attack.drown',
                parameters: ['Steve'],
                respawnAt: { x: 1, y: 64, z: 2 }
            });

            const [info, respawn] = sent;
            if (!(respawn instanceof RespawnPacket) || !(info instanceof DeathInfoPacket)) {
                throw new Error('expected DeathInfo then Respawn');
            }
            expect(respawn.getPacketData()).toMatchObject({
                state: PlayerRespawnState.SEARCHING_FOR_SPAWN,
                position: { x: 1, y: 64, z: 2 },
                runtimeEntityId: 0n
            });
            expect(info.getPacketData()).toEqual({ cause: 'death.attack.drown', messages: ['Steve'] });
        });

        it('shows the player alive again with its health', async () => {
            const { sent, bedrock } = player7();

            await bedrock.showRespawned(20);

            const [event, health] = sent;
            if (!(event instanceof ActorEventPacket) || !(health instanceof SetHealthPacket)) {
                throw new Error('expected ActorEvent then SetHealth');
            }
            expect([event.runtimeEntityId, event.event]).toEqual([7n, ActorEvent.SPAWN_ALIVE]);
            expect(health.getPacketData()).toEqual({ health: 20 });
        });
    });

    describe('the world change and the respawn exchange', () => {
        /** A presenter for player 7 whose session numbers loading screens from 5. */
        const player7 = () => {
            const sent: NetworkPacket[] = [];
            let next = 5;
            const bedrock = new BedrockPresenter(
                { sendDataPacket: async (packet) => void sent.push(packet) },
                undefined,
                { runtimeId: 7n, lastInputTick: () => 0n, loadingScreens: { begin: () => next++ } }
            );
            return { sent, bedrock };
        };
        const overworld = { id: 'minecraft:overworld', seaLevel: 63, bedrockId: 0 };
        const nether = { id: 'minecraft:the_nether', seaLevel: 32, bedrockId: 1 };
        const change = (from: typeof overworld, dimension: typeof overworld) => ({
            gamemode: Gametype.SURVIVAL,
            dimension,
            from,
            feet: { x: 1, y: 70, z: 2 },
            eyes: { x: 1, y: 71.62, z: 2 },
            keepData: true,
            replacesWorld: false
        });

        it('sends the change and the server ack, as the pinned servers do, and waits on its screen', async () => {
            const { sent, bedrock } = player7();

            const shown = bedrock.showWorldChange(change(overworld, nether));
            await shown.sent;

            expect(shown.loadingScreen).toBe(5);
            const [dimension, ack, ...rest] = sent;
            if (!(dimension instanceof ChangeDimensionPacket) || !(ack instanceof PlayerActionPacket)) {
                throw new Error('expected ChangeDimension then PlayerAction');
            }
            expect(dimension.getPacketData()).toMatchObject({ dimension: 1, respawn: false, loadingScreenId: 5 });
            expect(ack.getPacketData()).toMatchObject({
                runtimeEntityId: 7n,
                action: PlayerActionType.ChangeDimensionAck
            });
            expect(rest).toEqual([]);
        });

        it('goes through another dimension first between two worlds of one Bedrock id', async () => {
            const { sent, bedrock } = player7();

            const shown = bedrock.showWorldChange(change(nether, nether));
            await shown.sent;

            const dimensions = sent.flatMap((packet) =>
                packet instanceof ChangeDimensionPacket ? [packet.getPacketData()?.dimension] : []
            );
            expect(dimensions).toEqual([1, 0, 0, 1]);
            // The session waits on the last screen, the real change's.
            expect(shown.loadingScreen).toBe(8);
        });

        it('tells a dead player the block, then the eyes, and a living one the eyes alone', async () => {
            const { sent, bedrock } = player7();

            await bedrock.showRespawnPoint({ block: { x: 1, y: 70, z: 2 }, eyes: { x: 1, y: 71.62, z: 2 } });
            await bedrock.showRespawnPoint({ eyes: { x: 3, y: 65.62, z: 4 } });

            const states = sent.map((packet) =>
                packet instanceof RespawnPacket
                    ? [packet.getPacketData()?.state, packet.getPacketData()?.runtimeEntityId]
                    : undefined
            );
            expect(states).toEqual([
                [PlayerRespawnState.SEARCHING_FOR_SPAWN, 0n],
                [PlayerRespawnState.READY_TO_SPAWN, 0n],
                [PlayerRespawnState.READY_TO_SPAWN, 0n]
            ]);
        });

        it('refuses a world change without a session to number its screen', () => {
            const { presenter: bedrock } = presenter();

            expect(() => bedrock.showWorldChange(change(overworld, nether))).toThrow(
                PrismarineNetworkErrors.PresenterHasNoSession
            );
        });
    });

    describe("the player's own inventory", () => {
        it('refuses to show the inventory without a session to read it from', async () => {
            const { presenter: bedrock } = presenter();

            await expect(bedrock.showInventory()).rejects.toBeInstanceOf(PrismarineNetworkErrors.PresenterHasNoSession);
        });

        it('opens the inventory under the window the session opened, and sends its contents under it', async () => {
            const sent: NetworkPacket[] = [];
            const opened: number[] = [];
            const bedrock = new BedrockPresenter(
                { sendDataPacket: async (packet) => void sent.push(packet) },
                undefined,
                {
                    runtimeId: 7n,
                    lastInputTick: () => 0n,
                    inventory: {
                        inventory: () => new HumanInventory(),
                        codecContext: () => ({ protocolVersion: 2193 }),
                        equipment: () => ({}),
                        openWindow: (containerType) => {
                            opened.push(containerType);
                            return WindowIds.FIRST;
                        }
                    }
                }
            );

            await bedrock.openOwnInventory();

            const [open, contents] = sent;
            if (!(open instanceof ContainerOpenPacket) || !(contents instanceof InventoryContentPacket)) {
                throw new Error('expected ContainerOpen then InventoryContent');
            }
            expect(opened).toEqual([WindowTypes.INVENTORY]);
            expect([open.windowId, open.containerEntityId]).toEqual([WindowIds.FIRST, 7n]);
            expect(contents.windowId).toBe(WindowIds.FIRST);
        });
    });
});
