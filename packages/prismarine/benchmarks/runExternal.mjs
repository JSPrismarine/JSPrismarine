/**
 * Compiles a TypeScript benchmark harness while leaving workspace package imports to Node.
 *
 * Source-mode commands preload tsx so Node can load the workspace's default TypeScript exports.
 * Built-mode commands add `jsprismarine:dist`; the same imports then resolve to the per-module
 * output without installing a TypeScript loader in the measured process.
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('vite/package.json')] }));

const [entry, ...args] = process.argv.slice(2);
if (entry === undefined) {
    console.error('usage: node benchmarks/runExternal.mjs <file.bench.ts> [args...]');
    process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const temporaryDirectory = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.tmp-bench-'));
const outfile = join(temporaryDirectory, 'bench.mjs');

await esbuild.build({
    absWorkingDir: root,
    bundle: true,
    entryPoints: [resolve(entry)],
    external: ['node:*', '@jsprismarine/*'],
    format: 'esm',
    keepNames: false,
    logLevel: 'warning',
    outfile,
    platform: 'node',
    target: 'node22'
});

process.argv = [process.argv[0], outfile, ...args];
try {
    await import(pathToFileURL(outfile).href);
} finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
}
