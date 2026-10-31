import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import { PacketIdentifier, PlayStatus, PlayerActionType, PositionMode } from '@jsprismarine/protocol';
import { Config, Server } from '@jsprismarine/prismarine';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Player } from '@jsprismarine/prismarine';
import type { DecodedPacket } from './net/ClientPacketRegistry';
import type { PendingDimensionChange } from './DimensionChange';

// The full test run reuses workers without isolating modules. Another server test can leave
// its mocked RakNet listener in the worker, so this integration suite must reload the real one.
vi.hoisted(() => {
    vi.doUnmock('@jsprismarine/raknet');
    vi.resetModules();
});

import Client from './Client';
import { isPacket } from './net/ClientPacketRegistry';

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

const playerNamed = (name: string): Player => {
    const player = server!
        .getSessionManager()
        .getAllPlayers()
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
    }, 90_000);
});
