import type { Module } from '@jsprismarine/kernel';
import ClientboundCloseFormPacket from '@jsprismarine/protocol/packet/ClientboundCloseFormPacket';
import ModalFormRequestPacket from '@jsprismarine/protocol/packet/ModalFormRequestPacket';

import type { ScriptComponentSink } from '@jsprismarine/script-host/host/world';

import type Server from '../Server';
import type { Level } from '../world/Level';
import { levelScriptAccess } from '../scripting/levelScriptAccess';
import { levelEntityEvents } from '../scripting/scriptEntityEvents';
import { levelSimulatedPlayers } from '../scripting/levelSimulatedPlayers';
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
 * runs them around a world load. `script-debugger-auto-attach` attaches the VS Code debugger
 * just before that, unless the server replays a session. Stopping it sends the scripts
 * `system.beforeEvents.shutdown`.
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
                access: { ...levelScriptAccess(server, level), simulatedPlayers: levelSimulatedPlayers(server, level) },
                onPlayerLeaving: (listener) =>
                    server
                        .getKernel()
                        .events.on('playerDespawn', (event) => listener(String(event.getSession().runtimeId))),
                commands: (commands) => {
                    server.getCommandManager().setScriptCommands(commands);
                    return () => server.getCommandManager().setScriptCommands(undefined);
                },
                components: (sink) => bindScriptComponents(server, level, sink),
                entityEvents: levelEntityEvents(server, level)
            },
            seed: server.getWorldManager().getDefaultWorld().getSeed(),
            watchdog: server.getConfig().getScriptWatchdog(),
            experiments: level.getExperiments(),
            log: {
                info: (message) => server.getLogger().info(message),
                warn: (message) => server.getLogger().warn(message),
                error: (message) => server.getLogger().error(message)
            },
            onShutdown: () => void server.shutdown(),
            debugger: { settings: server.getConfig().getScriptDebugger(), replay: server.isReplay() }
        });
        if (scripts === undefined) return;
        // BDS attaches the debugger at level load, before any script runs, so a breakpoint on a
        // pack's first line stops it.
        await scripts.debugger.autoAttach();
        scripts.start(server.getWorldManager().getDefaultWorld());
        server.setScripts(scripts);
    },
    stop: () => {
        server.getScripts()?.close();
        server.setScripts(undefined);
    }
});

/**
 * Sends the custom component hooks of a level's blocks and items to the scripts' sink: the ones
 * the content's adapter behavior raises, and `onPlace` and `onBreak` from every block write of
 * the level's worlds. A block with `minecraft:tick` ticks through the server's scheduled ticks.
 * @returns A function that stops it.
 */
const bindScriptComponents = (server: Server, level: Level, sink: ScriptComponentSink): (() => void) => {
    const content = server.getContent();
    const bridge = content.scriptComponents;
    if (bridge === undefined) return () => {};
    bridge.setScheduler((block, min, max) => {
        const actions = content.world.blockWorld.at(block.dimension, level.name);
        const spread = max > min ? (actions.randomInt?.(max - min + 1) ?? 0) : 0;
        actions.scheduleTick(block, min + spread);
    });
    const stops = [
        bridge.bind(sink),
        ...[...level.worlds()].map((world) => world.onBlockWritten(bridge.blockWrites(world.getDimension().name)))
    ];
    return () => {
        for (const stop of stops) stop();
    };
};
