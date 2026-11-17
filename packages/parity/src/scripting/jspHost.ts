/**
 * The JSPrismarine side of a scripting scenario.
 *
 * This is the seam the script host plugs into. It takes a scenario, runs its packs the way BDS
 * would, and returns what the scripts recorded, in the same format the BDS capture reads off the
 * content log.
 *
 * A scenario that needs only the engine runs here already, each pack in a bare
 * `@jsprismarine/script-host` engine. A scenario that needs a world waits for the script host
 * that loads packs into one, issue #3203.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { ScriptHostLibrary } from '@jsprismarine/script-host';
import type { ScriptEngine } from '@jsprismarine/script-host';
import { ScriptHandle } from '@jsprismarine/script-host/values';
import type { ScriptValue } from '@jsprismarine/script-host/values';

import { isRecord } from '../isRecord.ts';
import type { ScenarioRecord } from './record.ts';
import { readScenarioRecord } from './record.ts';
import type { ScriptScenario } from './scenarios.ts';
import { scenarioPackDirectory } from './scenarios.ts';

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

/**
 * Runs a scenario's packs on JSPrismarine and returns their record.
 *
 * An `engine` scenario runs each pack in its own bare script engine, with no world. A `world`
 * scenario returns undefined, and its row reads as deferred, until the script host skeleton,
 * issue #3203, fills that branch.
 *
 * @returns The record, or undefined while JSPrismarine cannot run the scenario's packs.
 * @throws NativeLibraryError when an `engine` scenario finds no script host library.
 */
export const runScenarioOnJsp = async (scenario: ScriptScenario): Promise<ScenarioRecord | undefined> => {
    if (scenario.needs !== 'engine') return undefined;
    const library = ScriptHostLibrary.load();
    try {
        const lines = scenario.packs.flatMap((pack) => runPackInEngine(library, scenarioPackDirectory(scenario, pack)));
        return readScenarioRecord(lines, scenario.packs);
    } finally {
        library.close();
    }
};
