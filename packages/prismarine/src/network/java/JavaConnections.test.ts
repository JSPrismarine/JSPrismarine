import { constants, publicEncrypt, randomBytes } from 'node:crypto';

import {
    AcknowledgeFinishConfiguration,
    brandPayload,
    ClientboundKnownPacks,
    ClientboundPluginMessage,
    ConfigurationDisconnect,
    FeatureFlags,
    FinishConfiguration,
    RegistryData,
    ServerboundKnownPacks,
    UpdateTags
} from '@jsprismarine/protocol/java/packet/configuration';
import { defineJavaPacket } from '@jsprismarine/protocol/java/packet/JavaPacket';
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
    PlayerActionStatus,
    PlayerLoaded,
    PlayLogin,
    START_WAITING_FOR_LEVEL_CHUNKS,
    SynchronizePlayerPosition
} from '@jsprismarine/protocol/java/packet/play';
import { CONFIGURATION } from '@jsprismarine/protocol/java/versions/26.3/configuration';
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
import type PlayerSession from '../PlayerSession';
import type { ShownDimension } from '../presenter/SessionPresenter';
import type { SessionPlayer } from '../sessionPlayers';
import { ConnectionIds } from '../transport/ConnectionId';
import { TcpTransport } from '../transport/TcpTransport';
import type { JavaProfile } from './javaAuth';
import { offlineUuid, serverHash } from './javaAuth';
import { JavaConnections } from './JavaConnections';
import type { JavaText } from '@jsprismarine/protocol/java/wire/javaTypes';

/** `Client Information`, by id alone: its fields are the client's settings, which the server reads past. */
const ClientInformationProbe = defineJavaPacket(
    'Client Information',
    'configuration/serverbound/client_information',
    {}
);

/** What the test worlds tell a joining client: vanilla's three dimensions and the default rules. */
const JOIN_SETTINGS = {
    hardcore: false,
    dimensions: ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'],
    reducedDebugInfo: false,
    showDeathScreen: true,
    doLimitedCrafting: false
};
const status = { getMotd: () => 'A JSPrismarine server', getOnlinePlayerCount: () => 3, getMaxPlayerCount: () => 20 };
const quiet = { debug: () => {}, info: () => {} };
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
    const listen = async ({ onlineMode = false, mojang }: { onlineMode?: boolean; mojang?: JavaProfile } = {}) => {
        asked.length = 0;
        transport = new TcpTransport(new ConnectionIds(), quiet);
        new JavaConnections(transport, {
            status,
            brand: 'JSPrismarine',
            onlineMode: () => onlineMode,
            compressionThreshold: () => 256,
            keepAliveIntervalMs: () => 15_000,
            enforcesSecureChat: () => false,
            hasJoined: async (name, hash) => {
                asked.push({ name, hash });
                return mojang;
            },
            log: quiet
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
        // What a vanilla client sends first, which the server reads past.
        java.send(ClientInformationProbe, {});
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
                    join: async (profile, verified) => {
                        did.push(`join ${profile.name} ${verified ? 'java' : 'offline'}`);
                        // A player whose record left them in the Nether.
                        return { session, feet: { x: 8.5, y: -60, z: 8.5 }, dimension: NETHER };
                    },
                    move: async (_session, { position, onGround, handledTeleport }) =>
                        void did.push(
                            `move ${position.getX()} ${position.getY() - EYE_HEIGHT} ${onGround} ${handledTeleport}`
                        ),
                    showWorld: async (_session, viewDistance) => void did.push(`show world ${viewDistance}`),
                    announce: async () => void did.push('announce'),
                    intent: async (_session, intent) => void did.push(`intent ${JSON.stringify(intent)}`),
                    leave: async () => {
                        did.push('leave');
                        left();
                    }
                },
                viewDistance: () => 1,
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

        const login = await java.receive(PlayLogin);
        const position = await java.receive(SynchronizePlayerPosition);
        const event = await java.receive(GameEvent);
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

        // Loaded, a line of chat, then a confirmed teleport and a step east into the next chunk.
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
        java.send(ConfirmTeleportation, { teleportId: 1, x: 8.5, y: -60, z: 8.5, yaw: 90, pitch: 0 });
        java.send(MovePlayerPos, { x: 16.5, y: -60, z: 8.5, flags: MOVE_ON_GROUND });
        await expect.poll(() => did.at(-1)).toBe('move 16.5 -60 true true');

        // Moved elsewhere, as a respawn or a teleport moves the player: the client confirms where
        // it now stands, and a turn on the spot moves the player from there.
        java.send(ConfirmTeleportation, { teleportId: 2, x: 40.5, y: 70, z: 8.5, yaw: 0, pitch: 0 });
        java.send(MovePlayerRot, { yaw: 0, pitch: 0, flags: MOVE_ON_GROUND });
        await expect.poll(() => did.at(-1)).toBe('move 40.5 70 true true');
        java.destroy();
        await leaving;

        expect(did).toEqual([
            'join Steve offline',
            'show world 1',
            'announce',
            'intent {"kind":"playerInitialized"}',
            'intent {"kind":"chat","message":"hello"}',
            'move 16.5 -60 true true',
            'move 40.5 70 true true',
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
                    move: async () => held('move'),
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
        for (const opening of [PlayLogin, SynchronizePlayerPosition, GameEvent]) {
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
                    join: async (_profile, _verified, _id, _address, _send, close) => {
                        hangUp = close;
                        return { session, feet: { x: 8.5, y: -60, z: 8.5 }, dimension: OVERWORLD };
                    },
                    showWorld: async () => {},
                    announce: async () => {},
                    move: async () => {},
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

        for (const opening of [SynchronizePlayerPosition, GameEvent]) {
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
                    move: async () => {},
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
    });

    it('hangs up on a packet its phase has no place for', async () => {
        const port = await listen();
        const java = await javaClient(port);

        java.send(PingRequest, { timestamp: 1n });

        await java.closed;
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
