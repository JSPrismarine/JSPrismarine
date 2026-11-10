/**
 * The e2e runner: builds the pinned client if needed, then runs compatible scenarios in
 * disposable suites that each own one JSPrismarine server and headless cinnabar client.
 *
 * ```
 * pnpm --filter @jsprismarine/client-e2e run e2e                         # every scenario
 * pnpm --filter @jsprismarine/client-e2e run e2e movement                # a selection
 * pnpm --filter @jsprismarine/client-e2e run e2e --concurrency 2 --record # parallel suites, with recordings
 * pnpm --filter @jsprismarine/client-e2e run e2e --retry                 # failed scenarios run once more
 * ```
 *
 * Evidence lands in `--artifacts` (default: a fresh temporary directory, printed at the end).
 * Exits 0 only when the client joins and every selected scenario passes.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { ensureCinnabar, parseTransport } from './cinnabar.mts';
import { CinnabarClient } from './client.mts';
import { startServer } from './jsp-server.mts';
import type { ScenarioResult } from './retry.mts';
import { mergeRetries, retrySuites } from './retry.mts';
import { sleep, standAt } from './scenario.mts';
import type { Scenario } from './scenario.mts';
import { chat } from './scenarios/chat.mts';
import { miningDrops } from './scenarios/mining-drops.mts';
import { farmland } from './scenarios/farmland.mts';
import { furnace } from './scenarios/furnace.mts';
import { villagerTrade } from './scenarios/villager-trade.mts';
import { eating } from './scenarios/eating.mts';
import { litFurnace } from './scenarios/lit-furnace.mts';
import { recipeBook } from './scenarios/recipe-book.mts';
import { jump } from './scenarios/jump.mts';
import { gait } from './scenarios/gait.mts';
import { lookDirection } from './scenarios/look-direction.mts';
import { damage } from './scenarios/damage.mts';
import { fallDamage } from './scenarios/fall-damage.mts';
import { title } from './scenarios/title.mts';
import { blockPlacement } from './scenarios/block-placement.mts';
import { deathRespawn } from './scenarios/death-respawn.mts';
import { teleportWhileDead } from './scenarios/teleport-while-dead.mts';
import { summonEntity } from './scenarios/summon-entity.mts';
import { leverLamp } from './scenarios/lever-lamp.mts';
import { attackEntity } from './scenarios/attack-entity.mts';
import { movement } from './scenarios/movement.mts';
import { movementFanout } from './scenarios/movement-fanout.mts';
import { duplicateLogin } from './scenarios/duplicate-login.mts';
import { movementRotation } from './scenarios/movement-rotation.mts';
import { naturalSpawnPlacement } from './scenarios/natural-spawn-placement.mts';
import { naturalSpawnUnderCanopy } from './scenarios/natural-spawn-under-canopy.mts';
import { placementOverlap } from './scenarios/placement-overlap.mts';
import { spawn } from './scenarios/spawn.mts';
import { subChunkBlockChanges } from './scenarios/sub-chunk-block-changes.mts';
import { worldgenSpawn } from './scenarios/worldgen-spawn.mts';
import { teleport } from './scenarios/teleport.mts';
import { edgeChunkBlockChange } from './scenarios/edge-chunk-block-change.mts';
import { dimensionsScenario } from './scenarios/dimensions.mts';
import { enderDragon } from './scenarios/ender-dragon.mts';
import { chunkCompletionReadiness } from './scenarios/chunk-completion-readiness.mts';
import { cachedChunkDelivery } from './scenarios/cached-chunk-delivery.mts';
import { subChunkRequestDelivery } from './scenarios/subchunk-request-delivery.mts';

interface ScenarioSuite {
    name: string;
    scenarios: Scenario[];
}

const suites: ScenarioSuite[] = [
    {
        name: 'gameplay-and-dimensions',
        scenarios: [
            cachedChunkDelivery,
            subChunkRequestDelivery,
            spawn,
            chunkCompletionReadiness,
            movement,
            jump,
            attackEntity,
            leverLamp,
            summonEntity,
            deathRespawn,
            teleportWhileDead,
            blockPlacement,
            title,
            fallDamage,
            damage,
            lookDirection,
            gait,
            movementFanout,
            duplicateLogin,
            movementRotation,
            chat,
            miningDrops,
            edgeChunkBlockChange,
            subChunkBlockChanges,
            teleport,
            furnace,
            litFurnace,
            villagerTrade,
            eating,
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
    { name: 'natural-spawn', scenarios: [naturalSpawnPlacement, naturalSpawnUnderCanopy] },
    { name: 'worldgen-spawn', scenarios: [worldgenSpawn] }
];

// pnpm forwards the literal `--` separators it was given; drop them so flags stay flags.
const argv = process.argv.slice(2).filter((argument) => argument !== '--');

const { values, positionals } = parseArgs({
    args: argv,
    options: {
        record: { type: 'boolean', default: false },
        retry: { type: 'boolean', default: false },
        artifacts: { type: 'string' },
        port: { type: 'string' },
        protocol: { type: 'string' },
        transport: { type: 'string', default: 'raknet' },
        'compression-algorithm': { type: 'string', default: 'snappy' },
        'raknet-worker': { type: 'boolean', default: true },
        concurrency: { type: 'string', default: '2' }
    },
    allowPositionals: true,
    allowNegative: true
});

const allScenarios = suites.flatMap((suite) => suite.scenarios);

/**
 * Whether Mojang's world generation data is on this machine. The `worldgen-spawn` suite boots a
 * noise-generated Overworld from it, and its server dies at startup without it. The E2E jobs do
 * not fetch it, because that is a JDK, a 62 MB jar and a data generator run, so a default run
 * leaves the suite out here rather than failing every job on a missing prerequisite.
 */
const worldgenDataReady = await (async (): Promise<boolean> => {
    try {
        const cache = await import('../../../packages/bedrock-data/utils/java/worldgen-cache.ts');
        const source = await cache.loadJavaServerSource();
        return cache.worldgenCacheComplete(cache.worldgenCachePaths(source.version));
    } catch {
        return false;
    }
})();
const worldgenSpawnName = worldgenSpawn.name;
if (!positionals.length && !worldgenDataReady) {
    console.log(`${worldgenSpawnName}: skipped, the Java world generation data is not fetched on this machine`);
}
const requestedNames = positionals.length
    ? positionals
    : allScenarios.map((scenario) => scenario.name).filter((name) => name !== worldgenSpawnName || worldgenDataReady);
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
const transport = parseTransport(values.transport);
const compressionAlgorithm = (() => {
    switch (values['compression-algorithm']) {
        case 'zlib':
        case 'snappy':
        case 'none':
            return values['compression-algorithm'];
        default:
            throw new Error('--compression-algorithm must be zlib, snappy, or none');
    }
})();
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
const cinnabar = ensureCinnabar(protocolVersion, transport);
console.log(
    `client targets Bedrock ${cinnabar.target.gameVersion} (protocol ${cinnabar.target.wireProtocol}) over ${transport}`
);

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
    // Creative until the player stands on the floor again: a scenario can finish far from the spawn
    // pad, where the floor is not loaded and the pad is not there yet, and a survival player
    // teleported above nothing falls a hundred blocks to their death.
    server.command(`gamemode creative ${playerName}`);
    server.command(`clear ${playerName}`);
    server.command('kill @e[type=item]');
    server.command(`execute in minecraft:overworld run teleport ${playerName} 0.5 64 0.5`);
    server.command(`say ${reset}`);
    await resetComplete;
    // A scenario starts with the first hotbar slot selected and no control held, whatever the
    // one before it left behind.
    await client.input({ release_all: true });
    await client.input({ hotbar: 1 });
    await client.input({ look: { yaw: 0, pitch: 0, frames: 0 } });
    await client.waitFor('in_world', 30_000);
    await client.waitForScreenAbsent('Loading', 30_000);
    await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);

    // Movement travels about twelve blocks in three seconds; keep a floor under its full path
    // so cleanup can respawn a player that finishes the scenario away from the spawn pad. Only now
    // does the fill land, since the chunks it writes to are loaded around the player.
    server.command('fill -2 63 -2 2 63 20 minecraft:stone');
    await standAt({ server, client, playerName }, { x: 0.5, y: 64, z: 0.5 });
    const { dimension } = await client.state();
    if (![0, 'minecraft:overworld', 'Overworld'].some((value) => value === dimension)) {
        throw new Error(`client did not return to the overworld; dimension ${String(dimension)}`);
    }
    server.command(`gamemode survival ${playerName}`);
    await client.armInput();
};

/**
 * What a failed scenario leaves behind in the CI log: the client's own view of itself and the
 * server's recent warnings. The artifacts hold the full logs, but a failure that is read from
 * the job page alone should still say whether the server complained and where the client was.
 */
const reportFailureContext = async (
    server: { lines: string[] },
    client: CinnabarClient,
    scenario: string
): Promise<void> => {
    try {
        const { screens, dimension, in_world, feet, health, chunks_loaded } = await client.state();
        console.error(
            `${scenario}: client ${JSON.stringify({ screens, dimension, in_world, feet, health, chunks_loaded })}`
        );
    } catch (error) {
        console.error(`${scenario}: client state unavailable (${String(error)})`);
    }

    const noteworthy = server.lines
        .filter((line) => /\b(WARN|ERROR)\b/.test(line) && !/PermissionManager|BanManager|Can't keep up/.test(line))
        .slice(-8);
    for (const line of noteworthy) console.error(`${scenario}: server: ${line.slice(0, 240)}`);
};

/** Whether the client has fallen out of the world, back to a menu, as when the server drops it. */
const clientLeftTheWorld = async (client: CinnabarClient): Promise<boolean> => {
    try {
        const state = await client.state();
        const screens = Array.isArray(state.screens) ? state.screens : [];
        return (
            state.in_world !== true ||
            screens.some((screen) => typeof screen === 'string' && /^Menu/.test(screen) && !/Death/.test(screen))
        );
    } catch {
        return true;
    }
};

const runSuite = async (suite: ScenarioSuite, index: number): Promise<ScenarioResult[]> => {
    let server: Awaited<ReturnType<typeof startServer>> | undefined;
    let client: CinnabarClient | undefined;
    const results: ScenarioResult[] = [];

    try {
        server = await startServer({
            port: requestedPort,
            compressionAlgorithm,
            raknetWorker: values['raknet-worker'],
            transport,
            profile: suite.scenarios.some((scenario) => scenario.serverOptions?.profile === true),
            ...(suite.scenarios.some((scenario) => scenario.serverOptions?.preloadRadius !== undefined)
                ? {
                      preloadRadius: Math.max(
                          ...suite.scenarios.map((scenario) => scenario.serverOptions?.preloadRadius ?? 0)
                      )
                  }
                : {}),
            ...(suite.scenarios.some((scenario) => scenario.serverOptions?.naturalCowSpawning === true)
                ? { naturalCowSpawning: true }
                : {}),
            ...(suite.scenarios.some((scenario) => scenario.serverOptions?.worldgenSpawn === true)
                ? { worldgenSpawn: true }
                : {})
        });
        const suiteServer = server;
        console.log(`${suite.name}: server listening on 127.0.0.1:${suiteServer.port}`);
        // Scenarios that count or kill one kind of mob expect only the ones they summoned. With
        // the vanilla behavior pack on disk the spawn cycle fills the flat world with animals,
        // and a pig that wandered in outlives every swing at the summoned one. Only the suite
        // that tests natural spawning keeps the cycle.
        if (!suite.scenarios.some((scenario) => scenario.serverOptions?.naturalCowSpawning === true)) {
            const spawningOff = suiteServer.waitForLine(/spawn_mobs = false/, 15_000);
            suiteServer.command('gamerule spawn_mobs false');
            await spawningOff;
        }
        /** Starts a client and launches it; joining is left to the caller. */
        const launchClient = async (): Promise<CinnabarClient> => {
            const launched = await CinnabarClient.start(cinnabar.checkout, cinnabar.binaries.mcp);
            await launched.launch({
                userRoot: path.join(suiteServer.dir, 'client-user-root'),
                clientBinary: cinnabar.clientBinary,
                displayName: playerName,
                recorded: values.record
            });
            return launched;
        };
        client = await launchClient();

        // A suite that boots the Java noise Overworld generates real terrain and runs the climate
        // spawn search before the first join, which took a minute on a developer machine and
        // longer than two minutes on a CI runner.
        const joinBudgetMs = suite.scenarios.some((scenario) => scenario.serverOptions?.worldgenSpawn === true)
            ? 360_000
            : 120_000;
        const joined = suiteServer.waitForLine(new RegExp(`${playerName} joined the game`), joinBudgetMs);
        const measureChunkJoin = suite.scenarios.some((scenario) => scenario.name === cachedChunkDelivery.name);
        const connectStarted = performance.now();
        await client.connect(suiteServer.port, transport === 'nethernet');
        let playerSpawnMs: number | undefined;
        let radius2ChunkReadyMs: number | undefined;
        if (measureChunkJoin) {
            const deadline = Date.now() + 120_000;
            while (playerSpawnMs === undefined || radius2ChunkReadyMs === undefined) {
                const state = await client.state();
                const elapsed = performance.now() - connectStarted;
                if (state.in_world === true) playerSpawnMs ??= elapsed;
                const chunks = state.chunks;
                if (
                    typeof chunks === 'object' &&
                    chunks !== null &&
                    'loaded_columns' in chunks &&
                    typeof chunks.loaded_columns === 'number' &&
                    chunks.loaded_columns >= 25
                ) {
                    radius2ChunkReadyMs ??= elapsed;
                }
                if (Date.now() >= deadline) {
                    throw new Error(
                        `timed out measuring join stages: in_world=${String(playerSpawnMs)}, ` +
                            `radius-2 chunks=${String(radius2ChunkReadyMs)}`
                    );
                }
                if (playerSpawnMs === undefined || radius2ChunkReadyMs === undefined) await sleep(20);
            }
            await client.waitFor('in_world', 120_000);
            await client.waitFor({ chunks_loaded: { radius: 2 } }, 120_000);
        } else {
            await client.waitFor('in_world', joinBudgetMs);
        }
        await client.waitForScreenAbsent('Loading', joinBudgetMs);
        await joined;
        await client.armInput();
        console.log(`${suite.name}: join ok`);

        for (const [scenarioIndex, scenario] of suite.scenarios.entries()) {
            const scenarioArtifacts = path.join(artifacts, scenario.name);
            fs.mkdirSync(scenarioArtifacts, { recursive: true });
            const scenarioClients: CinnabarClient[] = [];
            let recordingStarted = false;
            try {
                if (values.record) {
                    await client.recordStart(path.join(scenarioArtifacts, 'run.mp4'));
                    recordingStarted = true;
                }
                // Each additional client gets its own user root, so two clients may share a name.
                const launchClient = async (displayName: string): Promise<CinnabarClient> => {
                    if (!/^[a-zA-Z0-9_-]{1,16}$/.test(displayName)) {
                        throw new Error(
                            'additional client names must be 1 to 16 letters, numbers, underscores, or hyphens'
                        );
                    }
                    const additional = await CinnabarClient.start(cinnabar.checkout, cinnabar.binaries.mcp);
                    scenarioClients.push(additional);
                    const root =
                        scenarioClients.length === 1 ? displayName : `${displayName}-${scenarioClients.length}`;
                    await additional.launch({
                        userRoot: path.join(suiteServer.dir, `client-user-root-${root}`),
                        clientBinary: cinnabar.clientBinary,
                        displayName,
                        recorded: false
                    });
                    return additional;
                };
                const connectClient = async (displayName: string): Promise<CinnabarClient> => {
                    const additional = await launchClient(displayName);
                    await additional.connect(suiteServer.port, transport === 'nethernet');
                    return additional;
                };
                await scenario.run({
                    server: suiteServer,
                    client,
                    connectClient,
                    launchClient,
                    connect: (additional) => additional.connect(suiteServer.port, transport === 'nethernet'),
                    createClient: async (displayName) => {
                        const additionalJoined = suiteServer.waitForLine(
                            new RegExp(`${displayName} joined the game`),
                            120_000
                        );
                        const additional = await connectClient(displayName);
                        await additional.waitFor('in_world', 120_000);
                        await additional.waitForScreenAbsent('Loading', 120_000);
                        await additionalJoined;
                        return additional;
                    },
                    playerName,
                    ...(playerSpawnMs === undefined ? {} : { playerSpawnMs }),
                    ...(radius2ChunkReadyMs === undefined ? {} : { radius2ChunkReadyMs }),
                    artifacts: scenarioArtifacts,
                    log: (message) => console.log(`${scenario.name}: ${message}`)
                });
                results.push({ name: scenario.name, ok: true, note: scenario.description });
                console.log(`${scenario.name}: ok (${scenario.description})`);
            } catch (error) {
                const note = error instanceof Error ? error.message : String(error);
                console.error(`${scenario.name}: FAILED`);
                console.error(error);
                await reportFailureContext(suiteServer, client, scenario.name);
                results.push({ name: scenario.name, ok: false, note });
                await client.screenshot(path.join(scenarioArtifacts, 'failure.png')).catch(() => {});
            } finally {
                if (recordingStarted) {
                    const recording = await client.recordStop().catch(() => undefined);
                    if (recording) console.log(`${scenario.name}: recording ${String(recording.path)}`);
                }
                for (const additional of scenarioClients.reverse()) {
                    await additional.close().catch((error: unknown) => {
                        console.warn(`${scenario.name}: additional client cleanup failed: ${String(error)}`);
                    });
                }
            }

            if (scenarioIndex < suite.scenarios.length - 1) {
                try {
                    try {
                        await resetBetweenScenarios(server, client);
                    } catch (error) {
                        // A client the server dropped under load is not a failure of the next
                        // scenarios: bring a fresh one in and reset again. Any other reset failure
                        // is still a failure.
                        if (!(await clientLeftTheWorld(client))) throw error;
                        console.warn(`${suite.name}: the client left the world (${String(error)}); rejoining`);
                        await client.close().catch(() => {});
                        client = await launchClient();
                        const rejoined = suiteServer.waitForLine(new RegExp(`${playerName} joined the game`), 120_000);
                        await client.connect(suiteServer.port, transport === 'nethernet');
                        await client.waitFor('in_world', 120_000);
                        await client.waitForScreenAbsent('Loading', 120_000);
                        await rejoined;
                        await resetBetweenScenarios(server, client);
                    }
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
        client?.keepLog(path.join(artifacts, `${suite.name}.client.log`));
        await client?.close().catch((error: unknown) => {
            console.warn(`${suite.name}: client cleanup failed: ${String(error)}`);
        });
        if (server) {
            const captureProfile = suite.scenarios.some((scenario) => scenario.serverOptions?.profile === true);
            await server.stop().catch((error: unknown) => {
                console.warn(`${suite.name}: server cleanup failed: ${String(error)}`);
            });

            const log = `${server.lines.join('\n')}\n`;
            serverLogs[index] = `=== ${suite.name} ===\n${log}`;
            fs.writeFileSync(path.join(artifacts, `${suite.name}.server.log`), log);
            if (captureProfile) {
                const profileDirectory = path.join(server.dir, 'profiles');
                const profile = fs.existsSync(profileDirectory)
                    ? fs.readdirSync(profileDirectory).find((name) => name.endsWith('.trace.json'))
                    : undefined;
                if (profile === undefined) {
                    console.warn(`${suite.name}: no server timing trace was produced`);
                } else {
                    const source = path.join(profileDirectory, profile);
                    const saved = path.join(artifacts, `${suite.name}.trace.json`);
                    fs.copyFileSync(source, saved);
                    const trace = JSON.parse(fs.readFileSync(source, 'utf8')) as {
                        traceEvents: Array<{ args?: Record<string, number>; name?: string; ph?: string }>;
                    };
                    const samples = trace.traceEvents.filter(
                        (event) => event.ph === 'C' && event.name === 'Server.chunkCompletions.queue'
                    );
                    const latest = samples.at(-1)?.args;
                    if (latest !== undefined) {
                        console.log(
                            `${suite.name}: completion profile ${saved}; samples=${samples.length}, ` +
                                `worker results=${latest.workerResults}, worker CPU=${latest.workerResultCpuMs?.toFixed(2)} ms, ` +
                                `lighting=${latest.chunkLighting}, lighting CPU=${latest.chunkLightingCpuMs?.toFixed(2)} ms, ` +
                                `max queue age=${latest.maxQueueAgeMs?.toFixed(2)} ms, peak pending=${latest.peakPending}`
                        );
                    }
                }
                fs.rmSync(server.dir, { recursive: true, force: true });
            }
        }
    }

    return results;
};

/** Runs suites `concurrency` at a time. `firstIndex` numbers their server logs after earlier runs'. */
const runSuites = async (toRun: readonly ScenarioSuite[], firstIndex: number): Promise<ScenarioResult[]> => {
    const resultsBySuite: Array<ScenarioResult[] | undefined> = new Array(toRun.length);
    let nextSuiteIndex = 0;
    const worker = async (): Promise<void> => {
        for (;;) {
            const index = nextSuiteIndex;
            nextSuiteIndex += 1;
            const suite = toRun[index];
            if (!suite) return;
            resultsBySuite[index] = await runSuite(suite, firstIndex + index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, toRun.length) }, worker));
    return resultsBySuite.flatMap((suiteResults) => suiteResults ?? []);
};

const firstResults = await runSuites(selectedSuites, 0);
// `--retry` runs each failed scenario once more, on a fresh server and client. One that passes
// then is flaky, not broken: the run passes, and the summary and a warning name it.
const toRetry = values.retry ? retrySuites(selectedSuites, firstResults) : [];
if (toRetry.length > 0) {
    const names = toRetry.flatMap((suite) => suite.scenarios.map((scenario) => scenario.name));
    console.log(`retrying ${names.length} failed scenario(s): ${names.join(', ')}`);
}
const results = mergeRetries(firstResults, await runSuites(toRetry, selectedSuites.length));
for (const result of results) {
    if (!result.retried) continue;
    const message = `${result.name} failed, then passed when run again. ${result.note}`.replaceAll('\n', ' ');
    console.warn(process.env.GITHUB_ACTIONS ? `::warning title=Flaky client e2e scenario::${message}` : message);
}
const failures = results.filter((result) => !result.ok).length;
fs.writeFileSync(path.join(artifacts, 'server.log'), serverLogs.filter(Boolean).join('\n'));
// On GitHub Actions, put the verdicts on the run's summary page beside the uploaded artifacts.
if (process.env.GITHUB_STEP_SUMMARY) {
    const escape = (text: string): string => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
    const rows = results.map(
        (result) =>
            `| ${result.name} | ${result.retried ? 'pass on retry' : result.ok ? 'pass' : 'FAIL'} | ${escape(result.note)} |`
    );
    fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        [
            `## Client e2e (cinnabar ${cinnabar.target.gameVersion}, protocol ${cinnabar.target.wireProtocol}, ${transport})`,
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
