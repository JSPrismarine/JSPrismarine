import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import { Server } from '@jsprismarine/prismarine';
import { Config } from '@jsprismarine/prismarine/config/Config';
import { networkToken } from '@jsprismarine/prismarine/modules/tokens';
import { ModalFormRequestPacket, ModalFormResponsePacket, TextPacket } from '@jsprismarine/protocol';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Client from './Client';
import type { DecodedPacket } from './net/ClientPacketRegistry';
import { LoopbackNetwork } from './testing/loopback.test.helper';

const MAX_TICKS = 120;

const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    vi.unstubAllEnvs();
}, 60_000);

/**
 * A behavior pack script shows a joined player a form: the client receives the form's JSON as a
 * `ModalFormRequestPacket`, answers with a `ModalFormResponsePacket`, and the script's `show()`
 * promise settles with the answer in the script flush of the tick the answer arrived in, where
 * the script reports it back as a line of chat.
 */
describe("a script's form", () => {
    it("reaches a joined player, and the player's answer settles show()", { timeout: 300_000 }, async (context) => {
        const stateRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-script-form-'));
        const pack = path.join(stateRoot, 'pack');
        mkdirSync(path.join(pack, 'scripts'), { recursive: true });
        writeFileSync(
            path.join(pack, 'manifest.json'),
            JSON.stringify({
                format_version: 2,
                header: { name: 'asker', uuid: 'e1a2b3c4-5d6e-4f70-8192-a3b4c5d6e7f8', version: [1, 0, 0] },
                modules: [
                    {
                        type: 'script',
                        uuid: 'f2b3c4d5-6e7f-4081-92a3-b4c5d6e7f809',
                        version: [1, 0, 0],
                        entry: 'scripts/main.js'
                    }
                ],
                dependencies: [
                    { module_name: '@minecraft/server', version: '2.0.0' },
                    { module_name: '@minecraft/server-ui', version: '2.0.0' }
                ]
            })
        );
        // Shows the form once the weather changes, which the test does after the join.
        writeFileSync(
            path.join(pack, 'scripts', 'main.js'),
            `import { world } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';
world.afterEvents.weatherChange.subscribe(() => {
    new ActionFormData().title('Pick').button('a').button('b')
        .show(world.getAllPlayers()[0])
        .then((response) => world.sendMessage('picked ' + response.selection));
});`
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
                displayName: 'Answerer',
                identity: '00000000-0000-4000-8000-000000520302'
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

        // The client decodes only the packets it registers, and forms are not among them.
        client.getRegistry().register(ModalFormRequestPacket);
        const forms: string[] = [];
        const lines: string[] = [];
        // A field packet keeps its payload in its fields, so the decoded packet itself is read.
        client.on('packet', ({ packet }: DecodedPacket) => {
            if (!(packet instanceof ModalFormRequestPacket)) return;
            forms.push(packet.formUiJson);
            const answer = Object.assign(new ModalFormResponsePacket(), { formId: packet.formId, jsonResponse: '1' });
            void client.getSession().track(client.getSession().send(answer));
        });
        client.getSession().registerHandler(TextPacket, {
            phases: ['play'],
            handle: (text) => void lines.push(text.message)
        });

        // The tick's flush shows the form; the answer arrives before the next tick.
        server.getWorldManager().getDefaultWorld().setWeather('rain', 6000);
        server.advanceTick();
        await settle();
        expect(forms).toEqual([
            '{"content":"","elements":[{"image":null,"text":"a","type":"button"},' +
                '{"image":null,"text":"b","type":"button"}],"title":"Pick","type":"form"}\n'
        ]);
        expect(lines).toEqual([]);

        server.advanceTick();
        await settle();
        expect(lines).toEqual(['picked 1']);
    });
});
