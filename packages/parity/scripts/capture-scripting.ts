/**
 * Captures the scripting scenario goldens from the pinned Bedrock Dedicated Server.
 *
 * Each scenario's packs go into a fresh flat world of a staged server, the server runs until
 * every pack has written its end line, and the observations on the content log become
 * `goldens/scripting/<scenario>.json`. The staging, the launcher and the line protocol are the
 * ones `pnpm --filter @jsprismarine/bedrock-data run dump:bedrock` uses, so a host that can run
 * the capture can run this, natively or in a container.
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * pnpm --filter @jsprismarine/parity run capture:scripting
 * pnpm --filter @jsprismarine/parity run capture:scripting -- --scenario startup-order
 * ```
 *
 * Run it when a scenario is added or changed, or when the BDS pin moves, and commit the goldens
 * it writes. CI never runs it: the comparison reads the checked-in goldens.
 */
import { existsSync, readdirSync } from 'node:fs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { dumpArgs } from '../../bedrock-data/utils/bedrock-dump/cli.ts';
import { renderLevelDat } from '../../bedrock-data/utils/bedrock-dump/levelDat.ts';
import { stageBehaviorPacks } from '../../bedrock-data/utils/bedrock-dump/pack.ts';
import { spawnProbe } from '../../bedrock-data/utils/bedrock-dump/probe.ts';
import { launcherForHost } from '../../bedrock-data/utils/bedrock-dump/runner.ts';
import { READY_LINE, SERVER_BINARY, stageServer, startServer } from '../../bedrock-data/utils/bedrock-dump/server.ts';
import { bedrockServerPath } from '../../bedrock-data/utils/fetch/bds.ts';
import { loadBdsData, selectBdsVersion } from '../../bedrock-data/utils/fetch/manifest.ts';
import { cacheRoot, packageDir as bedrockDataDirectory } from '../../bedrock-data/utils/fetch/paths.ts';
import {
    END_TABLE,
    readScenarioRecord,
    renderScenarioGolden,
    SCENARIO_GOLDEN_DIRECTORY,
    SCENARIO_GOLDEN_FORMAT,
    readServerVersion,
    scenarioGoldenPath
} from '../src/scripting/record.ts';
import type { ScenarioGolden } from '../src/scripting/record.ts';
import {
    checkReloadLanded,
    loadedPacks,
    readScenarioPackIdentity,
    SCRIPT_SCENARIOS,
    scenarioConfigDirectory,
    scenarioPackDirectory
} from '../src/scripting/scenarios.ts';
import type { ScriptScenario } from '../src/scripting/scenarios.ts';
import type { ScenarioHttpServer } from '../src/scripting/httpServer.ts';
import { scenarioHttpBase, startScenarioHttpServer } from '../src/scripting/httpServer.ts';
import type { JoinedScenarioClient } from './scenarioClient.ts';
import { joinScenarioClient } from './scenarioClient.ts';

/** How long each stage may take on a native run. The launcher stretches them for emulation. */
const NATIVE_TIMEOUTS = {
    /** From spawn to the engine accepting commands. */
    boot: 180_000,
    /** From the ready line to every pack's end line. */
    scenario: 120_000,
    /** A clean shutdown, after which the process is killed. */
    stop: 120_000
};

/**
 * `server.properties` for every scenario world. A flat world costs nothing to generate, and the
 * ports keep clear of a JSPrismarine or BDS server already listening on the default ones.
 */
const SCENARIO_PROPERTIES = {
    'level-type': 'FLAT',
    'server-port': '29132',
    'server-portv6': '29133'
};

/** `level.dat`'s `Generator` for a flat world, which `level-type` FLAT asks for. */
const FLAT_GENERATOR = 2;

const { values } = parseArgs({
    args: dumpArgs(process.argv.slice(2)),
    options: {
        /** A scenario id to capture; repeat it for several. Defaults to every scenario. */
        scenario: { type: 'string', multiple: true },
        /** Copy the server archive again even when the run directory already holds one. */
        force: { type: 'boolean', default: false },
        /**
         * The IPv4 port the server listens on, the next one up for IPv6. A capture on another port
         * stages its server in a run directory of its own, so captures can run side by side.
         */
        port: { type: 'string' }
    }
});

const port = values.port === undefined ? undefined : Number(values.port);
if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65_534)) {
    throw new Error(`--port takes a port from 1 to 65534, not ${values.port}`);
}
/** The scenario properties with the ports `--port` asks for. */
const properties: Readonly<Record<string, string>> =
    port === undefined
        ? SCENARIO_PROPERTIES
        : { ...SCENARIO_PROPERTIES, 'server-port': String(port), 'server-portv6': String(port + 1) };

const selected: readonly ScriptScenario[] =
    values.scenario === undefined
        ? SCRIPT_SCENARIOS
        : values.scenario.map((id) => {
              const scenario = SCRIPT_SCENARIOS.find((candidate) => candidate.id === id);
              if (scenario === undefined) {
                  throw new Error(
                      `No scenario ${id}; expected one of ${SCRIPT_SCENARIOS.map((known) => known.id).join(', ')}`
                  );
              }
              return scenario;
          });

const { protocolVersion, version: pinnedServer } = selectBdsVersion(
    await loadBdsData(join(bedrockDataDirectory, 'sources.json'))
);
const unpacked = await bedrockServerPath(protocolVersion);
if (!existsSync(join(unpacked, SERVER_BINARY))) {
    throw new Error(
        `${unpacked} holds no ${SERVER_BINARY}. Run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources\` first.`
    );
}

const launcher = launcherForHost(spawnProbe);
console.log(`Running ${launcher.description}`);
launcher.ensureImage();
// `--rm` covers an ordinary exit; a Ctrl+C kills the CLI and leaves the container behind.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        launcher.cleanup();
        process.exit(130);
    });
}

/** Runs one scenario on a fresh world and returns its golden. */
const capture = async (scenario: ScriptScenario): Promise<ScenarioGolden> => {
    const staged = await stageServer({
        unpacked,
        // A run directory of its own, so a capture never shares packs or worlds with `dump:bedrock`.
        root: join(cacheRoot, 'bds-run', `v${protocolVersion}-scripting${port === undefined ? '' : `-${port}`}`),
        force: values.force,
        levelName: `jsp-${scenario.id}`,
        properties: { ...properties, ...scenario.properties }
    });
    // `server.properties` has no key for an experiment, so the world starts from a `level.dat`
    // that has them on. It says flat, as `level-type` does.
    if (scenario.experiments !== undefined) {
        await writeFile(
            join(staged.worldDirectory, 'level.dat'),
            renderLevelDat({ experiments: scenario.experiments, generator: FLAT_GENERATOR })
        );
    }
    await stageBehaviorPacks(
        staged.root,
        staged.worldDirectory,
        scenario.packs.map((pack) => {
            const source = scenarioPackDirectory(scenario, pack);
            return { ...readScenarioPackIdentity(source), source, directory: `jsp-${scenario.id}-${pack}` };
        })
    );

    // The scenario's module folders go beside the shipped `config/default`, and leave with the run.
    const config = scenarioConfigDirectory(scenario);
    const copied = config === undefined ? [] : readdirSync(config).map((folder) => join(staged.root, 'config', folder));
    if (config !== undefined) await cp(config, join(staged.root, 'config'), { recursive: true });

    const base = scenario.httpServer === true ? scenarioHttpBase(scenario) : undefined;
    if (scenario.httpServer === true && base === undefined) {
        throw new Error(`Scenario ${scenario.id} has no base variable for its HTTP server.`);
    }
    // The server listens on the host's loopback address, which a container's own loopback is not.
    if (base !== undefined && launcher.kind !== 'native') {
        throw new Error(`Scenario ${scenario.id} sends HTTP requests to the host, so it captures natively only.`);
    }
    // Before the server starts, as a top-level request can go out in early execution.
    const http: ScenarioHttpServer | undefined = base === undefined ? undefined : await startScenarioHttpServer(base);
    const server = startServer({
        // Only a scenario with a client needs the server's ports published.
        ...launcher.launch(staged.root, { clientConnects: scenario.client !== undefined }),
        cwd: staged.root,
        onLine: (line) => console.log(`  ${line}`)
    });
    let client: JoinedScenarioClient | undefined;
    try {
        await server.waitForLine(
            (line) => line.includes(READY_LINE),
            'the ready line',
            NATIVE_TIMEOUTS.boot * launcher.timeoutScale
        );
        if (scenario.client !== undefined) {
            client = await joinScenarioClient(scenario.client, {
                port: Number(properties['server-port']),
                network: staged.transport,
                protocolVersion
            });
        }
        if (scenario.reloadAfter !== undefined) {
            await server.waitForLine(
                (line) => line.includes(`"event":${JSON.stringify(scenario.reloadAfter)}`),
                `the ${scenario.reloadAfter} observation`,
                NATIVE_TIMEOUTS.scenario * launcher.timeoutScale
            );
            server.send('reload');
        }
        if (scenario.gametestAfter !== undefined) {
            const { event, commands } = scenario.gametestAfter;
            await server.waitForLine(
                (line) => line.includes(`"event":${JSON.stringify(event)}`),
                `the ${event} observation`,
                NATIVE_TIMEOUTS.scenario * launcher.timeoutScale
            );
            for (const command of commands) server.send(command);
        }
        if (scenario.consoleAfter !== undefined) {
            const { event, commands } = scenario.consoleAfter;
            await server.waitForLine(
                (line) => line.includes(`"event":${JSON.stringify(event)}`),
                `the ${event} observation`,
                NATIVE_TIMEOUTS.scenario * launcher.timeoutScale
            );
            for (const command of commands) server.send(command);
        }
        for (const pack of loadedPacks(scenario)) {
            const endLine = `DUMP ${END_TABLE} {"pack":${JSON.stringify(pack)},`;
            // A scenario that reloads has each pack end once per run.
            let from = 0;
            for (let run = 0; run < (scenario.runs ?? 1); run++) {
                await server.waitForLine(
                    (line) => line.includes(endLine),
                    `end line ${run + 1} of pack ${pack}`,
                    NATIVE_TIMEOUTS.scenario * launcher.timeoutScale,
                    from
                );
                from = server.lines.findIndex((line, index) => index >= from && line.includes(endLine)) + 1;
            }
        }
        client?.leave();
        const status = await server.stop(NATIVE_TIMEOUTS.stop * launcher.timeoutScale);
        if (status !== 0) console.warn(`The server exited with status ${status}.`);
    } finally {
        client?.leave();
        // A failed wait leaves the server running, and holding the ports the next capture needs.
        // stop() returns at once when the server has already exited.
        await server.stop(NATIVE_TIMEOUTS.stop * launcher.timeoutScale);
        // A stop that timed out kills the CLI rather than the container it started.
        launcher.cleanup();
        await http?.close();
        for (const folder of copied) await rm(folder, { recursive: true, force: true });
    }

    // A server path override can point at another BDS, and the golden names the pinned version.
    const running = readServerVersion(server.lines);
    if (running !== pinnedServer.serverVersion) {
        throw new Error(
            `The server reported version ${running ?? 'none'}, not the pinned ${pinnedServer.serverVersion}.`
        );
    }

    const read = readScenarioRecord(server.lines, loadedPacks(scenario), scenario.runs);
    const record = client === undefined ? read : { ...read, client: client.observations() };
    checkReloadLanded(scenario, record);
    return {
        $comment: [
            `What the scripts of scenario \`${scenario.id}\` recorded on the pinned Bedrock Dedicated Server.`,
            'Written by `pnpm --filter @jsprismarine/parity run capture:scripting`; never edit by hand.',
            'The format is described in packages/parity/README.md under "Scripting scenarios".'
        ],
        format: SCENARIO_GOLDEN_FORMAT,
        family: scenario.family,
        scenario: scenario.id,
        server: { protocolVersion, serverVersion: pinnedServer.serverVersion },
        ...record
    };
};

await mkdir(SCENARIO_GOLDEN_DIRECTORY, { recursive: true });
for (const scenario of selected) {
    console.log(`Scenario ${scenario.id}`);
    const golden = await capture(scenario);
    await writeFile(scenarioGoldenPath(scenario.id), renderScenarioGolden(golden));
    console.log(`Wrote ${scenarioGoldenPath(scenario.id)}: ${golden.observations.length} observations.`);
}
