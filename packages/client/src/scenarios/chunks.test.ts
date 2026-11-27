// @module-tag integration

/**
 * How a joined player is sent its chunks: the client e2e scenarios `cached-chunk-delivery`,
 * `chunk-completion-readiness` and `subchunk-request-delivery`, played over a loopback pipe
 * against a server stepped by hand.
 *
 * The cinnabar suite these come from keeps a radius of two chunks resident before the client
 * joins and plays with a render distance of five, so this server does too. The cinnabar versions
 * time the join in milliseconds; these count what the client held when the server spawned it.
 */
import { LevelChunkPacket, NetworkChunkPublisherUpdatePacket } from '@jsprismarine/protocol';
import SubChunkPacket, { SubChunkRequestResult } from '@jsprismarine/protocol/bedrock/packet/SubChunkPacket';
import SubChunkRequestPacket from '@jsprismarine/protocol/bedrock/packet/SubChunkRequestPacket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startLoopbackServer } from '../testing/loopbackServer.test-utils';
import { EYE_HEIGHT } from './scenarioSupport.test-utils';

import type { LevelChunk } from '@jsprismarine/protocol';
import type { SubChunk } from '@jsprismarine/protocol/bedrock/packet/SubChunkPacket';
import type Client from '../Client';
import type { DecodedPacket } from '../net/ClientPacketRegistry';
import type { LoopbackPlayer, LoopbackServer } from '../testing/loopbackServer.test-utils';

/** The cinnabar client's render distance, in chunks. */
const RENDER_DISTANCE = 5;
/** The radius the cinnabar suite keeps resident around the spawn before the client joins. */
const PRELOAD_RADIUS = 2;
/** The lowest sub chunk of the Overworld, at y -64. */
const OVERWORLD_MIN_SUB_CHUNK = -4;

let jsp: LoopbackServer;

// Booting the server builds its content, the slow part, so it happens once for the file.
beforeAll(async () => {
    jsp = await startLoopbackServer({
        name: 'chunk-scenarios',
        config: { 'view-distance': RENDER_DISTANCE, 'preload-radius': PRELOAD_RADIUS }
    });
}, 900_000);

afterAll(async () => {
    await jsp?.close();
}, 60_000);

/** What a client was told about its chunks, read from the packets `ClientWorld` keeps no copy of. */
interface ChunkStream {
    /** The last `LevelChunk` the client was sent for each column, by `x,z` key. */
    readonly levelChunks: Map<string, LevelChunk>;
    /** Every `SubChunk` answer the client was sent, oldest first. */
    readonly subChunks: SubChunk[];
    /** The publisher's radius, in blocks, or `undefined` before the first update. */
    publisherRadius(): number | undefined;
}

/**
 * Listens to the chunk packets a client is sent, before it connects.
 * @param client - The client to listen to.
 * @returns What it was sent, as it arrives.
 */
const streamChunks = (client: Client): ChunkStream => {
    const registry = client.getRegistry();
    if (!registry.has(new SubChunkPacket().getId())) registry.register(SubChunkPacket);
    const levelChunks = new Map<string, LevelChunk>();
    const subChunks: SubChunk[] = [];
    let radius: number | undefined;
    client.on('packet', ({ packet }: DecodedPacket) => {
        if (packet instanceof LevelChunkPacket) {
            const chunk = packet.getPacketData();
            if (chunk !== null) levelChunks.set(`${chunk.chunkX},${chunk.chunkZ}`, chunk);
        } else if (packet instanceof SubChunkPacket) {
            const answer = packet.getPacketData();
            if (answer !== null) subChunks.push(answer);
        } else if (packet instanceof NetworkChunkPublisherUpdatePacket) {
            const update = packet.getPacketData();
            if (update !== null) radius = update.radius;
        }
    });
    return { levelChunks, subChunks, publisherRadius: () => radius };
};

/**
 * Joins a player through `connect`, so a listener sees the join, and notes how many columns
 * around the player the client held when the server spawned it.
 * @param name - The player's name.
 * @returns The player, its chunk stream, and whether the radius-2 square was loaded at the spawn.
 */
const joinWatched = async (name: string) => {
    const { player, joined } = jsp.connect(name);
    const stream = streamChunks(player.client);
    let loadedAtSpawn: boolean | undefined;
    player.client.on('spawn', () => {
        loadedAtSpawn = player.world.chunksLoadedAround(2);
    });
    let done = false;
    void joined.finally(() => {
        done = true;
    });
    await jsp.until(() => done, `${name} never joined`, 240);
    await joined;
    await jsp.until(
        () => player.session()?.getPlayer() !== undefined && player.world.getPosition() !== undefined,
        `${name} never joined the server's session list`
    );
    return { player, stream, loadedAtSpawn: () => loadedAtSpawn };
};

/**
 * The widest square of columns the server fills around the client.
 *
 * The server sends a circle of chunks, the publisher's radius across, while the check counts a
 * square, whose corners stand √2 times its radius out.
 */
const nearbyRadius = (stream: ChunkStream): number => {
    const radius = stream.publisherRadius();
    if (radius === undefined) throw new Error('the client was never sent a chunk publisher update');
    return Math.min(4, Math.floor(radius / 16 / Math.SQRT2));
};

/** Waits until the client holds every column within `radius` of the player. */
const chunksAround = (player: LoopbackPlayer, radius: number): Promise<number> =>
    jsp.until(() => player.world.chunksLoadedAround(radius), `${player.name} never loaded radius ${radius}`, 200);

describe('cached-chunk-delivery', () => {
    it('sends the resident radius-2 chunks by the time the client spawns', async () => {
        const { player, loadedAtSpawn } = await joinWatched('Cached');
        await chunksAround(player, 2);

        expect(player.client.isConnected()).toBe(true);
        expect(player.world.loadedChunks().length).toBeGreaterThanOrEqual(25);
        // The cinnabar scenario logs which came first in milliseconds; the order is what it reads.
        expect(loadedAtSpawn(), 'every radius-2 column was on the client before PlayerSpawn').toBe(true);
        player.leave();
        await jsp.tick();
    });
});

describe('chunk-completion-readiness', () => {
    it('sends the nearby chunks after each of two teleports into unloaded ground', async () => {
        const { player, stream } = await joinWatched('Burst');
        await chunksAround(player, 2);
        await jsp.command(`gamemode creative ${player.name}`);

        for (const [x, z] of [
            [24, 24],
            [-40, 40]
        ] as const) {
            await jsp.command(`fill ${x - 1} -57 ${z - 1} ${x + 1} -57 ${z + 1} minecraft:stone`);
            const before = player.world.getTeleportCount();
            // The server puts a player in its world some ticks after the spawn, and a teleport
            // finds it only then; the cinnabar `standAt` asks again in the same way.
            for (let tick = 0; ; tick++) {
                const { messages } = await jsp.command(`teleport ${player.name} ${x} -56 ${z}`);
                if (messages.some((line) => /Teleported [1-9]/.test(line))) break;
                if (tick >= 100) throw new Error(`${player.name} was never teleported: ${messages.join('; ')}`);
                await jsp.tick();
            }
            await jsp.until(() => player.world.getTeleportCount() > before, 'the client was never sent the teleport');
            await player.input();
            const eyes = player.world.getPosition()!;
            expect(Math.hypot(eyes.x - x, eyes.y - EYE_HEIGHT + 56, eyes.z - z)).toBeLessThan(2);

            await chunksAround(player, nearbyRadius(stream));
            expect(player.world.loadedChunks().length).toBeGreaterThan(0);
        }

        // The cinnabar scenario's five stationary seconds, at twenty ticks a second.
        for (let tick = 0; tick < 100; tick++) {
            await player.input();
            await jsp.tick();
        }
        expect(player.world.chunksLoadedAround(nearbyRadius(stream)), 'the chunks stay loaded').toBe(true);
        player.leave();
        await jsp.tick();
    });
});

describe('subchunk-request-delivery', () => {
    it('answers the sub chunks of each request-mode LevelChunk skeleton the client asks for', async () => {
        const { player, stream } = await joinWatched('Requester');
        await chunksAround(player, 2);

        const position = player.world.getPosition()!;
        const centerX = Math.floor(position.x) >> 4;
        const centerZ = Math.floor(position.z) >> 4;
        const columns: { x: number; z: number; count: number }[] = [];
        for (let x = centerX - 2; x <= centerX + 2; x++) {
            for (let z = centerZ - 2; z <= centerZ + 2; z++) {
                const chunk = stream.levelChunks.get(`${x},${z}`);
                expect(chunk?.clientSubChunkRequestsEnabled, `column ${x},${z} came as a request-mode skeleton`).toBe(
                    true
                );
                columns.push({ x, z, count: chunk!.subChunkCount });
            }
        }

        // What a retail client does with a skeleton: ask for every sub chunk up to its limit.
        for (const { x, z, count } of columns) {
            const request = new SubChunkRequestPacket();
            request.dimensionType = 0;
            request.centerPos = { x, y: OVERWORLD_MIN_SUB_CHUNK, z };
            request.offsets = Array.from({ length: count }, (_, y) => ({ x: 0, y, z: 0 }));
            await player.client.getSession().send(request);
        }
        await jsp.until(() => stream.subChunks.length >= columns.length, 'the server never answered every request');

        for (const answer of stream.subChunks) {
            const column = `${answer.centerPos.x},${answer.centerPos.z}`;
            const results = answer.entries.map((entry) => entry.result);
            expect(
                results.every(
                    (result) =>
                        result === SubChunkRequestResult.SUCCESS || result === SubChunkRequestResult.SUCCESS_ALL_AIR
                ),
                `every sub chunk of ${column} was answered: ${results.join(', ')}`
            ).toBe(true);
            // The flat world's floor fills the lowest sub chunk of every column.
            expect(results, `${column} has terrain`).toContain(SubChunkRequestResult.SUCCESS);
        }
        expect(new Set(stream.subChunks.map(({ centerPos }) => `${centerPos.x},${centerPos.z}`)).size).toBe(25);
        player.leave();
        await jsp.tick();
    });
});
