/**
 * Builds the native worldgen library for this machine from `native/src/`.
 *
 * The C reproduces worldgen's float rounding step by step, so it is compiled with
 * `-ffp-contract=off`: a fused multiply-add rounds once where the TypeScript rounds twice, and
 * the bits would differ. The library lands in `prebuilds/<platform>/`, with a `build.json` that
 * records its size, its digest and the hash of the native sources it was built from.
 *
 * Needs a C compiler (`CC` names one). The default is `cc` on Linux and macOS, and MinGW-w64's
 * `gcc` on Windows, which takes the same flags.
 *
 *     node scripts/build-native.mts [--out <dir>] [--debug]
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// By path, not by package name: this script runs where no dependencies are installed.
import { nativeSourceHash } from '../../native-library/src/nativeHash.ts';
import {
    installedLibraryFile,
    namingAnswers,
    platformKey,
    sharedLibraryFile
} from '../../native-library/src/platform.ts';
import { BUILD_SCRIPTS } from '../src/nativeHash.ts';
import { LIBRARY, PUBLISHED_PLATFORMS, isPublishedPlatform } from '../src/platform.ts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nativeDir = join(packageDir, 'native');

const { values } = parseArgs({
    options: {
        out: { type: 'string' },
        debug: { type: 'boolean', default: false }
    }
});

const key = platformKey();
if (!isPublishedPlatform(key)) {
    console.warn(`build:native is tested on ${PUBLISHED_PLATFORMS.join(', ')}, not ${key}; trying anyway`);
}

const run = (command: string, args: string[]): void => {
    const result = spawnSync(command, args, { cwd: packageDir, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
};

const sha256 = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

const out = resolve(values.out ?? dirname(installedLibraryFile(packageDir, key, LIBRARY)));
mkdirSync(out, { recursive: true });
const shared = join(out, sharedLibraryFile(LIBRARY));

/** The linker flags for this operating system: only the jwg_ interface is exported. */
const linkFlags = (): string[] => {
    if (process.platform === 'darwin') {
        return ['-dynamiclib', `-Wl,-install_name,@rpath/${sharedLibraryFile(LIBRARY)}`, '-Wl,-dead_strip'];
    }
    // JWG_EXPORT marks the jwg_ functions dllexport, and -static links libgcc in.
    if (process.platform === 'win32') return ['-shared', '-static', ...(values.debug ? [] : ['-s'])];
    // Every symbol binds at load, so a missing one fails loading instead of a later call.
    return ['-shared', `-Wl,--version-script=${join(nativeDir, 'exports.map')}`, '-Wl,-z,now'];
};

const compiler = process.env.CC ?? (process.platform === 'win32' ? 'gcc' : 'cc');
run(compiler, [
    ...(values.debug ? ['-O0', '-g'] : ['-O2']),
    // Each float operation in the C is one rounding, as each f32() is in the TypeScript.
    '-ffp-contract=off',
    // Every object in a Windows DLL is position independent already, and GCC there rejects the flag.
    ...(process.platform === 'win32' ? [] : ['-fPIC']),
    '-fvisibility=hidden',
    '-std=c11',
    '-Wall',
    '-Wextra',
    `-I${join(nativeDir, 'include')}`,
    ...linkFlags(),
    '-o',
    shared,
    join(nativeDir, 'src', 'noise.c'),
    join(nativeDir, 'src', 'density.c'),
    join(nativeDir, 'src', 'climate.c'),
    join(nativeDir, 'src', 'biome.c'),
    '-lm'
]);
if (!values.debug && process.platform === 'darwin') run('strip', ['-x', shared]);
else if (!values.debug && process.platform !== 'win32') run('strip', ['--strip-unneeded', shared]);

const report = {
    platform: key,
    sourceHash: nativeSourceHash(packageDir, BUILD_SCRIPTS, namingAnswers()),
    buildType: values.debug ? 'Debug' : 'Release',
    sources: {},
    shared: { file: sharedLibraryFile(LIBRARY), bytes: statSync(shared).size, sha256: sha256(shared) }
};
writeFileSync(join(out, 'build.json'), `${JSON.stringify(report, null, 4)}\n`);
console.log(JSON.stringify(report, null, 4));
