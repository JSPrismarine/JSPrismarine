import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import { Server } from '@jsprismarine/prismarine';
import { Config } from '@jsprismarine/prismarine/config/Config';
import { networkToken } from '@jsprismarine/prismarine/modules/tokens';
import { TextPacket } from '@jsprismarine/protocol';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Client from './Client';
import { LoopbackNetwork } from './testing/loopback.test.helper';

const MAX_TICKS = 120;
const MESSAGE = 'script says: the weather is now ';

const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    vi.unstubAllEnvs();
}, 60_000);

/**
 * A behavior pack script reaches a player: the weather changes, the script's `weatherChange`
 * after-event runs in the script flush of that tick, and its `world.sendMessage` arrives at the
 * player's client as a line of chat.
 */
describe("a script's world.sendMessage", () => {
    it(
        'reaches a joined player as a chat line in the tick the weather changed',
        { timeout: 300_000 },
        async (context) => {
            const stateRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-script-message-'));
            const pack = path.join(stateRoot, 'pack');
            mkdirSync(path.join(pack, 'scripts'), { recursive: true });
            writeFileSync(
                path.join(pack, 'manifest.json'),
                JSON.stringify({
                    format_version: 2,
                    header: { name: 'messenger', uuid: 'c7f3e8a4-5b9d-4e1f-a2c3-3d4e5f6a7b82', version: [1, 0, 0] },
                    modules: [
                        {
                            type: 'script',
                            uuid: 'd8a4f9b5-6cae-4f2a-b3d4-4e5f6a7b8c93',
                            version: [1, 0, 0],
                            entry: 'scripts/main.js'
                        }
                    ],
                    dependencies: [{ module_name: '@minecraft/server', version: '2.0.0' }]
                })
            );
            writeFileSync(
                path.join(pack, 'scripts', 'main.js'),
                `import { world } from '@minecraft/server';
world.afterEvents.weatherChange.subscribe((event) => world.sendMessage('${MESSAGE}' + event.newWeather));`
            );
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
                    'content-world-packs': [pack],
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
                    displayName: 'Listener',
                    identity: '00000000-0000-4000-8000-000000520301'
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
                    await Promise.all(connections().map(async (connection) => connection.settleOutbound()));
                    await nextTurn();
                    if (quiet()) {
                        await nextTurn();
                        if (quiet()) return;
                    }
                }
            };

            await server.bootstrap('127.0.0.1', 0);
            server.getChunkCompletionQueue().activate();
            // A machine without the script host library runs no scripts; CI requires it on Linux x64.
            if (server.getScripts() === undefined && process.env.JSP_SCRIPT_HOST_REQUIRE !== '1') context.skip();
            expect(server.getScripts()).toBeDefined();

            let joined = false;
            const connecting = client.connect().finally(() => {
                joined = true;
            });
            connecting.catch(() => {});
            for (let ticks = 0; !joined; ticks++) {
                if (ticks > MAX_TICKS) throw new Error(`The client did not join within ${MAX_TICKS} ticks`);
                await settle();
                server.advanceTick();
            }
            await connecting;
            await settle();

            const lines: string[] = [];
            client.getSession().registerHandler(TextPacket, {
                phases: ['play'],
                handle: (text) => void lines.push(text.message)
            });

            // Between ticks, as a console `/weather rain` would land; the next tick's flush runs the after-event.
            server.getWorldManager().getDefaultWorld().setWeather('rain', 6000);
            expect(lines).toEqual([]);
            server.advanceTick();
            await settle();

            expect(lines).toEqual([`${MESSAGE}Rain`]);
        }
    );
});
