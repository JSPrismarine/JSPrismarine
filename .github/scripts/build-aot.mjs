import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPackagedData } from '../../scripts/data-bundle.mts';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The module whose constants carry the data a compiled binary unpacks on first run.
 *
 * Bun implements no `node:sea`, so the asset table the Node single executable uses is not
 * available here; module source is what `bun build --compile` carries reliably. The real payload
 * is written in before the compile and the checked-in empty pair is restored after, so a build
 * never leaves the tree dirty.
 */
const embeddedDataPath = path.join(repositoryRoot, 'packages', 'server', 'src', 'packaged', 'embeddedData.ts');
const [target, outputPath] = process.argv.slice(2);
const supportedTargets = new Set([
    'bun-linux-x64',
    'bun-linux-arm64',
    'bun-linux-x64-musl',
    'bun-linux-arm64-musl',
    'bun-darwin-x64',
    'bun-darwin-arm64',
    'bun-windows-x64',
    'bun-windows-arm64'
]);

if (!supportedTargets.has(target) || !outputPath) {
    throw new Error('Usage: node .github/scripts/build-aot.mjs <bun-target> <output-path>');
}

if (
    target.startsWith('bun-windows-') &&
    (process.platform !== 'win32' || process.arch !== target.slice('bun-windows-'.length))
) {
    throw new Error(
        `Windows icons require a native ${target} build; Bun ignores Windows metadata when cross-compiling`
    );
}

const buildMetadata = ['BUILD_TIME', 'BUILD_GIT_HASH', 'BUILD_VERSION', 'BUILD_FLAVOR', 'BUILD_TYPE'];
const args = [
    'build',
    './packages/server/src/Server.ts',
    '--compile',
    '--sourcemap',
    `--target=${target}`,
    `--outfile=${outputPath}`,
    '--no-compile-autoload-dotenv',
    '--no-compile-autoload-bunfig',
    '--trim'
];

for (const name of buildMetadata) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} must be set before building an executable`);
    args.push('--define', `${name}=${JSON.stringify(value)}`);
}

if (target.startsWith('bun-windows-')) {
    args.push('--windows-icon=.github/assets/icon.ico');
}

const packaged = buildPackagedData(repositoryRoot);
console.log(
    `Embedding ${packaged.fileCount} data files (${(packaged.bundle.byteLength / 1024 / 1024).toFixed(1)} MiB gzipped)`
);

const checkedInSource = readFileSync(embeddedDataPath, 'utf8');
const withPayload = checkedInSource
    .replace(
        "export const EMBEDDED_DATA_BUNDLE = '';",
        `export const EMBEDDED_DATA_BUNDLE = '${Buffer.from(packaged.bundle).toString('base64')}';`
    )
    .replace(
        "export const EMBEDDED_DATA_MANIFEST = '';",
        `export const EMBEDDED_DATA_MANIFEST = ${JSON.stringify(packaged.manifest)};`
    );
if (withPayload === checkedInSource) {
    throw new Error(`${embeddedDataPath} no longer holds the empty constants this script fills in`);
}

const bunExecutable = process.platform === 'win32' ? 'bun.exe' : 'bun';
try {
    writeFileSync(embeddedDataPath, withPayload);
    execFileSync(bunExecutable, args, { cwd: repositoryRoot, stdio: 'inherit' });
} finally {
    writeFileSync(embeddedDataPath, checkedInSource);
}
