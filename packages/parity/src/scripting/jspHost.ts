/**
 * The JSPrismarine side of a scripting scenario.
 *
 * It takes a scenario, runs its packs the way BDS would, and returns what the scripts recorded,
 * in the same format the BDS capture reads off the content log.
 *
 * A scenario that needs only the engine runs each pack in a bare `@jsprismarine/script-host`
 * engine. A scenario that needs a world runs its packs through `@jsprismarine/prismarine`'s
 * `LevelScripts`, the code a server runs them with, over a test level with the three vanilla
 * dimensions and its real weather, flushing once per tick until every pack has ended.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { ScriptHostLibrary } from '@jsprismarine/script-host';
import type { ScriptEngine } from '@jsprismarine/script-host';
import { ScriptHandle } from '@jsprismarine/script-host/values';
import type { ScriptValue } from '@jsprismarine/script-host/values';

import { LevelScripts } from '@jsprismarine/prismarine/scripting/LevelScripts';
import { fakeLevel } from '@jsprismarine/prismarine/testing/level';
import { Dimensions } from '@jsprismarine/prismarine/world/DimensionType';

import { isRecord } from '../isRecord.ts';
import type { ScenarioRecord } from './record.ts';
import { END_TABLE, readScenarioRecord } from './record.ts';
import type { ScriptScenario } from './scenarios.ts';
import { loadedPacks, scenarioConfigDirectory, scenarioPackDirectory } from './scenarios.ts';

/**
 * Reads the entry file of a pack's script module from its manifest.
 *
 * @returns The entry's path relative to the pack directory, such as `scripts/main.js`.
 * @throws Error when the manifest has no script module with an entry.
 */
const readScriptEntry = (directory: string): string => {
    const path = join(directory, 'manifest.json');
    const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const modules = isRecord(manifest) && Array.isArray(manifest.modules) ? manifest.modules : [];
    for (const module of modules) {
        if (isRecord(module) && module.type === 'script' && typeof module.entry === 'string') return module.entry;
    }
    throw new Error(`${path} has no script module with an entry.`);
};

/** Joins what a script passed to `console` or `print` into one log line, as the content log does. */
const logLine = (args: readonly ScriptValue[]): string =>
    args.map((arg) => (arg instanceof ScriptHandle ? '[object]' : String(arg))).join(' ');

/**
 * Gives the engine the content log a scenario reports through: `console` with its logging
 * methods, and `print`. The world-level host adds both on BDS, and an engine scenario's record
 * leaves their members out, so only their names matter here.
 */
const installContentLog = (engine: ScriptEngine, lines: string[]): void => {
    const log = (...args: ScriptValue[]): undefined => {
        lines.push(logLine(args));
        return undefined;
    };
    const global = engine.global();
    const consoleObject = engine.evaluate('({})');
    if (!(consoleObject instanceof ScriptHandle)) throw new Error('An object literal evaluated to a primitive.');
    try {
        for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
            const fn = engine.hostFunction(method, log);
            engine.set(consoleObject, method, fn);
            engine.free(fn);
        }
        engine.set(global, 'console', consoleObject);
        engine.defineGlobalFunction('print', log);
    } finally {
        engine.free(consoleObject);
        engine.free(global);
    }
};

/**
 * Runs one pack in a new engine and returns the lines it logged. Its entry runs as a module, as
 * BDS runs it, and a module it imports loads from the pack directory.
 */
const runPackInEngine = (library: ScriptHostLibrary, directory: string): string[] => {
    const lines: string[] = [];
    const engine = library.createEngine({
        loadModule: (name) => {
            const path = resolve(directory, name);
            if (relative(directory, path).startsWith('..') || !existsSync(path)) return undefined;
            return readFileSync(path, 'utf8');
        }
    });
    try {
        installContentLog(engine, lines);
        const entry = readScriptEntry(directory);
        engine.free(engine.evaluateModule(entry, readFileSync(join(directory, entry), 'utf8')));
        engine.runJobs();
    } finally {
        engine.destroy();
    }
    return lines;
};

/** The most ticks a world scenario may take before every pack has ended. BDS's packs end at tick 20. */
const SCENARIO_TICKS = 200;

/** The `script-watchdog-*` defaults BDS ships, under the scenario's own properties. */
const watchdogOf = (properties: Readonly<Record<string, string>> = {}) => ({
    enableShutdown: properties['script-watchdog-enable-shutdown'] !== 'false',
    hangThreshold: Number(properties['script-watchdog-hang-threshold'] ?? 10_000),
    memoryLimit: Number(properties['script-watchdog-memory-limit'] ?? 250)
});

/**
 * Runs a world scenario's packs in a test level through `LevelScripts`, one flush per tick, and
 * returns the lines they logged.
 * @throws Error when the script host cannot load the packs, or a pack never ends.
 */
const runPacksInLevel = async (scenario: ScriptScenario): Promise<string[]> => {
    const lines: string[] = [];
    const level = fakeLevel();
    const scripts = await LevelScripts.load({
        packDirectories: scenario.packs.map((pack) => scenarioPackDirectory(scenario, pack)),
        configDirectory: scenarioConfigDirectory(scenario),
        sources: {
            dimensions: () =>
                [Dimensions.Overworld, Dimensions.Nether, Dimensions.TheEnd].map((type) => type.bedrockName),
            players: () => [],
            weather: level.getWeather(),
            // No scenario player chats on JSPrismarine yet: a BDS scenario's chat comes from a
            // GameTest simulated player, which needs @minecraft/server-gametest.
            chat: { addGuard: () => () => {} },
            // A fixed clock: no scenario records a date, and a run must not depend on the host's.
            clock: () => Date.UTC(2026, 10, 16)
        },
        seed: 0n,
        watchdog: watchdogOf(scenario.properties),
        experiments: scenario.experiments ?? [],
        log: { info: (line) => lines.push(line), warn: (line) => lines.push(line), error: (line) => lines.push(line) },
        onShutdown: () => {
            throw new Error(`Scenario ${scenario.id} asked for a server shutdown`);
        }
    });
    if (scripts === undefined) throw new Error(`The script host did not load scenario ${scenario.id}'s packs.`);
    try {
        scripts.start({ setScriptPhase: () => {} });
        const ended = (): boolean =>
            loadedPacks(scenario).every(
                (pack) =>
                    lines.filter((line) => line.includes(`DUMP ${END_TABLE} {"pack":${JSON.stringify(pack)},`))
                        .length >= (scenario.runs ?? 1)
            );
        let reloaded = false;
        for (let tick = 0; tick < SCENARIO_TICKS && !ended(); tick++) {
            scripts.flush();
            // Between ticks, as a console command arrives.
            const reloadAfter = scenario.reloadAfter;
            if (
                !reloaded &&
                reloadAfter !== undefined &&
                lines.some((line) => line.includes(`"event":${JSON.stringify(reloadAfter)}`))
            ) {
                reloaded = true;
                scripts.reload();
            }
        }
    } finally {
        scripts.close();
    }
    return lines;
};

/**
 * Runs a scenario's packs on JSPrismarine and returns their record.
 *
 * An `engine` scenario runs each pack in its own bare script engine, with no world. A `world`
 * scenario runs its packs together in a test level.
 *
 * @returns The record.
 * @throws NativeLibraryError when the scenario finds no script host library.
 */
export const runScenarioOnJsp = async (scenario: ScriptScenario): Promise<ScenarioRecord | undefined> => {
    if (scenario.needs === 'world') {
        return readScenarioRecord(await runPacksInLevel(scenario), loadedPacks(scenario), scenario.runs);
    }
    const library = ScriptHostLibrary.load();
    try {
        const lines = scenario.packs.flatMap((pack) => runPackInEngine(library, scenarioPackDirectory(scenario, pack)));
        return readScenarioRecord(lines, scenario.packs);
    } finally {
        library.close();
    }
};
