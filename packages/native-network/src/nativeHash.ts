import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

// `build:native` and scripts/native/packages.mts load this file with no dependencies installed,
// so it imports only Node.js modules.

/**
 * Every file outside `native/` that `build:native` reads, relative to the package: the build
 * script and each module it imports, including the shared helpers it loads from
 * `@jsprismarine/native-library` by path. A change to any of them can change the built library,
 * so the source hash covers them.
 */
export const BUILD_SCRIPTS = [
    'scripts/build-native.mts',
    'src/nativeHash.ts',
    'src/platform.ts',
    '../native-library/src/nativeHash.ts',
    '../native-library/src/platform.ts'
];

/** The options that pick a native build's CMake build directory. */
export interface NativeBuildDirOptions {
    /** The shared cache that holds the build directories. */
    cacheDir: string;
    /** The checkout's `native/` directory, which CMake configures from. */
    nativeDir: string;
    /** The key of the unpacked source tree. */
    treeKey: string;
    /** The platform key, such as `linux-x64-gnu`. */
    platform: string;
    /** The TLS library. */
    tls: string;
    /** Whether the build is a debug build. */
    debug: boolean;
}

/**
 * The CMake build directory for a native build. Linked worktrees share one cache, and CMake
 * records the absolute source directory in a build directory and refuses to configure it from
 * another, so the name holds a hash of the checkout's resolved `native/` path beside the source
 * tree's key. Downloads and unpacked sources stay shared between checkouts.
 * @param options - The cache, checkout and build configuration.
 * @returns The build directory's path.
 */
export const nativeBuildDir = ({
    cacheDir,
    nativeDir,
    treeKey,
    platform,
    tls,
    debug
}: NativeBuildDirOptions): string => {
    const checkout = createHash('sha256').update(resolve(nativeDir)).digest('hex').slice(0, 8);
    return join(cacheDir, `build-${treeKey}-${checkout}-${platform}-${tls}${debug ? '-debug' : ''}`);
};
