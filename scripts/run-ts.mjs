/**
 * Bundles one TypeScript or JavaScript entry and runs it on plain Node, with no loader.
 *
 * A loader such as tsx transforms every module in the process and compiles with `keepNames`,
 * which wraps each function in a call that sets its name. Benchmarks measure hot closures, and the
 * wrapper moves the profile onto itself. This bundles with `keepNames` off and imports the result,
 * so the measured process runs the same plain JavaScript a built package does.
 *
 * Usage, from a package directory: node ../../scripts/run-ts.mjs <entry> [args...]
 * Node flags go before the script: node --expose-gc ../../scripts/run-ts.mjs <entry>
 *
 * The bundle is written under the current directory so `createRequire(import.meta.url)` finds the
 * package's own links. A bench that starts worker threads from a path next to its source cannot
 * run bundled; build the packages and run it with `--conditions=jsprismarine:dist` instead.
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// esbuild is Vite's dependency rather than this repository's, so it is resolved from Vite.
const require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('vite/package.json')] }));

const [entry, ...args] = process.argv.slice(2);
if (entry === undefined) {
    console.error('usage: node ../../scripts/run-ts.mjs <entry> [args...]');
    process.exit(2);
}

const outputDirectory = mkdtempSync(join(process.cwd(), '.jsp-run-'));
const outfile = join(outputDirectory, 'entry.mjs');

try {
    await esbuild.build({
        absWorkingDir: resolve(process.cwd(), '../..'),
        banner: {
            // CommonJS dependencies in the bundle call require() for Node builtins.
            js: "import { createRequire as __jspCreateRequire } from 'node:module'; const require = __jspCreateRequire(import.meta.url);"
        },
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
} finally {
    rmSync(outputDirectory, { recursive: true, force: true });
}
