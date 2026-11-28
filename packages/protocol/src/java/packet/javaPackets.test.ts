import { describe, expect, it } from 'vitest';

import { LevelChunkWithLight, JavaHeightmapType } from '../chunk/levelChunk';
import { NEWEST_JAVA_RELEASE } from '../versions/javaReleases';
import {
    AcknowledgeFinishConfiguration,
    ClientboundKnownPacks,
    ClientboundPluginMessage,
    ConfigurationClientboundKeepAlive,
    ConfigurationClientInformation,
    ConfigurationDisconnect,
    ConfigurationResourcePackPop,
    ConfigurationResourcePackPush,
    ConfigurationResourcePackResponse,
    ConfigurationServerboundKeepAlive,
    FeatureFlags,
    FinishConfiguration,
    JavaChatVisibility,
    JavaMainHand,
    JavaParticleStatus,
    JavaResourcePackAction,
    RegistryData,
    ServerboundKnownPacks,
    ServerboundPluginMessage,
    UpdateTags,
    brandOf,
    brandPayload
} from './configuration';
import { ClientIntent, Intention } from './handshake';
import type { JavaPacketDefinition, JavaPayload } from './JavaPacket';
import { decodeJavaPacket, encodeJavaPacket, javaPacketId, readJavaPacketId } from './JavaPacket';
import { JAVA_PACKETS, javaPacketsById } from './javaPackets';
import {
    EncryptionRequest,
    EncryptionResponse,
    LoginAcknowledged,
    LoginDisconnect,
    LoginStart,
    LoginSuccess,
    SetCompression
} from './login';
import {
    AddEntity,
    BlockChangedAck,
    BlockUpdate,
    BossEvent,
    ChangeDifficulty,
    ChatCommand,
    ChatMessage,
    ChunkBatchFinished,
    ChunkBatchReceived,
    ChunkBatchStart,
    ClearTitles,
    ClientCommand,
    ClientCommandAction,
    ClientboundKeepAlive,
    ConfirmTeleportation,
    ContainerSetContent,
    ContainerSetSlot,
    ForgetLevelChunk,
    GameEvent,
    JavaDifficulty,
    JavaBossBarColor,
    JavaBossBarOverlay,
    JavaBossEventOperation,
    JavaDisplaySlot,
    JavaEntityDataSerializer,
    JavaEquipmentSlot,
    JavaHand,
    JavaNumberFormatType,
    JavaObjectiveMethod,
    JavaObjectiveRenderType,
    MOVE_ON_GROUND,
    MovePlayerPos,
    MovePlayerPosRot,
    MovePlayerRot,
    MovePlayerStatusOnly,
    PlayDisconnect,
    PlayLogin,
    PlayerAction,
    PlayerActionStatus,
    PlayerCombatKill,
    PlayerCommand,
    PlayerCommandAction,
    PlayerInfoAction,
    PlayerInfoAdd,
    PlayerInfoRemove,
    PlayerInfoUpdateGameMode,
    PlayerInput,
    Attack,
    Interact,
    UseItem,
    SetStructureBlock,
    JavaStructureUpdateType,
    EditBook,
    SetCommandBlock,
    SetCommandMinecart,
    JavaCommandBlockMode,
    JavaCommandBlockFlag,
    RecipeBookChangeSettings,
    JavaRecipeBookType,
    PickItemFromBlock,
    PickItemFromEntity,
    PlayerInputFlag,
    PlayerLoaded,
    RemoveEntities,
    ResetScore,
    Respawn,
    RotateHead,
    START_WAITING_FOR_LEVEL_CHUNKS,
    SectionBlocksUpdate,
    ServerboundKeepAlive,
    SetActionBarText,
    SetChunkCacheRadius,
    SetDefaultSpawnPosition,
    SetSimulationDistance,
    SetTime,
    TickingState,
    TickingStep,
    TakeItemEntity,
    SetExperience,
    PlayClientInformation,
    PlayPingRequest,
    PlayPongResponse,
    PlayServerboundPluginMessage,
    PlayTransfer,
    ServerData,
    SetCarriedItem,
    SetCenterChunk,
    SetCreativeModeSlot,
    SetDisplayObjective,
    SetEntityData,
    SetEquipment,
    SetHealth,
    SetHeldSlot,
    SetObjective,
    SetScore,
    SetSubtitleText,
    SetTitleText,
    SetTitlesAnimation,
    SystemChat,
    SynchronizePlayerPosition,
    TeleportEntity,
    PlayResourcePackPop,
    PlayResourcePackPush,
    PlayResourcePackResponse,
    UseItemOn
} from './play';
import { PingRequest, PongResponse, StatusRequest, StatusResponse } from './status';

/** One packet and payloads it has to carry unchanged, as either end of a connection writes them. */
interface Sample {
    readonly definition: JavaPacketDefinition;
    /** Each payload's round trip: written, read back as the same value, and written to the same bytes. */
    readonly roundTrips: readonly (() => void)[];
}

const roundTrip = <D extends JavaPacketDefinition>(definition: D, value: JavaPayload<D>): void => {
    const frame = encodeJavaPacket(NEWEST_JAVA_RELEASE, definition, value);
    const { id, body } = readJavaPacketId(frame);

    expect(id).toBe(javaPacketId(NEWEST_JAVA_RELEASE, definition));
    const read = decodeJavaPacket(NEWEST_JAVA_RELEASE, definition, body);
    expect(read).toEqual(value);
    expect(encodeJavaPacket(NEWEST_JAVA_RELEASE, definition, read)).toEqual(frame);
};

const sample = <D extends JavaPacketDefinition>(definition: D, ...values: JavaPayload<D>[]): Sample => ({
    definition,
    roundTrips: values.map((value) => () => roundTrip(definition, value))
});

const STEVE = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const SPAWN_INFO = {
    dimensionType: 0,
    dimension: 'minecraft:overworld',
    hashedSeed: -42n,
    gameMode: 0,
    previousGameMode: null,
    isDebug: false,
    isFlat: true,
    deathLocation: { dimension: 'minecraft:the_nether', position: 12_345n },
    portalCooldown: 0,
    seaLevel: -63
};

/**
 * A payload for every packet. A packet the server only reads still has to write, since the client
 * package sends it, and one it only writes still has to read, since the client package reads it.
 * Each value uses only what the wire keeps exactly: an angle in 256ths of a turn, a float a
 * float holds.
 */
/** A client's settings, as the configuration and play packets both carry them. */
const SETTINGS = {
    language: 'sv_se',
    viewDistance: 12,
    chatVisibility: JavaChatVisibility.System,
    chatColors: false,
    modelCustomisation: 0x7f,
    mainHand: JavaMainHand.Left,
    textFilteringEnabled: true,
    allowsListing: false,
    particleStatus: JavaParticleStatus.Decreased
};
const SAMPLES: readonly Sample[] = [
    sample(Intention, {
        protocolVersion: NEWEST_JAVA_RELEASE.protocolVersion,
        serverAddress: 'localhost',
        serverPort: 25_565,
        intent: ClientIntent.Login
    }),
    sample(StatusRequest, {}),
    sample(StatusResponse, { json: '{"version":{"name":"26.3"}}' }),
    sample(PingRequest, { timestamp: 1_700_000_000_000n }),
    sample(PongResponse, { timestamp: -1n }),
    sample(LoginDisconnect, { reason: '{"text":"Bye"}' }),
    sample(LoginStart, { name: 'Steve', profileId: STEVE }),
    sample(EncryptionRequest, {
        serverId: '',
        publicKey: Buffer.from([1, 2, 3]),
        verifyToken: Buffer.from([4, 5, 6, 7]),
        shouldAuthenticate: true
    }),
    sample(EncryptionResponse, { sharedSecret: Buffer.alloc(128, 1), verifyToken: Buffer.alloc(128, 2) }),
    sample(SetCompression, { threshold: 256 }),
    sample(LoginSuccess, {
        uuid: STEVE,
        username: 'Steve',
        properties: [
            { name: 'textures', value: 'e30=', signature: null },
            { name: 'textures', value: 'e30=', signature: 'c2ln' }
        ],
        sessionId: '83b77f6c-6c4b-4976-b32e-1c63c8d95583'
    }),
    sample(LoginAcknowledged, {}),
    sample(ConfigurationDisconnect, { reason: 'Bye' }, { reason: { translate: 'disconnect.timeout' } }),
    sample(ClientboundKnownPacks, { packs: [{ namespace: 'minecraft', id: 'core', version: '26.3' }] }),
    sample(ServerboundKnownPacks, { packs: [{ namespace: 'minecraft', id: 'core', version: '26.3' }] }, { packs: [] }),
    sample(RegistryData, {
        registry: 'minecraft:dimension_type',
        entries: [
            { id: 'minecraft:overworld', data: null },
            { id: 'minecraft:the_end', data: null }
        ]
    }),
    sample(UpdateTags, {
        registries: [{ registry: 'minecraft:block', tags: [{ name: 'minecraft:logs', entries: [1, 2, 300] }] }]
    }),
    sample(FeatureFlags, { features: ['minecraft:vanilla'] }),
    sample(ClientboundPluginMessage, { channel: 'minecraft:brand', data: brandPayload('JSPrismarine') }),
    sample(FinishConfiguration, {}),
    sample(
        ConfigurationResourcePackPush,
        {
            id: STEVE,
            url: 'http://127.0.0.1:25565/resource-packs/0123456789abcdef0123456789abcdef01234567.zip',
            hash: '0123456789abcdef0123456789abcdef01234567',
            required: true,
            prompt: 'Take the pack'
        },
        { id: STEVE, url: 'https://example.com/pack.zip', hash: '', required: false, prompt: null }
    ),
    sample(ConfigurationResourcePackPop, { id: STEVE }, { id: null }),
    sample(ConfigurationResourcePackResponse, { id: STEVE, action: JavaResourcePackAction.Declined }),
    sample(PlayResourcePackPush, {
        id: STEVE,
        url: 'https://example.com/pack.zip',
        hash: '0123456789abcdef0123456789abcdef01234567',
        required: false,
        prompt: { translate: 'addServer.resourcePack' }
    }),
    sample(PlayResourcePackPop, { id: null }),
    sample(PlayResourcePackResponse, { id: STEVE, action: JavaResourcePackAction.SuccessfullyLoaded }),
    sample(AcknowledgeFinishConfiguration, {}),
    sample(
        PlayDisconnect,
        { reason: 'Kicked' },
        { reason: { translate: 'multiplayer.disconnect.kicked', with: ['Steve', { translate: 'gameMode.creative' }] } }
    ),
    sample(PlayLogin, {
        entityId: 7,
        hardcore: false,
        dimensions: ['minecraft:overworld', 'minecraft:the_nether'],
        maxPlayers: 20,
        viewDistance: 10,
        simulationDistance: 8,
        reducedDebugInfo: false,
        showDeathScreen: true,
        doLimitedCrafting: false,
        ...SPAWN_INFO,
        onlineMode: true,
        enforcesSecureChat: false
    }),
    sample(SynchronizePlayerPosition, {
        teleportId: 1,
        x: 0.5,
        y: -60,
        z: -0.5,
        velocityX: 0,
        velocityY: -0.25,
        velocityZ: 0,
        yaw: 90,
        pitch: -45,
        flags: 0
    }),
    sample(ConfirmTeleportation, { teleportId: 1, x: 0.5, y: -60, z: -0.5, yaw: 90, pitch: -45 }),
    sample(GameEvent, { event: START_WAITING_FOR_LEVEL_CHUNKS, value: 0 }),
    sample(SetCenterChunk, { x: -1, z: 2 }),
    sample(ChunkBatchStart, {}),
    sample(ChunkBatchFinished, { batchSize: 25 }),
    sample(ChunkBatchReceived, { chunksPerTick: 9.5 }),
    sample(ClientboundKeepAlive, { id: 123_456_789n }),
    sample(ServerboundKeepAlive, { id: -1n }),
    sample(MovePlayerPos, { x: 1.5, y: -59, z: 2.25, flags: MOVE_ON_GROUND }),
    sample(MovePlayerPosRot, { x: 1.5, y: -59, z: 2.25, yaw: 180, pitch: 0.5, flags: 0 }),
    sample(MovePlayerRot, { yaw: -90, pitch: 30, flags: MOVE_ON_GROUND }),
    sample(MovePlayerStatusOnly, { flags: MOVE_ON_GROUND }),
    sample(PlayerCommand, { entityId: 7, action: PlayerCommandAction.StartSprinting, data: 0 }),
    sample(PlayerInput, { flags: PlayerInputFlag.Forward | PlayerInputFlag.Jump }),
    sample(PickItemFromBlock, { position: { x: -3, y: 70, z: 12 }, includeData: true }),
    sample(PickItemFromEntity, { entityId: 42, includeData: false }),
    sample(
        SystemChat,
        { content: 'Hello', overlay: false },
        { content: { translate: 'chat.type.text' }, overlay: true }
    ),
    sample(
        ChatMessage,
        {
            message: 'Hello',
            timestamp: 1_700_000_000_000n,
            salt: 0n,
            signature: null,
            lastSeenOffset: 0,
            acknowledged: Buffer.alloc(3),
            checksum: 0
        },
        {
            message: 'Signed',
            timestamp: 1n,
            salt: -5n,
            signature: Buffer.alloc(256, 7),
            lastSeenOffset: 2,
            acknowledged: Buffer.from([1, 0, 0]),
            checksum: 9
        }
    ),
    sample(ChatCommand, { command: 'gamemode creative' }),
    sample(PlayerLoaded, {}),
    sample(AddEntity, {
        entityId: 8,
        uuid: STEVE,
        type: 151,
        x: 0.5,
        y: -60,
        z: 0.5,
        velocity: null,
        pitch: 45,
        yaw: 90,
        headYaw: 180,
        data: 0
    }),
    sample(RemoveEntities, { entityIds: [8, 9] }),
    sample(TeleportEntity, {
        entityId: 8,
        x: 1,
        y: 2,
        z: 3,
        velocityX: 0,
        velocityY: 0,
        velocityZ: 0,
        yaw: 90,
        pitch: 0,
        flags: 0,
        onGround: true
    }),
    sample(RotateHead, { entityId: 8, headYaw: 270 }),
    sample(PlayerInfoAdd, {
        actions: PlayerInfoAction.AddPlayer | PlayerInfoAction.UpdateListed,
        players: [{ uuid: STEVE, name: 'Steve', properties: [], listed: true }]
    }),
    sample(PlayerInfoUpdateGameMode, {
        actions: PlayerInfoAction.UpdateGameMode,
        players: [{ uuid: STEVE, gameMode: 3 }]
    }),
    sample(PlayerInfoRemove, { uuids: [STEVE] }),
    sample(BlockUpdate, { position: { x: -1, y: -64, z: 33_554_431 }, state: 1 }),
    sample(SectionBlocksUpdate, {
        section: { x: -2, y: -4, z: 3 },
        blocks: [
            { state: 1, x: 0, y: 0, z: 0 },
            { state: 30_000, x: 15, y: 15, z: 15 }
        ]
    }),
    sample(PlayerAction, {
        status: PlayerActionStatus.StartDestroyBlock,
        position: { x: 1, y: -61, z: 2 },
        face: 1,
        sequence: 4
    }),
    sample(BlockChangedAck, { sequence: 4 }),
    sample(ContainerSetContent, {
        window: 0,
        stateId: 1,
        items: [null, { item: 1, count: 64 }],
        carried: null
    }),
    sample(
        ContainerSetSlot,
        { window: 0, stateId: 2, slot: 36, item: { item: 5, count: 1 } },
        {
            window: 0,
            stateId: 3,
            slot: 36,
            item: {
                item: 5,
                count: 1,
                components: { 'minecraft:damage': 12, 'minecraft:custom_name': 'Pick' },
                removed: ['minecraft:food']
            }
        }
    ),
    sample(SetHeldSlot, { slot: 8 }),
    sample(SetCarriedItem, { slot: 3 }),
    sample(
        SetCreativeModeSlot,
        { slot: 36, item: { item: 5, count: 1 } },
        { slot: 37, item: null },
        {
            slot: 38,
            item: { item: 5, count: 1, components: { 'minecraft:enchantments': { 'minecraft:efficiency': 3 } } }
        }
    ),
    sample(UseItemOn, {
        hand: JavaHand.Main,
        position: { x: 1, y: -61, z: 2 },
        face: 1,
        cursorX: 0.5,
        cursorY: 1,
        cursorZ: 0.25,
        inside: false,
        worldBorderHit: false,
        sequence: 5
    }),
    sample(UseItem, { hand: JavaHand.Main, sequence: 6, yaw: 90, pitch: -45 }),
    sample(Attack, { entityId: 12 }),
    sample(SetStructureBlock, {
        position: { x: 4, y: 64, z: -3 },
        updateType: JavaStructureUpdateType.SaveArea,
        mode: 0,
        name: 'minecraft:house',
        offsetX: 0,
        offsetY: 1,
        offsetZ: -2,
        sizeX: 5,
        sizeY: 4,
        sizeZ: 6,
        mirror: 0,
        rotation: 1,
        data: '',
        integrity: 1,
        seed: 42n,
        flags: 0x05
    }),
    sample(EditBook, { slot: 3, pages: ['first', 'second'], title: null }),
    sample(EditBook, { slot: 40, pages: ['only'], title: 'Diary' }),
    sample(SetCommandBlock, {
        position: { x: 1, y: 64, z: -2 },
        command: 'say hi',
        mode: JavaCommandBlockMode.Auto,
        flags: JavaCommandBlockFlag.TrackOutput | JavaCommandBlockFlag.Automatic
    }),
    sample(SetCommandMinecart, { entityId: 9, command: 'say hi', trackOutput: false }),
    sample(RecipeBookChangeSettings, { bookType: JavaRecipeBookType.Smoker, isOpen: true, isFiltering: false }),
    // A location whose coordinates quantize exactly: one in each of the scale's units.
    sample(Interact, { entityId: 12, hand: JavaHand.Off, location: { x: 1, y: 0, z: -1 }, sneaking: true }),
    sample(SetHealth, { health: 20, food: 20, saturation: 5 }),
    sample(PlayerCombatKill, { playerId: 7, message: { translate: 'death.attack.fall', with: ['Steve'] } }),
    sample(ClientCommand, { action: ClientCommandAction.PerformRespawn }),
    sample(Respawn, { ...SPAWN_INFO, previousGameMode: 1, deathLocation: null, dataToKeep: 3 }),
    sample(SetEquipment, {
        entityId: 8,
        equipment: [
            { slot: JavaEquipmentSlot.MainHand, item: { item: 5, count: 1 } },
            { slot: JavaEquipmentSlot.Head, item: null }
        ]
    }),
    sample(SetEntityData, {
        entityId: 8,
        entries: [
            { index: 0, serializer: JavaEntityDataSerializer.Byte, value: 0x02 },
            { index: 6, serializer: JavaEntityDataSerializer.Pose, value: 5 },
            { index: 17, serializer: JavaEntityDataSerializer.Int, value: 300 },
            { index: 8, serializer: JavaEntityDataSerializer.ItemStack, value: { item: 1, count: 64 } },
            { index: 8, serializer: JavaEntityDataSerializer.ItemStack, value: null }
        ]
    }),
    sample(
        BossEvent,
        {
            uuid: STEVE,
            operation: {
                type: JavaBossEventOperation.Add,
                title: 'Wither',
                progress: 0.5,
                color: JavaBossBarColor.Purple,
                overlay: JavaBossBarOverlay.Notched10,
                flags: 1
            }
        },
        { uuid: STEVE, operation: { type: JavaBossEventOperation.Remove } },
        { uuid: STEVE, operation: { type: JavaBossEventOperation.UpdateProgress, progress: 0.25 } },
        { uuid: STEVE, operation: { type: JavaBossEventOperation.UpdateName, title: { translate: 'entity.wither' } } },
        {
            uuid: STEVE,
            operation: {
                type: JavaBossEventOperation.UpdateStyle,
                color: JavaBossBarColor.Red,
                overlay: JavaBossBarOverlay.Progress
            }
        },
        { uuid: STEVE, operation: { type: JavaBossEventOperation.UpdateProperties, flags: 6 } }
    ),
    sample(SetTitleText, { text: 'Title' }),
    sample(SetSubtitleText, { text: { translate: 'subtitle' } }),
    sample(SetActionBarText, { text: 'Action bar' }),
    sample(SetTitlesAnimation, { fadeIn: 10, stay: 70, fadeOut: 20 }),
    sample(ClearTitles, { resetTimes: true }),
    sample(
        SetObjective,
        {
            objective: 'kills',
            change: {
                method: JavaObjectiveMethod.Add,
                displayName: 'Kills',
                renderType: JavaObjectiveRenderType.Integer,
                numberFormat: null
            }
        },
        {
            objective: 'kills',
            change: {
                method: JavaObjectiveMethod.Change,
                displayName: 'Hearts',
                renderType: JavaObjectiveRenderType.Hearts,
                numberFormat: { type: JavaNumberFormatType.Fixed, text: '-' }
            }
        },
        { objective: 'kills', change: { method: JavaObjectiveMethod.Remove } }
    ),
    sample(SetDisplayObjective, { slot: JavaDisplaySlot.Sidebar, objective: 'kills' }),
    sample(
        SetScore,
        { owner: 'Steve', objective: 'kills', score: 3, displayName: null, numberFormat: null },
        {
            owner: 'Steve',
            objective: 'kills',
            score: -1,
            displayName: 'Steve!',
            numberFormat: { type: JavaNumberFormatType.Blank }
        }
    ),
    sample(ResetScore, { owner: 'Steve', objective: null }, { owner: 'Steve', objective: 'kills' }),
    sample(SetTime, {
        gameTime: 24_000n,
        clocks: [{ clock: 0, totalTicks: 6_000n, partialTick: 0.5, rate: 1 }]
    }),
    sample(SetDefaultSpawnPosition, {
        dimension: 'minecraft:overworld',
        position: { x: 0, y: -60, z: 0 },
        yaw: 90,
        pitch: 0
    }),
    sample(ChangeDifficulty, { difficulty: JavaDifficulty.Hard, locked: true }),
    sample(ForgetLevelChunk, { z: -3, x: 4 }),
    sample(SetChunkCacheRadius, { radius: 10 }),
    sample(SetSimulationDistance, { distance: 8 }),
    sample(TickingState, { tickRate: 20, frozen: true }),
    sample(TickingStep, { steps: 5 }),
    sample(TakeItemEntity, { itemId: 12, collectorId: 7, amount: 3 }),
    sample(SetExperience, { progress: 0.5, level: 30, total: 1_395 }),
    sample(ServerboundPluginMessage, { channel: 'minecraft:brand', data: brandPayload('vanilla') }),
    sample(ConfigurationClientInformation, SETTINGS),
    sample(ConfigurationClientboundKeepAlive, { id: 123_456_789n }),
    sample(ConfigurationServerboundKeepAlive, { id: -1n }),
    sample(PlayPingRequest, { timestamp: 42n }),
    sample(PlayPongResponse, { timestamp: 42n }),
    sample(PlayClientInformation, SETTINGS),
    sample(PlayServerboundPluginMessage, { channel: 'example:empty', data: Buffer.alloc(0) }),
    sample(
        ServerData,
        { motd: 'A server', icon: null },
        { motd: { translate: 'menu.server' }, icon: Buffer.from([0x89, 0x50]) }
    ),
    sample(PlayTransfer, { host: 'play.example.org', port: 25_565 }),
    sample(LevelChunkWithLight, {
        x: -1,
        z: 0,
        heightmaps: [{ type: JavaHeightmapType.MotionBlocking, data: [0n, -1n] }],
        data: Buffer.from([0, 0, 0, 0]),
        blockEntities: [],
        skyMask: [0, 3, 25],
        blockMask: [],
        emptySkyMask: [1],
        emptyBlockMask: [0, 1, 2],
        skyLight: [Buffer.alloc(2048, 0xff)],
        blockLight: []
    })
];

describe('every Java packet goes both ways', () => {
    it('has a sample for each definition', () => {
        const sampled = new Set(SAMPLES.map(({ definition }) => definition));
        expect(JAVA_PACKETS.filter((definition) => !sampled.has(definition)).map(({ name }) => name)).toEqual([]);
    });

    it.each(
        SAMPLES.flatMap(({ definition, roundTrips }) =>
            roundTrips.map((check, index) => ({ name: definition.name, index, check }))
        )
    )('writes and reads back $name, sample $index', ({ check }) => check());
});

describe('the brand payload', () => {
    it('reads back the name it carries', () => {
        expect(brandOf(brandPayload('JSPrismarine'))).toBe('JSPrismarine');
    });
});

describe('javaPacketsById', () => {
    it('lists every definition of a phase and direction under its id', () => {
        const byId = javaPacketsById(NEWEST_JAVA_RELEASE, 'play', 'clientbound');

        expect(byId.get(javaPacketId(NEWEST_JAVA_RELEASE, PlayLogin))).toEqual([PlayLogin]);
        expect(byId.get(javaPacketId(NEWEST_JAVA_RELEASE, PlayerInfoAdd))).toEqual([
            PlayerInfoAdd,
            PlayerInfoUpdateGameMode
        ]);
        expect([...byId.values()].flat().every(({ phase, bound }) => phase === 'play' && bound === 'clientbound')).toBe(
            true
        );
    });
});
