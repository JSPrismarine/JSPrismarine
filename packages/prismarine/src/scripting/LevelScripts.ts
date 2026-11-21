/**
 * The behavior pack scripts of one level: the script host's runtime, started at the points the
 * server reaches and flushed in one world's tick
 * ([ADR 0020](../../../../docs/adr/0020-scripts-run-in-quickjs-on-the-world-thread.md)).
 *
 * The script host is an optional dependency: it is a native library that is not built for every
 * platform yet, and npm cannot install it until it ships prebuilt libraries
 * ([#3215](https://github.com/JSPrismarine/JSPrismarine/issues/3215)). A server without it, or
 * without a library for its platform, runs without scripts and says why once when a world pack
 * has some.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ScriptPack } from '@jsprismarine/script-host/host/pack';
import type { GameTestReply } from '@jsprismarine/script-host/host/gametest';
import type { GameTestCommand, ScriptLog, WorldScripts } from '@jsprismarine/script-host/host/WorldScripts';
import type { ScriptFormResponse } from '@jsprismarine/script-host/host/world';
import type { DebuggerStat } from '@jsprismarine/script-host/debugger/protocol';
import type { JsprismarineServerMembers } from '@jsprismarine/script-host/host/jsprismarineMembers';
import type { AddonConfigStore } from '@jsprismarine/script-host/host/addonConfig';

import { about } from '../about';
import type { ScriptDebuggerConfig, ScriptWatchdogConfig } from '../config/Config';
import { isRecord } from '../utils/isRecord';
import { BETA_APIS } from '../world/WorldExperiments';
import { LevelScriptWorld } from './LevelScriptWorld';
import type { ScriptWorldSources } from './LevelScriptWorld';
import { ScriptDebugger } from './ScriptDebugger';
import type { DebuggableScripts, ScriptDebuggerHost } from './ScriptDebugger';

/** What a level's scripts need from the server. */
export interface LevelScriptsOptions {
    /** The behavior pack directories the level loads; the ones with a script module run. */
    readonly packDirectories: readonly string[];
    /** BDS's `config/` folder, which `permissions.json` and the rest are read from, when there is one. */
    readonly configDirectory: string | undefined;
    readonly sources: ScriptWorldSources;
    /**
     * What `@jsprismarine/server`'s `performance`, `getPing`, `bossBars` and `playerList` reach
     * of the server. The module leaves them out when absent.
     */
    readonly members?: JsprismarineServerMembers;
    /** The packs' config files, which `@jsprismarine/server`'s `config` reaches. The module leaves it out when absent. */
    readonly addonConfig?: AddonConfigStore;
    /** How many players may be online at once, which `jsprismarine.maxPlayers` tells the packs. */
    readonly maxPlayers: number;
    /** The level's seed, which `Math.random` is seeded from. */
    readonly seed: bigint;
    readonly watchdog: ScriptWatchdogConfig;
    /**
     * The experiments the level has on, by their `level.dat` names. Beta APIs lets a pack
     * declare a beta Script API version. None when absent.
     */
    readonly experiments?: readonly string[];
    readonly log: ScriptLog;
    /** Asked to stop the server after a critical exception the watchdog does not let pass. */
    readonly onShutdown: () => void;
    /**
     * The script debugger's settings, and whether the server replays a recorded session, when the
     * debugger never opens a socket. Every connection is refused when absent.
     */
    readonly debugger?: {
        readonly settings: ScriptDebuggerConfig;
        readonly replay: boolean;
        /** Resolves after a number of seconds, for auto-attach; a timer when absent. */
        readonly sleep?: (seconds: number) => Promise<void>;
    };
}

/** The script debugger's settings when the server gives none: every connection refused. */
const DEBUGGER_OFF: ScriptDebuggerConfig = {
    allowInbound: false,
    allowOutbound: false,
    listenPort: 0,
    portForced: false,
    listenAddress: '',
    autoAttach: 'disabled',
    autoAttachConnectAddress: '',
    autoAttachTimeout: 0,
    passcode: ''
};

/** How often an attached debugger gets the engine's memory, in ticks, as BDS sends it. */
const MEMORY_STAT_TICKS = 10;

/** A world whose tick runs the level's script flush. */
export interface ScriptPhaseWorld {
    /** Sets the flush phase; with `replacing`, only while that phase is the world's current one. */
    setScriptPhase(phase: (() => void) | undefined, replacing?: () => void): void;
}

/**
 * Whether a pack's manifest has a script module, read without the script host, so a server that
 * lacks it can tell whether that costs the world anything. The script host reads the module in
 * full when it is there.
 */
const hasScriptModule = (directory: string): boolean => {
    const path = join(directory, 'manifest.json');
    if (!existsSync(path)) return false;
    try {
        const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
        const modules = isRecord(manifest) && Array.isArray(manifest.modules) ? manifest.modules : [];
        return modules.some((module) => isRecord(module) && module.type === 'script');
    } catch {
        // The content loader reports a manifest that is not JSON.
        return false;
    }
};

/** One level's scripts. */
export class LevelScripts {
    private readonly runtime: WorldScripts;
    private readonly world: LevelScriptWorld;
    private readonly closeLibrary: () => void;
    /** The VS Code script debugger of these scripts. */
    public readonly debugger: ScriptDebugger;
    private attached: ScriptPhaseWorld | undefined;
    /** The flush phase these scripts give the world they start in. */
    private readonly phase = (): void => this.flush();
    /** Set while {@link LevelScripts.close} runs, when a watchdog shutdown would stop a stop. */
    private closing = false;

    private constructor(
        runtime: WorldScripts,
        world: LevelScriptWorld,
        closeLibrary: () => void,
        scriptDebugger: ScriptDebugger
    ) {
        this.runtime = runtime;
        this.world = world;
        this.closeLibrary = closeLibrary;
        this.debugger = scriptDebugger;
    }

    /**
     * Loads the script host and the level's script packs.
     * @param options - The level's packs, sources, log and settings.
     * @param importHost - Imports the optional `@jsprismarine/script-host` package, and rejects
     *   where it is not installed.
     * @returns The level's scripts, or undefined when no pack has a script module or the script
     *   host cannot run on this machine.
     */
    public static async load(
        options: LevelScriptsOptions,
        importHost: () => Promise<ScriptHostModules> = importScriptHost
    ): Promise<LevelScripts | undefined> {
        let host: ScriptHostModules;
        try {
            host = await importHost();
        } catch {
            const scripted = options.packDirectories.filter(hasScriptModule).length;
            if (scripted > 0) {
                options.log.warn(
                    `${scripted} behavior pack(s) have scripts, but @jsprismarine/script-host is not installed, so they ` +
                        'do not run. It is an optional dependency: install it, or reinstall without omitting optional dependencies.'
                );
            }
            return undefined;
        }
        const packs = options.packDirectories
            .map((directory) => host.readScriptPack(directory))
            .filter((pack) => pack !== undefined);
        if (packs.length === 0) return undefined;

        let library: ReturnType<typeof host.ScriptHostLibrary.load>;
        try {
            library = host.ScriptHostLibrary.load();
        } catch (error: unknown) {
            options.log.warn(
                `${packs.length} behavior pack(s) have scripts, but @jsprismarine/script-host has no library for ` +
                    `${process.platform}-${process.arch}, so they do not run: ${String(error)}`
            );
            return undefined;
        }
        const world = new LevelScriptWorld(options.sources);
        let scripts: LevelScripts | undefined;
        const scriptDebugger = new ScriptDebugger({
            settings: options.debugger?.settings ?? DEBUGGER_OFF,
            replay: options.debugger?.replay ?? false,
            ...(options.debugger?.sleep === undefined ? {} : { sleep: options.debugger.sleep }),
            scripts: debuggableScripts(packs, () => scripts?.runtime),
            host: host.debuggerHost,
            log: options.log,
            // The extension's command box runs a command as a script's dimension does, and BDS
            // prints it and its error to the content log.
            runCommand: (command, dimension) => {
                log.info(`${SCRIPTING_PREFIX}Executing command [${command}]`);
                const result = world.runCommand(command, {
                    dimension: dimension.includes(':') ? dimension : `minecraft:${dimension}`
                });
                if ('error' in result) log.info(`${SCRIPTING_PREFIX}${result.error}`);
            }
        });
        // The content log's script lines also go to the debug console of an attached debugger.
        const log: ScriptLog = {
            info: (message) => {
                options.log.info(message);
                printScriptLine(scriptDebugger, message, 'info');
            },
            warn: (message) => {
                options.log.warn(message);
                printScriptLine(scriptDebugger, message, 'warn');
            },
            error: (message) => {
                options.log.error(message);
                printScriptLine(scriptDebugger, message, 'error');
            }
        };
        const { version, minecraftVersion, protocolVersion } = about();
        const runtime = new host.WorldScripts({
            library,
            world,
            packs,
            config: host.readScriptConfig(options.configDirectory, (message) => log.warn(message)),
            betaApis: options.experiments?.includes(BETA_APIS) === true,
            log,
            server: { version, minecraftVersion, protocolVersion, maxPlayers: options.maxPlayers },
            ...(options.members === undefined ? {} : { members: options.members }),
            ...(options.addonConfig === undefined ? {} : { addonConfig: options.addonConfig }),
            seed: options.seed,
            watchdog: host.watchdogSettings({
                'script-watchdog-enable-shutdown': String(options.watchdog.enableShutdown),
                'script-watchdog-hang-threshold': String(options.watchdog.hangThreshold),
                'script-watchdog-memory-limit': String(options.watchdog.memoryLimit)
            }),
            // A shutdown callback that trips the watchdog while the server is stopping asks for
            // nothing: the stop is already under way, and a second request would exit before the
            // worlds save.
            onShutdown: () => {
                if (scripts?.closing !== true) options.onShutdown();
            },
            onPackLoaded: (moduleUuid) => scriptDebugger.packLoaded(moduleUuid)
        });
        scripts = new LevelScripts(runtime, world, () => library.close(), scriptDebugger);
        return scripts;
    }

    /** `system.currentTick` of the level's scripts. */
    public get currentTick(): number {
        return this.runtime.currentTick;
    }

    /**
     * Starts the scripts once the level has loaded, and runs their flush in `world`'s tick from
     * the next tick on: the version 2 packs' early execution, then the version 1 packs, as BDS
     * runs them around a world load.
     */
    public start(world: ScriptPhaseWorld): void {
        this.runtime.startEarly();
        this.runtime.startWorld();
        this.attached = world;
        world.setScriptPhase(this.phase);
    }

    /** Runs the script flush, for a level ticked by hand rather than through its world. */
    public flush(): void {
        const tick = this.runtime.currentTick;
        this.world.beginFlush();
        try {
            this.runtime.flush();
        } finally {
            this.world.endFlush();
        }
        this.debugger.tick(tick, () => this.debuggerStats(tick));
    }

    /**
     * One tick's statistics for an attached debugger, in the names BDS streams: the level's
     * entities each tick, and the engine's memory every {@link MEMORY_STAT_TICKS} ticks, for the
     * extension's world and memory tabs and BDS's scripting engine table.
     */
    private debuggerStats(tick: number): DebuggerStat[] {
        const entities = this.world.dimensions().reduce((sum, name) => sum + this.world.entities(name).length, 0);
        const stats: DebuggerStat[] = [{ name: 'entities', should_aggregate: false, values: [entities] }];
        if (tick % MEMORY_STAT_TICKS !== 0) return stats;
        const used = this.runtime.stats().memoryUsed;
        stats.push(
            {
                name: 'runtime_memory',
                should_aggregate: false,
                children: [{ name: 'used', should_aggregate: false, values: [used] }]
            },
            {
                name: 'scripting_engine',
                should_aggregate: false,
                children: [{ name: 'Memory Used (KB)', should_aggregate: false, values: [used / 1000] }]
            }
        );
        return stats;
    }

    /**
     * Runs a `/gametest` subcommand on the level's GameTests. The tests it queues start in the
     * next script flush.
     */
    public gametest(command: GameTestCommand): GameTestReply {
        return this.runtime.gametest(command);
    }

    /**
     * Takes a client's answer to a form one of the level's scripts showed. The next script flush
     * settles the form, and an answer for a form the scripts did not send is dropped there.
     */
    public answerForm(response: ScriptFormResponse): void {
        this.world.answerForm(response);
    }

    /**
     * Raises `system.afterEvents.scriptEventReceive` for a `/scriptevent` the console or a player
     * ran, in the next script flush.
     * @param sourceEntity - The runtime id of the entity that ran it; the server when absent.
     * @returns False for an id `/scriptevent` refuses: one without a namespace, or in `minecraft`.
     */
    public scriptEvent(id: string, message: string, sourceEntity?: string): boolean {
        return this.world.scriptEvent(id, message, sourceEntity);
    }

    /**
     * Reloads every pack's scripts, as `/reload` does. The reload replaces the engine, so an
     * attached debugger detaches first, and attaches to the new engine once its pack has loaded.
     */
    public reload(): void {
        this.debugger.reloading();
        this.runtime.reload();
    }

    /** Sends `system.beforeEvents.shutdown` and stops the scripts. */
    public close(): void {
        this.closing = true;
        // The debugger thread does not keep the process alive, so nothing waits for it to stop.
        void this.debugger.dispose();
        // Another level's scripts may have taken the world's phase since, which stays.
        this.attached?.setScriptPhase(undefined, this.phase);
        this.attached = undefined;
        this.runtime.shutdown();
        this.world.close();
        this.closeLibrary();
    }

    /** The engine's counters, for tests that count host calls and steps. */
    public stats(): ReturnType<WorldScripts['stats']> {
        return this.runtime.stats();
    }
}

/** The packs a debugger may pick: every pack with a script module, attachable once its scripts load. */
const debuggableScripts = (
    packs: readonly ScriptPack[],
    runtime: () => WorldScripts | undefined
): DebuggableScripts => {
    return {
        plugins: () => packs.map((pack) => ({ name: pack.name, module_uuid: pack.moduleUuid })),
        target: (moduleUuid) => {
            const pack = packs.find((each) => each.moduleUuid.toLowerCase() === moduleUuid.toLowerCase());
            const target = pack === undefined ? undefined : runtime()?.debugTarget(pack.moduleUuid);
            return pack === undefined || target === undefined ? undefined : { pack, ...target };
        }
    };
};

/** The prefix of the content log's script lines, which BDS's debug console leaves out. */
const SCRIPTING_PREFIX = '[Scripting] ';

/** Shows a script line of the content log in an attached debugger's console. */
const printScriptLine = (scriptDebugger: ScriptDebugger, message: string, level: 'info' | 'warn' | 'error'): void => {
    if (message.startsWith(SCRIPTING_PREFIX)) scriptDebugger.print(message.slice(SCRIPTING_PREFIX.length), level);
};

/** Imports the parts of the script host a level uses, which fails when it is not installed. */
const importScriptHost = async () => {
    const [
        { ScriptHostLibrary },
        { WorldScripts, watchdogSettings },
        { readScriptConfig, readScriptPack, readPackFile },
        { ScriptDebugSession },
        { PortDebuggerChannel },
        { DebuggerThread },
        { DEFAULT_DEBUGGER_PORT, LogLevel }
    ] = await Promise.all([
        import('@jsprismarine/script-host'),
        import('@jsprismarine/script-host/host/WorldScripts'),
        import('@jsprismarine/script-host/host/pack'),
        import('@jsprismarine/script-host/debugger/DebugSession'),
        import('@jsprismarine/script-host/debugger/channel'),
        import('@jsprismarine/script-host/debugger/thread'),
        import('@jsprismarine/script-host/debugger/protocol')
    ]);
    const debuggerHost: ScriptDebuggerHost = {
        ScriptDebugSession,
        PortDebuggerChannel,
        DebuggerThread,
        LogLevel,
        DEFAULT_DEBUGGER_PORT,
        readPackFile
    };
    return { ScriptHostLibrary, WorldScripts, watchdogSettings, readScriptConfig, readScriptPack, debuggerHost };
};

/** The parts of the script host a level uses. */
type ScriptHostModules = Awaited<ReturnType<typeof importScriptHost>>;
