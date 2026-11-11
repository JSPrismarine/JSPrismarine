/**
 * Builds the native networking library for this machine from pinned sources.
 *
 * Downloads every source in `native/sources.json` into the shared cache, checks its SHA-256,
 * unpacks it, applies the patches, and runs CMake. The shared library and the static archive land
 * in `prebuilds/<platform>/`, with a `build.json` that records their sizes and digests.
 *
 * Needs CMake 3.20 or newer (`CMAKE` names another one) and a C and C++ compiler. With
 * `--tls openssl` it also builds OpenSSL, which needs Perl and make.
 *
 *     node scripts/build-native.mts [--tls mbedtls|openssl] [--out <dir>] [--debug]
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync
} from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';

import { nativeSourceHash } from '../src/nativeHash.ts';
import { platformKey, sharedLibraryName, staticLibraryName } from '../src/platform.ts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nativeDir = join(packageDir, 'native');
const cacheDir = resolve(packageDir, '../../node_modules/.cache/jsprismarine/native-network');

interface Source {
    version: string;
    url: string;
    sha256: string;
    into: string;
    patches?: string[];
    optional?: boolean;
}

const { values } = parseArgs({
    options: {
        tls: { type: 'string', default: 'mbedtls' },
        out: { type: 'string' },
        debug: { type: 'boolean', default: false }
    }
});
const tls = values.tls;
if (tls !== 'mbedtls' && tls !== 'openssl') throw new Error(`--tls must be mbedtls or openssl, not ${tls}`);

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

/**
 * The `tar` to unpack with. On Windows it is the system's bsdtar: Git's GNU tar, which is often
 * first on the path there, reads `C:\…` as a remote host and fails.
 */
const tarCommand = (): string =>
    process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

const sha256 = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

/** Downloads a source once into the cache and checks its digest every time. */
const download = async (source: Source & { name: string }): Promise<string> => {
    const extension = source.url.endsWith('.tar.bz2') ? '.tar.bz2' : '.tar.gz';
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

/** Whether a build with this TLS library needs a source. */
const needed = (source: Source & { name: string }): boolean => !source.optional || source.name === tls;

const unpack = async (): Promise<void> => {
    for (const source of pinned.filter(needed)) {
        // A marker per source, so a later build that needs an optional one adds it to the tree.
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

/** Builds OpenSSL's static libraries into the cache, for the size comparison with Mbed TLS. */
const buildOpenSsl = (): string => {
    const prefix = join(cacheDir, `openssl-install-${treeKey}`);
    if (existsSync(join(prefix, 'lib', 'libssl.a'))) return prefix;
    const source = join(sourcesDir, 'openssl');
    run(
        'perl',
        [
            './Configure',
            `--prefix=${prefix}`,
            '--libdir=lib',
            'no-shared',
            'no-tests',
            'no-docs',
            'no-apps',
            'no-module',
            'no-legacy',
            'no-engine',
            'no-comp',
            'no-quic',
            '-fPIC'
        ],
        source
    );
    run('make', [`-j${cpus().length}`], source);
    run('make', ['install_sw'], source);
    return prefix;
};

await unpack();
const key = platformKey();
const out = resolve(values.out ?? join(packageDir, 'prebuilds', tls === 'mbedtls' ? key : `${key}-${tls}`));
const buildDir = join(cacheDir, `build-${treeKey}-${key}-${tls}${values.debug ? '-debug' : ''}`);
const cmake = process.env.CMAKE ?? 'cmake';
const buildType = values.debug ? 'Debug' : 'Release';

const configure = [
    '-S',
    nativeDir,
    '-B',
    buildDir,
    `-DCMAKE_BUILD_TYPE=${buildType}`,
    `-DJSP_SOURCES_DIR=${sourcesDir}`,
    `-DJSP_TLS=${tls}`
];
if (tls === 'openssl') configure.push(`-DJSP_OPENSSL_ROOT=${buildOpenSsl()}`);
run(cmake, configure, packageDir);
run(
    cmake,
    [
        '--build',
        buildDir,
        '--config',
        buildType,
        '--parallel',
        String(cpus().length),
        '--target',
        'jsp_native_network',
        'jsp_native_network_static',
        'datachannel-static'
    ],
    packageDir
);

/** Finds a built file by name anywhere under the build directory. */
const findBuilt = (names: string[]): string => {
    const stack = [buildDir];
    while (stack.length > 0) {
        const dir = stack.pop()!;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) stack.push(path);
            else if (names.includes(entry.name) && dir.split(/[\\/]/).every((part) => part !== 'libdatachannel')) {
                return path;
            }
        }
    }
    throw new Error(`None of ${names.join(', ')} was built under ${buildDir}`);
};

mkdirSync(out, { recursive: true });
const shared = join(out, sharedLibraryName());
copyFileSync(findBuilt([sharedLibraryName(), 'jsp_native_network.dll']), shared);
if (process.platform !== 'win32' && process.platform !== 'darwin' && !values.debug) {
    run('strip', ['--strip-unneeded', shared], out);
}
// The scriptc build links one archive, so the C layer's archive and every one it depends on are
// merged into it.
const archive = join(out, staticLibraryName());
const findArchive = (stem: string): string => {
    const names = process.platform === 'win32' ? [`${stem}.lib`] : [`lib${stem}.a`];
    const stack = [buildDir];
    while (stack.length > 0) {
        const dir = stack.pop()!;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) stack.push(path);
            else if (names.includes(entry.name)) return path;
        }
    }
    throw new Error(`No ${names.join(' or ')} under ${buildDir}`);
};
const archives = [
    findBuilt(['libjsp_native_network_static.a', 'jsp_native_network_static.lib']),
    ...['datachannel-static', 'juice-static', 'usrsctp'].map(findArchive),
    ...(tls === 'mbedtls'
        ? ['mbedtls', 'mbedx509', 'mbedcrypto'].map(findArchive)
        : ['libssl.a', 'libcrypto.a'].map((name) => join(cacheDir, `openssl-install-${treeKey}`, 'lib', name)))
];
rmSync(archive, { force: true });
if (process.platform === 'win32') {
    run('lib.exe', ['/NOLOGO', `/OUT:${archive}`, ...archives], out);
} else if (process.platform === 'darwin') {
    run('libtool', ['-static', '-o', archive, ...archives], out);
} else {
    const script = join(buildDir, 'merge.mri');
    writeFileSync(script, `CREATE ${archive}\n${archives.map((path) => `ADDLIB ${path}`).join('\n')}\nSAVE\nEND\n`);
    const merged = spawnSync('ar', ['-M'], { input: readFileSync(script), stdio: ['pipe', 'inherit', 'inherit'] });
    if (merged.status !== 0) throw new Error(`ar -M exited with ${merged.status}`);
}

const describe = (file: string) => ({
    file: file.slice(out.length + 1),
    bytes: statSync(file).size,
    gzipBytes: gzipSync(readFileSync(file), { level: 9 }).byteLength,
    sha256: sha256(file)
});
const report = {
    platform: key,
    sourceHash: nativeSourceHash(packageDir),
    tls,
    buildType,
    sources: Object.fromEntries(pinned.map((source) => [source.name, source.version])),
    shared: describe(shared),
    static: describe(archive)
};
writeFileSync(join(out, 'build.json'), `${JSON.stringify(report, null, 4)}\n`);
console.log(JSON.stringify(report, null, 4));
