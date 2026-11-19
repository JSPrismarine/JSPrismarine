/**
 * The packages that ship a native library as prebuilt files on a GitHub release, and what the
 * shared scripts and workflows in this directory need to know about each one. A package keeps its
 * build script, its source hash and the platforms it publishes; this file only points at them.
 *
 * Every script here takes a package's id, a key of {@link NATIVE_PACKAGES}.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { nativeSourceHash as networkSourceHash } from '../../packages/native-network/src/nativeHash.ts';
import { PUBLISHED_PLATFORMS as NETWORK_PLATFORMS } from '../../packages/native-network/src/platform.ts';
import { nativeSourceHash as scriptHostSourceHash } from '../../packages/script-host/src/nativeHash.ts';
import { PUBLISHED_PLATFORMS as SCRIPT_HOST_PLATFORMS } from '../../packages/script-host/src/platform.ts';

/** The repository's root. */
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The compiler a package's Windows build uses, which the workflows set up before building. */
export type WindowsToolchain = 'msvc' | 'mingw';

/** One package that publishes a native library. */
export interface NativePackage {
    /** The npm name. */
    readonly name: string;
    /** The package's directory, relative to the repository's root. */
    readonly dir: string;
    /** The library's file name without its extension, such as `libjsp_native_network`. */
    readonly library: string;
    /** The exported function that returns the library's interface version and takes nothing. */
    readonly abiSymbol: string;
    /** Every platform a release publishes a build for, from the package's `src/platform.ts`. */
    readonly platforms: readonly string[];
    /** The platforms whose runners also run the package's test suite against the build. */
    readonly testPlatforms: readonly string[];
    /** The environment variable that makes the package's tests fail, not skip, without a library. */
    readonly requireEnv: string;
    readonly windowsToolchain: WindowsToolchain;
    /** The system packages a build installs in its container, by image family. */
    readonly containerPackages: { readonly alpine: string; readonly debian: string };
    /** A module script that loads the library from an npm project, exiting non-zero when it fails. */
    readonly loadScript: string;
    /** The hash of the native sources, which names a release of builds. */
    readonly sourceHash: () => string;
}

const PACKAGES = {
    'native-network': {
        name: '@jsprismarine/native-network',
        dir: 'packages/native-network',
        library: 'libjsp_native_network',
        abiSymbol: 'jsp_abi_version',
        platforms: NETWORK_PLATFORMS,
        testPlatforms: ['linux-x64-gnu'],
        requireEnv: 'JSP_NATIVE_NETWORK_REQUIRE',
        windowsToolchain: 'msvc',
        containerPackages: { alpine: 'build-base cmake git perl linux-headers', debian: 'cmake' },
        loadScript:
            "import('@jsprismarine/native-network').then(async (m) => { const n = await m.NativeNetwork.load(); console.log('loaded queue', n.queue); n.close(); }).catch((e) => { console.log(e.message); process.exit(3); })",
        sourceHash: () => networkSourceHash(join(repoRoot, 'packages/native-network'))
    },
    'script-host': {
        name: '@jsprismarine/script-host',
        dir: 'packages/script-host',
        library: 'libjsp_script_host',
        abiSymbol: 'jsh_abi_version',
        platforms: SCRIPT_HOST_PLATFORMS,
        testPlatforms: ['linux-x64-gnu', 'linux-arm64-gnu', 'darwin-arm64', 'win32-x64'],
        requireEnv: 'JSP_SCRIPT_HOST_REQUIRE',
        // Bellard's QuickJS builds with GCC or Clang on a POSIX-like C library, and on Windows
        // only with MinGW-w64: it includes <sys/time.h> and uses pthreads, which MSVC lacks.
        windowsToolchain: 'mingw',
        containerPackages: { alpine: 'build-base git tar xz', debian: '' },
        loadScript:
            "import('@jsprismarine/script-host').then((m) => { const e = m.ScriptHostLibrary.load().createEngine(); console.log('1 + 2 =', e.evaluate('1 + 2')); e.destroy(); }).catch((e) => { console.log(e.message); process.exit(3); })",
        sourceHash: () => scriptHostSourceHash(join(repoRoot, 'packages/script-host'))
    }
} as const satisfies Record<string, NativePackage>;

/** The packages, by id. */
export const NATIVE_PACKAGES: Readonly<Record<keyof typeof PACKAGES, NativePackage>> = PACKAGES;

/** A package id. */
export type NativePackageId = keyof typeof PACKAGES;

/**
 * The package an id names.
 * @param id - A key of {@link NATIVE_PACKAGES}, such as `script-host`.
 * @returns The package.
 * @throws {Error} When no package has that id.
 */
export const nativePackage = (id: string | undefined): NativePackage => {
    const found = Object.entries(NATIVE_PACKAGES).find(([key]) => key === id)?.[1];
    if (found === undefined) {
        throw new Error(`Name a native package: ${Object.keys(NATIVE_PACKAGES).join(', ')} (got ${id})`);
    }
    return found;
};

/** Where a platform's builds run in CI: a GitHub-hosted runner, and for Linux the image to build in. */
export interface PlatformRunner {
    readonly runner: string;
    /** Debian 12 sets the glibc floor at 2.36, and Alpine builds against musl. */
    readonly image?: string;
}

/** The runner for every platform a package may publish. */
export const PLATFORM_RUNNERS: Readonly<Record<string, PlatformRunner>> = {
    'linux-x64-gnu': { runner: 'ubuntu-latest', image: 'node:26-bookworm' },
    'linux-arm64-gnu': { runner: 'ubuntu-24.04-arm', image: 'node:26-bookworm' },
    'linux-x64-musl': { runner: 'ubuntu-latest', image: 'node:26-alpine' },
    'linux-arm64-musl': { runner: 'ubuntu-24.04-arm', image: 'node:26-alpine' },
    'darwin-arm64': { runner: 'macos-latest' },
    'win32-x64': { runner: 'windows-latest' }
};

/**
 * The extension a platform gives a shared library.
 * @param platform - A platform key, such as `win32-x64`, or an operating system, such as `win32`.
 * @returns `dll`, `dylib` or `so`.
 */
export const sharedExtension = (platform: string): string => {
    if (platform.startsWith('win32')) return 'dll';
    if (platform.startsWith('darwin')) return 'dylib';
    return 'so';
};
