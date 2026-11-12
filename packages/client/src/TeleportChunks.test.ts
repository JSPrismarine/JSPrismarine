import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import { Config } from '@jsprismarine/prismarine/config/Config';
import { Server } from '@jsprismarine/prismarine';
import type PlayerSession from '@jsprismarine/prismarine/network/PlayerSession';
import { networkToken } from '@jsprismarine/prismarine/modules/tokens';
import {
    LevelChunkPacket,
    MovePlayerPacket,
    NetworkChunkPublisherUpdatePacket,
    PositionMode
} from '@jsprismarine/protocol';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Client from './Client';
import { LoopbackNetwork } from './testing/loopback.test.helper';

const VIEW_DISTANCE = 2;
const MAX_JOIN_TICKS = 120;
/** More ticks than a teleport and its chunks can need on a stepped server. */
const MAX_ARRIVAL_TICKS = 40;
const TARGET = { x: 101.5, y: 64, z: 101.5 };

const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
const toChunk = (block: number): number => Math.floor(block) >> 4;

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    vi.unstubAllEnvs();
}, 60_000);

/**
 * A server teleport while the client still reports where it was.
 *
 * A Bedrock client sends its position every tick, and goes on sending the old one until it has
 * read the server's teleport. Those inputs are applied in the input step of the tick after they
 * arrive, so one that arrived just before a console `/teleport` is applied after it.
 */
describe('a server teleport of a client that keeps reporting its old position', () => {
    it('keeps the player at the target and sends the chunks around it', async () => {
        const stateRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-teleport-chunks-'));
        vi.stubEnv('JSP_DIR', stateRoot);
        writeFileSync(
            path.join(stateRoot, 'config.json'),
            JSON.stringify({
                'online-mode': false,
                'preload-radius': 0,
                'view-distance': VIEW_DISTANCE,
                'enable-ticking': false,
                'chunk-workers': 0,
                'enable-query': false,
                worlds: { world: { preset: 'minecraft:flat', provider: 'LevelDB', seed: '1' } }
            })
        );

        const network = new LoopbackNetwork();
        const server = new Server({
            logger: new Logger('error'),
            config: new Config(),
            headless: true,
            transport: network.transport
        });
        const client = new Client({
            host: '127.0.0.1',
            transport: network.client(),
            auth: new OfflineAuthProvider({
                displayName: 'Teleported',
                identity: '00000000-0000-4000-8000-000000510101'
            }),
            logger: new Logger('error'),
            loginTimeoutMs: 600_000
        });
        cleanup = async () => {
            client.disconnect();
            await server.shutdown({ stayAlive: true });
            rmSync(stateRoot, { recursive: true, force: true });
        };

        const connections = () => network.connectionIds().flatMap((id) => server.getSessionManager().get(id) ?? []);
        const quiet = (): boolean =>
            server.getKernel().get(networkToken).isInboundSettled() &&
            client.getSession().isIdle() &&
            connections().every((connection) => connection.isOutboundSettled()) &&
            server.getChunkScheduler().isIdle();
        const settle = async (): Promise<void> => {
            for (;;) {
                await client.getSession().settled();
                await server.getChunkScheduler().settled();
                await Promise.all(connections().map((connection) => connection.settleOutbound()));
                await nextTurn();
                if (quiet()) {
                    await nextTurn();
                    if (quiet()) return;
                }
            }
        };
        const tick = async (): Promise<void> => {
            await settle();
            await server.advanceTick();
            await settle();
        };

        // What a Bedrock client keeps: chunks inside the publisher's radius, and nothing else.
        let center: { x: number; z: number } | undefined;
        let radius = 0;
        const kept = new Set<string>();
        const inView = (x: number, z: number): boolean =>
            center !== undefined && Math.max(Math.abs(x - center.x), Math.abs(z - center.z)) <= radius;
        let teleportedTo: { x: number; y: number; z: number } | undefined;
        const session = client.getSession();
        session.registerHandler(NetworkChunkPublisherUpdatePacket, {
            phases: ['login', 'play'],
            handle: (update) => {
                center = { x: update.position.x >> 4, z: update.position.z >> 4 };
                radius = update.radius >> 4;
                for (const key of kept) {
                    const [x, z] = key.split(',').map(Number);
                    if (!inView(x!, z!)) kept.delete(key);
                }
            }
        });
        session.registerHandler(LevelChunkPacket, {
            phases: ['login', 'play'],
            handle: (chunk) => {
                if (inView(chunk.chunkX, chunk.chunkZ)) kept.add(`${chunk.chunkX},${chunk.chunkZ}`);
            }
        });
        session.registerHandler(MovePlayerPacket, {
            phases: ['login', 'play'],
            handle: (move) => {
                if (move.mode === PositionMode.Teleport) teleportedTo = move.position;
            }
        });

        await server.bootstrap('127.0.0.1', 0);
        server.getChunkCompletionQueue().activate();

        let joined = false;
        const connecting = client.connect().finally(() => {
            joined = true;
        });
        connecting.catch(() => {});
        for (let ticks = 0; !joined; ticks++) {
            if (ticks > MAX_JOIN_TICKS) throw new Error(`The client did not join within ${MAX_JOIN_TICKS} ticks`);
            await tick();
        }
        await connecting;

        const startGame = client.getStartGame();
        if (startGame === null) throw new Error('The client did not receive StartGame');
        const player: PlayerSession | undefined = server.getSessionManager().getSessions()[0];
        if (player === undefined) throw new Error('The player did not join');

        let reported = { x: startGame.position.x, y: startGame.position.y, z: startGame.position.z };
        let inputTick = 0n;
        // The client's position every tick: the old one until it has read the teleport.
        const report = async (stale = false): Promise<void> => {
            if (!stale && teleportedTo !== undefined) reported = { ...teleportedTo };
            inputTick += 1n;
            await client.getSession().send(
                new MovePlayerPacket({
                    runtimeEntityId: startGame.runtimeEntityId,
                    position: reported,
                    pitch: 0,
                    yaw: 0,
                    headYaw: 0,
                    mode: PositionMode.Normal,
                    onGround: false,
                    ridingEntityRuntimeId: 0n,
                    tick: inputTick
                })
            );
        };

        for (let index = 0; index < 4; index++) {
            await report();
            await tick();
        }

        // A console line runs when it arrives, which can be partway through a tick: after its
        // input step and before the worlds update. The client's input for that tick, sent
        // before it read the teleport, arrives behind it and waits for the next input step.
        const teleportMidTick = async (): Promise<void> => {
            server.removeListener('tick', teleportMidTick);
            await server
                .getCommandManager()
                .dispatchCommand(
                    server.getConsoleSender(),
                    server.getConsoleSender(),
                    `teleport ${player.getName()} ${TARGET.x} ${TARGET.y} ${TARGET.z}`
                );
            await report(true);
        };
        server.on('tick', teleportMidTick);
        await tick();

        const targetX = toChunk(TARGET.x);
        const targetZ = toChunk(TARGET.z);
        const around = (): string[] => {
            const missing: string[] = [];
            for (let x = targetX - 1; x <= targetX + 1; x++) {
                for (let z = targetZ - 1; z <= targetZ + 1; z++) {
                    if (!kept.has(`${x},${z}`)) missing.push(`${x},${z}`);
                }
            }
            return missing;
        };

        // Where the server held the player after each tick, and the tick the client first had
        // every chunk around the target.
        const serverChunks: string[] = [];
        let arrivedAt: number | undefined;
        for (let ticks = 0; ticks < MAX_ARRIVAL_TICKS && arrivedAt === undefined; ticks++) {
            await tick();
            await report();
            const position = player.getPosition();
            serverChunks.push(`${toChunk(position.getX())},${toChunk(position.getZ())}`);
            if (around().length === 0) arrivedAt = ticks;
        }

        expect({ x: teleportedTo?.x, z: teleportedTo?.z }).toEqual({ x: TARGET.x, z: TARGET.z });
        // The input sent before the teleport never moved the player back.
        expect(new Set(serverChunks)).toEqual(new Set([`${targetX},${targetZ}`]));
        expect(center).toEqual({ x: targetX, z: targetZ });
        expect(around()).toEqual([]);
        expect(arrivedAt).toBeDefined();
    }, 600_000);
});
