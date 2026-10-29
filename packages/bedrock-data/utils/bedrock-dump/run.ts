/**
 * The Bedrock half of the capture job: boots the pinned Bedrock Dedicated Server, asks it
 * everything it will answer, and writes the goldens under `src/jsp/v<protocol>/`.
 *
 * This is step 4 of [the pipeline](../../../../docs/plans/data-driven-vanilla.md), the one that
 * runs on a version bump and weekly rather than on every build. `dump:java` is its Java
 * counterpart; it writes `src/jsp/java/`, which tracks Java releases and is not keyed by
 * Bedrock protocol version.
 *
 * Four passes, each a fresh world in the same staged server:
 *
 * - `dump` runs the dump behavior pack and writes one JSON file per Script API table into
 *   `src/jsp/v<protocol>/bedrock/`;
 * - `refworld` generates the reference region with a fixed seed and reduces the save to
 *   `src/jsp/v<protocol>/reference_world.json`, which `packages/parity/` compares a generator
 *   against;
 * - `packets` logs a client in and records what the server sends every joining client, which
 *   is `packages/client/tools/capture-server-data.mjs`;
 * - `palette` runs the two halves of the block palette capture and writes
 *   `packages/minecraft/datagen/snapshot/v<protocol>/block-palette.json`.
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run dump:bedrock
 * pnpm --filter @jsprismarine/bedrock-data run dump:bedrock -- --pass refworld
 * pnpm --filter @jsprismarine/bedrock-data run dump:bedrock -- --protocol 2225
 * ```
 *
 * `sources.json` pins one server per Bedrock protocol version. `--protocol <n>` captures a
 * version other than its `defaultProtocolVersion`; the server for that version has to be in
 * the cache already, which `fetch:sources --protocol <n>` puts there.
 *
 * Mojang publishes the server for Linux x86-64 and Windows, and `sources.json` pins the Linux
 * zip. On a Linux x86-64 host the capture starts it directly; anywhere else it starts the same
 * staged copy inside a Linux x86-64 container, which `runner.ts` selects and explains. The
 * server is a proprietary binary either way: it is copied into a run directory of this job's
 * own, started from outside it with every path passed as an argument, and the extracted archive
 * is never written to.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { bedrockServerPath } from '../fetch/bds.ts';
import { bdsDescriptor, loadBdsData, selectBdsVersion } from '../fetch/manifest.ts';
import { dumpArgs, selectPasses } from './cli.ts';
import type { Pass } from './cli.ts';
import { writeDumpPack } from './pack.ts';
import { assertComplete, collectDumpTables } from './protocol.ts';
import { REFERENCE_DIMENSION, REFERENCE_SEED } from './region.ts';
import {
    CONTAINER_CLIS,
    NATIVE_PLATFORM,
    RUNNER_ENV,
    createLauncher,
    parseRunnerPreference,
    probeContainerRuntime,
    selectRunner
} from './runner.ts';
import type { ProbeCommand, ServerLauncher } from './runner.ts';
import { READY_LINE, stageServer, startServer } from './server.ts';
import type { StagedServer } from './server.ts';
import { readReferenceWorld } from './world.ts';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = resolve(packageDirectory, '../..');
const cacheRoot = join(repositoryRoot, 'node_modules/.cache/jsprismarine');
const jspRoot = join(packageDirectory, 'src/jsp');

/**
 * How long each stage may take on a native run before the job gives up and says which one
 * stalled. {@link TIMEOUTS} is this, stretched by whatever the chosen runner costs.
 */
const NATIVE_TIMEOUTS = {
    /** From spawn to the engine accepting commands. */
    boot: 180_000,
    /** The dump pack walking every registry. */
    dump: 900_000,
    /** Generating the reference region, which has no published throughput figure. */
    reference: 2_400_000,
    /** A clean shutdown, after which the process is killed. */
    stop: 120_000
};

const { values } = parseArgs({
    args: dumpArgs(process.argv.slice(2)),
    options: {
        pass: { type: 'string', multiple: true },
        /** Copy the server archive again even when the run directory already holds one. */
        force: { type: 'boolean', default: false },
        /** Which pinned server to capture. Defaults to the manifest's `defaultProtocolVersion`. */
        protocol: { type: 'string' },
        /** Where the capture writes. Defaults to the captured version's `src/jsp/v<protocol>`. */
        out: { type: 'string' }
    }
});

const requested = selectPasses(values.pass);

// ---------------------------------------------------------------------------
// The pinned server
// ---------------------------------------------------------------------------

/** Runs a short command and reports what it did, for the runtime probe and the container cleanup. */
const runProbe: ProbeCommand = (command, args) => {
    const result = spawnSync(command, [...args], { encoding: 'utf8' });
    return {
        status: result.error !== undefined ? null : result.status,
        stdout: result.stdout ?? '',
        stderr: result.error !== undefined ? result.error.message : (result.stderr ?? '')
    };
};

const preference = parseRunnerPreference(process.env[RUNNER_ENV.runner]);
const nativeHost = process.platform === NATIVE_PLATFORM && process.arch === 'x64';
const forcedCli = process.env[RUNNER_ENV.cli];
// Probing starts a CLI, so it is skipped when native is already the answer.
const probe =
    preference === 'native' || (preference === 'auto' && nativeHost)
        ? { failures: [] }
        : probeContainerRuntime(forcedCli !== undefined && forcedCli !== '' ? [forcedCli] : CONTAINER_CLIS, runProbe);

const plan = selectRunner({
    platform: process.platform,
    arch: process.arch,
    preference,
    containerRuntime: 'runtime' in probe ? probe.runtime : undefined,
    probeFailures: 'failures' in probe ? probe.failures : undefined
});

// On a Linux host a container writing as root would leave the staged world and the save owned
// by root. Elsewhere the runtime already maps ownership, and a uid with no passwd entry inside
// the image is the bigger risk.
const { getuid, getgid } = process;
const hostUser =
    process.platform === 'linux' && getuid !== undefined && getgid !== undefined
        ? `${getuid()}:${getgid()}`
        : undefined;

const launcher: ServerLauncher = createLauncher(plan, {
    image: process.env[RUNNER_ENV.image],
    user: hostUser,
    run: runProbe
});

/** The stage budgets for this run, sized for the runner that was chosen. */
const TIMEOUTS = {
    boot: NATIVE_TIMEOUTS.boot * launcher.timeoutScale,
    dump: NATIVE_TIMEOUTS.dump * launcher.timeoutScale,
    reference: NATIVE_TIMEOUTS.reference * launcher.timeoutScale,
    stop: NATIVE_TIMEOUTS.stop * launcher.timeoutScale
};

// `--rm` covers an ordinary exit; a Ctrl+C kills the CLI and leaves the container behind.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        launcher.cleanup();
        process.exit(130);
    });
}

const bdsData = await loadBdsData(join(packageDirectory, 'sources.json'));
const requestedProtocol = values.protocol === undefined ? undefined : Number(values.protocol);
if (requestedProtocol !== undefined && !Number.isInteger(requestedProtocol))
    throw new Error('--protocol needs a Bedrock protocol version, such as --protocol 2193');
const { protocolVersion, version: pinnedServer } = selectBdsVersion(bdsData, requestedProtocol);
const bds = bdsDescriptor(bdsData, protocolVersion);

// One directory per protocol version, so a capture of a second version lands beside the
// first rather than overwriting it. `utils/build.js` re-exports one of them unversioned.
const outDirectory = values.out === undefined ? join(jspRoot, `v${protocolVersion}`) : resolve(values.out);

const unpacked = await bedrockServerPath(protocolVersion);

if (!existsSync(join(unpacked, 'bedrock_server'))) {
    throw new Error(
        `${unpacked} holds no bedrock_server. Run ` +
            '`pnpm --filter @jsprismarine/bedrock-data run fetch:sources ' +
            `--protocol ${protocolVersion}\` first, or set ` +
            `${bds.envOverride} to an unpacked server of version ${pinnedServer.serverVersion}.`
    );
}

const runRoot = join(cacheRoot, 'bds-run', bds.version);
await mkdir(outDirectory, { recursive: true });

const writeJson = async (path: string, value: unknown, indent = 0): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, undefined, indent)}\n`);
    console.log(`Wrote ${path}`);
};

/** Boots the staged server, waits for a marker, stops it cleanly and returns its output. */
const capture = async (
    staged: StagedServer,
    marker: (line: string) => boolean,
    what: string,
    timeoutMs: number
): Promise<string[]> => {
    const server = startServer({
        // Nothing connects to the server in these passes; they drive it over its console alone.
        ...launcher.launch(staged.root),
        cwd: staged.root,
        onLine: (line) => {
            // Progress, not the rows: those are read off the collected lines afterwards.
            if (
                !line.includes('DUMP ') ||
                line.includes('DUMP begin') ||
                line.includes('DUMP end') ||
                line.includes('DUMP errors {"table":"reference-tiles"')
            ) {
                console.log(`  ${line}`);
            }
        }
    });

    try {
        await server.waitForLine((line) => line.includes(READY_LINE), 'the ready line', TIMEOUTS.boot);
        await server.waitForLine(marker, what, timeoutMs);
        // A killed server never writes its world, so the stop is part of every pass.
        const status = await server.stop(TIMEOUTS.stop);
        if (status !== 0) console.warn(`The server exited with status ${status} after ${what}.`);
        return [...server.lines];
    } finally {
        // A stop that timed out kills the CLI rather than the container it started.
        launcher.cleanup();
    }
};

// ---------------------------------------------------------------------------
// Pass: the Script API tables
// ---------------------------------------------------------------------------

const runDumpPass = async (): Promise<void> => {
    console.log('Pass 1 of 4: the dump pack');
    const staged = await stageServer({
        unpacked,
        root: runRoot,
        force: values.force,
        levelName: 'jsp-dump',
        // The dump pack spawns and reads blocks, which needs the world generated beside it.
        properties: { 'level-seed': REFERENCE_SEED, 'view-distance': '4' }
    });
    await writeDumpPack(staged.root, staged.worldDirectory, 'dump');

    const lines = await capture(staged, (line) => line.includes('DUMP end '), 'the dump pack to finish', TIMEOUTS.dump);
    const dumped = collectDumpTables(lines);
    const summary = assertComplete(dumped);

    for (const [table, rows] of [...dumped.tables].sort(([a], [b]) => (a < b ? -1 : 1))) {
        await writeJson(join(outDirectory, 'bedrock', `${table}.json`), {
            $comment: [
                `The \`${table}\` table of the Bedrock capture, one row per entry as the engine`,
                'reported it. Written by `pnpm --filter @jsprismarine/bedrock-data run dump:bedrock`',
                'from the Script API of the pinned Bedrock Dedicated Server; never edit by hand.'
            ],
            minecraftVersion: pinnedServer.serverVersion,
            rows
        });
    }
    console.log(`  ${summary.rows} rows, ${summary.errors} entries the engine refused.`);
};

// ---------------------------------------------------------------------------
// Pass: the reference world
// ---------------------------------------------------------------------------

const runReferenceWorldPass = async (): Promise<void> => {
    console.log('Pass 2 of 4: the reference world');
    const staged = await stageServer({
        unpacked,
        root: runRoot,
        force: false,
        levelName: 'jsp-reference',
        properties: {
            'level-seed': REFERENCE_SEED,
            // With client-side generation on, a server leaves chunks to the client and saves
            // nothing, which is the opposite of what this pass is for.
            'client-side-chunk-generation-enabled': 'false',
            'view-distance': '12',
            'tick-distance': '4'
        }
    });
    await writeDumpPack(staged.root, staged.worldDirectory, 'refworld');

    const lines = await capture(
        staged,
        (line) => line.includes('DUMP end '),
        'the reference region to finish generating',
        TIMEOUTS.reference
    );
    assertComplete(collectDumpTables(lines));

    const golden = await readReferenceWorld(join(staged.worldDirectory, 'db'), {
        minecraftVersion: pinnedServer.serverVersion,
        seed: REFERENCE_SEED,
        dimension: REFERENCE_DIMENSION
    });
    await writeJson(join(outDirectory, 'reference_world.json'), golden);
    console.log(`  ${golden.chunks.length} chunks, ${golden.samples.length} kept whole.`);
};

// ---------------------------------------------------------------------------
// Pass: the block palette
// ---------------------------------------------------------------------------

/**
 * Captures `packages/minecraft/datagen/snapshot/v<protocol>/block-palette.json`.
 *
 * Two server runs, because neither source alone is the answer: a saved world knows which
 * properties the network carries for a block, and only the game knows which values each of
 * them accepts. `README-palette.md` has the reasoning.
 *
 * The two runs used to need a human to re-point the pack manifest between them. `pack.ts`
 * writes the manifest per pass, so here they are just two calls.
 */
const runPalettePass = async (): Promise<void> => {
    console.log('Pass 4 of 4: the block palette');
    const datagen = join(repositoryRoot, 'packages/minecraft/datagen');
    const scratch = join(runRoot, 'palette');
    await mkdir(scratch, { recursive: true });
    const statesFile = join(scratch, 'states.json');
    const domainsFile = join(scratch, 'domains.jsonl');

    const runScript = (script: string, args: string[]): void => {
        const result = spawnSync(process.execPath, [join(datagen, script), ...args], {
            cwd: repositoryRoot,
            stdio: 'inherit'
        });
        if (result.status !== 0) throw new Error(`${script} exited with status ${result.status}`);
    };

    // First run: place one of every block type, so the save carries their network states.
    const placed = await stageServer({
        unpacked,
        root: runRoot,
        force: false,
        levelName: 'jsp-palette-place',
        properties: { 'level-seed': REFERENCE_SEED, 'view-distance': '4' }
    });
    await writeDumpPack(placed.root, placed.worldDirectory, 'place');
    const placeLines = await capture(
        placed,
        (line) => line.includes('PALETTE PLACED '),
        'every block type to be placed',
        TIMEOUTS.dump
    );
    const summary = placeLines.find((line) => line.includes('PALETTE PLACED '))?.trim();
    console.log(`  ${summary ?? 'PALETTE PLACED (not reported)'}`);

    // The save is only written by a clean stop, which `capture` does, so the db is readable now.
    runScript('extract-block-palette.mjs', [join(placed.worldDirectory, 'db'), statesFile]);

    // Second run: ask the game which values each property accepts, block by block.
    const described = await stageServer({
        unpacked,
        root: runRoot,
        force: false,
        levelName: 'jsp-palette-domains',
        properties: { 'level-seed': REFERENCE_SEED, 'view-distance': '4' }
    });
    await writeDumpPack(described.root, described.worldDirectory, 'domains');
    const domainLines = await capture(
        described,
        (line) => line.includes('PALETTE END'),
        'the game to describe every block type',
        TIMEOUTS.dump
    );

    const blocks = domainLines
        .filter((line) => line.includes('PALETTE BLOCK '))
        .map((line) => line.slice(line.indexOf('PALETTE BLOCK ') + 'PALETTE BLOCK '.length).trim());
    if (blocks.length === 0) throw new Error('The domains pass logged no PALETTE BLOCK lines.');
    await writeFile(domainsFile, `${blocks.join('\n')}\n`);
    console.log(`  ${blocks.length} block types described.`);

    // The merge resolves its own output directory from `datagen/manifest.json`, by the
    // Minecraft version, and refuses a version that manifest does not declare.
    runScript('merge-block-palette.mjs', [
        statesFile,
        domainsFile,
        pinnedServer.minecraftVersion,
        `bedrock-server-${pinnedServer.serverVersion}`
    ]);
};

// ---------------------------------------------------------------------------
// Pass: what the server sends a joining client
// ---------------------------------------------------------------------------

const runPacketPass = async (): Promise<void> => {
    console.log('Pass 3 of 4: the packet capture');
    const tool = join(repositoryRoot, 'packages/client/tools/capture-server-data.mjs');
    if (!existsSync(join(repositoryRoot, 'packages/client/dist/index.es.js'))) {
        throw new Error('The capture client is not built. Run `pnpm run build` first.');
    }

    const staged = await stageServer({
        unpacked,
        root: runRoot,
        force: false,
        levelName: 'jsp-packets',
        // Nothing in this pass depends on the world; the client leaves before it is spawned.
        properties: { 'level-seed': REFERENCE_SEED, 'view-distance': '4' }
    });

    const server = startServer({
        // The only pass whose client has to reach the server, so the only one that publishes ports.
        ...launcher.launch(staged.root, { clientConnects: true }),
        cwd: staged.root,
        onLine: (line) => console.log(`  ${line}`)
    });
    try {
        await server.waitForLine((line) => line.includes(READY_LINE), 'the ready line', TIMEOUTS.boot);
        const captured = spawnSync(
            process.execPath,
            [
                tool,
                '--out',
                outDirectory,
                '--extended',
                join(outDirectory, 'packets'),
                '--server',
                `bedrock-server-${pinnedServer.serverVersion}`
            ],
            { cwd: repositoryRoot, stdio: 'inherit' }
        );
        if (captured.status !== 0) throw new Error(`The capture client exited with status ${captured.status}`);
    } finally {
        await server.stop(TIMEOUTS.stop);
        launcher.cleanup();
    }
};

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const passes: Record<Pass, () => Promise<void>> = {
    dump: runDumpPass,
    refworld: runReferenceWorldPass,
    packets: runPacketPass,
    palette: runPalettePass
};

console.log(
    `Capturing Bedrock Dedicated Server ${pinnedServer.serverVersion} ` +
        `(Minecraft ${pinnedServer.minecraftVersion}, protocol ${protocolVersion}) from ${unpacked}, ` +
        `running ${launcher.description}`
);
// Before any staging, so a missing image is reported as itself rather than as a pass that stalled.
launcher.ensureImage();
for (const pass of requested) await passes[pass]();
console.log(`Capture complete. Review the diff under ${outDirectory} before committing it.`);
