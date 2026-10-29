/**
 * The Bedrock half of the capture job: boots the pinned Bedrock Dedicated Server, asks it
 * everything it will answer, and writes the goldens under `src/jsp/`.
 *
 * This is step 4 of [the pipeline](../../../../docs/plans/data-driven-vanilla.md), the one that
 * runs on a version bump and weekly rather than on every build. `dump:java` is its Java
 * counterpart and the two share nothing but the `src/jsp/` directory they write into.
 *
 * Three passes, each a fresh world in the same staged server:
 *
 * - `dump` runs the dump behavior pack and writes one JSON file per Script API table into
 *   `src/jsp/bedrock/`;
 * - `refworld` generates the reference region with a fixed seed and reduces the save to
 *   `src/jsp/reference_world.json`, which is what `packages/parity/` compares a generator
 *   against;
 * - `packets` logs a client in and records what the server sends every joining client, which
 *   is `packages/client/tools/capture-server-data.mjs`.
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run dump:bedrock
 * pnpm --filter @jsprismarine/bedrock-data run dump:bedrock -- --pass refworld
 * ```
 *
 * Mojang publishes the server for Linux x86-64 and Windows, and `sources.json` pins the Linux
 * zip, so the job runs on Linux and refuses anywhere else rather than producing half a capture.
 * The server is a proprietary binary: it is copied into a run directory of this job's own,
 * started from outside it with every path passed as an argument, and the extracted archive is
 * never written to.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { loadSourceDescriptors } from '../fetch/manifest.ts';
import { writeDumpPack } from './pack.ts';
import { assertComplete, collectDumpTables } from './protocol.ts';
import { REFERENCE_DIMENSION, REFERENCE_SEED } from './region.ts';
import { READY_LINE, stageServer, startServer } from './server.ts';
import { readReferenceWorld } from './world.ts';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = resolve(packageDirectory, '../..');
const cacheRoot = join(repositoryRoot, 'node_modules/.cache/jsprismarine');
const jspDirectory = join(packageDirectory, 'src/jsp');

/** How long each stage may take before the job gives up and says which one stalled. */
const TIMEOUTS = {
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
    options: {
        pass: { type: 'string', multiple: true },
        /** Copy the server archive again even when the run directory already holds one. */
        force: { type: 'boolean', default: false },
        /** Where the capture writes. Defaults to the package's `src/jsp`. */
        out: { type: 'string', default: jspDirectory }
    }
});

const PASSES = ['dump', 'refworld', 'packets'] as const;
type Pass = (typeof PASSES)[number];

const requested: Pass[] =
    values.pass === undefined || values.pass.length === 0
        ? [...PASSES]
        : values.pass
              .flatMap((name) => name.split(','))
              .map((name) => {
                  if (!PASSES.includes(name as Pass))
                      throw new Error(`Unknown pass ${name}; expected ${PASSES.join(', ')}`);
                  // Checked against the literal list on the line above.
                  return name as Pass;
              });

const outDirectory = resolve(values.out);

// ---------------------------------------------------------------------------
// The pinned server
// ---------------------------------------------------------------------------

if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error(
        `The pinned Bedrock Dedicated Server is a Linux x86-64 binary and this is ${process.platform}/${process.arch}. ` +
            'Run the capture through .github/workflows/capture.yml, or on a Linux x86-64 machine with ' +
            'JSP_BDS_PATH pointing at an unpacked server.'
    );
}

const descriptors = await loadSourceDescriptors(join(packageDirectory, 'sources.json'));
const bds = descriptors.find((descriptor) => descriptor.name === 'bds');
if (bds === undefined) throw new Error('sources.json no longer pins a bds source');

const override = process.env[bds.envOverride];
const unpacked =
    override !== undefined && override !== '' ? override : join(cacheRoot, bds.name, bds.version, 'unpacked');

if (!existsSync(join(unpacked, 'bedrock_server'))) {
    throw new Error(
        `${unpacked} holds no bedrock_server. Run ` +
            '`pnpm --filter @jsprismarine/bedrock-data run fetch:sources` first, or set ' +
            `${bds.envOverride} to an unpacked server of version ${bds.version}.`
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
    staged: { root: string; binary: string },
    marker: (line: string) => boolean,
    what: string,
    timeoutMs: number
): Promise<string[]> => {
    const server = startServer({
        command: staged.binary,
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

    await server.waitForLine((line) => line.includes(READY_LINE), 'the ready line', TIMEOUTS.boot);
    await server.waitForLine(marker, what, timeoutMs);
    // A killed server never writes its world, so the stop is part of every pass.
    const status = await server.stop(TIMEOUTS.stop);
    if (status !== 0) console.warn(`The server exited with status ${status} after ${what}.`);
    return [...server.lines];
};

// ---------------------------------------------------------------------------
// Pass: the Script API tables
// ---------------------------------------------------------------------------

const runDumpPass = async (): Promise<void> => {
    console.log('Pass 1 of 3: the dump pack');
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
            minecraftVersion: bds.version,
            rows
        });
    }
    console.log(`  ${summary.rows} rows, ${summary.errors} entries the engine refused.`);
};

// ---------------------------------------------------------------------------
// Pass: the reference world
// ---------------------------------------------------------------------------

const runReferenceWorldPass = async (): Promise<void> => {
    console.log('Pass 2 of 3: the reference world');
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
        minecraftVersion: bds.version,
        seed: REFERENCE_SEED,
        dimension: REFERENCE_DIMENSION
    });
    await writeJson(join(outDirectory, 'reference_world.json'), golden);
    console.log(`  ${golden.chunks.length} chunks, ${golden.samples.length} kept whole.`);
};

// ---------------------------------------------------------------------------
// Pass: what the server sends a joining client
// ---------------------------------------------------------------------------

const runPacketPass = async (): Promise<void> => {
    console.log('Pass 3 of 3: the packet capture');
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
        command: staged.binary,
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
                `bedrock-server-${bds.version}`
            ],
            { cwd: repositoryRoot, stdio: 'inherit' }
        );
        if (captured.status !== 0) throw new Error(`The capture client exited with status ${captured.status}`);
    } finally {
        await server.stop(TIMEOUTS.stop);
    }
};

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const passes: Record<Pass, () => Promise<void>> = {
    dump: runDumpPass,
    refworld: runReferenceWorldPass,
    packets: runPacketPass
};

console.log(`Capturing Bedrock Dedicated Server ${bds.version} from ${unpacked}`);
for (const pass of requested) await passes[pass]();
console.log(`Capture complete. Review the diff under ${outDirectory} before committing it.`);
