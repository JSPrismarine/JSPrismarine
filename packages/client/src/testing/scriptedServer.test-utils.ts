import path from 'node:path';

import type { Server } from '@jsprismarine/prismarine';

import type Client from '../Client';
import { startLoopbackServer } from './loopbackServer.test-utils';

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
}

/** A headless server running one script pack, with a client joined to it over a loopback pipe. */
export interface ScriptedServer {
    readonly server: Server;
    readonly client: Client;
    /** Whether the server loaded its scripts. Without the script host library it runs none. */
    readonly scripted: boolean;
    /** Resolves once the server, the client and every pipe between them have nothing left to do. */
    settle(): Promise<void>;
    /** Disconnects the client, shuts the server down and removes its state directory. */
    close(): Promise<void>;
}

/**
 * Boots a headless flat-world server that loads a single script pack and joins a client to it,
 * ticking the server by hand until the join finishes.
 * @param options - The pack and the player.
 * @returns The server and its joined client.
 */
export const joinScriptedServer = async (options: ScriptedServerOptions): Promise<ScriptedServer> => {
    const manifest = {
        format_version: 2,
        header: { name: options.name, uuid: options.uuids[0], version: [1, 0, 0] },
        modules: [{ type: 'script', uuid: options.uuids[1], version: [1, 0, 0], entry: 'scripts/main.js' }],
        dependencies: options.dependencies
    };
    const jsp = await startLoopbackServer({
        name: options.name,
        files: { 'pack/manifest.json': JSON.stringify(manifest), 'pack/scripts/main.js': options.script },
        config: (stateRoot) => ({ 'content-world-packs': [path.join(stateRoot, 'pack')] })
    });
    const { server, settle, close } = jsp;
    const scripted = server.getScripts() !== undefined;
    const { client } = await jsp.join(options.displayName);
    return { server, client, scripted, settle, close };
};
