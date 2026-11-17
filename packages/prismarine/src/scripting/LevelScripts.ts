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

import type { ScriptLog, WorldScripts } from '@jsprismarine/script-host/host/WorldScripts';
import type { ScriptFormResponse } from '@jsprismarine/script-host/host/world';

import type { ScriptWatchdogConfig } from '../config/Config';
import { isRecord } from '../utils/isRecord';
import { BETA_APIS } from '../world/WorldExperiments';
import { LevelScriptWorld } from './LevelScriptWorld';
import type { ScriptWorldSources } from './LevelScriptWorld';

/** What a level's scripts need from the server. */
export interface LevelScriptsOptions {
    /** The behavior pack directories the level loads; the ones with a script module run. */
    readonly packDirectories: readonly string[];
    /** BDS's `config/` folder, which `permissions.json` and the rest are read from, when there is one. */
    readonly configDirectory: string | undefined;
    readonly sources: ScriptWorldSources;
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
}

/** A world whose tick runs the level's script flush. */
export interface ScriptPhaseWorld {
    setScriptPhase(phase: (() => void) | undefined): void;
}

/** Where a script host that cannot run here says to look for when it will. */
const PREBUILT_LIBRARIES_ISSUE = 'https://github.com/JSPrismarine/JSPrismarine/issues/3215';

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
    private attached: ScriptPhaseWorld | undefined;
    /** Set while {@link LevelScripts.close} runs, when a watchdog shutdown would stop a stop. */
    private closing = false;

    private constructor(runtime: WorldScripts, world: LevelScriptWorld, closeLibrary: () => void) {
        this.runtime = runtime;
        this.world = world;
        this.closeLibrary = closeLibrary;
    }

    /**
     * Loads the script host and the level's script packs.
     * @returns The level's scripts, or undefined when no pack has a script module or the script
     *   host cannot run on this machine.
     */
    public static async load(options: LevelScriptsOptions): Promise<LevelScripts | undefined> {
        let host: Awaited<ReturnType<typeof importScriptHost>>;
        try {
            host = await importScriptHost();
        } catch {
            const scripted = options.packDirectories.filter(hasScriptModule).length;
            if (scripted > 0) {
                options.log.warn(
                    `${scripted} behavior pack(s) have scripts, but @jsprismarine/script-host is not installed, so they ` +
                        `do not run. npm cannot install it until it ships prebuilt libraries: ${PREBUILT_LIBRARIES_ISSUE}`
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
                    `${process.platform}-${process.arch}, so they do not run: ${String(error)}. Prebuilt libraries ` +
                    `for every platform: ${PREBUILT_LIBRARIES_ISSUE}`
            );
            return undefined;
        }
        const world = new LevelScriptWorld(options.sources);
        let scripts: LevelScripts | undefined;
        const runtime = new host.WorldScripts({
            library,
            world,
            packs,
            config: host.readScriptConfig(options.configDirectory),
            betaApis: options.experiments?.includes(BETA_APIS) === true,
            log: options.log,
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
            }
        });
        scripts = new LevelScripts(runtime, world, () => library.close());
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
        world.setScriptPhase(() => this.runtime.flush());
    }

    /** Runs the script flush, for a level ticked by hand rather than through its world. */
    public flush(): void {
        this.runtime.flush();
    }

    /**
     * Takes a client's answer to a form one of the level's scripts showed. The next script flush
     * settles the form, and an answer for a form the scripts did not send is dropped there.
     */
    public answerForm(response: ScriptFormResponse): void {
        this.world.answerForm(response);
    }

    /** Reloads every pack's scripts, as `/reload` does. */
    public reload(): void {
        this.runtime.reload();
    }

    /** Sends `system.beforeEvents.shutdown` and stops the scripts. */
    public close(): void {
        this.closing = true;
        this.attached?.setScriptPhase(undefined);
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

/** Imports the parts of the script host a level uses, which fails when it is not installed. */
const importScriptHost = async () => {
    const [{ ScriptHostLibrary }, { WorldScripts, watchdogSettings }, { readScriptConfig, readScriptPack }] =
        await Promise.all([
            import('@jsprismarine/script-host'),
            import('@jsprismarine/script-host/host/WorldScripts'),
            import('@jsprismarine/script-host/host/pack')
        ]);
    return { ScriptHostLibrary, WorldScripts, watchdogSettings, readScriptConfig, readScriptPack };
};
