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
import { LevelChunkWithLight } from '@jsprismarine/protocol/java/chunk/levelChunk';
import {
    ChunkBatchFinished,
    ChunkBatchStart,
    GameEvent,
    PlayDisconnect,
    PlayLogin,
    SetCenterChunk,
    START_WAITING_FOR_LEVEL_CHUNKS,
    SynchronizePlayerPosition
} from '@jsprismarine/protocol/java/packet/play';
import { CONFIGURATION } from '@jsprismarine/protocol/java/versions/26.3/configuration';
import { PACKETS } from '@jsprismarine/protocol/java/versions/26.3/packets';
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
import Chunk from '../../world/chunk/Chunk';
import { ConnectionIds } from '../transport/ConnectionId';
import { TcpTransport } from '../transport/TcpTransport';
import type { JavaProfile } from './javaAuth';
import { offlineUuid, serverHash } from './javaAuth';
import { JavaConnections } from './JavaConnections';

/** `Client Information`, by id alone: its fields are the client's settings, which the server reads past. */
const ClientInformationProbe = defineJavaPacket(
    'Client Information',
    PACKETS.configuration.serverbound.client_information,
    {}
);

const status = { getMotd: () => 'A JSPrismarine server', getOnlinePlayerCount: () => 3, getMaxPlayerCount: () => 20 };
const quiet = { debug: () => {}, info: () => {} };

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

    it('shows a player who reaches play the world around spawn, in the order vanilla sends it', async () => {
        transport = new TcpTransport(new ConnectionIds(), quiet);
        const asked: string[] = [];
        new JavaConnections(transport, {
            status,
            brand: 'JSPrismarine',
            onlineMode: () => false,
            log: quiet,
            world: {
                spawn: async () => ({ x: 8.5, y: -60, z: 8.5 }),
                chunk: async (x, z) => {
                    asked.push(`${x},${z}`);
                    return new Chunk(x, z);
                },
                light: () => ({ sky: () => 15, block: () => 0 }),
                viewDistance: () => 1,
                gameMode: () => 1,
                maxPlayers: () => 20
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
        const center = await java.receive(SetCenterChunk);
        await java.receive(ChunkBatchStart);
        const chunks = [];
        for (let i = 0; i < 9; i++) chunks.push(await java.receive(LevelChunkWithLight));
        const finished = await java.receive(ChunkBatchFinished);
        java.destroy();

        expect(login).toMatchObject({
            dimension: 'minecraft:overworld',
            gameMode: 1,
            previousGameMode: null,
            viewDistance: 1
        });
        expect(position).toMatchObject({ teleportId: 1, x: 8.5, y: -60, z: 8.5 });
        expect(event).toEqual({ event: START_WAITING_FOR_LEVEL_CHUNKS, value: 0 });
        expect(center).toEqual({ x: 0, z: 0 });
        // The chunk under the player first, then the eight around it.
        expect([chunks[0]!.x, chunks[0]!.z]).toEqual([0, 0]);
        expect(new Set(chunks.map(({ x, z }) => `${x},${z}`))).toEqual(new Set(asked));
        expect(finished).toEqual({ batchSize: 9 });
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

    it('hangs up on a packet its phase has no place for', async () => {
        const port = await listen();
        const java = await javaClient(port);

        java.send(PingRequest, { timestamp: 1n });

        await java.closed;
    });
});

describe('JavaConnections session id', () => {
    it('gives every login on one server the same session id', async () => {
        const transport = new TcpTransport(new ConnectionIds(), quiet);
        new JavaConnections(transport, { status, brand: 'JSPrismarine', onlineMode: () => false, log: quiet });
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
