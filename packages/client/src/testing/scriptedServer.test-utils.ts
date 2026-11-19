import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import { Server } from '@jsprismarine/prismarine';
import { Config } from '@jsprismarine/prismarine/config/Config';
import { networkToken } from '@jsprismarine/prismarine/modules/tokens';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';

import Client from '../Client';
import { LoopbackNetwork } from './loopback.test.helper';

const MAX_TICKS = 120;

const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** The behavior pack a {@link joinScriptedServer} server loads, and the player that joins it. */
export interface ScriptedServerOptions {
    /** The pack's name, which also names the state directory. */
    readonly name: string;
    /** The pack header's and script module's UUIDs. */
    readonly uuids: readonly [header: string, module: string];
    /** The Script API modules the pack declares, by module name and version. */
    readonly dependencies: readonly { readonly module_name: string; readonly version: string }[];
    /** The source of `scripts/main.js`. */
    readonly script: string;
    readonly displayName: string;
    readonly identity: string;
}

/** A headless server running one script pack, with a client joined to it over a loopback pipe. */
export interface ScriptedServer {
    readonly server: Server;
    readonly client: Client;
    /** Whether the server loaded its scripts. Without the script host library it runs none, and no client joins. */
    readonly scripted: boolean;
    /** Resolves once the server, the client and every pipe between them have nothing left to do. */
    settle(): Promise<void>;
    /** Disconnects the client, shuts the server down and removes its state directory. */
    close(): Promise<void>;
}

/**
 * Boots a headless flat-world server that loads a single script pack and, when the script host
 * library is there, joins a client to it, ticking the server by hand until the join finishes.
 *
 * Stubs `JSP_DIR` for the server's state; {@link ScriptedServer.close} restores it.
 */
export const joinScriptedServer = async (options: ScriptedServerOptions): Promise<ScriptedServer> => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), `jsprismarine-${options.name}-`));
    const pack = path.join(stateRoot, 'pack');
    mkdirSync(path.join(pack, 'scripts'), { recursive: true });
    writeFileSync(
        path.join(pack, 'manifest.json'),
        JSON.stringify({
            format_version: 2,
            header: { name: options.name, uuid: options.uuids[0], version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: options.uuids[1], version: [1, 0, 0], entry: 'scripts/main.js' }],
            dependencies: options.dependencies
        })
    );
    writeFileSync(path.join(pack, 'scripts', 'main.js'), options.script);
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
        auth: new OfflineAuthProvider({ displayName: options.displayName, identity: options.identity }),
        logger: new Logger('error'),
        loginTimeoutMs: 600_000
    });
    const close = async (): Promise<void> => {
        client.disconnect();
        await server.shutdown({ stayAlive: true });
        rmSync(stateRoot, { recursive: true, force: true });
        vi.unstubAllEnvs();
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
    const scripted = server.getScripts() !== undefined;
    if (!scripted) return { server, client, scripted, settle, close };

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
    return { server, client, scripted, settle, close };
};
