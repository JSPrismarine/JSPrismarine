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
 * `packages/server/src/sea/provision.ts` for the runtime half.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { encodeDataBundle } from '../packages/server/src/sea/dataBundle.ts';
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

/** Every file under a directory, as bundle entries with `/` separators. */
const collect = (files: Map<string, Uint8Array>, root: string, prefix: string): void => {
    for (const entry of readdirSync(root).sort()) {
        const absolute = path.join(root, entry);
        if (statSync(absolute).isDirectory()) collect(files, absolute, `${prefix}${entry}/`);
        else files.set(`${prefix}${entry}`, readFileSync(absolute));
    }
};

/** The newest version directory under a cache folder that holds `marker`. */
const newestVersionWith = (root: string, marker: string): string | undefined => {
    if (!existsSync(root)) return undefined;
    for (const entry of readdirSync(root).sort().reverse()) {
        if (existsSync(path.join(root, entry, marker))) return path.join(root, entry);
    }
    return undefined;
};

const cacheRoot = path.join(repoRoot, 'node_modules', '.cache', 'jsprismarine');
const datapack = newestVersionWith(path.join(cacheRoot, 'vanilla-datapack'), 'pack.mcmeta');
const reports = newestVersionWith(path.join(cacheRoot, 'java-reports'), path.join('generated', 'reports'));
const structures = newestVersionWith(path.join(cacheRoot, 'java-structures'), 'empty.nbt');
if (datapack === undefined || reports === undefined || structures === undefined) {
    console.error(
        'The packaged binary carries the Java worldgen data, and this checkout has not fetched it. Run ' +
            '`pnpm --filter @jsprismarine/bedrock-data run ensure:worldgen` and ' +
            '`pnpm --filter @jsprismarine/bedrock-data run extract:structures` first.'
    );
    process.exit(1);
}

const bundleFiles = new Map<string, Uint8Array>();
const cachePrefix = `.cache/jsprismarine`;
collect(bundleFiles, datapack, `${cachePrefix}/vanilla-datapack/${path.basename(datapack)}/`);
collect(
    bundleFiles,
    path.join(reports, 'generated', 'reports', 'biome_parameters'),
    `${cachePrefix}/java-reports/${path.basename(reports)}/generated/reports/biome_parameters/`
);
collect(bundleFiles, structures, `${cachePrefix}/java-structures/${path.basename(structures)}/`);
collect(
    bundleFiles,
    path.join(repoRoot, 'packages', 'blocks', 'vanilla_overlay'),
    '@jsprismarine/blocks/vanilla_overlay/'
);
collect(
    bundleFiles,
    path.join(repoRoot, 'packages', 'entities', 'vanilla_overlay'),
    '@jsprismarine/entities/vanilla_overlay/'
);

const dataBundle = encodeDataBundle(bundleFiles);
const bundlePath = path.join(seaDir, 'data-bundle.bin');
writeFileSync(bundlePath, dataBundle);
console.log(`Encoded ${bundleFiles.size} files (${(dataBundle.byteLength / 1024 / 1024).toFixed(1)} MiB gzipped)`);

// The pinned Bedrock Dedicated Server the binary downloads on first run: its license does not
// allow carrying the zip inside the executable the way the data above travels.
interface BdsPin {
    minecraftVersion: string;
    serverVersion: string;
    url: string;
    sha256: string;
    sizeInBytes: number;
}
// Parsed JSON pinned in this repository, cross-checked by the bedrock-data fetch tests.
const sources: { bds: { defaultProtocolVersion: number; versions: Record<string, BdsPin> } } = JSON.parse(
    readFileSync(path.join(repoRoot, 'packages', 'bedrock-data', 'sources.json'), 'utf8')
);
const bdsPin = sources.bds.versions[String(sources.bds.defaultProtocolVersion)];
if (bdsPin === undefined) {
    console.error('sources.json pins no Bedrock Dedicated Server for its default protocol version.');
    process.exit(1);
}

const manifestPath = path.join(seaDir, 'data-manifest.json');
writeFileSync(
    manifestPath,
    `${JSON.stringify({ bundleSha256: createHash('sha256').update(dataBundle).digest('hex'), bds: bdsPin }, null, 4)}\n`
);

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
