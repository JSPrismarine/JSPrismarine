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
/**
 * Worker-thread entrypoints the executable embeds beside the server, so the chunk generation
 * pool runs in a compiled binary: the pool's worker entry and the pipeline modules it imports
 * dynamically. Bun embeds each extra entrypoint under its repository-relative path in the
 * binary's virtual filesystem, and the matching `JSP_EMBEDDED_*` defines tell the pool where.
 */
const workerEntrypoints = {
    JSP_EMBEDDED_GENERATION_WORKER: './packages/chunkgen/src/generationWorker.ts',
    JSP_EMBEDDED_CHUNK_PIPELINE: './packages/prismarine/src/world/generators/datadriven/chunkPipeline.ts',
    JSP_EMBEDDED_TERRAIN_PIPELINE: './packages/prismarine/src/world/generators/datadriven/terrainPipeline.ts'
};

const args = [
    'build',
    './packages/server/src/Server.ts',
    ...Object.values(workerEntrypoints),
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

/**
 * Where an extra entrypoint lands inside the binary. Observed, not documented: Bun names each
 * chunk by its path relative to the entrypoints' common directory - `packages/`, since every
 * entry including the server lives under it - and emits `.js`. The build fails below if a
 * compiled binary stops carrying these names, so a Bun that changes the scheme breaks loudly
 * here rather than silently costing the pool its workers.
 */
const relativeEmbeddedNameOf = (entry) => entry.replace('./packages/', '').replace(/\.ts$/, '.js');
const embeddedNameOf = (entry) => `/$bunfs/root/${relativeEmbeddedNameOf(entry)}`;
/** Windows targets store embedded files on Bun's virtual `B:` drive. */
const embeddedFileNameOf = (entry) =>
    target.startsWith('bun-windows-') ? `B:/~BUN/root/${relativeEmbeddedNameOf(entry)}` : embeddedNameOf(entry);

for (const [name, entry] of Object.entries(workerEntrypoints)) {
    args.push('--define', `${name}=${JSON.stringify(`file://${embeddedNameOf(entry)}`)}`);
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

// Bun appends `.exe` on Windows when the output path omits the extension.
const binaryPath =
    process.platform === 'win32' && !outputPath.toLowerCase().endsWith('.exe') ? `${outputPath}.exe` : outputPath;
const binary = readFileSync(path.resolve(repositoryRoot, binaryPath));
for (const entry of Object.values(workerEntrypoints)) {
    if (!binary.includes(Buffer.from(embeddedFileNameOf(entry)))) {
        throw new Error(
            `${binaryPath} does not carry ${embeddedFileNameOf(entry)}; Bun changed how it names ` +
                'embedded entrypoints, and the generation pool would silently lose its workers'
        );
    }
}
