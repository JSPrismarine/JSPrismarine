/**
 * The first command of a protocol bring-up: boots the pinned Bedrock Dedicated Server for a
 * protocol version and walks our client's full login against it, stage by stage.
 *
 * ```sh
 * pnpm run bringup --protocol 2225
 * ```
 *
 * Three checks, each reported on its own:
 *
 * 1. **The pins.** `sources.json` has to pin a server for the version and
 *    `packages/minecraft/datagen/manifest.json` has to declare it; when one does not, the output
 *    says exactly what to add and the run stops before any server starts.
 * 2. **The server.** The same staging and runner machinery as `dump:bedrock` — native on
 *    Linux x86-64, a container elsewhere — boots the pinned server with the ports published.
 * 3. **The login.** `packages/client/tools/bringup-probe.mjs` connects at that protocol and
 *    reports each stage (network settings, login, resource packs, start game, spawn) as pass or
 *    fail, with the undecodable packet ids and offsets on a failure. Reaching spawn exercises
 *    both wire directions of every join-path packet, so it is the whole-stack check a new
 *    version runs first and keeps running while the delta codec is implemented.
 *
 * The exit status is the probe's: 0 means our client spawned on the real server.
 * `.agents/skills/protocol-bringup/SKILL.md` places this inside the whole bring-up workflow.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { bedrockServerPath } from '../fetch/bds.ts';
import { loadBdsData, selectBdsVersion } from '../fetch/manifest.ts';
import type { BdsVersion } from '../fetch/manifest.ts';
import { dumpArgs } from './cli.ts';
import { hostNodeArgs } from './host.ts';
import { launcherForHost } from './runner.ts';
import type { ProbeCommand } from './runner.ts';
import { READY_LINE, SERVER_BINARY, stageServer, startServer } from './server.ts';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = resolve(packageDirectory, '../..');
const cacheRoot = join(repositoryRoot, 'node_modules/.cache/jsprismarine');
const datagenManifest = join(repositoryRoot, 'packages/minecraft/datagen/manifest.json');

/** Sized like `run.ts`'s, and stretched the same way when the runner is emulated. */
const NATIVE_TIMEOUTS = { boot: 180_000, stop: 120_000 };

const { values } = parseArgs({
    args: dumpArgs(process.argv.slice(2)),
    options: {
        /** Which pinned server to bring up against. Defaults to `defaultProtocolVersion`. */
        protocol: { type: 'string' },
        /** How long the probe may take from connect to spawn, in milliseconds. */
        timeout: { type: 'string', default: '60000' }
    }
});

const requestedProtocol = values.protocol === undefined ? undefined : Number(values.protocol);
if (requestedProtocol !== undefined && !Number.isInteger(requestedProtocol))
    throw new Error('--protocol needs a Bedrock protocol version, such as --protocol 2225');

// ---------------------------------------------------------------------------
// Check 1: the pins
// ---------------------------------------------------------------------------

const bdsData = await loadBdsData(join(packageDirectory, 'sources.json'));

let pinned: { protocolVersion: number; version: BdsVersion };
try {
    pinned = selectBdsVersion(bdsData, requestedProtocol);
} catch (error) {
    console.error(`FAIL pins: ${error instanceof Error ? error.message : String(error)}`);
    console.error(
        '  Pin it: add an entry under `bds.versions` in packages/bedrock-data/sources.json shaped ' +
            'like the existing ones (minecraftVersion, serverVersion, url, sha1 from ' +
            'Bedrock-OSS/BDS-Versions, sha256 and size measured on download).'
    );
    process.exit(1);
}
const { protocolVersion, version: pinnedServer } = pinned;

// The datagen manifest is parsed JSON the compiler cannot see the shape of.
const datagen = JSON.parse(await readFile(datagenManifest, 'utf8')) as {
    versions: Record<string, unknown>;
};
if (datagen.versions[String(protocolVersion)] === undefined) {
    console.error(
        `FAIL pins: packages/minecraft/datagen/manifest.json declares no version "${protocolVersion}" ` +
            `(declared: ${Object.keys(datagen.versions).join(', ')}).`
    );
    console.error(
        '  Pin it: add a `versions` entry pinning the matching Mojang/bedrock-protocol-docs release ' +
            '(its `metadata.zip` URL and measured sha256) shaped like the existing entries, then run ' +
            '`pnpm --filter @jsprismarine/minecraft run generate`.'
    );
    process.exit(1);
}
console.log(
    `PASS pins: sources.json pins BDS ${pinnedServer.serverVersion} and datagen/manifest.json ` +
        `declares ${protocolVersion}`
);

const unpacked = await bedrockServerPath(protocolVersion);
if (!existsSync(join(unpacked, SERVER_BINARY))) {
    console.error(
        `FAIL server: ${unpacked} holds no ${SERVER_BINARY}. Run ` +
            `\`pnpm --filter @jsprismarine/bedrock-data run fetch:sources --protocol ${protocolVersion}\` first.`
    );
    process.exit(1);
}

const probeTool = join(repositoryRoot, 'packages/client/tools/bringup-probe.mjs');
if (!existsSync(join(repositoryRoot, 'packages/client/dist/index.es.js'))) {
    console.error('FAIL client: the client is not built. Run `pnpm run build` first.');
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Check 2: the server
// ---------------------------------------------------------------------------

const runCommand: ProbeCommand = (command, args) => {
    const result = spawnSync(command, [...args], { encoding: 'utf8' });
    return {
        status: result.error !== undefined ? null : result.status,
        stdout: result.stdout ?? '',
        stderr: result.error !== undefined ? result.error.message : (result.stderr ?? '')
    };
};

const launcher = launcherForHost(runCommand);

// `--rm` covers an ordinary exit; a Ctrl+C kills the CLI and leaves the container behind.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        launcher.cleanup();
        process.exit(130);
    });
}

console.log(
    `Booting Bedrock Dedicated Server ${pinnedServer.serverVersion} ` +
        `(Minecraft ${pinnedServer.minecraftVersion}, protocol ${protocolVersion}), ` +
        `running ${launcher.description}`
);
launcher.ensureImage();

const staged = await stageServer({
    unpacked,
    // The same run directory `dump:bedrock` stages, so the 315 MB copy is shared, not repeated.
    root: join(cacheRoot, 'bds-run', `v${protocolVersion}`),
    force: false,
    levelName: 'jsp-bringup',
    // Nothing in the probe depends on the world; it disconnects right after it spawns.
    properties: { 'view-distance': '4' }
});

const server = startServer({
    ...launcher.launch(staged.root, { clientConnects: true }),
    cwd: staged.root,
    onLine: (line) => console.log(`  ${line}`)
});

let status: number;
try {
    await server.waitForLine(
        (line) => line.includes(READY_LINE),
        'the ready line',
        NATIVE_TIMEOUTS.boot * launcher.timeoutScale
    );
    console.log(`PASS server: ${READY_LINE}`);

    // -----------------------------------------------------------------------
    // Check 3: the login, stage by stage
    // -----------------------------------------------------------------------

    const probe = spawnSync(
        process.execPath,
        hostNodeArgs(probeTool, ['--protocol', String(protocolVersion), '--timeout', values.timeout]),
        { cwd: repositoryRoot, stdio: 'inherit' }
    );
    status = probe.status ?? 1;
} finally {
    await server.stop(NATIVE_TIMEOUTS.stop * launcher.timeoutScale);
    launcher.cleanup();
}

console.log(
    status === 0
        ? `Bring-up check passed: our client spawned on BDS ${pinnedServer.serverVersion} at protocol ${protocolVersion}.`
        : `Bring-up check failed at protocol ${protocolVersion}; the stage report above says where.`
);
process.exit(status);
