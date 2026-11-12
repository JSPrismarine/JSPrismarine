import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import { Config, Server } from '@jsprismarine/prismarine';
import { networkToken } from '@jsprismarine/prismarine/modules/tokens';
import { insideTick } from '@jsprismarine/prismarine/world/TickContext';
import { TextPacket, TextPacketType } from '@jsprismarine/protocol';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Client from './Client';
import { LoopbackNetwork } from './testing/loopback.test.helper';

const MAX_JOIN_TICKS = 120;
/** The ticks the test checks, with a chat line and falling sand and flowing water in them. */
const CHECKED_TICKS = 20;

const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
}, 60_000);

/**
 * The slice 9 target of the entity and tick re-architecture: a tick makes no wall-clock read and
 * completes without yielding (ADR 0015).
 *
 * A real server with ticking disabled and a client joined over a loopback transport. Each checked
 * tick runs with `performance.now` and `Date.now` throwing whenever they are read inside the
 * tick's simulation phases. The ticker times its phases for the lag profile with the clock the
 * server hands it, which is the loop's and not the simulation's. A tick has to return from one call
 * with its change log sealed, and nothing it left running may change the world afterwards: if an
 * await came back, the work after it would run once the call had returned, and the world would
 * change while the event loop drained.
 */
describe('a tick', () => {
    it('runs to its end in one call, reads no clock and leaves nothing of the simulation running', async () => {
        const stateRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-synchronous-tick-'));
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
        // The loop's own clock, for its schedule and its phase timings; see the description above.
        const tickClock = performance.now.bind(performance);
        const server = new Server({
            logger: new Logger('error'),
            config: new Config(),
            headless: true,
            transport: network.transport,
            tickClock
        });
        const client = new Client({
            host: '127.0.0.1',
            transport: network.client(),
            auth: new OfflineAuthProvider({
                displayName: 'Steady',
                identity: '00000000-0000-4000-8000-000000510202'
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

        await server.bootstrap('127.0.0.1', 0);
        server.getChunkCompletionQueue().activate();

        let joined = false;
        const connecting = client.connect().finally(() => {
            joined = true;
        });
        connecting.catch(() => {});
        for (let ticks = 0; !joined; ticks++) {
            if (ticks > MAX_JOIN_TICKS) throw new Error(`The client did not join within ${MAX_JOIN_TICKS} ticks`);
            await settle();
            server.advanceTick();
        }
        await connecting;
        await settle();

        // Something for the ticks to do: sand over air falls, and water spreads.
        const console = server.getConsoleSender();
        const commands = server.getCommandManager();
        for (const line of ['setblock 3 12 3 minecraft:sand', 'setblock -3 9 -3 minecraft:water']) {
            expect(await commands.dispatchCommand(console, console, line)).toBe(true);
        }
        const world = server.getWorldManager().getDefaultWorld();

        const reads: string[] = [];
        let entries = 0;
        // True while this test's own tick runs. Test files share a worker, so another file's
        // server may tick on its timer between the ticks checked here, and its ticker reads the
        // clock for its schedule. A tick is one synchronous call, so no other tick can run while
        // this flag is set.
        let checking = false;
        const throwInsideTick =
            <T>(name: string, read: () => T) =>
            () => {
                if (checking && insideTick()) {
                    reads.push(name);
                    throw new Error(`${name} was read inside a tick`);
                }
                return read();
            };
        const performanceNow = performance.now.bind(performance);
        const dateNow = Date.now.bind(Date);
        vi.spyOn(performance, 'now').mockImplementation(throwInsideTick('performance.now', performanceNow));
        vi.spyOn(Date, 'now').mockImplementation(throwInsideTick('Date.now', dateNow));

        for (let checked = 0; checked < CHECKED_TICKS; checked++) {
            // An input for the tick's input step, sent between ticks as a client sends it.
            await client.getSession().send(
                new TextPacket({
                    type: TextPacketType.Chat,
                    needsTranslation: false,
                    sourceName: 'Steady',
                    message: `line ${checked}`,
                    xuid: '',
                    platformChatId: '',
                    filtered: ''
                })
            );
            await settle();

            const tick = server.getTick();
            checking = true;
            let returned: unknown;
            try {
                returned = server.advanceTick();
            } finally {
                checking = false;
            }

            expect(returned).toBeUndefined();
            expect(insideTick()).toBe(false);
            expect(world.getEntityStore().tickOpen).toBe(false);
            const sealed = world.lastChangeTick();
            expect(sealed?.header?.tick).toBe(world.getTicks());
            expect(server.getTick()).toBe(tick + 1);
            if (sealed?.header === undefined) throw new Error(`Tick ${tick} sealed without a header`);
            entries += sealed.entries.length;
            const digest = world.replayStateDigest(sealed.header);

            await settle();

            // Nothing the tick started and did not wait for changed the world once it had returned.
            expect(world.lastChangeTick()).toBe(sealed);
            expect(world.replayStateDigest(sealed.header)).toBe(digest);
        }

        expect(reads).toEqual([]);
        // The ticks did something: the sand fell and the water spread, through the change log.
        expect(entries).toBeGreaterThan(0);
        expect(world.loadedBlockAt(3, 12, 3)?.name).not.toBe('minecraft:sand');
    }, 600_000);
});
