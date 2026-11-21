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
import { scriptAdminServer } from '../scripting/adminServer';
import { scriptServerMembers } from '../scripting/serverMembers';
import { LevelScripts } from '../scripting/LevelScripts';
import { withCwd } from '../utils/cwd';
import { contentToken, worldsToken } from './tokens';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';

/**
 * BDS's `config/` folder for the server's scripts: in the server directory, which `JSP_DIR`
 * names, beside `config.json`.
 */
export const scriptConfigDirectory = (): string => withCwd('config');

/**
 * Runs the behavior pack scripts of every level the server loads, the ones it loads at startup and
 * each one attached later, each level in a runtime of its own ([ADR 0020](../../../../docs/adr/0020-scripts-run-in-quickjs-on-the-world-thread.md)):
 * the world packs `content-world-packs` names and the installed addons, those that have a script
 * module, with BDS's `config/` folder beside the server. The content build is the server's, so
 * every level loads the same packs.
 *
 * It starts once the worlds have loaded, so the version 2 packs' early execution and the
 * version 1 packs run back to back before the first tick that flushes them, in the order BDS
 * runs them around a world load. `script-debugger-auto-attach` attaches the VS Code debugger to
 * the default level's runtime just before that, unless the server replays a session. Stopping it
 * sends the scripts `system.beforeEvents.shutdown`.
 *
 * @param server - The server whose levels run the scripts.
 * @returns The module to register on the kernel.
 */
export const scriptsModule = (server: Server): Module => {
    /** The levels whose scripts this module started, which it stops. */
    const started = new Set<Level>();
    /** Takes the module off the level lifecycle events. */
    let unsubscribe: (() => void) | undefined;
    /** Starts a level's scripts, from the server's current pack list. */
    const startFor = async (level: Level): Promise<void> => {
        const worlds = server.getWorldManager();
        started.add(level);
        await server.getScriptSlot(level).start(server.getWorldPackDirectories(), (directories) =>
            startLevelScripts(server, level, directories, {
                // One debugger, on one port, so it attaches to the default level's runtime.
                autoAttach: level === worlds.getEntryLevel()
            })
        );
    };
    const stopFor = (level: Level): void => {
        if (!started.delete(level)) return;
        server.getScriptSlot(level).stop();
    };
    return {
        id: 'prismarine:scripts',
        dependencies: [contentToken, worldsToken],
        register: () => {},
        start: async () => {
            // One after another, in load order: each level's early execution and first run happen
            // before the next level's, as each Bedrock world's would on its own server.
            for (const level of server.getWorldManager().getLevels()) await startFor(level);
            // A level attached later starts its scripts as it attaches, and a detaching one stops
            // them before its players move out.
            const events = server.getKernel().events;
            const stops = [
                events.on('levelAttached', (event) => startFor(event.getLevel())),
                events.on('levelDetaching', (event) => stopFor(event.getLevel()))
            ];
            unsubscribe = () => {
                for (const stop of stops) stop();
            };
        },
        stop: () => {
            unsubscribe?.();
            unsubscribe = undefined;
            for (const level of [...started]) stopFor(level);
        }
    };
};

/**
 * Loads and starts a level's scripts from a list of behavior pack folders. The
 * `prismarine:scripts` module runs it at startup through the level's script slot, and a reload
 * whose pack list changed runs it again in place of the scripts it closed.
 *
 * @param level - The level whose runtime runs the scripts.
 * @param packDirectories - The world's behavior packs; those with a script module run.
 * @param options - `autoAttach` attaches the debugger as `script-debugger-auto-attach` asks
 *   before the scripts start, which BDS does once, at level load.
 * @returns The running scripts, or undefined when no pack has a script module.
 */
export const startLevelScripts = async (
    server: Server,
    level: Level,
    packDirectories: readonly string[],
    options: { readonly autoAttach: boolean }
): Promise<LevelScripts | undefined> => {
    // The runtime flushes in the tick of its level's Overworld, so a level without one runs none.
    const overworld = level.loadedWorld(OVERWORLD_STEM_ID);
    if (overworld === undefined) {
        server
            .getLogger()
            .warn(`Level ${level.name} has no Overworld loaded, so its behavior pack scripts do not run.`);
        return undefined;
    }
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
            registerCustomDimension: (typeId) => level.registerScriptDimension(typeId),
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
                // A command's dimension names its level only outside the default level.
                const name = level === server.getWorldManager().getEntryLevel() ? undefined : level.name;
                server.getCommandManager().setScriptCommands(commands, name);
                return () => server.getCommandManager().setScriptCommands(undefined, name);
            },
            components: (sink) => bindScriptComponents(server, level, sink),
            entityEvents: levelEntityEvents(server, level),
            playerActions: levelPlayerActions(server, level),
            worldEvents: levelWorldEvents(server, level)
        },
        members: scriptServerMembers(server, level),
        admin: scriptAdminServer(server),
        addonConfig: new AddonConfigFiles({ log: { warn: (message) => server.getLogger().warn(message) } }),
        maxPlayers: server.getConfig().getMaxPlayers(),
        seed: overworld.getSeed(),
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
    scripts.start(overworld);
    // A reload, or scripts started again from a new pack list, add no dimension, as on BDS.
    level.sealScriptDimensions();
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
    const actors = levelActors(server, level);
    const stops = [
        bridge.bind(sink, {
            name: level.name,
            isDefault: level === server.getWorldManager().getEntryLevel(),
            ownsEntity: (runtimeId) => actors.actorOf(runtimeId) !== undefined,
            scheduler: (block, min, max) => {
                const actions = content.world.blockWorld.at(block.dimension, level.name);
                const spread = max > min ? (actions.randomInt?.(max - min + 1) ?? 0) : 0;
                actions.scheduleTick(block, min + spread);
            }
        }),
        ...[...level.worlds()].map((world) =>
            world.onBlockWritten(bridge.blockWrites(world.getDimension().name, level.name))
        )
    ];
    return () => {
        for (const stop of stops) stop();
    };
};
