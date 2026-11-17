import type { Module } from '@jsprismarine/kernel';
import ClientboundCloseFormPacket from '@jsprismarine/protocol/packet/ClientboundCloseFormPacket';
import ModalFormRequestPacket from '@jsprismarine/protocol/packet/ModalFormRequestPacket';

import type Server from '../Server';
import { levelScriptAccess } from '../scripting/levelScriptAccess';
import { LevelScripts } from '../scripting/LevelScripts';
import { withCwd } from '../utils/cwd';
import { contentToken, worldsToken } from './tokens';

/**
 * BDS's `config/` folder for the server's scripts: in the server directory, which `JSP_DIR`
 * names, beside `config.json`.
 */
export const scriptConfigDirectory = (): string => withCwd('config');

/**
 * Runs the behavior pack scripts of the default level: the world packs `content-world-packs`
 * names that have a script module, with BDS's `config/` folder beside the server.
 *
 * It starts once the worlds have loaded, so the version 2 packs' early execution and the
 * version 1 packs run back to back before the first tick that flushes them, in the order BDS
 * runs them around a world load. Stopping it sends the scripts `system.beforeEvents.shutdown`.
 *
 * @param server - The server whose default level runs the scripts.
 * @returns The module to register on the kernel.
 */
export const scriptsModule = (server: Server): Module => ({
    id: 'prismarine:scripts',
    dependencies: [contentToken, worldsToken],
    register: () => {},
    start: async () => {
        const level = server.getWorldManager().getDefaultLevel();
        const scripts = await LevelScripts.load({
            packDirectories: server.getContentSettings().worldPacks,
            configDirectory: scriptConfigDirectory(),
            sources: {
                dimensions: () =>
                    [...level.getStems().keys()].map((dimension) => level.dimensionTypeOf(dimension).bedrockName),
                players: () =>
                    server
                        .getSessionManager()
                        .getSessions()
                        .filter((session) => session.getWorld().getLevel() === level)
                        .map((session) => ({
                            id: String(session.getRuntimeId()),
                            name: session.identity.name,
                            sendMessage: (message) =>
                                void session
                                    .sendMessage(message)
                                    .catch((error: unknown) => server.getLogger().error(error)),
                            showForm: (formId, formUiJson) =>
                                session.released(
                                    session.send(Object.assign(new ModalFormRequestPacket(), { formId, formUiJson }))
                                ),
                            closeForms: () => session.released(session.send(new ClientboundCloseFormPacket({})))
                        })),
                weather: level.getWeather(),
                chat: server.getChatManager(),
                clock: () => server.getAdmittedClock(),
                access: levelScriptAccess(server, level),
                onPlayerLeaving: (listener) =>
                    server
                        .getKernel()
                        .events.on('playerDespawn', (event) => listener(String(event.getSession().runtimeId)))
            },
            seed: server.getWorldManager().getDefaultWorld().getSeed(),
            watchdog: server.getConfig().getScriptWatchdog(),
            experiments: level.getExperiments(),
            log: {
                info: (message) => server.getLogger().info(message),
                warn: (message) => server.getLogger().warn(message),
                error: (message) => server.getLogger().error(message)
            },
            onShutdown: () => void server.shutdown()
        });
        if (scripts === undefined) return;
        scripts.start(server.getWorldManager().getDefaultWorld());
        server.setScripts(scripts);
    },
    stop: () => {
        server.getScripts()?.close();
        server.setScripts(undefined);
    }
});
