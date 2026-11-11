import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import { Gametype } from '@jsprismarine/minecraft';
import {
    ChangeDimensionPacket,
    LevelChunkPacket,
    NetworkBinaryStream,
    PacketIdentifier,
    PlayStatus,
    PlayerActionPacket,
    PlayerActionType,
    PositionMode,
    ServerboundLoadingScreenPacket,
    ServerboundLoadingScreenPacketType
} from '@jsprismarine/protocol';
import { Config, Server } from '@jsprismarine/prismarine';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ChangeDimensionPayload } from '@jsprismarine/protocol';
import type { PlayerSession } from '@jsprismarine/prismarine';
import type { DecodedPacket } from './net/ClientPacketRegistry';
import type { PendingDimensionChange } from './DimensionChange';

import Client from './Client';
import DimensionChange from './DimensionChange';
import ClientPacketRegistry, { isPacket } from './net/ClientPacketRegistry';
import ClientSession from './net/ClientSession';
import { FakeTransport } from './testing/fakeTransport.test.helper';

/**
 * A portal trip observed on the wire: a real server with a flat Overworld and a flat Nether,
 * and the real client standing in a lit portal until the server moves it.
 *
 * The unit tests over `PlayerSession.changeWorld` prove the server sends the sequence it
 * means to. This proves the client can read every packet of it, that the id the server hands
 * out comes back to it, and that the change finishes on the client's answer and not before.
 */

/** The Bedrock `Dimension ID` of the Nether, as `ChangeDimension` and `LevelChunk` carry it. */
const NETHER = 1;

let stateRoot: string;
let server: Server | null = null;
let port = 0;
const clients: Client[] = [];

beforeAll(async () => {
    stateRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-client-dimension-'));
    vi.stubEnv('JSP_DIR', stateRoot);
    writeFileSync(
        path.join(stateRoot, 'config.json'),
        JSON.stringify({
            'online-mode': false,
            // This fixture tests travel between dimensions, not spawn-area generation.
            'preload-radius': 0,
            worlds: {
                world: {
                    preset: 'minecraft:flat',
                    dimensions: {
                        // The built-in flat preset carries the Overworld alone, so the Nether
                        // is added by hand. Eager, so the trip does not wait on a world boot.
                        'minecraft:the_nether': {
                            type: 'minecraft:the_nether',
                            generator: {
                                type: 'minecraft:flat',
                                settings: {
                                    layers: [
                                        { block: 'minecraft:bedrock', height: 1 },
                                        { block: 'minecraft:netherrack', height: 3 }
                                    ],
                                    biome: 'minecraft:nether_wastes'
                                }
                            },
                            load: 'eager'
                        }
                    }
                }
            }
        })
    );

    const logger = new Logger('error');
    server = new Server({ logger, config: new Config(), headless: true });

    // A fixed port, as `Login.test.ts` explains, and not that suite's.
    port = 19279;
    await server.bootstrap('127.0.0.1', port);
}, 60_000);

afterEach(() => {
    clients.splice(0).forEach((client) => client.disconnect());
});

afterAll(async () => {
    server?.getRaknet()?.kill();
    vi.unstubAllEnvs();
    rmSync(stateRoot, { recursive: true, force: true });
}, 30_000);

const newClient = (displayName: string) => {
    const client = new Client({
        host: '127.0.0.1',
        port,
        logger: new Logger('error'),
        auth: new OfflineAuthProvider({ displayName }),
        loginTimeoutMs: 25_000
    });

    clients.push(client);
    return client;
};

const playerNamed = (name: string): PlayerSession => {
    const player = server!
        .getSessionManager()
        .getSessions()
        .find((candidate) => candidate.getName() === name);
    if (player === undefined) throw new Error(`${name} is not online`);
    return player;
};

describe('traveling through a nether portal on a real server', () => {
    it('reads the change on the wire, closes the screen, and lands in the Nether', async () => {
        const client = newClient('PortalTester');

        // Every decoded packet in arrival order, so the sequence can be read back.
        const received: DecodedPacket[] = [];
        client.getSession().on('packet', (packet: DecodedPacket) => received.push(packet));
        const ended: PendingDimensionChange[] = [];
        client.on('dimensionChange', (change: PendingDimensionChange) => ended.push(change));

        await client.connect();
        const player = playerNamed('PortalTester');
        const overworld = player.getWorld();
        expect(overworld.getDimension().bedrockId).toBe(0);

        // A lit portal around the player: the 2 by 3 interior of an x-axis frame, with the
        // player in its first column. The frame itself is not needed for the contact or the
        // trip, only for lighting one with a flint and steel.
        const x = Math.floor(player.getPosition().getX());
        const z = Math.floor(player.getPosition().getZ());
        const feet = Math.floor(player.getFeetY());
        for (const dx of [0, 1]) {
            for (let dy = 0; dy < 3; dy += 1) {
                expect(await overworld.setBlockByName(x + dx, feet + dy, z, 'minecraft:portal')).toBe(true);
            }
        }

        // Survival: 80 ticks of contact, four seconds at 20 TPS, before the server moves the
        // player. The server's own ticker drives this; nothing is advanced by hand.
        const changeDimension = received.length;
        await vi.waitFor(
            () =>
                expect(received.slice(changeDimension).some((p) => p.id === PacketIdentifier.CHANGE_DIMENSION)).toBe(
                    true
                ),
            { timeout: 20_000, interval: 50 }
        );

        // Then the client answers once the first Nether chunk is in, and the server finishes.
        await vi.waitFor(() => expect(ended).toHaveLength(1), { timeout: 20_000, interval: 50 });
        await vi.waitFor(
            () => expect(received.slice(changeDimension).some((p) => p.id === PacketIdentifier.MOVE_PLAYER)).toBe(true),
            { timeout: 10_000, interval: 50 }
        );

        // From `ChangeDimension` on. The join sent chunks and publisher updates of its own,
        // and keeps sending the latter with every chunk batch, so the order is read from the
        // change itself.
        const trip = received.slice(received.findIndex((p) => p.id === PacketIdentifier.CHANGE_DIMENSION));
        const indexOf = (id: number) => trip.findIndex((p) => p.id === id);

        // `ChangeDimension` names the Nether, carries a screen id, and comes before the rest.
        const change = trip[0];
        if (change === undefined || !isPacket(change, PacketIdentifier.CHANGE_DIMENSION)) throw new Error('no change');
        expect(change.data.dimension).toBe(NETHER);
        expect(change.data.respawn).toBe(false);
        expect(change.data.loadingScreenId).not.toBeNull();
        expect(ended[0]!.loadingScreenId).toBe(change.data.loadingScreenId);

        // The order the portal note settles on: ChangeDimension, StopSound, the publisher
        // update, the server-sent ack, the chunks, then PlayerSpawn.
        const serverAck = trip.findIndex(
            (p) => isPacket(p, PacketIdentifier.PLAYER_ACTION) && p.data.action === PlayerActionType.ChangeDimensionAck
        );
        const firstNetherChunk = trip.findIndex(
            (p) => isPacket(p, PacketIdentifier.LEVEL_CHUNK) && p.data.dimension === NETHER
        );
        const spawn = trip.findIndex(
            (p) => isPacket(p, PacketIdentifier.PLAY_STATUS) && p.data.status === PlayStatus.PlayerSpawn
        );
        expect(indexOf(PacketIdentifier.CHANGE_DIMENSION)).toBeLessThan(indexOf(PacketIdentifier.STOP_SOUND));
        expect(indexOf(PacketIdentifier.STOP_SOUND)).toBeLessThan(
            indexOf(PacketIdentifier.NETWORK_CHUNK_PUBLISHER_UPDATE)
        );
        expect(indexOf(PacketIdentifier.NETWORK_CHUNK_PUBLISHER_UPDATE)).toBeLessThan(serverAck);
        expect(serverAck).toBeLessThan(firstNetherChunk);
        expect(spawn).toBeGreaterThan(serverAck);

        // Every chunk since the change is the Nether's; none of the Overworld's leaked through.
        const chunks = trip.filter((p) => isPacket(p, PacketIdentifier.LEVEL_CHUNK));
        expect(chunks.length).toBeGreaterThan(0);
        for (const chunk of chunks) {
            if (isPacket(chunk, PacketIdentifier.LEVEL_CHUNK)) expect(chunk.data.dimension).toBe(NETHER);
        }

        // The server moved the player, and the teleport that ends the change came after the
        // client closed its screen, at the arrival position `ChangeDimension` announced.
        expect(player.getWorld().getDimension().bedrockId).toBe(NETHER);
        expect(player.getWorld()).not.toBe(overworld);
        const move = trip.find((p) => isPacket(p, PacketIdentifier.MOVE_PLAYER));
        if (move === undefined || !isPacket(move, PacketIdentifier.MOVE_PLAYER)) throw new Error('no move');
        expect(move.data.mode).toBe(PositionMode.Teleport);
        expect(move.data.runtimeEntityId).toBe(client.getStartGame()!.runtimeEntityId);
        expect(move.data.position.x).toBeCloseTo(change.data.position.getX());
        expect(move.data.position.y).toBeCloseTo(change.data.position.getY());
        expect(move.data.position.z).toBeCloseTo(change.data.position.getZ());
        expect(indexOf(PacketIdentifier.MOVE_PLAYER)).toBeGreaterThan(firstNetherChunk);

        // Both carry the eyes the server holds, and the feet below them stand in the portal
        // the trip built rather than in its obsidian floor.
        expect(move.data.position.y).toBeCloseTo(player.getPosition().getY());
        const underfoot = await player
            .getWorld()
            .getBlock(
                Math.floor(player.getPosition().getX()),
                Math.floor(player.getFeetY()),
                Math.floor(player.getPosition().getZ())
            );
        expect(underfoot.getName()).toBe('minecraft:portal');

        // The sequence is read whole: nothing in it reached the client without a codec.
        for (const id of [
            PacketIdentifier.CHANGE_DIMENSION,
            PacketIdentifier.STOP_SOUND,
            PacketIdentifier.NETWORK_CHUNK_PUBLISHER_UPDATE,
            PacketIdentifier.PLAYER_ACTION,
            PacketIdentifier.LEVEL_CHUNK,
            PacketIdentifier.MOVE_PLAYER
        ]) {
            expect(client.getRegistry().getUnknownIds()).not.toContain(id);
        }

        // Standing in the arrival portal must not start a trip back: every touched tick winds
        // the cooldown back (Java's `Entity.setAsInsidePortal`), so travel needs leaving and
        // re-entering. Creative makes a regression immediate, since its transition delay is
        // zero once the cooldown has run out.
        await player.setGamemode(Gametype.CREATIVE);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        expect(received.filter((p) => p.id === PacketIdentifier.CHANGE_DIMENSION)).toHaveLength(1);
        expect(player.getWorld().getDimension().bedrockId).toBe(NETHER);
    }, 90_000);
});

describe('DimensionChange on its own session', () => {
    const RUNTIME_ID = 5n;
    const SCREEN = 9;

    /** A `ChangeDimension` payload, decoded from its wire form because the client has no `Vector3` of its own. */
    const changeTo = (dimension: number, loadingScreenId: number | null): ChangeDimensionPayload => {
        const stream = new NetworkBinaryStream();
        stream.writeUnsignedVarInt(PacketIdentifier.CHANGE_DIMENSION);
        stream.writeVarInt(dimension);
        for (const axis of [8, 64, 8]) stream.writeFloatLE(axis);
        stream.writeBoolean(false);
        stream.writeBoolean(loadingScreenId !== null);
        if (loadingScreenId !== null) stream.writeUnsignedIntLE(loadingScreenId);
        return new ChangeDimensionPacket().deserialize(new NetworkBinaryStream(stream.getBuffer()));
    };
    const chunkIn = (dimension: number) =>
        new LevelChunkPacket({
            chunkX: 0,
            chunkZ: 0,
            dimension,
            subChunkCount: 0,
            clientSubChunkRequestsEnabled: false,
            cached: false,
            blobHashes: [],
            payload: Buffer.alloc(0)
        });

    const newDimensionChange = () => {
        const transport = new FakeTransport();
        const registry = new ClientPacketRegistry();
        registry.registerAll([ChangeDimensionPacket, LevelChunkPacket]);
        const session = new ClientSession(transport, registry, new Logger('error'));
        const dimensionChange = new DimensionChange(session, () => RUNTIME_ID);
        const ended: PendingDimensionChange[] = [];
        dimensionChange.on('end', (change: PendingDimensionChange) => ended.push(change));
        /** What was sent, as the id and the payload of each packet the change sends. */
        const sent = async () =>
            (await transport.sentPackets()).map((packet) => {
                const stream = new NetworkBinaryStream(packet);
                return ClientPacketRegistry.readPacketId(packet) === PacketIdentifier.PLAYER_ACTION
                    ? new PlayerActionPacket().deserialize(stream)
                    : new ServerboundLoadingScreenPacket().deserialize(stream);
            });
        return { transport, session, dimensionChange, ended, sent };
    };

    it('opens the screen on the change and closes it on the first chunk of the new dimension', async () => {
        const { transport, session, dimensionChange, ended, sent } = newDimensionChange();

        await transport.deliver(new ChangeDimensionPacket(changeTo(NETHER, SCREEN)));
        await session.settled();
        expect(dimensionChange.getPending()).toMatchObject({ dimension: NETHER, loadingScreenId: SCREEN });

        // A chunk of the dimension being left closes nothing; the Nether's first one does, and
        // the one after it finds no change left to close.
        await transport.deliver(chunkIn(0), chunkIn(NETHER), chunkIn(NETHER));
        await session.settled();

        expect(await sent()).toEqual([
            { loadingScreenType: ServerboundLoadingScreenPacketType.StartLoadingScreen, loadingScreenId: SCREEN },
            expect.objectContaining({ runtimeEntityId: RUNTIME_ID, action: PlayerActionType.ChangeDimensionAck }),
            { loadingScreenType: ServerboundLoadingScreenPacketType.EndLoadingScreen, loadingScreenId: SCREEN }
        ]);
        expect(ended).toHaveLength(1);
        expect(dimensionChange.getPending()).toBeNull();
    });

    it('sends no screen start for a change without an id, and still closes it', async () => {
        const { transport, session, ended, sent } = newDimensionChange();
        session.setPhase('play');

        await transport.deliver(new ChangeDimensionPacket(changeTo(NETHER, null)), chunkIn(NETHER));
        await session.settled();

        expect((await sent()).map((packet) => ('action' in packet ? 'ack' : packet.loadingScreenType))).toEqual([
            'ack',
            ServerboundLoadingScreenPacketType.EndLoadingScreen
        ]);
        expect(ended).toHaveLength(1);
    });
});
