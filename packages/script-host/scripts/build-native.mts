/**
 * Builds the script host's native library for this machine from pinned sources.
 *
 * Downloads every source in `native/sources.json` into the shared cache, checks its SHA-256,
 * unpacks it and applies its patches. It then writes `jsh_absent_globals.h` from
 * `src/absentGlobals.ts` and compiles QuickJS with the C layer in `native/src/` into one
 * shared library. The library lands in `prebuilds/<platform>/`, with a `build.json` that records
 * its size, its digest and the hash of the native sources it was built from.
 *
 * Needs a C compiler (`CC` names one), `tar` with xz support and `git`. The default compiler is
 * `cc` on Linux and macOS, and MinGW-w64's `gcc` on Windows: Bellard's QuickJS includes
 * `<sys/time.h>` and uses pthreads, so it builds on Windows with MinGW-w64 and not with MSVC. A
 * Windows build links libgcc and winpthreads in, so it needs only the system's DLLs.
 *
 *     node scripts/build-native.mts [--out <dir>] [--debug]
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { absentGlobals, splitAbsentPath } from '../src/absentGlobals.ts';
import { nativeSourceHash } from '../src/nativeHash.ts';
import {
    PUBLISHED_PLATFORMS,
    installedLibraryPath,
    isPublishedPlatform,
    platformKey,
    sharedLibraryName
} from '../src/platform.ts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nativeDir = join(packageDir, 'native');
const cacheDir = resolve(packageDir, '../../node_modules/.cache/jsprismarine/script-host');

interface Source {
    version: string;
    url: string;
    sha256: string;
    into: string;
    patches?: string[];
}

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

// Parsed JSON from our own manifest; its shape is the Source interface above.
const sources = JSON.parse(readFileSync(join(nativeDir, 'sources.json'), 'utf8')) as Record<string, Source | string>;
const pinned = Object.entries(sources).flatMap(([name, source]) =>
    typeof source === 'string' ? [] : [{ name, ...source }]
);

const run = (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): void => {
    const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
};

/** Runs a command without blocking, so the compiler can build several files at once. */
const runAsync = (command: string, args: string[], cwd: string): Promise<void> =>
    new Promise((resolvePromise, reject) => {
        const child = spawn(command, args, { cwd, stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', (code) =>
            code === 0 ? resolvePromise() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
        );
    });

/**
 * The `tar` to unpack with. On Windows it is the system's bsdtar: Git's GNU tar, which is often
 * first on the path there, reads `C:\…` as a remote host and fails.
 */
const tarCommand = (): string =>
    process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

const sha256 = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

/** Downloads a source once into the cache and checks its digest every time. */
const download = async (source: Source & { name: string }): Promise<string> => {
    const extension = source.url.slice(source.url.lastIndexOf('.tar'));
    const file = join(cacheDir, 'downloads', `${source.name}-${source.version}${extension}`);
    if (!existsSync(file)) {
        mkdirSync(dirname(file), { recursive: true });
        console.log(`Downloading ${source.url}`);
        const response = await fetch(source.url);
        if (!response.ok) throw new Error(`${source.url} answered ${response.status}`);
        writeFileSync(`${file}.part`, Buffer.from(await response.arrayBuffer()));
        copyFileSync(`${file}.part`, file);
        rmSync(`${file}.part`);
    }
    const digest = sha256(file);
    if (digest !== source.sha256) {
        rmSync(file);
        throw new Error(`${source.name} ${source.version} has SHA-256 ${digest}, expected ${source.sha256}`);
    }
    return file;
};

// One unpacked tree per combination of pins and patches, so a changed patch starts clean.
const treeKey = createHash('sha256')
    .update(readFileSync(join(nativeDir, 'sources.json')))
    .update(
        pinned.flatMap((source) => (source.patches ?? []).map((patch) => readFileSync(join(nativeDir, patch)))).join('')
    )
    .digest('hex')
    .slice(0, 16);
const sourcesDir = join(cacheDir, `sources-${treeKey}`);

const unpack = async (): Promise<void> => {
    for (const source of pinned) {
        const marker = join(sourcesDir, `.${source.name}-${source.version}`);
        if (existsSync(marker)) continue;
        const archive = await download(source);
        const into = join(sourcesDir, source.into);
        rmSync(into, { recursive: true, force: true });
        mkdirSync(into, { recursive: true });
        run(tarCommand(), ['-xf', archive, '--strip-components=1', '-C', into], sourcesDir);
        for (const patch of source.patches ?? []) {
            // The cache can sit inside a git checkout, where `git apply` would resolve paths from
            // the checkout's root and skip every file; stopping discovery here applies it in place.
            run('git', ['apply', '--verbose', join(nativeDir, patch)], into, {
                ...process.env,
                GIT_CEILING_DIRECTORIES: dirname(into)
            });
        }
        writeFileSync(marker, '');
    }
};

await unpack();

// Linked worktrees share the cache, so each checkout compiles into its own directory.
const checkout = createHash('sha256').update(nativeDir).digest('hex').slice(0, 8);
const buildDir = join(cacheDir, `build-${treeKey}-${checkout}-${key}${values.debug ? '-debug' : ''}`);
mkdirSync(buildDir, { recursive: true });

const header = [
    '/* Generated by scripts/build-native.mts from src/absentGlobals.ts. Do not edit. */',
    '/* A property to delete: the dotted names from the global object to its holder, and its key. */',
    'typedef struct {',
    '\tconst char *owner;',
    '\tconst char *key;',
    '\t/* Nonzero when key names a well-known symbol, Symbol[key]. */',
    '\tint symbol;',
    '} jsh_absent_path;',
    'static const jsh_absent_path jsh_absent_globals[] = {',
    ...absentGlobals().map(({ path }) => {
        const { owner, key, symbol } = splitAbsentPath(path);
        return `\t{${JSON.stringify(owner.join('.'))}, ${JSON.stringify(key)}, ${symbol ? 1 : 0}},`;
    }),
    '};',
    ''
].join('\n');
writeFileSync(join(buildDir, 'jsh_absent_globals.h'), header);

const quickjsDir = join(sourcesDir, 'quickjs');
const quickjsVersion = pinned.find((source) => source.name === 'quickjs')?.version;
if (quickjsVersion === undefined) throw new Error('native/sources.json pins no quickjs');

const compiler = process.env.CC ?? (process.platform === 'win32' ? 'gcc' : 'cc');
const optimize = values.debug ? ['-O0', '-g'] : ['-O2'];
const common = [
    ...optimize,
    // Every object in a Windows DLL is position independent already, and GCC there rejects the flag.
    ...(process.platform === 'win32' ? [] : ['-fPIC']),
    '-fvisibility=hidden',
    '-ffunction-sections',
    '-fdata-sections',
    '-D_GNU_SOURCE',
    // MinGW-w64's own printf family, as QuickJS's Makefile picks on Windows for C99 formatting.
    ...(process.platform === 'win32' ? ['-D__USE_MINGW_ANSI_STDIO'] : []),
    `-DCONFIG_VERSION="${quickjsVersion}"`,
    // QuickJS's header is upstream's, so its warnings stay out of the C layer's build.
    '-isystem',
    quickjsDir,
    `-I${join(nativeDir, 'include')}`,
    `-I${buildDir}`
];
const units = [
    // QuickJS's own warnings are upstream's to fix, so they stay quiet. Its Makefile builds it with
    // -fwrapv, as it relies on signed overflow wrapping.
    ...['quickjs.c', 'libregexp.c', 'libunicode.c', 'cutils.c', 'dtoa.c'].map((file) => ({
        source: join(quickjsDir, file),
        flags: ['-w', '-fwrapv']
    })),
    { source: join(nativeDir, 'src', 'engine.c'), flags: ['-Wall', '-Wextra', '-std=c11'] }
];

const objects: string[] = [];
const queue = [...units];
const workers = Array.from({ length: Math.min(availableParallelism(), queue.length) }, async () => {
    for (let unit = queue.shift(); unit !== undefined; unit = queue.shift()) {
        const object = join(buildDir, `${basename(unit.source)}.o`);
        objects.push(object);
        await runAsync(compiler, [...common, ...unit.flags, '-c', unit.source, '-o', object], buildDir);
    }
});
await Promise.all(workers);

const out = resolve(values.out ?? dirname(installedLibraryPath(packageDir, key)));
mkdirSync(out, { recursive: true });
const shared = join(out, sharedLibraryName());

/** The linker flags for this operating system: only the jsh_ interface is exported, and unused sections go. */
const linkFlags = (): string[] => {
    if (process.platform === 'darwin') {
        // The C layer marks the jsh_ functions visible, and -fvisibility=hidden hides the rest.
        return ['-dynamiclib', `-Wl,-install_name,@rpath/${sharedLibraryName()}`, '-Wl,-dead_strip'];
    }
    if (process.platform === 'win32') {
        // JSH_EXPORT marks the jsh_ functions dllexport, so the DLL exports only them. -static links
        // libgcc and winpthreads in, and -s strips the DLL as it is linked.
        return ['-shared', '-static', '-Wl,--gc-sections', ...(values.debug ? [] : ['-s'])];
    }
    // Every symbol binds at load, so a missing one fails loading instead of a later call.
    return ['-shared', `-Wl,--version-script=${join(nativeDir, 'exports.map')}`, '-Wl,--gc-sections', '-Wl,-z,now'];
};
run(compiler, [...linkFlags(), '-o', shared, ...objects.sort(), '-lm', '-lpthread'], buildDir);
if (!values.debug && process.platform === 'darwin') run('strip', ['-x', shared], out);
else if (!values.debug && process.platform !== 'win32') run('strip', ['--strip-unneeded', shared], out);

const report = {
    platform: key,
    sourceHash: nativeSourceHash(packageDir),
    buildType: values.debug ? 'Debug' : 'Release',
    sources: Object.fromEntries(pinned.map((source) => [source.name, source.version])),
    shared: { file: sharedLibraryName(), bytes: statSync(shared).size, sha256: sha256(shared) }
};
writeFileSync(join(out, 'build.json'), `${JSON.stringify(report, null, 4)}\n`);
console.log(JSON.stringify(report, null, 4));
