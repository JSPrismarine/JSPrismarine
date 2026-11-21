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
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { Logger } from '@jsprismarine/logger';

import { ScriptHostLibrary } from '@jsprismarine/script-host';
import type { ScriptEngine } from '@jsprismarine/script-host';
import type { ScriptEntityState } from '@jsprismarine/script-host/host/world';
import type { JsprismarineServerMembers } from '@jsprismarine/script-host/host/jsprismarineMembers';
import { ScriptHandle } from '@jsprismarine/script-host/values';
import type { ScriptValue } from '@jsprismarine/script-host/values';

import Server from '@jsprismarine/prismarine';
import { Config } from '@jsprismarine/prismarine/config/Config';
import { NO_LEVEL_ACCESS } from '@jsprismarine/prismarine/scripting/LevelScriptWorld';
import { LevelScripts } from '@jsprismarine/prismarine/scripting/LevelScripts';
import { ScriptHttpInputs } from '@jsprismarine/prismarine/scripting/ScriptHttpInputs';
import { fakeLevel } from '@jsprismarine/prismarine/testing/level';
import { Dimensions } from '@jsprismarine/prismarine/world/DimensionType';

import { isRecord } from '../isRecord.ts';
import type { FormAnswer } from './formClient.ts';
import { scenarioHttpBase, startScenarioHttpServer } from './httpServer.ts';
import { cancelByte, FormClientScript } from './formClient.ts';
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

/**
 * The most ticks a world scenario may take before every pack has ended. BDS's packs end at tick
 * 20; a scenario with a client waits up to 60 ticks for a form that never settles.
 */
const SCENARIO_TICKS = 400;

/** The script id of a scenario client's player. */
const CLIENT_PLAYER = '1';

/**
 * A scenario's client at the world seam: a player that receives the scripts' forms and answers
 * each as the scenario says, one tick later, as a client's answer arrives in a later tick's input
 * step. An answer that is not JSON makes the player leave, as the server disconnects a client
 * that sends one (`ModalFormResponseHandler`).
 */
class ScenarioClientPlayer {
    public readonly script: FormClientScript;
    public present = true;
    private queued: { readonly formId: number; readonly answer: FormAnswer }[] = [];

    public constructor(scenario: ScriptScenario) {
        this.script = new FormClientScript(scenario.client ?? { answers: [] });
    }

    /** The player as the level's script world reaches it, while it is in the level. */
    public players() {
        if (!this.present) return [];
        return [
            {
                id: CLIENT_PLAYER,
                sendMessage: () => {},
                showForm: (formId: number, json: string) =>
                    this.queued.push({ formId, answer: this.script.formRequested(formId, json) }),
                closeForms: () => this.script.formsClosed()
            }
        ];
    }

    /**
     * The player's entity, while it is in the level, which `world.getAllPlayers` reads. It stands
     * where BDS's client joins, and no scenario that shows forms reads where that is.
     */
    public entity(id: string): ScriptEntityState | undefined {
        if (!this.present || id !== CLIENT_PLAYER) return undefined;
        return {
            id,
            typeId: 'minecraft:player',
            dimension: Dimensions.Overworld.bedrockName,
            location: { x: 0.5, y: -60, z: 0.5 },
            nameTag: 'client',
            tags: [],
            name: 'client'
        };
    }

    /** Sends the answers to the forms the last tick showed, as the next input step admits them. */
    public answer(scripts: LevelScripts): void {
        for (const { formId, answer } of this.queued.splice(0)) {
            if (!this.present || 'ignore' in answer) continue;
            const response = 'leave' in answer ? undefined : answer.response;
            if ('leave' in answer || (response !== undefined && !isJson(response))) {
                this.present = false;
                continue;
            }
            scripts.answerForm({
                player: CLIENT_PLAYER,
                formId,
                response: response ?? null,
                cancelReason: answer.cancel === undefined ? null : cancelByte(answer.cancel)
            });
        }
    }
}

const isJson = (text: string): boolean => {
    try {
        JSON.parse(text);
        return true;
    } catch {
        return false;
    }
};

/**
 * What `@jsprismarine/server`'s members that reach the server read in a world scenario: a level
 * with no ticker and no transport, so the figures are fixed and nobody has a ping, a bar or a
 * list entry.
 */
const SCENARIO_MEMBERS: JsprismarineServerMembers = {
    performance: () => ({ tps: 20, tpsAverages: [20, 20, 20], lastTickMs: 0, averageTickMs: 0 }),
    ping: () => undefined,
    showBossBar: () => {},
    updateBossBar: () => {},
    hideBossBar: () => {},
    setPlayerListName: () => {},
    resetPlayerListName: () => {},
    // Permission files with nothing in them: everyone holds `default` alone, and a write changes nothing.
    permissions: {
        has: () => false,
        groupsOf: () => ['default'],
        primaryGroupOf: () => 'default',
        metaOf: () => undefined,
        weightOf: () => 0,
        grant: () => {},
        revoke: () => {},
        addToGroup: () => {},
        removeFromGroup: () => {},
        onChange: () => () => {}
    }
};

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
const runPacksInLevel = async (
    scenario: ScriptScenario,
    client: ScenarioClientPlayer | undefined
): Promise<string[]> => {
    const lines: string[] = [];
    const level = fakeLevel();
    const base = scenario.httpServer === true ? scenarioHttpBase(scenario) : undefined;
    if (scenario.httpServer === true && base === undefined) {
        throw new Error(`Scenario ${scenario.id} has no base variable for its HTTP server.`);
    }
    const httpServer = base === undefined ? undefined : await startScenarioHttpServer(base);
    // The host's network, as a server sends the requests, with each result admitted between ticks.
    const http = new ScriptHttpInputs();
    try {
        return await runLoadedPacks(scenario, client, lines, level, http);
    } finally {
        http.close();
        await httpServer?.close();
    }
};

/** Loads a world scenario's packs and ticks them until they end; see {@link runPacksInLevel}. */
const runLoadedPacks = async (
    scenario: ScriptScenario,
    client: ScenarioClientPlayer | undefined,
    lines: string[],
    level: ReturnType<typeof fakeLevel>,
    http: ScriptHttpInputs
): Promise<string[]> => {
    const scripts = await LevelScripts.load({
        packDirectories: scenario.packs.map((pack) => scenarioPackDirectory(scenario, pack)),
        configDirectory: scenarioConfigDirectory(scenario),
        sources: {
            dimensions: () =>
                [Dimensions.Overworld, Dimensions.Nether, Dimensions.TheEnd].map((type) => type.bedrockName),
            players: () => client?.players() ?? [],
            access: {
                ...NO_LEVEL_ACCESS,
                entity: (id) => client?.entity(id),
                entities: (dimension) => {
                    const player = client?.entity(CLIENT_PLAYER);
                    return player?.dimension === dimension ? [player] : [];
                }
            },
            weather: level.getWeather(),
            // No player of a world scenario chats: a scenario's chat comes from a GameTest
            // simulated player, which runs in a server scenario.
            chat: { addGuard: () => () => {} },
            // A fixed clock: no scenario records a date, and a run must not depend on the host's.
            clock: () => Date.UTC(2026, 10, 16),
            http
        },
        members: SCENARIO_MEMBERS,
        // A scenario has no config file; the member is there, as on a server, and reads nothing.
        addonConfig: { read: () => undefined, write: () => {}, watch: () => () => {} },
        // BDS's `max-players` default, which `jsprismarine.maxPlayers` tells the packs.
        maxPlayers: 10,
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
            client?.answer(scripts);
            // Every request a script sent has its answer before the next tick, so a run admits
            // the same results in the same ticks however fast the network is.
            await http.settled();
            http.admit(tick);
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

/** Whether every loaded pack of a scenario has written its end line as often as it runs. */
const packsEnded = (scenario: ScriptScenario, lines: readonly string[]): boolean =>
    loadedPacks(scenario).every(
        (pack) =>
            lines.filter((line) => line.includes(`DUMP ${END_TABLE} {"pack":${JSON.stringify(pack)},`)).length >=
            (scenario.runs ?? 1)
    );

/** What {@link runPacksOnHeadlessServer} runs. */
export interface HeadlessServerRun {
    /** The behavior pack directories, as the world's packs. */
    readonly packDirectories: readonly string[];
    /** BDS's `config/` folder for the scripts, when there is one. */
    readonly configDirectory?: string;
    /** The world experiments to turn on, by their `level.dat` names. */
    readonly experiments?: readonly string[];
    /** A world folder to start from, such as one BDS saved, copied in before the server starts. */
    readonly world?: string;
    /** Where to copy the world folder the server saved once it has stopped. */
    readonly keepWorld?: string;
    /** Whether the packs have logged everything; the server ticks until it says so. */
    readonly ended: (lines: readonly string[]) => boolean;
    /** Console commands to send once a pack has logged an event, as a scenario's `gametestAfter`. */
    readonly gametestAfter?: ScriptScenario['gametestAfter'];
    /** Console commands to type, and finish, once a pack has logged an event, as a scenario's `consoleAfter`. */
    readonly consoleAfter?: ScriptScenario['consoleAfter'];
}

/**
 * Runs packs in a headless JSPrismarine server with a flat LevelDB world called `world`, one tick
 * at a time until `ended` says so, and returns the lines they logged. Its `JSP_DIR` is a
 * directory of its own, with the packs as the world's packs and a `config/` folder beside them.
 * The server saves its world as it stops.
 * @throws Error when the server does not start.
 */
export const runPacksOnHeadlessServer = async (run: HeadlessServerRun): Promise<string[]> => {
    const lines: string[] = [];
    const root = mkdtempSync(join(tmpdir(), 'jsp-parity-scripting-'));
    const previous = process.env.JSP_DIR;
    process.env.JSP_DIR = root;
    try {
        if (run.configDirectory !== undefined) cpSync(run.configDirectory, join(root, 'config'), { recursive: true });
        if (run.world !== undefined) cpSync(run.world, join(root, 'worlds', 'world'), { recursive: true });
        writeFileSync(
            join(root, 'config.json'),
            JSON.stringify({
                'online-mode': false,
                'preload-radius': 1,
                'view-distance': 1,
                'enable-ticking': false,
                'chunk-workers': 0,
                'enable-query': false,
                'content-world-packs': run.packDirectories,
                worlds: {
                    world: {
                        preset: 'minecraft:flat',
                        provider: 'LevelDB',
                        seed: '1',
                        ...(run.experiments === undefined ? {} : { experiments: run.experiments })
                    }
                }
            })
        );
        // The logger's message carries Minecraft's formatting codes and ends a line in a period,
        // which a record line has neither of.
        const logger = new Logger('info', [
            { log: (record) => lines.push(record.message.replace(/§./g, '').replace(/\}\.$/, '}')) }
        ]);
        // A fixed clock: no scenario records a date, and a run must not depend on the host's.
        const server = new Server({
            logger,
            config: new Config(),
            headless: true,
            wallClock: () => Date.UTC(2026, 10, 16)
        });
        await server.bootstrap('127.0.0.1', 0);
        try {
            let gametestSent = false;
            let typed = false;
            for (let tick = 0; tick < SCENARIO_TICKS && !run.ended(lines); tick++) {
                // Between ticks, as a console command arrives: after the first tick at the
                // earliest, since BDS takes the command once the server runs, after its first ticks.
                const gametest = run.gametestAfter;
                if (
                    !gametestSent &&
                    tick > 0 &&
                    gametest !== undefined &&
                    lines.some((line) => line.includes(`"event":${JSON.stringify(gametest.event)}`))
                ) {
                    gametestSent = true;
                    const sender = server.getConsoleSender();
                    // Not awaited: the command is an input of the next tick, which it waits for.
                    for (const command of gametest.commands) {
                        void server
                            .getCommandManager()
                            .dispatchCommand(sender, sender, command)
                            .then((ran) => {
                                if (!ran) lines.push(`The console command ${command} did not run`);
                            });
                    }
                }
                // Typed between ticks, as a console command arrives, and finished before the next tick.
                const typing = run.consoleAfter;
                if (
                    !typed &&
                    typing !== undefined &&
                    lines.some((line) => line.includes(`"event":${JSON.stringify(typing.event)}`))
                ) {
                    typed = true;
                    const sender = server.getConsoleSender();
                    for (const command of typing.commands) {
                        await server.getCommandManager().dispatchCommand(sender, sender, command);
                    }
                }
                server.advanceTick();
                // Chunk loads and other work the tick started settle between ticks, as on a running server.
                await new Promise((settled) => setImmediate(settled));
            }
        } finally {
            await server.shutdown({ stayAlive: true });
        }
        if (run.keepWorld !== undefined) cpSync(join(root, 'worlds', 'world'), run.keepWorld, { recursive: true });
    } finally {
        if (previous === undefined) delete process.env.JSP_DIR;
        else process.env.JSP_DIR = previous;
        rmSync(root, { recursive: true, force: true });
    }
    return lines;
};

/** Runs a server scenario's packs in a headless JSPrismarine server, as {@link runPacksOnHeadlessServer} does. */
const runPacksOnServer = async (scenario: ScriptScenario): Promise<string[]> => {
    const configDirectory = scenarioConfigDirectory(scenario);
    return runPacksOnHeadlessServer({
        packDirectories: scenario.packs.map((pack) => scenarioPackDirectory(scenario, pack)),
        ...(configDirectory === undefined ? {} : { configDirectory }),
        ...(scenario.experiments === undefined ? {} : { experiments: scenario.experiments }),
        ...(scenario.gametestAfter === undefined ? {} : { gametestAfter: scenario.gametestAfter }),
        ...(scenario.consoleAfter === undefined ? {} : { consoleAfter: scenario.consoleAfter }),
        ended: (lines) => packsEnded(scenario, lines)
    });
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
    if (scenario.needs === 'server') {
        return readScenarioRecord(await runPacksOnServer(scenario), loadedPacks(scenario), scenario.runs);
    }
    if (scenario.needs === 'world') {
        const client = scenario.client === undefined ? undefined : new ScenarioClientPlayer(scenario);
        const record = readScenarioRecord(
            await runPacksInLevel(scenario, client),
            loadedPacks(scenario),
            scenario.runs
        );
        return client === undefined ? record : { ...record, client: client.script.observations };
    }
    const library = ScriptHostLibrary.load();
    try {
        const lines = scenario.packs.flatMap((pack) => runPackInEngine(library, scenarioPackDirectory(scenario, pack)));
        return readScenarioRecord(lines, scenario.packs);
    } finally {
        library.close();
    }
};
