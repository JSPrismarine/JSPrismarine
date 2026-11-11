import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { tsImport } from 'tsx/esm/api';

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
 * Worker-thread entrypoints the executable embeds beside the server, one for every worker the
 * server starts: the generation pool's worker and the pipeline modules it imports dynamically,
 * the RakNet socket worker, and LevelDB's table builder. Bun embeds each extra entrypoint under
 * its repository-relative path in the binary's virtual filesystem, and the matching
 * `JSP_EMBEDDED_*` defines tell each package where. A worker missing from this list fails only
 * when the binary first starts it, with the build itself green.
 *
 * The generation pool embeds the worker the Node single executable uses rather than piscina's
 * task module: piscina starts every thread from its own `dist/worker.js`, which nothing embeds.
 */
const workerEntrypoints = {
    JSP_EMBEDDED_GENERATION_WORKER: './packages/chunkgen/src/singleExecutableWorker.ts',
    JSP_EMBEDDED_CHUNK_PIPELINE: './packages/prismarine/src/world/generators/datadriven/chunkPipeline.ts',
    JSP_EMBEDDED_TERRAIN_PIPELINE: './packages/prismarine/src/world/generators/datadriven/terrainPipeline.ts',
    JSP_EMBEDDED_RAKNET_WORKER: './packages/raknet/src/WorkerServerSocket.worker.ts',
    JSP_EMBEDDED_TABLE_BUILDER_WORKER: './packages/leveldb/src/db/TableBuilderWorker.ts'
};

const args = [
    'build',
    './packages/server/src/Server.ts',
    ...Object.values(workerEntrypoints),
    '--compile',
    // No `--sourcemap`: an AOT executable reports its source positions itself, which the logger
    // reads its namespaces from. `--sourcemap=external` would move them into a `.map` file and
    // leave every stack frame reading `compiled.js:1:3`.
    '--aot',
    `--target=${target}`,
    `--outfile=${outputPath}`,
    '--no-compile-autoload-dotenv',
    '--no-compile-autoload-bunfig',
    '--trim',
    // The server's entry answers `--role generation-host`, so the generation pool may start its
    // host by running the executable again.
    '--define',
    'JSP_EMBEDDED_GENERATION_HOST=true'
];

/**
 * A compiled Bun executable reports `NODE_ENV=development` when the variable is unset, which
 * turned on development behavior such as the verbose default log level and the development log
 * file. Defining it at build time makes every shipped executable a production build.
 */
args.push('--define', 'process.env.NODE_ENV="production"');

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
/**
 * The file URL a worker is started from. On Windows it has to carry the `B:` drive: a URL
 * without one is not an absolute path there, and `new Worker` throws `ERR_INVALID_FILE_URL_PATH`.
 */
const embeddedUrlOf = (entry) => `file:///${embeddedFileNameOf(entry).replace(/^\//, '')}`;

for (const [name, entry] of Object.entries(workerEntrypoints)) {
    args.push('--define', `${name}=${JSON.stringify(embeddedUrlOf(entry))}`);
}

if (target.startsWith('bun-windows-')) {
    args.push('--windows-icon=.github/assets/icon.ico');
}

const packaged = buildPackagedData(repositoryRoot);
console.log(
    `Embedding ${packaged.fileCount} data files (${(packaged.bundle.byteLength / 1024 / 1024).toFixed(1)} MiB gzipped)`
);

/** The native networking library's platform key for each Bun target; darwin-x64 has no build. */
const nativePlatforms = {
    'bun-linux-x64': 'linux-x64-gnu',
    'bun-linux-arm64': 'linux-arm64-gnu',
    'bun-linux-x64-musl': 'linux-x64-musl',
    'bun-linux-arm64-musl': 'linux-arm64-musl',
    'bun-darwin-arm64': 'darwin-arm64',
    'bun-windows-x64': 'win32-x64'
};
const { libraryForPlatform } = await tsImport(
    pathToFileURL(path.join(repositoryRoot, 'packages', 'native-network', 'src', 'embed.ts')).href,
    import.meta.url
);
const nativeLibrary =
    nativePlatforms[target] === undefined ? undefined : await libraryForPlatform(nativePlatforms[target]);
if (nativeLibrary === undefined) {
    console.warn(`No native networking library for ${target}: the executable can run RakNet only.`);
} else {
    console.log(`Embedding the native networking library (${nativeLibrary.byteLength} bytes)`);
}

const checkedInSource = readFileSync(embeddedDataPath, 'utf8');
const withPayload = checkedInSource
    .replace(
        "export const EMBEDDED_DATA_BUNDLE = '';",
        `export const EMBEDDED_DATA_BUNDLE = '${Buffer.from(packaged.bundle).toString('base64')}';`
    )
    .replace(
        "export const EMBEDDED_DATA_MANIFEST = '';",
        `export const EMBEDDED_DATA_MANIFEST = ${JSON.stringify(packaged.manifest)};`
    )
    .replace(
        "export const EMBEDDED_NATIVE_LIBRARY = '';",
        `export const EMBEDDED_NATIVE_LIBRARY = '${nativeLibrary === undefined ? '' : Buffer.from(nativeLibrary).toString('base64')}';`
    );
if (withPayload === checkedInSource) {
    throw new Error(`${embeddedDataPath} no longer holds the empty constants this script fills in`);
}

const bunExecutable = process.platform === 'win32' ? 'bun.exe' : 'bun';

/**
 * Compiles with `--trim`, which drops the Bun APIs the program never reaches, and without it
 * for a target whose Bun build has no trim table: the linux-arm64 one answered `NoTrimTable`
 * and took the whole release down. An untrimmed executable is larger and otherwise the same.
 */
const compile = () => {
    try {
        execFileSync(bunExecutable, args, { cwd: repositoryRoot, stdio: ['inherit', 'inherit', 'pipe'] });
    } catch (error) {
        const stderr = String(error.stderr ?? '');
        process.stderr.write(stderr);
        if (!stderr.includes('NoTrimTable')) throw error;

        console.warn(`Bun has no trim table for ${target}; compiling without --trim`);
        execFileSync(
            bunExecutable,
            args.filter((arg) => arg !== '--trim'),
            { cwd: repositoryRoot, stdio: 'inherit' }
        );
    }
};

try {
    writeFileSync(embeddedDataPath, withPayload);
    compile();
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
                'embedded entrypoints, and the server would lose that worker on its first start'
        );
    }
}
