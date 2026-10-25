/**
 * Bundles one benchmark and runs it on plain Node.
 *
 * `npx tsx` would run these files too, but not honestly: tsx compiles with
 * esbuild's `keepNames`, which wraps every function in an
 * `Object.defineProperty` call on its name. The entity runtime builds tens of
 * thousands of closures a tick, so that one flag doubles what the benchmark
 * reports and moves the profile's hot spots onto the wrapper. This bundles
 * with the flag off instead.
 *
 * Usage: node packages/prismarine/benchmarks/run.mjs <file.bench.ts> [args...]
 *
 * Set `ENTITY_AI_PROFILE` to a path to have the entity benchmark write a
 * `.cpuprofile` of its measured ticks, with the setup and the warm-up left
 * out.
 */
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// esbuild is Vite's dependency rather than this repository's, so it is
// resolved from Vite rather than named here.
const require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('vite/package.json')] }));

const [entry, ...args] = process.argv.slice(2);
if (entry === undefined) {
    console.error('usage: node packages/prismarine/benchmarks/run.mjs <file.bench.ts> [args...]');
    process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outfile = join(mkdtempSync(join(tmpdir(), 'jsprismarine-bench-')), 'bench.mjs');

await esbuild.build({
    absWorkingDir: root,
    bundle: true,
    entryPoints: [resolve(entry)],
    external: ['node:*'],
    format: 'esm',
    keepNames: false,
    logLevel: 'warning',
    outfile,
    packages: 'bundle',
    platform: 'node',
    target: 'node22'
});

process.argv = [process.argv[0], outfile, ...args];
await import(pathToFileURL(outfile).href);
