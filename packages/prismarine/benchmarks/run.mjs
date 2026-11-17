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
import { mkdtempSync, rmSync } from 'node:fs';
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

const benchmarkDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(benchmarkDirectory, '..');
const root = resolve(packageRoot, '../..');
const entryPath = resolve(entry);

// `packStack.ts` uses `createRequire(import.meta.url)` to find workspace overlays. Keep the
// temporary bundle under this package so its resolver can see the package's pnpm links.
const outputDirectory = mkdtempSync(join(packageRoot, '.jsp-bench-'));
const outfile = join(outputDirectory, 'bench.mjs');

/**
 * Worker-thread entries a benchmark may start, keyed by the define that tells their package where
 * the worker is. Each package looks for its worker beside its own module by default, and a bundled
 * module's own URL is the bundle's, where no worker file sits. So each worker is bundled as an extra
 * entry and named through the define `.github/scripts/build-aot.mjs` uses for the same purpose.
 *
 * The generation pool's define is left out: it selects the single executable worker protocol,
 * which only a compiled executable carries. In a bundle, `GenerationPool.unavailable` reports the
 * worker missing and the data-driven generator generates on the calling thread instead.
 */
const workerEntries = {
    JSP_EMBEDDED_RAKNET_WORKER: 'packages/raknet/src/WorkerServerSocket.worker.ts',
    JSP_EMBEDDED_TABLE_BUILDER_WORKER: 'packages/leveldb/src/db/TableBuilderWorker.ts'
};
const workerOutput = (name) => `workers/${name}`;

try {
    await esbuild.build({
        absWorkingDir: root,
        // jsonc-parser's `main` is a UMD build that hands `require` to its factory as a
        // parameter, so esbuild cannot see its `require("./impl/…")` calls and leaves them in the
        // bundle, where they resolve against the bundle's directory and fail. Its ESM build bundles
        // cleanly; `scripts/package-sea.mts` makes the same substitution. esbuild resolves an alias
        // from `absWorkingDir`, which does not link the package, so it is resolved from here.
        alias: { 'jsonc-parser': require.resolve('jsonc-parser/lib/esm/main.js') },
        banner: {
            // CommonJS dependencies in the bundle call require() for Node builtins.
            js: "import { createRequire as __jspCreateRequire } from 'node:module'; const require = __jspCreateRequire(import.meta.url);"
        },
        bundle: true,
        define: Object.fromEntries(
            Object.keys(workerEntries).map((name) => [
                name,
                JSON.stringify(pathToFileURL(join(outputDirectory, `${workerOutput(name)}.mjs`)).href)
            ])
        ),
        entryPoints: [
            { in: entryPath, out: 'bench' },
            ...Object.entries(workerEntries).map(([name, source]) => ({
                in: resolve(root, source),
                out: workerOutput(name)
            }))
        ],
        external: ['node:*'],
        format: 'esm',
        keepNames: false,
        logLevel: 'warning',
        outdir: outputDirectory,
        outExtension: { '.js': '.mjs' },
        packages: 'bundle',
        platform: 'node',
        target: 'node22'
    });

    process.argv = [process.argv[0], outfile, ...args];
    await import(pathToFileURL(outfile).href);
} finally {
    rmSync(outputDirectory, { recursive: true, force: true });
}
