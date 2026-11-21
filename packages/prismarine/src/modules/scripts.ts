import type { Module } from '@jsprismarine/kernel';
import ClientboundCloseFormPacket from '@jsprismarine/protocol/bedrock/packet/ClientboundCloseFormPacket';
import ModalFormRequestPacket from '@jsprismarine/protocol/bedrock/packet/ModalFormRequestPacket';
import PrimitiveShapesPacket from '@jsprismarine/protocol/bedrock/packet/PrimitiveShapesPacket';
import TransferPacket from '@jsprismarine/protocol/bedrock/packet/TransferPacket';

import type { ScriptComponentSink } from '@jsprismarine/script-host/host/world';

import type Server from '../Server';
import type { Level } from '../world/Level';
import { primitiveShapes } from '../scripting/debugShapes';
import { levelScriptAccess } from '../scripting/levelScriptAccess';
import { levelEntitySystems } from '../scripting/entities/levelEntitySystems';
import { levelWorldSystem } from '../scripting/worldsystem/levelWorldSystem';
import { levelPlayerActions } from '../scripting/scriptPlayerActions';
import { levelEntityEvents } from '../scripting/scriptEntityEvents';
import { levelWorldEvents } from '../scripting/events/worldEvents';
import { levelActors } from '../scripting/levelActors';
import { levelSimulatedPlayers } from '../scripting/levelSimulatedPlayers';
import { AddonConfigFiles } from '../scripting/addonConfig';
import { scriptServerMembers } from '../scripting/serverMembers';
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
 * names and the installed addons, those that have a script module, with BDS's `config/` folder
 * beside the server.
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
    start: () =>
        server
            .getScriptSlot()
            .start(server.getWorldPackDirectories(), (packs) => startLevelScripts(server, packs, { autoAttach: true })),
    stop: () => server.getScriptSlot().stop()
});

/**
 * Loads and starts the default level's scripts from a list of behavior pack folders. The
 * `prismarine:scripts` module runs it at startup through the server's script slot, and a reload
 * whose pack list changed runs it again in place of the scripts it closed.
 *
 * @param packDirectories - The world's behavior packs; those with a script module run.
 * @param options - `autoAttach` attaches the debugger as `script-debugger-auto-attach` asks
 *   before the scripts start, which BDS does once, at level load.
 * @returns The running scripts, or undefined when no pack has a script module.
 */
export const startLevelScripts = async (
    server: Server,
    packDirectories: readonly string[],
    options: { readonly autoAttach: boolean }
): Promise<LevelScripts | undefined> => {
    const level = server.getWorldManager().getDefaultLevel();
    const actors = levelActors(server, level);
    /** The wire's id of one of the level's dimensions, by its Bedrock name. */
    const dimensionId = (name: string): number | undefined =>
        [...level.getStems().keys()]
            .map((stem) => level.dimensionTypeOf(stem))
            .find((type) => type.bedrockName === name)?.bedrockId;
    const scripts = await LevelScripts.load({
        packDirectories,
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
                        // The session joins before `World.addPlayer` puts its entity in the store.
                        spawned: actors.actorOf(String(session.getRuntimeId())) !== undefined,
                        sendMessage: (message) =>
                            void session
                                .sendMessage(message)
                                .catch((error: unknown) => server.getLogger().error(error)),
                        showForm: (formId, formUiJson) =>
                            session.released(
                                session.send(Object.assign(new ModalFormRequestPacket(), { formId, formUiJson }))
                            ),
                        closeForms: () => session.released(session.send(new ClientboundCloseFormPacket({}))),
                        drawDebugShapes: (changes) =>
                            session.released(
                                session.send(
                                    new PrimitiveShapesPacket({ shapes: primitiveShapes(changes, dimensionId) })
                                )
                            ),
                        transfer: (target) => {
                            // A NetherNet transfer's packet is not captured yet, so only an address moves the player.
                            if (!('hostname' in target)) return;
                            session.released(
                                session.send(
                                    new TransferPacket({
                                        address: target.hostname,
                                        port: target.port,
                                        reloadWorld: false,
                                        gatheringsConfig: null,
                                        transferSettings: null
                                    })
                                )
                            );
                        }
                    })),
            weather: level.getWeather(),
            chat: server.getChatManager(),
            clock: () => server.getAdmittedClock(),
            http: server.getScriptHttp(),
            entitySystems: levelEntitySystems(server, level),
            access: {
                ...levelScriptAccess(server, level),
                simulatedPlayers: levelSimulatedPlayers(server, level),
                worldSystem: levelWorldSystem(server, level)
            },
            onPlayerLeaving: (listener) =>
                server
                    .getKernel()
                    .events.on('playerDespawn', (event) => listener(String(event.getSession().runtimeId))),
            commands: (commands) => {
                server.getCommandManager().setScriptCommands(commands);
                return () => server.getCommandManager().setScriptCommands(undefined);
            },
            components: (sink) => bindScriptComponents(server, level, sink),
            entityEvents: levelEntityEvents(server, level),
            playerActions: levelPlayerActions(server, level),
            worldEvents: levelWorldEvents(server, level)
        },
        members: scriptServerMembers(server),
        addonConfig: new AddonConfigFiles({ log: { warn: (message) => server.getLogger().warn(message) } }),
        maxPlayers: server.getConfig().getMaxPlayers(),
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
    if (scripts === undefined) return undefined;
    // BDS attaches the debugger at level load, before any script runs, so a breakpoint on a
    // pack's first line stops it.
    if (options.autoAttach) await scripts.debugger.autoAttach();
    scripts.start(server.getWorldManager().getDefaultWorld());
    return scripts;
};

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
