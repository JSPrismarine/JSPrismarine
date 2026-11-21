/**
 * Prints what the workflows need to know about a native package, as `key=value` lines a workflow
 * step appends to `$GITHUB_OUTPUT`:
 *
 * - `dir`, `name`, `library`, `abi-symbol`, `require-env` and `windows-toolchain`, from
 *   `packages.mts`.
 * - `hash`, the native sources' hash, and `published`, the hash the manifest's builds were made
 *   from. `stale` is `true` when they differ, so the checkout must build its own library.
 * - `build-matrix` and `test-matrix`, the JSON a workflow's matrix reads.
 *
 *     node scripts/native/describe.mts <package-id>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PLATFORM_RUNNERS, nativePackage, repoRoot } from './packages.mts';

const id = process.argv[2];
const pkg = nativePackage(id);

// Our own manifest; @jsprismarine/native-library's manifest.ts checks its full shape where it loads it.
const manifest = JSON.parse(readFileSync(join(repoRoot, pkg.dir, 'native', 'manifest.json'), 'utf8')) as {
    build: string;
};
const hash = pkg.sourceHash();

const runnerOf = (platform: string) => {
    const runner = PLATFORM_RUNNERS[platform];
    if (runner === undefined) throw new Error(`${pkg.name} publishes ${platform}, which has no runner in packages.mts`);
    return runner;
};
const buildMatrix = {
    include: pkg.platforms.map((platform) => ({ platform, image: '', ...runnerOf(platform) }))
};
const testMatrix = { include: pkg.testPlatforms.map((platform) => ({ platform, runner: runnerOf(platform).runner })) };

const outputs: Record<string, string> = {
    id: id ?? '',
    dir: pkg.dir,
    name: pkg.name,
    library: pkg.library,
    'abi-symbol': pkg.abiSymbol,
    'require-env': pkg.requireEnv,
    'windows-toolchain': pkg.windowsToolchain,
    'alpine-packages': pkg.containerPackages.alpine,
    'debian-packages': pkg.containerPackages.debian,
    hash,
    published: manifest.build,
    stale: String(hash !== manifest.build),
    'build-matrix': JSON.stringify(buildMatrix),
    'test-matrix': JSON.stringify(testMatrix)
};
console.log(
    Object.entries(outputs)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')
);
