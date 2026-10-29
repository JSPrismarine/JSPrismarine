/**
 * Packages the server as a Node single executable application.
 *
 * Four steps: bundle the server and all of its workspace dependencies into one
 * CommonJS file with rolldown, encode the data the binary carries into a SEA
 * asset bundle, build the executable with `node --build-sea`, and on macOS
 * give the result the ad-hoc signature the kernel requires before it will
 * start the binary.
 *
 * The asset bundle holds the Java worldgen data (`ensure:worldgen` output plus
 * the extracted structure templates) and this project's overlay packs; the
 * binary extracts it on first run. The Bedrock Dedicated Server zip is pinned
 * in the manifest instead and downloaded on first run, because Mojang's
 * license does not allow redistributing it. See
 * `packages/server/src/packaged/provision.ts` for the runtime half.
 */

import { execFileSync } from 'node:child_process';

import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { buildPackagedData } from './data-bundle.mts';
import { yargsCjsImportMetaPlugin } from './yargs-cjs-import-meta.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major! < 25 || (major === 25 && minor! < 5)) {
    console.error(`Node ${process.versions.node} has no --build-sea; packaging needs Node 25.5 or newer.`);
    process.exit(1);
}
const seaDir = path.join(repoRoot, 'dist', 'sea');
const executable = path.join(repoRoot, 'dist', process.platform === 'win32' ? 'prismarine.exe' : 'prismarine');

mkdirSync(seaDir, { recursive: true });

console.log('Bundling the server...');
const bundle = await rolldown({
    input: path.join(repoRoot, 'packages', 'server', 'src', 'Server.ts'),
    platform: 'node',
    // The terminal UI loads a native library through `@opentui/core`, whose top-level await
    // cannot be bundled into the CommonJS SEA entry. The host imports `@jsprismarine/console`
    // dynamically and falls back to the plain line console when that import fails, which is
    // exactly what happens inside the executable.
    external: ['@jsprismarine/console'],
    resolve: {
        // jsonc-parser's `main` is a UMD build whose factory keeps a live `require("./impl/…")`
        // call; inside the executable, require only reaches Node's builtins, so the UMD build
        // crashes on startup. The ESM build bundles cleanly.
        alias: { 'jsonc-parser': 'jsonc-parser/lib/esm/main.js' }
    },
    plugins: [yargsCjsImportMetaPlugin]
});
await bundle.write({
    file: path.join(seaDir, 'server.cjs'),
    format: 'cjs',
    inlineDynamicImports: true
});
await bundle.close();

console.log('Encoding the data bundle...');

let packaged;
try {
    packaged = buildPackagedData(repoRoot);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}

const bundlePath = path.join(seaDir, 'data-bundle.bin');
writeFileSync(bundlePath, packaged.bundle);
console.log(
    `Encoded ${packaged.fileCount} files (${(packaged.bundle.byteLength / 1024 / 1024).toFixed(1)} MiB gzipped)`
);

const manifestPath = path.join(seaDir, 'data-manifest.json');
writeFileSync(manifestPath, packaged.manifest);

console.log('Building the single executable...');
const seaConfig = path.join(seaDir, 'sea-config.json');
writeFileSync(
    seaConfig,
    `${JSON.stringify(
        {
            main: path.join(seaDir, 'server.cjs'),
            output: executable,
            disableExperimentalSEAWarning: true,
            assets: {
                'data-bundle': bundlePath,
                'data-manifest': manifestPath
            }
        },
        null,
        4
    )}\n`
);
execFileSync(process.execPath, [`--build-sea=${seaConfig}`], { cwd: repoRoot, stdio: 'inherit' });

if (process.platform === 'darwin') {
    // An unsigned binary is killed by the kernel before it runs; an ad-hoc
    // signature is enough for a locally built executable.
    execFileSync('codesign', ['--sign', '-', '--force', executable], { stdio: 'inherit' });
}

const size = statSync(executable).size;
console.log(`Packaged ${path.relative(repoRoot, executable)} (${(size / 1024 / 1024).toFixed(1)} MiB)`);
