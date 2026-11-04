/**
 * The e2e runner: builds the pinned client if needed, then runs compatible scenarios in
 * disposable suites that each own one JSPrismarine server and headless cinnabar client.
 *
 * ```
 * pnpm --filter @jsprismarine/client-e2e run e2e                         # every scenario
 * pnpm --filter @jsprismarine/client-e2e run e2e movement                # a selection
 * pnpm --filter @jsprismarine/client-e2e run e2e --concurrency 2 --record # parallel suites, with recordings
 * ```
 *
 * Evidence lands in `--artifacts` (default: a fresh temporary directory, printed at the end).
 * Exits 0 only when the client joins and every selected scenario passes.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { ensureCinnabar } from './cinnabar.mts';
import { CinnabarClient } from './client.mts';
import { startServer } from './jsp-server.mts';
import { sleep, vec3 } from './scenario.mts';
import type { Scenario } from './scenario.mts';
import { chat } from './scenarios/chat.mts';
import { miningDrops } from './scenarios/mining-drops.mts';
import { farmland } from './scenarios/farmland.mts';
import { furnace } from './scenarios/furnace.mts';
import { litFurnace } from './scenarios/lit-furnace.mts';
import { recipeBook } from './scenarios/recipe-book.mts';
import { jump } from './scenarios/jump.mts';
import { gait } from './scenarios/gait.mts';
import { lookDirection } from './scenarios/look-direction.mts';
import { damage } from './scenarios/damage.mts';
import { fallDamage } from './scenarios/fall-damage.mts';
import { movement } from './scenarios/movement.mts';
import { naturalSpawnPlacement } from './scenarios/natural-spawn-placement.mts';
import { naturalSpawnUnderCanopy } from './scenarios/natural-spawn-under-canopy.mts';
import { placementOverlap } from './scenarios/placement-overlap.mts';
import { spawn } from './scenarios/spawn.mts';
import { subChunkBlockChanges } from './scenarios/sub-chunk-block-changes.mts';
import { teleport } from './scenarios/teleport.mts';
import { edgeChunkBlockChange } from './scenarios/edge-chunk-block-change.mts';
import { dimensionsScenario } from './scenarios/dimensions.mts';
import { enderDragon } from './scenarios/ender-dragon.mts';

interface ScenarioSuite {
    name: string;
    scenarios: Scenario[];
}

const suites: ScenarioSuite[] = [
    {
        name: 'gameplay-and-dimensions',
        scenarios: [
            spawn,
            movement,
            jump,
            fallDamage,
            damage,
            lookDirection,
            gait,
            chat,
            miningDrops,
            edgeChunkBlockChange,
            subChunkBlockChanges,
            teleport,
            furnace,
            litFurnace,
            recipeBook,
            placementOverlap,
            enderDragon,
            dimensionsScenario,
            // Last, because it reshapes the terrain it runs on - tilled ground, planted wheat
            // and a water source stay behind - and nothing should have to play on top of that.
            farmland
        ]
    },
    // Natural spawning needs its own content fixture so roaming cows cannot affect gameplay checks.
    // The canopy one runs last: it roofs the world over, and nothing after it would see the sky.
    { name: 'natural-spawn', scenarios: [naturalSpawnPlacement, naturalSpawnUnderCanopy] }
];

// pnpm forwards the literal `--` separators it was given; drop them so flags stay flags.
const argv = process.argv.slice(2).filter((argument) => argument !== '--');

const { values, positionals } = parseArgs({
    args: argv,
    options: {
        record: { type: 'boolean', default: false },
        artifacts: { type: 'string' },
        port: { type: 'string' },
        protocol: { type: 'string' },
        concurrency: { type: 'string', default: '2' }
    },
    allowPositionals: true
});

const allScenarios = suites.flatMap((suite) => suite.scenarios);
const requestedNames = positionals.length ? positionals : allScenarios.map((scenario) => scenario.name);
const availableNames = new Set(allScenarios.map((scenario) => scenario.name));
const unknownNames = requestedNames.filter((name) => !availableNames.has(name));
if (unknownNames.length > 0) {
    console.error(`unknown scenario(s) '${unknownNames.join(', ')}'; available: ${[...availableNames].join(', ')}`);
    process.exit(2);
}
if (new Set(requestedNames).size !== requestedNames.length) {
    throw new Error('each scenario can only be selected once in a run');
}
const requested = new Set(requestedNames);
const selectedSuites = suites
    .map((suite) => ({ ...suite, scenarios: suite.scenarios.filter((scenario) => requested.has(scenario.name)) }))
    .filter((suite) => suite.scenarios.length > 0);

const artifacts = path.resolve(values.artifacts ?? fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-e2e-')));
fs.mkdirSync(artifacts, { recursive: true });
const playerName = 'jsp-e2e';
const persistentGameplayScreens = new Set(['Gameplay', 'Crosshair', 'Hud']);
const protocolVersion = values.protocol === undefined ? undefined : Number(values.protocol);
if (protocolVersion !== undefined && (!Number.isSafeInteger(protocolVersion) || protocolVersion <= 0)) {
    throw new Error('--protocol must be a positive integer');
}
const concurrency = Number(values.concurrency);
if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
    throw new Error('--concurrency must be a positive integer');
}
const requestedPort = values.port === undefined ? undefined : Number(values.port);
if (
    requestedPort !== undefined &&
    (!Number.isSafeInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535)
) {
    throw new Error('--port must be an integer from 1 to 65535');
}
if (requestedPort !== undefined && concurrency > 1 && selectedSuites.length > 1) {
    throw new Error('--port can only be used with one suite at a time; use --concurrency 1');
}

console.log('ensuring the pinned cinnabar build (the first run clones and compiles it)...');
const cinnabar = ensureCinnabar(protocolVersion);
console.log(`client targets Bedrock ${cinnabar.target.gameVersion} (protocol ${cinnabar.target.wireProtocol})`);

type ScenarioResult = { name: string; ok: boolean; note: string };
const serverLogs: string[] = new Array(selectedSuites.length);

const resetBetweenScenarios = async (
    server: Awaited<ReturnType<typeof startServer>>,
    client: CinnabarClient
): Promise<void> => {
    await client.input({ release_all: true });
    await client.waitForScreenAbsent('Loading', 30_000);
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const screens = (await client.state()).screens;
        const visibleScreens = Array.isArray(screens)
            ? screens.filter(
                  (screen): screen is string =>
                      typeof screen === 'string' && screen !== 'Loading' && !persistentGameplayScreens.has(screen)
              )
            : [];
        if (visibleScreens.length === 0) break;
        const deathScreen = visibleScreens.find((screen) => screen.includes('Death'));
        if (deathScreen !== undefined) {
            await client.input({ pointer: [640, 510], press: ['MouseLeft'], press_frames: 3 });
            await client.input({ release_all: true });
            await client.waitForScreenAbsent(deathScreen, 15_000);
        } else {
            await client.input({ press: ['Escape'], press_frames: 3 });
            await client.input({ release_all: true });
            await sleep(100);
        }
    }

    const screens = (await client.state()).screens;
    const remainingScreens = Array.isArray(screens)
        ? screens.filter(
              (screen): screen is string =>
                  typeof screen === 'string' && screen !== 'Loading' && !persistentGameplayScreens.has(screen)
          )
        : [];
    if (remainingScreens.length > 0) {
        throw new Error(`client UI did not close before reset: ${remainingScreens.join(', ')}`);
    }

    const reset = `e2e-reset-${Date.now()}`;
    const resetComplete = server.waitForLine(new RegExp(reset), 15_000);
    server.command(`gamemode survival ${playerName}`);
    server.command(`clear ${playerName}`);
    server.command('kill @e[type=item]');
    // Movement travels about twelve blocks in three seconds; keep a floor under its full path
    // so cleanup can respawn a player that finishes the scenario away from the spawn pad.
    server.command('fill -2 63 -2 2 63 20 minecraft:stone');
    server.command(`execute in minecraft:overworld run teleport ${playerName} 0.5 64 0.5`);
    server.command(`say ${reset}`);
    await resetComplete;
    await client.input({ look: { yaw: 0, pitch: 0, frames: 0 } });
    await client.waitFor('in_world', 30_000);
    await client.waitForScreenAbsent('Loading', 30_000);

    const deadline = Date.now() + 15_000;
    for (;;) {
        const state = await client.state();
        const feet = vec3(state, 'feet');
        const inOverworld = [0, 'minecraft:overworld', 'Overworld'].some((value) => value === state.dimension);
        if (inOverworld && Math.hypot(feet[0] - 0.5, feet[1] - 64, feet[2] - 0.5) < 1) return;
        if (Date.now() >= deadline) {
            throw new Error(
                `client did not return to the reset spawn; dimension ${String(state.dimension)}, feet ${feet.join(', ')}`
            );
        }
        await sleep(250);
    }
};

const runSuite = async (suite: ScenarioSuite, index: number): Promise<ScenarioResult[]> => {
    let server: Awaited<ReturnType<typeof startServer>> | undefined;
    let client: CinnabarClient | undefined;
    const results: ScenarioResult[] = [];

    try {
        server = await startServer({
            port: requestedPort,
            ...(suite.scenarios.some((scenario) => scenario.serverOptions?.naturalCowSpawning === true)
                ? { naturalCowSpawning: true }
                : {})
        });
        console.log(`${suite.name}: server listening on 127.0.0.1:${server.port}`);
        client = await CinnabarClient.start(cinnabar.checkout, cinnabar.binaries.mcp);
        await client.launch({
            userRoot: path.join(server.dir, 'client-user-root'),
            clientBinary: cinnabar.clientBinary,
            displayName: playerName,
            muteAudio: !values.record
        });

        const joined = server.waitForLine(new RegExp(`${playerName} joined the game`), 120_000);
        await client.connect(server.port);
        await client.waitFor('in_world', 120_000);
        await client.waitForScreenAbsent('Loading', 120_000);
        await joined;
        console.log(`${suite.name}: join ok`);

        for (const [scenarioIndex, scenario] of suite.scenarios.entries()) {
            const scenarioArtifacts = path.join(artifacts, scenario.name);
            fs.mkdirSync(scenarioArtifacts, { recursive: true });
            let recordingStarted = false;
            try {
                if (values.record) {
                    await client.recordStart(path.join(scenarioArtifacts, 'run.mp4'));
                    recordingStarted = true;
                }
                await scenario.run({
                    server,
                    client,
                    playerName,
                    artifacts: scenarioArtifacts,
                    log: (message) => console.log(`${scenario.name}: ${message}`)
                });
                results.push({ name: scenario.name, ok: true, note: scenario.description });
                console.log(`${scenario.name}: ok (${scenario.description})`);
            } catch (error) {
                const note = error instanceof Error ? error.message : String(error);
                console.error(`${scenario.name}: FAILED`);
                console.error(error);
                results.push({ name: scenario.name, ok: false, note });
                await client.screenshot(path.join(scenarioArtifacts, 'failure.png')).catch(() => {});
            } finally {
                if (recordingStarted) {
                    const recording = await client.recordStop().catch(() => undefined);
                    if (recording) console.log(`${scenario.name}: recording ${String(recording.path)}`);
                }
            }

            if (scenarioIndex < suite.scenarios.length - 1) {
                try {
                    await resetBetweenScenarios(server, client);
                } catch (error) {
                    const note = `suite reset failed: ${error instanceof Error ? error.message : String(error)}`;
                    console.error(`${suite.name}: ${note}`);
                    for (const remaining of suite.scenarios.slice(scenarioIndex + 1)) {
                        results.push({ name: remaining.name, ok: false, note: `not run because ${note}` });
                    }
                    break;
                }
            }
        }
    } catch (error) {
        const note = `suite setup failed: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`${suite.name}: ${note}`);
        console.error(error);
        for (const scenario of suite.scenarios) {
            if (!results.some((result) => result.name === scenario.name))
                results.push({ name: scenario.name, ok: false, note });
        }
    } finally {
        await client?.close().catch((error: unknown) => {
            console.warn(`${suite.name}: client cleanup failed: ${String(error)}`);
        });
        if (server) {
            const log = `${server.lines.join('\n')}\n`;
            serverLogs[index] = `=== ${suite.name} ===\n${log}`;
            fs.writeFileSync(path.join(artifacts, `${suite.name}.server.log`), log);
            await server.stop().catch((error: unknown) => {
                console.warn(`${suite.name}: server cleanup failed: ${String(error)}`);
            });
        }
    }

    return results;
};

const resultsBySuite: Array<ScenarioResult[] | undefined> = new Array(selectedSuites.length);
let nextSuiteIndex = 0;
const worker = async (): Promise<void> => {
    for (;;) {
        const index = nextSuiteIndex;
        nextSuiteIndex += 1;
        const suite = selectedSuites[index];
        if (!suite) return;
        resultsBySuite[index] = await runSuite(suite, index);
    }
};
await Promise.all(Array.from({ length: Math.min(concurrency, selectedSuites.length) }, worker));

const results = resultsBySuite.flatMap((suiteResults) => suiteResults ?? []);
const failures = results.filter((result) => !result.ok).length;
fs.writeFileSync(path.join(artifacts, 'server.log'), serverLogs.filter(Boolean).join('\n'));
// On GitHub Actions, put the verdicts on the run's summary page beside the uploaded artifacts.
if (process.env.GITHUB_STEP_SUMMARY) {
    const escape = (text: string): string => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
    const rows = results.map(
        (result) => `| ${result.name} | ${result.ok ? 'pass' : 'FAIL'} | ${escape(result.note)} |`
    );
    fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        [
            `## Client e2e (cinnabar ${cinnabar.target.gameVersion}, protocol ${cinnabar.target.wireProtocol})`,
            '',
            '| scenario | result | note |',
            '| --- | --- | --- |',
            ...rows,
            ''
        ].join('\n')
    );
}
console.log(`artifacts: ${artifacts}`);
console.log(failures === 0 ? 'e2e: all scenarios passed' : `e2e: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
