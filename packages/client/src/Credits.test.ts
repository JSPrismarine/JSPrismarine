import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import { CreditsState, PacketIdentifier, PositionMode } from '@jsprismarine/protocol';
import { Config, Position, Server } from '@jsprismarine/prismarine';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Player } from '@jsprismarine/prismarine';
import type { ShowCreditsPayload } from '@jsprismarine/protocol';
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
 * The credits round trip observed on the wire: a real server with a flat Overworld and a void
 * End, and the real client standing in the End's exit portal.
 *
 * The unit tests over `DimensionTravel.transfer` and `PlayerSession.startCredits` prove the
 * server holds a first exit on the credits. This proves the client can read `ShowCredits`
 * off the wire, that its answer releases the held change, and that the change lands the player
 * back in the Overworld at the spawn.
 */

/** The Bedrock `Dimension ID`s of the trip, as `ChangeDimension` and `LevelChunk` carry them. */
const OVERWORLD = 0;
const THE_END = 2;

let stateRoot: string;
let server: Server | null = null;
let port = 0;
const clients: Client[] = [];

beforeAll(async () => {
    stateRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-client-credits-'));
    vi.stubEnv('JSP_DIR', stateRoot);
    writeFileSync(
        path.join(stateRoot, 'config.json'),
        JSON.stringify({
            'online-mode': false,
            worlds: {
                world: {
                    preset: 'minecraft:flat',
                    dimensions: {
                        // The built-in flat preset carries the Overworld alone, so the End is
                        // added by hand. Void, so the test never touches the Java worldgen
                        // cache; eager, so the trip does not wait on a world boot.
                        'minecraft:the_end': {
                            type: 'minecraft:the_end',
                            generator: { type: 'jsprismarine:void' },
                            load: 'eager'
                        }
                    }
                }
            }
        })
    );

    const logger = new Logger('error');
    server = new Server({ logger, config: new Config(), headless: true });

    // A fixed port, as `Login.test.ts` explains, and not another suite's.
    port = 19282;
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

describe('leaving the End through the exit portal on a real server', () => {
    it('rolls the credits, takes the answer, and lands the player at the Overworld spawn', async () => {
        const client = newClient('CreditsTester');

        // Every decoded packet in arrival order, so the sequence can be read back.
        const received: DecodedPacket[] = [];
        client.getSession().on('packet', (packet: DecodedPacket) => received.push(packet));
        const changes: PendingDimensionChange[] = [];
        client.on('dimensionChange', (change: PendingDimensionChange) => changes.push(change));
        const answered: ShowCreditsPayload[] = [];
        client.on('credits', (credits: ShowCreditsPayload) => answered.push(credits));

        await client.connect();
        const player = playerNamed('CreditsTester');
        const overworld = player.getWorld();
        expect(overworld.getDimension().bedrockId).toBe(OVERWORLD);
        const spawn = await overworld.getSpawnPosition();

        // Into the End first: the exit portal only exists there. The client's dimension change
        // responder closes the screen once the first End chunk is in.
        const end = await overworld.getLevel().world('minecraft:the_end');
        await player
            .getNetworkSession()
            .changeWorld({ world: end, position: new Position(0.5, 60, 0.5, end), yaw: 0, pitch: 0 });
        await vi.waitFor(() => expect(changes).toHaveLength(1), { timeout: 20_000, interval: 50 });
        expect(changes[0]!.dimension).toBe(THE_END);
        expect(player.getWorld()).toBe(end);

        // The exit portal block at the player's feet. The next tick touches it, and the End's
        // zero transition delay resolves the trip at once - into the credits, not a change.
        const feet = Math.floor(player.getFeetY());
        expect(await end.setBlockByName(0, feet, 0, 'minecraft:end_portal')).toBe(true);

        // The server starts the credits and holds the change until the answer.
        await vi.waitFor(() => expect(received.some((p) => p.id === PacketIdentifier.SHOW_CREDITS)).toBe(true), {
            timeout: 20_000,
            interval: 50
        });
        const credits = received.find((p) => isPacket(p, PacketIdentifier.SHOW_CREDITS));
        if (credits === undefined || !isPacket(credits, PacketIdentifier.SHOW_CREDITS)) throw new Error('no credits');
        expect(credits.data.creditsState).toBe(CreditsState.Start);
        expect(credits.data.playerRuntimeId).toBe(client.getStartGame()!.runtimeEntityId);

        // This client has no screen to roll them on, so it answers at once: the skip.
        await vi.waitFor(() => expect(answered).toHaveLength(1), { timeout: 20_000, interval: 50 });

        // The answer releases the held change: back to the Overworld, sent as a respawn, with
        // the teleport that ends the change after the client closes its screen.
        await vi.waitFor(() => expect(changes).toHaveLength(2), { timeout: 20_000, interval: 50 });
        const creditsIndex = received.findIndex((p) => p.id === PacketIdentifier.SHOW_CREDITS);
        await vi.waitFor(
            () => expect(received.slice(creditsIndex).some((p) => p.id === PacketIdentifier.MOVE_PLAYER)).toBe(true),
            { timeout: 20_000, interval: 50 }
        );
        const trip = received.slice(creditsIndex);
        const change = trip.find((p) => isPacket(p, PacketIdentifier.CHANGE_DIMENSION));
        if (change === undefined || !isPacket(change, PacketIdentifier.CHANGE_DIMENSION)) throw new Error('no change');
        expect(change.data.dimension).toBe(OVERWORLD);
        expect(change.data.respawn).toBe(true);

        // The teleport carries the arrival `ChangeDimension` announced.
        const move = trip.find((p) => isPacket(p, PacketIdentifier.MOVE_PLAYER));
        if (move === undefined || !isPacket(move, PacketIdentifier.MOVE_PLAYER)) throw new Error('no move');
        expect(move.data.mode).toBe(PositionMode.Teleport);
        expect(move.data.position.x).toBeCloseTo(change.data.position.getX());
        expect(move.data.position.y).toBeCloseTo(change.data.position.getY());
        expect(move.data.position.z).toBeCloseTo(change.data.position.getZ());

        // Back in the Overworld, standing on the respawn point: the spawn block, since this
        // player has no bed, exactly as a death would place them.
        expect(player.getWorld()).toBe(overworld);
        expect(Math.floor(player.getPosition().getX())).toBe(Math.floor(spawn.getX()));
        expect(player.getFeetY()).toBeCloseTo(Math.floor(spawn.getY()));
        expect(Math.floor(player.getPosition().getZ())).toBe(Math.floor(spawn.getZ()));

        // One ShowCredits for the whole trip, and nothing arrived without a codec.
        expect(received.filter((p) => p.id === PacketIdentifier.SHOW_CREDITS)).toHaveLength(1);
        expect(client.getRegistry().getUnknownIds()).not.toContain(PacketIdentifier.SHOW_CREDITS);

        // The flag is on the player, so the next exit would transfer at once.
        expect(player.hasSeenCredits()).toBe(true);
    }, 90_000);
});
