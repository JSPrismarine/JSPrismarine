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
    loadedPacks,
    readScenarioPackIdentity,
    SCRIPT_SCENARIOS,
    scenarioConfigDirectory,
    scenarioPackDirectory
} from '../src/scripting/scenarios.ts';
import type { ScriptScenario } from '../src/scripting/scenarios.ts';

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

const { values } = parseArgs({
    args: dumpArgs(process.argv.slice(2)),
    options: {
        /** A scenario id to capture; repeat it for several. Defaults to every scenario. */
        scenario: { type: 'string', multiple: true },
        /** Copy the server archive again even when the run directory already holds one. */
        force: { type: 'boolean', default: false }
    }
});

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
        root: join(cacheRoot, 'bds-run', `v${protocolVersion}-scripting`),
        force: values.force,
        levelName: `jsp-${scenario.id}`,
        properties: { ...SCENARIO_PROPERTIES, ...scenario.properties }
    });
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

    const server = startServer({
        ...launcher.launch(staged.root),
        cwd: staged.root,
        onLine: (line) => console.log(`  ${line}`)
    });
    try {
        await server.waitForLine(
            (line) => line.includes(READY_LINE),
            'the ready line',
            NATIVE_TIMEOUTS.boot * launcher.timeoutScale
        );
        if (scenario.reloadAfter !== undefined) {
            await server.waitForLine(
                (line) => line.includes(`"event":${JSON.stringify(scenario.reloadAfter)}`),
                `the ${scenario.reloadAfter} observation`,
                NATIVE_TIMEOUTS.scenario * launcher.timeoutScale
            );
            server.send('reload');
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
        const status = await server.stop(NATIVE_TIMEOUTS.stop * launcher.timeoutScale);
        if (status !== 0) console.warn(`The server exited with status ${status}.`);
    } finally {
        // A failed wait leaves the server running, and holding the ports the next capture needs.
        // stop() returns at once when the server has already exited.
        await server.stop(NATIVE_TIMEOUTS.stop * launcher.timeoutScale);
        // A stop that timed out kills the CLI rather than the container it started.
        launcher.cleanup();
        for (const folder of copied) await rm(folder, { recursive: true, force: true });
    }

    // A server path override can point at another BDS, and the golden names the pinned version.
    const running = readServerVersion(server.lines);
    if (running !== pinnedServer.serverVersion) {
        throw new Error(
            `The server reported version ${running ?? 'none'}, not the pinned ${pinnedServer.serverVersion}.`
        );
    }

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
        ...readScenarioRecord(server.lines, loadedPacks(scenario), scenario.runs)
    };
};

await mkdir(SCENARIO_GOLDEN_DIRECTORY, { recursive: true });
for (const scenario of selected) {
    console.log(`Scenario ${scenario.id}`);
    const golden = await capture(scenario);
    await writeFile(scenarioGoldenPath(scenario.id), renderScenarioGolden(golden));
    console.log(`Wrote ${scenarioGoldenPath(scenario.id)}: ${golden.observations.length} observations.`);
}
