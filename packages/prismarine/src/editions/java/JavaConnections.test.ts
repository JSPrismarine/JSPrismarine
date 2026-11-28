import { constants, createHash, publicEncrypt, randomBytes } from 'node:crypto';

import {
    AcknowledgeFinishConfiguration,
    brandPayload,
    ClientboundKnownPacks,
    ClientboundPluginMessage,
    ConfigurationClientboundKeepAlive,
    ConfigurationClientInformation,
    ConfigurationDisconnect,
    ConfigurationResourcePackPush,
    ConfigurationResourcePackResponse,
    JavaResourcePackAction,
    ConfigurationServerboundKeepAlive,
    FeatureFlags,
    FinishConfiguration,
    JavaChatVisibility,
    JavaMainHand,
    JavaParticleStatus,
    RegistryData,
    ServerboundKnownPacks,
    ServerboundPluginMessage,
    UpdateTags
} from '@jsprismarine/protocol/java/packet/configuration';
import {
    BlockChangedAck,
    ChatMessage,
    ConfirmTeleportation,
    GameEvent,
    MOVE_ON_GROUND,
    MovePlayerPos,
    MovePlayerRot,
    PlayDisconnect,
    PlayerAction,
    PlayerCommand,
    PlayerCommandAction,
    PlayerInput,
    PlayerInputFlag,
    PickItemFromBlock,
    PickItemFromEntity,
    Attack,
    Interact,
    JavaHand,
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
    PlayerActionStatus,
    PlayerLoaded,
    PlayClientInformation,
    PlayLogin,
    PlayPingRequest,
    PlayPongResponse,
    ServerData,
    START_WAITING_FOR_LEVEL_CHUNKS,
    SynchronizePlayerPosition
} from '@jsprismarine/protocol/java/packet/play';
import { CONFIGURATION } from '@jsprismarine/protocol/java/versions/newest';
import { ClientIntent, Intention } from '@jsprismarine/protocol/java/packet/handshake';
import {
    EncryptionRequest,
    EncryptionResponse,
    LoginAcknowledged,
    LoginDisconnect,
    LoginStart,
    LoginSuccess,
    SetCompression
} from '@jsprismarine/protocol/java/packet/login';
import { PingRequest, PongResponse, StatusRequest, StatusResponse } from '@jsprismarine/protocol/java/packet/status';
import { NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';
import { afterEach, describe, expect, it } from 'vitest';

import { javaClient } from '../../testing/javaClient.test-utils';
import { Gametype } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { EYE_HEIGHT } from '../../entity/playerEyes';
import { stub } from '../../testing/stub.test.helper';
import type { KeepAliveTimer } from '../../player/KeepAlive';
import type PlayerSession from '../../player/PlayerSession';
import type { ShownDimension } from '../../player/presenter/SessionPresenter';
import type { SessionPlayer } from '../../player/sessionPlayers';
import { ConnectionIds } from '../../network/transport/ConnectionId';
import { TcpTransport } from '../../network/transport/TcpTransport';
import type { JavaResourcePack } from '../../resourcePacks/JavaResourcePacks';
import { javaResourcePackOffer } from '../../resourcePacks/javaResourcePackOffer';
import type { JavaResourcePackOffer } from './javaResourcePack';
import type { JavaProfile } from './javaAuth';
import { offlineUuid, serverHash } from '@jsprismarine/protocol/java/javaIdentity';
import { JavaConnections } from './JavaConnections';
import type { JavaText } from '@jsprismarine/protocol/java/wire/javaTypes';

/** What the test worlds tell a joining client: vanilla's three dimensions and the default rules. */
const JOIN_SETTINGS = {
    hardcore: false,
    dimensions: ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'],
    reducedDebugInfo: false,
    showDeathScreen: true,
    doLimitedCrafting: false
};
const status = { getMotd: () => 'A JSPrismarine server', getOnlinePlayerCount: () => 3, getMaxPlayerCount: () => 20 };
const quiet = { debug: () => {}, info: () => {}, warn: () => {} };
/** The settings a client in Swedish sends, with a view distance of 6. */
const SETTINGS = {
    language: 'sv_se',
    viewDistance: 6,
    chatVisibility: JavaChatVisibility.Full,
    chatColors: true,
    modelCustomisation: 0x7f,
    mainHand: JavaMainHand.Right,
    textFilteringEnabled: false,
    allowsListing: true,
    particleStatus: JavaParticleStatus.All
};
const OVERWORLD: ShownDimension = { id: 'minecraft:overworld', seaLevel: 63 };
const NETHER: ShownDimension = { id: 'minecraft:the_nether', seaLevel: 32 };
/** The dimension types the client is configured with, in network id order. */
const DIMENSION_TYPES =
    CONFIGURATION.registries.find(({ registry }) => registry === 'minecraft:dimension_type')?.entries ?? [];

describe('JavaConnections', () => {
    let transport: TcpTransport | undefined;
    afterEach(() => transport?.close());

    /** Every session server question, and the profile Mojang is said to hold. */
    const asked: { name: string; hash: string }[] = [];
    /** What the server warned of: the failed joins it reported. */
    const warned: string[] = [];
    /** Settles with the first warning. */
    let warning = Promise.withResolvers<string>();
    const listen = async ({
        onlineMode = false,
        mojang,
        keepAliveTimer,
        resourcePacks
    }: {
        onlineMode?: boolean;
        mojang?: JavaProfile;
        keepAliveTimer?: KeepAliveTimer;
        resourcePacks?: JavaResourcePackOffer;
    } = {}) => {
        warned.length = 0;
        warning = Promise.withResolvers<string>();
        asked.length = 0;
        transport = new TcpTransport(new ConnectionIds(), quiet);
        new JavaConnections(transport, {
            status,
            brand: 'JSPrismarine',
            onlineMode: () => onlineMode,
            compressionThreshold: () => 256,
            keepAliveIntervalMs: () => 15_000,
            ...(keepAliveTimer === undefined ? {} : { keepAliveTimer }),
            ...(resourcePacks === undefined ? {} : { resourcePacks }),
            enforcesSecureChat: () => false,
            hasJoined: async (name, hash) => {
                asked.push({ name, hash });
                return mojang;
            },
            log: {
                ...quiet,
                warn: (message: string) => {
                    warned.push(message);
                    warning.resolve(message);
                }
            }
        });
        await transport.listen('127.0.0.1', 0);
        return transport.port()!;
    };

    const handshake = (intent: ClientIntent, port: number, protocolVersion = NEWEST_JAVA_RELEASE.protocolVersion) => ({
        protocolVersion,
        serverAddress: 'localhost',
        serverPort: port,
        intent
    });

    it('answers a server list ping with the version, the counts and the MOTD, then the pong, and hangs up', async () => {
        const port = await listen();
        const java = await javaClient(port);

        java.send(Intention, handshake(ClientIntent.Status, port));
        java.send(StatusRequest, {});
        const { json } = await java.receive(StatusResponse);
        java.send(PingRequest, { timestamp: 42n });

        expect(JSON.parse(json)).toEqual({
            version: { name: NEWEST_JAVA_RELEASE.minecraftVersion, protocol: NEWEST_JAVA_RELEASE.protocolVersion },
            players: { max: 20, online: 3 },
            description: { text: 'A JSPrismarine server' },
            enforcesSecureChat: false
        });
        expect(await java.receive(PongResponse)).toEqual({ timestamp: 42n });
        await java.closed;
    });

    it('logs an offline player in under the UUID their name gives, compressed from Set Compression on', async () => {
        const port = await listen();
        const java = await javaClient(port);

        java.send(Intention, handshake(ClientIntent.Login, port));
        java.send(LoginStart, { name: 'Steve', profileId: offlineUuid('Steve') });
        const { threshold } = await java.receive(SetCompression);
        java.compress(threshold);
        const success = await java.receive(LoginSuccess);
        java.send(LoginAcknowledged, {});

        expect(success).toMatchObject({ uuid: offlineUuid('Steve'), username: 'Steve', properties: [] });
        expect(asked).toEqual([]);
        java.destroy();
    });

    /** A client logged in offline and acknowledged, at the start of its configuration phase. */
    const configuring = async (port: number) => {
        const java = await javaClient(port);
        java.send(Intention, handshake(ClientIntent.Login, port));
        java.send(LoginStart, { name: 'Steve', profileId: offlineUuid('Steve') });
        java.compress((await java.receive(SetCompression)).threshold);
        await java.receive(LoginSuccess);
        java.send(LoginAcknowledged, {});
        return java;
    };

    it('configures a client that has the core pack as vanilla does, and ends the join as it reaches play', async () => {
        const port = await listen();
        const java = await configuring(port);

        const brand = await java.receive(ClientboundPluginMessage);
        const { features } = await java.receive(FeatureFlags);
        const { packs } = await java.receive(ClientboundKnownPacks);
        // What a vanilla client sends first.
        java.send(ConfigurationClientInformation, SETTINGS);
        java.send(ServerboundKnownPacks, { packs });
        const registries: string[] = [];
        for (let i = 0; i < CONFIGURATION.registries.length; i++) {
            const { registry, entries } = await java.receive(RegistryData);
            registries.push(registry);
            expect(entries.map((entry) => entry.id)).toEqual(CONFIGURATION.registries[i]?.entries);
        }
        const tags = await java.receive(UpdateTags);
        await java.receive(FinishConfiguration);
        java.send(AcknowledgeFinishConfiguration, {});

        expect(brand).toEqual({ channel: 'minecraft:brand', data: brandPayload('JSPrismarine') });
        expect(features).toEqual(CONFIGURATION.features);
        expect(packs).toEqual(CONFIGURATION.knownPacks);
        expect(registries).toEqual(CONFIGURATION.registries.map((entry) => entry.registry));
        expect(tags.registries).toEqual(CONFIGURATION.tags);
        expect(await java.receive(PlayDisconnect)).toEqual({
            reason: 'This server does not take Java Edition players yet.'
        });
        await java.closed;
    });

    describe('the resource pack exchange', () => {
        const bytes = new TextEncoder().encode('a converted pack');
        const pack: JavaResourcePack = {
            id: '00000000-0000-4000-8000-0000000000aa',
            key: 'k'.repeat(64),
            sha1: createHash('sha1').update(bytes).digest('hex'),
            bytes
        };
        const offering = (required: boolean) =>
            javaResourcePackOffer({
                packs: { current: async () => pack },
                baseUrl: () => '',
                required: () => required,
                log: quiet
            });

        /** A client configured up to the server's pack, which it is pushed after the tags. */
        const pushed = async (port: number) => {
            const java = await configuring(port);
            await java.receive(ClientboundPluginMessage);
            await java.receive(FeatureFlags);
            const { packs } = await java.receive(ClientboundKnownPacks);
            java.send(ServerboundKnownPacks, { packs });
            for (let i = 0; i < CONFIGURATION.registries.length; i++) await java.receive(RegistryData);
            await java.receive(UpdateTags);
            return { java, push: await java.receive(ConfigurationResourcePackPush) };
        };

        it('pushes the pack at the address the client dialed and finishes once the client loaded it', async () => {
            const port = await listen({ resourcePacks: offering(true) });
            const { java, push } = await pushed(port);

            expect(push).toEqual({
                id: pack.id,
                url: `http://localhost:${port}/resource-packs/${pack.sha1}.zip`,
                hash: pack.sha1,
                required: true,
                prompt: null
            });
            java.send(ConfigurationResourcePackResponse, { id: pack.id, action: JavaResourcePackAction.Accepted });
            java.send(ConfigurationResourcePackResponse, { id: pack.id, action: JavaResourcePackAction.Downloaded });
            java.send(ConfigurationResourcePackResponse, {
                id: pack.id,
                action: JavaResourcePackAction.SuccessfullyLoaded
            });
            await java.receive(FinishConfiguration);
        });

        it('turns away a client that declines a required pack, in vanilla words', async () => {
            const { java } = await pushed(await listen({ resourcePacks: offering(true) }));

            java.send(ConfigurationResourcePackResponse, { id: pack.id, action: JavaResourcePackAction.Declined });

            expect(await java.receive(ConfigurationDisconnect)).toEqual({
                reason: { translate: 'multiplayer.requiredTexturePrompt.disconnect' }
            });
            await java.closed;
        });

        it('lets a client that declines or cannot download an optional pack join without it', async () => {
            const { java } = await pushed(await listen({ resourcePacks: offering(false) }));

            java.send(ConfigurationResourcePackResponse, { id: pack.id, action: JavaResourcePackAction.Declined });

            await java.receive(FinishConfiguration);
        });
    });

    it('pings a configuring client, and drops one that leaves a ping unanswered', async () => {
        // The test runs each interval itself, so how long the host takes between them does not matter.
        const intervals: (() => void)[] = [];
        const port = await listen({
            keepAliveTimer: (run) => {
                intervals.push(run);
                return () => {};
            }
        });
        const java = await configuring(port);
        await java.receive(ClientboundPluginMessage);
        await java.receive(FeatureFlags);
        const { packs } = await java.receive(ClientboundKnownPacks);
        const [interval] = intervals;
        if (interval === undefined) throw new Error('the configuration started no keep-alive');

        interval();
        const { id } = await java.receive(ConfigurationClientboundKeepAlive);
        java.send(ConfigurationServerboundKeepAlive, { id });
        // The server reads a client's packets in order, so once the registries answer the known
        // packs, the keep-alive's answer has been read too.
        java.send(ServerboundKnownPacks, { packs });
        for (const _ of CONFIGURATION.registries) await java.receive(RegistryData);
        await java.receive(UpdateTags);
        await java.receive(FinishConfiguration);

        // Answered, so the next interval pings again; left unanswered, the one after drops the client.
        interval();
        await java.receive(ConfigurationClientboundKeepAlive);
        interval();
        expect(await java.receive(ConfigurationDisconnect)).toEqual({ reason: { translate: 'disconnect.timeout' } });
        await java.closed;
    });

    it('joins a player who reaches play to the world, shows it in the order vanilla sends it, and reads what the player does', async () => {
        transport = new TcpTransport(new ConnectionIds(), quiet);
        const did: string[] = [];
        let left: () => void = () => {};
        const leaving = new Promise<void>((resolve) => (left = resolve));
        const session = stub<PlayerSession>({
            runtimeId: 7n,
            getPlayer: () =>
                stub<SessionPlayer>({
                    yaw: 90,
                    pitch: 0,
                    // Falling, which the client is told along with where it stands.
                    getVelocity: () => ({ x: 0, y: -0.0784, z: 0 }),
                    gamemode: Gametype.CREATIVE,
                    getPosition: () => new Vector3(8.5, -60 + EYE_HEIGHT, 8.5)
                })
        });
        new JavaConnections(transport, {
            status,
            brand: 'JSPrismarine',
            onlineMode: () => false,
            compressionThreshold: () => 256,
            keepAliveIntervalMs: () => 15_000,
            enforcesSecureChat: () => false,
            log: quiet,
            world: {
                players: {
                    refusalOf: async () => undefined,
                    join: async (profile, verified, _id, _address, locale) => {
                        did.push(`join ${profile.name} ${verified ? 'java' : 'offline'} ${locale}`);
                        // A player whose record left them in the Nether.
                        return { session, feet: { x: 8.5, y: -60, z: 8.5 }, dimension: NETHER };
                    },
                    showWorld: async (_session, viewDistance) => void did.push(`show world ${viewDistance}`),
                    announce: async () => void did.push('announce'),
                    intent: async (_session, intent) =>
                        void did.push(
                            intent.kind === 'move'
                                ? `move ${intent.position.x} ${intent.position.y - EYE_HEIGHT} ${intent.onGround} ${intent.handledTeleport}`
                                : // A replacer, since an entity pick names its target as a bigint.
                                  `intent ${JSON.stringify(intent, (_, value) => (typeof value === 'bigint' ? `${value}n` : value))}`
                        ),
                    leave: async () => {
                        did.push('leave');
                        left();
                    }
                },
                viewDistance: () => 10,
                maxPlayers: () => 20,
                joinSettings: () => JOIN_SETTINGS
            }
        });
        await transport.listen('127.0.0.1', 0);
        const java = await configuring(transport.port()!);
        await java.receive(ClientboundPluginMessage);
        await java.receive(FeatureFlags);
        // The settings and the brand a vanilla client sends as it starts to configure.
        java.send(ConfigurationClientInformation, SETTINGS);
        java.send(ServerboundPluginMessage, { channel: 'minecraft:brand', data: brandPayload('vanilla') });
        java.send(ServerboundKnownPacks, await java.receive(ClientboundKnownPacks));
        for (const _ of CONFIGURATION.registries) await java.receive(RegistryData);
        await java.receive(UpdateTags);
        await java.receive(FinishConfiguration);
        java.send(AcknowledgeFinishConfiguration, {});

        const login = await java.receive(PlayLogin);
        const data = await java.receive(ServerData);
        const position = await java.receive(SynchronizePlayerPosition);
        const event = await java.receive(GameEvent);
        expect(data).toEqual({ motd: 'A JSPrismarine server', icon: null });
        expect(login).toMatchObject({
            entityId: 7,
            dimensionType: DIMENSION_TYPES.indexOf('minecraft:the_nether'),
            dimension: 'minecraft:the_nether',
            gameMode: 1,
            previousGameMode: null,
            seaLevel: 32,
            dimensions: JOIN_SETTINGS.dimensions
        });
        expect(position).toMatchObject({ teleportId: 1, x: 8.5, y: -60, z: 8.5, yaw: 90 });
        expect(position.velocityY).toBeCloseTo(-0.0784);
        expect(event).toEqual({ event: START_WAITING_FOR_LEVEL_CHUNKS, value: 0 });

        // The debug screen's ping, answered with the number it carried.
        java.send(PlayPingRequest, { timestamp: 9n });
        expect(await java.receive(PlayPongResponse)).toEqual({ timestamp: 9n });

        // Loaded, a line of chat, a longer view distance, then a confirmed teleport and a step east
        // into the next chunk.
        java.send(PlayerLoaded, {});
        java.send(ChatMessage, {
            message: 'hello',
            timestamp: 0n,
            salt: 0n,
            signature: null,
            lastSeenOffset: 0,
            acknowledged: Buffer.alloc(3),
            checksum: 0
        });
        // Two changes before the input step: the second, back to the join's radius, is asked for
        // too, or the first would be the one left applied.
        java.send(PlayClientInformation, { ...SETTINGS, viewDistance: 8 });
        java.send(PlayClientInformation, { ...SETTINGS, viewDistance: 6 });
        java.send(ConfirmTeleportation, { teleportId: 1, x: 8.5, y: -60, z: 8.5, yaw: 90, pitch: 0 });
        java.send(MovePlayerPos, { x: 16.5, y: -60, z: 8.5, flags: MOVE_ON_GROUND });
        await expect.poll(() => did.at(-1)).toBe('move 16.5 -60 true true');

        // Moved elsewhere, as a respawn or a teleport moves the player: the client confirms where
        // it now stands, and a turn on the spot moves the player from there.
        java.send(ConfirmTeleportation, { teleportId: 2, x: 40.5, y: 70, z: 8.5, yaw: 0, pitch: 0 });
        java.send(MovePlayerRot, { yaw: 0, pitch: 0, flags: MOVE_ON_GROUND });
        await expect.poll(() => did.at(-1)).toBe('move 40.5 70 true true');

        // Off the ground and up is a jump, which a Java client sends no packet for. The held keys
        // and a sprint arrive in packets of their own.
        java.send(MovePlayerPos, { x: 40.5, y: 70.4, z: 8.5, flags: 0 });
        java.send(PlayerInput, { flags: PlayerInputFlag.Jump | PlayerInputFlag.Shift });
        java.send(PlayerCommand, { entityId: 7, action: PlayerCommandAction.StartSprinting, data: 0 });
        // Middle clicks on a block and on an entity, which name the entity by its runtime id.
        java.send(PickItemFromBlock, { position: { x: 1, y: -60, z: 2 }, includeData: true });
        java.send(PickItemFromEntity, { entityId: 12, includeData: false });
        // A hit and a use on an entity, the off hand's use being the main hand's that did nothing,
        // then a draw at nothing and its release.
        java.send(Attack, { entityId: 12 });
        java.send(Interact, { entityId: 13, hand: JavaHand.Off, location: { x: 0, y: 1, z: 0 }, sneaking: false });
        java.send(Interact, { entityId: 12, hand: JavaHand.Main, location: { x: 0, y: 1, z: 0 }, sneaking: false });
        java.send(UseItem, { hand: JavaHand.Main, sequence: 3, yaw: 0, pitch: 0 });
        java.send(PlayerAction, {
            status: PlayerActionStatus.ReleaseUseItem,
            position: { x: 0, y: 0, z: 0 },
            face: 0,
            sequence: 0
        });
        // A recipe book the player filtered, and a book type past the four, which names none.
        java.send(RecipeBookChangeSettings, { bookType: JavaRecipeBookType.Smoker, isOpen: true, isFiltering: true });
        java.send(RecipeBookChangeSettings, { bookType: 9, isOpen: true, isFiltering: true });
        // A signed book, one in the off hand the server's inventory has no slot for, and the
        // edits of a command block and of a cart.
        java.send(EditBook, { slot: 2, pages: ['hi'], title: 'Diary' });
        java.send(EditBook, { slot: 40, pages: ['hi'], title: null });
        java.send(SetCommandBlock, {
            position: { x: 1, y: 64, z: 2 },
            command: 'say hi',
            mode: JavaCommandBlockMode.Auto,
            flags: JavaCommandBlockFlag.Conditional
        });
        java.send(SetCommandMinecart, { entityId: 9, command: 'say hi', trackOutput: true });
        // A structure block saved: its settings, then the save.
        java.send(SetStructureBlock, {
            position: { x: 4, y: 64, z: 4 },
            updateType: JavaStructureUpdateType.SaveArea,
            mode: 0,
            name: 'house',
            offsetX: 0,
            offsetY: 1,
            offsetZ: 0,
            sizeX: 5,
            sizeY: 5,
            sizeZ: 5,
            mirror: 0,
            rotation: 0,
            data: '',
            integrity: 1,
            seed: 0n,
            flags: 0
        });
        await expect
            .poll(() => did.at(-1))
            .toBe(
                'intent {"kind":"useStructureBlock","position":{"x":4,"y":64,"z":4},"structure":"house","operation":"save"}'
            );
        java.destroy();
        await leaving;

        expect(did).toEqual([
            'join Steve offline sv_SE',
            'show world 6',
            'announce',
            'intent {"kind":"playerInitialized"}',
            'intent {"kind":"chat","message":"hello"}',
            'intent {"kind":"setViewDistance","radius":8,"maxRadius":0}',
            'intent {"kind":"setViewDistance","radius":6,"maxRadius":0}',
            'move 16.5 -60 true true',
            'move 40.5 70 true true',
            'move 40.5 70.4 false false',
            'intent {"kind":"jump"}',
            'intent {"kind":"holdButtons","jump":true,"sneak":true}',
            'intent {"kind":"setSneaking","sneaking":true}',
            'intent {"kind":"setSprinting","sprinting":true}',
            'intent {"kind":"pickBlock","position":{"x":1,"y":-60,"z":2},"withData":true}',
            'intent {"kind":"pickEntity","target":"12n","withData":false}',
            'intent {"kind":"attackEntity","target":"12n"}',
            'intent {"kind":"interactEntity","target":"12n"}',
            'intent {"kind":"useItem","held":false}',
            'intent {"kind":"releaseItem","action":"release"}',
            'intent {"kind":"setRecipeBook","book":"smoker","open":true,"filtering":true}',
            'intent {"kind":"editBook","slot":2,"edit":{"kind":"setPages","pages":["hi"],"title":"Diary"}}',
            'intent {"kind":"editCommandBlock","position":{"x":1,"y":64,"z":2},"mode":"repeat","conditional":true,"needsRedstone":true,"command":"say hi","trackOutput":false}',
            'intent {"kind":"editCommandMinecart","target":"9n","command":"say hi","trackOutput":true}',
            'intent {"kind":"editStructureBlock","position":{"x":4,"y":64,"z":4},"structure":"house"}',
            'intent {"kind":"useStructureBlock","position":{"x":4,"y":64,"z":4},"structure":"house","operation":"save"}',
            'leave'
        ]);
    });

    it('reads the next packet while an input waits for its step, and answers a dig once the dig applied', async () => {
        transport = new TcpTransport(new ConnectionIds(), quiet);
        const queued: string[] = [];
        const apply: (() => void)[] = [];
        const session = stub<PlayerSession>({
            runtimeId: 7n,
            getPlayer: () =>
                stub<SessionPlayer>({
                    yaw: 0,
                    pitch: 0,
                    getVelocity: () => ({ x: 0, y: 0, z: 0 }),
                    gamemode: Gametype.CREATIVE,
                    getPosition: () => new Vector3(8.5, -60 + EYE_HEIGHT, 8.5)
                })
        });
        // Inputs wait for an input step that only the test runs.
        const held = (what: string) => {
            queued.push(what);
            return new Promise<void>((resolve) => apply.push(resolve));
        };
        new JavaConnections(transport, {
            status,
            brand: 'JSPrismarine',
            onlineMode: () => false,
            compressionThreshold: () => 256,
            keepAliveIntervalMs: () => 15_000,
            enforcesSecureChat: () => false,
            log: quiet,
            world: {
                players: {
                    refusalOf: async () => undefined,
                    join: async () => ({ session, feet: { x: 8.5, y: -60, z: 8.5 }, dimension: OVERWORLD }),
                    showWorld: async () => {},
                    announce: async () => {},
                    intent: async (_session, intent) => held(intent.kind),
                    leave: async () => {}
                },
                viewDistance: () => 0,
                maxPlayers: () => 20,
                joinSettings: () => JOIN_SETTINGS
            }
        });
        await transport.listen('127.0.0.1', 0);
        const java = await configuring(transport.port()!);
        await java.receive(ClientboundPluginMessage);
        await java.receive(FeatureFlags);
        java.send(ServerboundKnownPacks, await java.receive(ClientboundKnownPacks));
        for (const _ of CONFIGURATION.registries) await java.receive(RegistryData);
        await java.receive(UpdateTags);
        await java.receive(FinishConfiguration);
        java.send(AcknowledgeFinishConfiguration, {});
        for (const opening of [PlayLogin, ServerData, SynchronizePlayerPosition, GameEvent]) {
            await java.receive(opening);
        }

        java.send(PlayerLoaded, {});
        java.send(PlayerAction, {
            status: PlayerActionStatus.StartDestroyBlock,
            position: { x: 8, y: -61, z: 8 },
            face: 1,
            sequence: 3
        });
        java.send(MovePlayerPos, { x: 8.5, y: -60, z: 9.5, flags: MOVE_ON_GROUND });
        // The ack waits for the dig, but the move behind it was read without waiting for either.
        await expect.poll(() => queued).toEqual(['playerInitialized', 'mineBlock', 'move']);

        for (const step of apply) step();
        expect(await java.receive(BlockChangedAck)).toEqual({ sequence: 3 });
        java.destroy();
    });

    it('disconnects a player in play with the reason the world hangs up with, and closes the connection', async () => {
        transport = new TcpTransport(new ConnectionIds(), quiet);
        let hangUp: (reason: JavaText) => Promise<void> = async () => {};
        let left: () => void = () => {};
        const leaving = new Promise<void>((resolve) => (left = resolve));
        const session = stub<PlayerSession>({
            runtimeId: 7n,
            getPlayer: () =>
                stub<SessionPlayer>({
                    yaw: 0,
                    pitch: 0,
                    getVelocity: () => ({ x: 0, y: 0, z: 0 }),
                    gamemode: Gametype.CREATIVE,
                    getPosition: () => new Vector3(8.5, -60 + EYE_HEIGHT, 8.5)
                })
        });
        new JavaConnections(transport, {
            status,
            brand: 'JSPrismarine',
            onlineMode: () => false,
            compressionThreshold: () => 256,
            keepAliveIntervalMs: () => 15_000,
            enforcesSecureChat: () => false,
            log: quiet,
            world: {
                players: {
                    refusalOf: async () => undefined,
                    join: async (_profile, _verified, _id, _address, _locale, _send, close) => {
                        hangUp = close;
                        return { session, feet: { x: 8.5, y: -60, z: 8.5 }, dimension: OVERWORLD };
                    },
                    showWorld: async () => {},
                    announce: async () => {},
                    intent: async () => {},
                    leave: async () => left()
                },
                viewDistance: () => 0,
                maxPlayers: () => 20,
                joinSettings: () => JOIN_SETTINGS
            }
        });
        await transport.listen('127.0.0.1', 0);
        const java = await configuring(transport.port()!);
        await java.receive(ClientboundPluginMessage);
        await java.receive(FeatureFlags);
        java.send(ServerboundKnownPacks, await java.receive(ClientboundKnownPacks));
        for (const _ of CONFIGURATION.registries) await java.receive(RegistryData);
        await java.receive(UpdateTags);
        await java.receive(FinishConfiguration);
        java.send(AcknowledgeFinishConfiguration, {});
        await java.receive(PlayLogin);

        await hangUp({ translate: 'multiplayer.disconnect.duplicate_login' });

        for (const opening of [ServerData, SynchronizePlayerPosition, GameEvent]) {
            await java.receive(opening);
        }
        expect(await java.receive(PlayDisconnect)).toEqual({
            reason: { translate: 'multiplayer.disconnect.duplicate_login' }
        });
        await java.closed;
        await leaving;
    });

    it('ends the join of a client without the pack the registries come from', async () => {
        const port = await listen();
        const java = await configuring(port);
        await java.receive(ClientboundPluginMessage);
        await java.receive(FeatureFlags);
        await java.receive(ClientboundKnownPacks);

        java.send(ServerboundKnownPacks, { packs: [] });

        const { reason } = await java.receive(ConfigurationDisconnect);
        expect(reason).toContain('minecraft:core');
        await java.closed;
    });

    it('gives the offline UUID the vanilla server gives the same name', () => {
        // `UUID.nameUUIDFromBytes("OfflinePlayer:Notch")`, as a vanilla offline server derives it.
        expect(offlineUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f');
    });

    it('logs an online player in with the profile Mojang holds, encrypted from the encryption response on', async () => {
        const mojang: JavaProfile = {
            id: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
            name: 'Notch',
            properties: [{ name: 'textures', value: 'e30=', signature: 'c2ln' }]
        };
        const port = await listen({ onlineMode: true, mojang });
        const java = await javaClient(port);

        java.send(Intention, handshake(ClientIntent.Login, port));
        java.send(LoginStart, { name: 'Notch', profileId: mojang.id });
        const request = await java.receive(EncryptionRequest);
        const secret = randomBytes(16);
        const key = {
            key: request.publicKey,
            format: 'der' as const,
            type: 'spki' as const,
            padding: constants.RSA_PKCS1_PADDING
        };
        java.send(EncryptionResponse, {
            sharedSecret: publicEncrypt(key, secret),
            verifyToken: publicEncrypt(key, request.verifyToken)
        });
        java.encrypt(secret);
        java.compress((await java.receive(SetCompression)).threshold);

        expect(request).toMatchObject({ serverId: '', shouldAuthenticate: true });
        expect(await java.receive(LoginSuccess)).toMatchObject({
            uuid: mojang.id,
            username: 'Notch',
            properties: mojang.properties
        });
        expect(asked).toEqual([{ name: 'Notch', hash: serverHash('', secret, request.publicKey) }]);
        java.destroy();
    });

    it('refuses a login the server turns away in vanilla words, before compression', async () => {
        transport = new TcpTransport(new ConnectionIds(), quiet);
        const joins: string[] = [];
        new JavaConnections(transport, {
            status,
            brand: 'JSPrismarine',
            onlineMode: () => false,
            compressionThreshold: () => 256,
            keepAliveIntervalMs: () => 15_000,
            enforcesSecureChat: () => false,
            log: quiet,
            world: {
                players: {
                    refusalOf: async () => ({ kind: 'banned', reason: 'griefing' }),
                    join: async (profile) => {
                        joins.push(profile.name);
                        return undefined;
                    },
                    showWorld: async () => {},
                    announce: async () => {},
                    intent: async () => {},
                    leave: async () => {}
                },
                viewDistance: () => 0,
                maxPlayers: () => 20,
                joinSettings: () => JOIN_SETTINGS
            }
        });
        await transport.listen('127.0.0.1', 0);
        const port = transport.port()!;
        const java = await javaClient(port);

        java.send(Intention, handshake(ClientIntent.Login, port));
        java.send(LoginStart, { name: 'Steve', profileId: offlineUuid('Steve') });

        expect(JSON.parse((await java.receive(LoginDisconnect)).reason)).toEqual({
            translate: 'multiplayer.disconnect.banned.reason',
            with: ['griefing']
        });
        await java.closed;
        expect(joins).toEqual([]);
    });

    it('refuses a player Mojang has no record of joining', async () => {
        const port = await listen({ onlineMode: true });
        const java = await javaClient(port);

        java.send(Intention, handshake(ClientIntent.Login, port));
        java.send(LoginStart, { name: 'Notch', profileId: offlineUuid('Notch') });
        const request = await java.receive(EncryptionRequest);
        const secret = randomBytes(16);
        const key = {
            key: request.publicKey,
            format: 'der' as const,
            type: 'spki' as const,
            padding: constants.RSA_PKCS1_PADDING
        };
        java.send(EncryptionResponse, {
            sharedSecret: publicEncrypt(key, secret),
            verifyToken: publicEncrypt(key, request.verifyToken)
        });
        java.encrypt(secret);

        expect(JSON.parse((await java.receive(LoginDisconnect)).reason)).toEqual({
            translate: 'multiplayer.disconnect.unverified_username'
        });
        await java.closed;
    });

    it('tells a client of another release which release the server speaks', async () => {
        const port = await listen();
        const java = await javaClient(port);

        java.send(Intention, handshake(ClientIntent.Login, port, NEWEST_JAVA_RELEASE.protocolVersion - 1));

        expect(JSON.parse((await java.receive(LoginDisconnect)).reason)).toEqual({
            translate: 'multiplayer.disconnect.outdated_client',
            with: [NEWEST_JAVA_RELEASE.minecraftVersion]
        });
        await java.closed;
    });

    it('hangs up on a client that acknowledges a configuration the server has not finished', async () => {
        const port = await listen();
        const java = await configuring(port);
        await java.receive(ClientboundPluginMessage);
        await java.receive(FeatureFlags);
        await java.receive(ClientboundKnownPacks);

        java.send(AcknowledgeFinishConfiguration, {});

        await java.closed;
        // A vanilla client keeps to the order, so a packet out of it is more likely the server's mistake.
        expect(warned).toEqual([
            expect.stringContaining('The server could not handle what the client sent in its configuration phase.')
        ]);
    });

    it('hangs up on a packet its phase has no place for', async () => {
        const port = await listen();
        const java = await javaClient(port);

        java.send(PingRequest, { timestamp: 1n });

        await java.closed;
        expect(warned).toEqual([]);
    });

    it('reports a client that hangs up during its configuration as a failed join, with a link to file it', async () => {
        const port = await listen();
        const java = await configuring(port);
        await java.receive(ClientboundPluginMessage);

        java.destroy();

        const line = await warning.promise;
        expect(warned).toHaveLength(1);
        expect(line).toContain('Steve (127.0.0.1:');
        expect(line).toContain('The client closed the connection during the join');
        const url = new URL(line.slice(line.indexOf('https://')));
        expect(url.searchParams.get('title')).toBe(
            `Bug: Java ${NEWEST_JAVA_RELEASE.minecraftVersion} client fails to join: The client closed the connection during the join, as a Java client does when it cannot read a packet`
        );
        expect(url.searchParams.get('body')).toContain('- Join phase: configuration');
        // The packets the server sent before the client hung up.
        expect(url.searchParams.get('body')).toContain('Set Compression');
        // The issue is public, so it does not name the player.
        expect(url.searchParams.get('body')).not.toContain('Steve');
    });
});

describe('JavaConnections compression', () => {
    it('compresses nothing when the threshold is 0, as for Bedrock', async () => {
        const transport = new TcpTransport(new ConnectionIds(), quiet);
        new JavaConnections(transport, {
            status,
            brand: 'JSPrismarine',
            onlineMode: () => false,
            compressionThreshold: () => 0,
            keepAliveIntervalMs: () => 15_000,
            enforcesSecureChat: () => false,
            log: quiet
        });
        await transport.listen('127.0.0.1', 0);
        const port = transport.port()!;
        const java = await javaClient(port);

        java.send(Intention, {
            protocolVersion: NEWEST_JAVA_RELEASE.protocolVersion,
            serverAddress: 'localhost',
            serverPort: port,
            intent: ClientIntent.Login
        });
        java.send(LoginStart, { name: 'Steve', profileId: offlineUuid('Steve') });

        expect((await java.receive(LoginSuccess)).username).toBe('Steve');
        java.destroy();
        transport.close();
    });
});

describe('JavaConnections session id', () => {
    it('gives every login on one server the same session id', async () => {
        const transport = new TcpTransport(new ConnectionIds(), quiet);
        new JavaConnections(transport, {
            status,
            brand: 'JSPrismarine',
            onlineMode: () => false,
            compressionThreshold: () => 256,
            keepAliveIntervalMs: () => 15_000,
            enforcesSecureChat: () => false,
            log: quiet
        });
        await transport.listen('127.0.0.1', 0);
        const port = transport.port()!;
        const loginAs = async (name: string) => {
            const java = await javaClient(port);
            java.send(Intention, {
                protocolVersion: NEWEST_JAVA_RELEASE.protocolVersion,
                serverAddress: 'localhost',
                serverPort: port,
                intent: ClientIntent.Login
            });
            java.send(LoginStart, { name, profileId: offlineUuid(name) });
            java.compress((await java.receive(SetCompression)).threshold);
            const { sessionId } = await java.receive(LoginSuccess);
            java.destroy();
            return sessionId;
        };

        try {
            expect(await loginAs('Steve')).toBe(await loginAs('Alex'));
        } finally {
            transport.close();
        }
    });
});
