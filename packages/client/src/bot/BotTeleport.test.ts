import { Logger } from '@jsprismarine/logger';
import { Config } from '@jsprismarine/prismarine/config/Config';
import { Server } from '@jsprismarine/prismarine';
import type PlayerSession from '@jsprismarine/prismarine/network/PlayerSession';
import { networkToken } from '@jsprismarine/prismarine/modules/tokens';
import { PlayerAuthInputData, PlayerAuthInputPacket } from '@jsprismarine/protocol';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoopbackNetwork } from '../testing/loopback.test.helper';
import Bot from './Bot';
import Random from './Random';
import WalkBehavior from './behavior/WalkBehavior';

const MAX_JOIN_TICKS = 120;
const WALK_TICKS = 10;
/** Farther than a bot walks in {@link WALK_TICKS}, and in other chunks than the spawn's. */
const TARGET = { x: 101.5, y: 70, z: 101.5 };
/** How far a bot walks in one tick, with room for rounding. */
const STEP = 0.25;

const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    vi.unstubAllEnvs();
}, 60_000);

/**
 * A bot the server teleports, on a stepped server: the bot's ticks and the server's alternate.
 * Fixes #3041, where a bot kept walking from where it had been and the server, once its hold
 * on stale positions timed out, moved the player back there.
 */
describe('a bot the server teleports', () => {
    it('reports from the target, and the server keeps the player there', async () => {
        const stateRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-bot-teleport-'));
        vi.stubEnv('JSP_DIR', stateRoot);
        writeFileSync(
            path.join(stateRoot, 'config.json'),
            JSON.stringify({
                'online-mode': false,
                'preload-radius': 0,
                'view-distance': 2,
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
        const bot = new Bot({
            host: '127.0.0.1',
            port: 0,
            transport: network.client(),
            displayName: 'Teleported',
            behaviors: [new WalkBehavior()],
            random: new Random(7),
            logger: new Logger('error'),
            viewDistance: 2,
            loginTimeoutMs: 600_000
        });
        cleanup = async () => {
            bot.disconnect();
            await server.shutdown({ stayAlive: true });
            rmSync(stateRoot, { recursive: true, force: true });
        };

        const client = bot.getClient();
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

        // What the bot tells the server: the server's own decoder reads each input it sends.
        const inputs: { x: number; z: number; handled: boolean }[] = [];
        const originalSend = client.getSession().send.bind(client.getSession());
        vi.spyOn(client.getSession(), 'send').mockImplementation(async (packet, priority) => {
            if (packet instanceof PlayerAuthInputPacket) {
                const data = packet.getPacketData();
                if (data !== null) {
                    inputs.push({
                        x: data.position.getX(),
                        z: data.position.getZ(),
                        handled: data.inputData.has(PlayerAuthInputData.HANDLED_TELEPORT)
                    });
                }
            }
            await originalSend(packet, priority);
        });

        await server.bootstrap('127.0.0.1', 0);
        server.getChunkCompletionQueue().activate();

        let joined = false;
        const connecting = bot.connect().finally(() => {
            joined = true;
        });
        connecting.catch(() => {});
        for (let ticks = 0; !joined; ticks++) {
            if (ticks > MAX_JOIN_TICKS) throw new Error(`The bot did not join within ${MAX_JOIN_TICKS} ticks`);
            await tick();
        }
        await connecting;

        const player: PlayerSession | undefined = server.getSessionManager().getSessions()[0];
        if (player === undefined) throw new Error('The player did not join');

        for (let index = 0; index < 3; index++) {
            await bot.tick();
            await tick();
        }

        await server
            .getCommandManager()
            .dispatchCommand(
                server.getConsoleSender(),
                server.getConsoleSender(),
                `teleport ${player.getName()} ${TARGET.x} ${TARGET.y} ${TARGET.z}`
            );
        await settle();
        const sentBefore = inputs.length;

        // Where the server held the player after each tick, against where the bot said it was.
        const distances: number[] = [];
        const agreed: boolean[] = [];
        for (let ticks = 0; ticks < WALK_TICKS; ticks++) {
            await bot.tick();
            await tick();
            const position = player.getPosition();
            distances.push(Math.hypot(position.getX() - TARGET.x, position.getZ() - TARGET.z));
            // The wire carries 32-bit floats, so the server holds the bot's position rounded to one.
            agreed.push(
                position.getX() === Math.fround(bot.position.x) && position.getZ() === Math.fround(bot.position.z)
            );
        }

        const after = inputs.slice(sentBefore);
        // The first input after the teleport says it was handled, from a step off the target.
        expect(after[0]?.handled).toBe(true);
        expect(Math.hypot(after[0]!.x - TARGET.x, after[0]!.z - TARGET.z)).toBeLessThanOrEqual(STEP);
        expect(after.slice(1).every((input) => !input.handled)).toBe(true);
        // The server took every report at once, without waiting for the hold to time out, and
        // the player walked on from the target rather than from where it was.
        expect(agreed).toEqual(Array.from({ length: WALK_TICKS }, () => true));
        distances.forEach((distance, index) => expect(distance).toBeLessThanOrEqual(STEP * (index + 1)));
    }, 600_000);
});
