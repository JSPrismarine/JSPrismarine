import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import { Config } from '@jsprismarine/prismarine/config/Config';
import { Server } from '@jsprismarine/prismarine';
import { networkToken } from '@jsprismarine/prismarine/modules/tokens';
import AnimatePacket, { AnimateAction } from '@jsprismarine/protocol/packet/AnimatePacket';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Client from './Client';
import { LoopbackNetwork } from './testing/loopback.test.helper';

const MAX_JOIN_TICKS = 120;
/** The frozen ticks that each carry one arm swing. */
const SWINGING_TICKS = 3;
const ANIMATE_ID = new AnimatePacket().getId();

/**
 * An arm swing the test client can send. `ClientSession.send` serializes only packets with a
 * typed payload, and `AnimatePacket` keeps its body in fields (#3019), so this one writes itself through
 * its field encoder. It keeps the name its id is looked up by.
 */
class SwingPacket extends AnimatePacket {
    public override getName(): string {
        return 'AnimatePacket';
    }

    public override serialize(): Buffer {
        return this.encodeTransient();
    }
}

const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    vi.unstubAllEnvs();
}, 60_000);

/**
 * `/tick freeze` holds the world still and lets the players act, as Java's tick rate manager
 * freezes every entity but the players. A frozen tick still applies its inputs, so what one
 * player does in it reaches the others in that tick, and nothing piles up for the unfreeze.
 */
describe('a frozen tick', () => {
    it('sends what its inputs did in that tick and keeps nothing back for the unfreeze', async () => {
        const stateRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-frozen-tick-'));
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
        const client = (displayName: string, identity: string) =>
            new Client({
                host: '127.0.0.1',
                transport: network.client(),
                auth: new OfflineAuthProvider({ displayName, identity }),
                logger: new Logger('error'),
                loginTimeoutMs: 600_000
            });
        const swinger = client('Swinger', '00000000-0000-4000-8000-000000510301');
        const watcher = client('Watcher', '00000000-0000-4000-8000-000000510302');
        const clients = [swinger, watcher];
        cleanup = async () => {
            for (const each of clients) each.disconnect();
            await server.shutdown({ stayAlive: true });
            rmSync(stateRoot, { recursive: true, force: true });
        };

        const connections = () => network.connectionIds().flatMap((id) => server.getSessionManager().get(id) ?? []);
        const quiet = (): boolean =>
            server.getKernel().get(networkToken).isInboundSettled() &&
            clients.every((each) => each.getSession().isIdle()) &&
            connections().every((connection) => connection.isOutboundSettled()) &&
            server.getChunkScheduler().isIdle();
        const settle = async (): Promise<void> => {
            for (;;) {
                await Promise.all(clients.map(async (each) => each.getSession().settled()));
                await server.getChunkScheduler().settled();
                await Promise.all(connections().map(async (connection) => connection.settleOutbound()));
                await nextTurn();
                if (quiet()) {
                    await nextTurn();
                    if (quiet()) return;
                }
            }
        };
        const tick = async (): Promise<void> => {
            server.advanceTick();
            await settle();
        };

        await server.bootstrap('127.0.0.1', 0);
        server.getChunkCompletionQueue().activate();

        for (const each of clients) {
            let joined = false;
            const connecting = each.connect().finally(() => {
                joined = true;
            });
            connecting.catch(() => {});
            for (let ticks = 0; !joined; ticks++) {
                if (ticks > MAX_JOIN_TICKS) throw new Error(`A client did not join within ${MAX_JOIN_TICKS} ticks`);
                await settle();
                server.advanceTick();
            }
            await connecting;
            await settle();
        }

        const world = server.getWorldManager().getDefaultWorld();
        const swingerId = swinger.getStartGame()?.runtimeEntityId;
        const watcherId = watcher.getStartGame()?.runtimeEntityId;
        if (swingerId === undefined || watcherId === undefined) throw new Error('A client joined without a StartGame');
        // Both stand at the spawn, so the watcher is shown the swinger by a tracking pass.
        for (let ticks = 0; !world.viewerOf(watcherId)?.tracks(swingerId); ticks++) {
            if (ticks > MAX_JOIN_TICKS) throw new Error('The watcher was never shown the swinger');
            await tick();
        }

        const swings: number[] = [];
        watcher.getSession().on('raw', ({ id }: { id: number }) => {
            if (id === ANIMATE_ID) swings.push(server.getTick());
        });
        const swing = async (): Promise<void> => {
            const packet = new SwingPacket();
            packet.action = AnimateAction.Swing;
            packet.runtimeEntityId = swingerId;
            await swinger.getSession().send(packet);
            await settle();
        };

        server.getTickControl().setFrozen(true);
        const worldTicks = world.getTicks();
        const expected: number[] = [];
        for (let swung = 0; swung < SWINGING_TICKS; swung++) {
            await swing();
            await tick();
            // The tick counter has moved on by the time the watcher reads the swing.
            expected.push(server.getTick());
            expect(swings).toEqual(expected);
        }
        // A frozen tick with no input sends no swing, and the unfreeze releases none.
        await tick();
        server.getTickControl().setFrozen(false);
        await tick();

        expect(swings).toEqual(expected);
        // Only replication ran: the world's own clock stood still while it was frozen.
        expect(world.getTicks()).toBe(worldTicks + 1);
    }, 600_000);
});
