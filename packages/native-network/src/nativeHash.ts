import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

// `build:native` and scripts/native/packages.mts load this file with no dependencies installed,
// so it imports only Node.js modules.

/**
 * Every file outside `native/` whose text can change what `build:native` builds, relative to the
 * package: the build script, and the library's name and the platforms it builds for. The source
 * hash covers them, and every change it sees publishes new builds.
 *
 * The build also imports this file and `@jsprismarine/native-library`'s `nativeHash.ts` and
 * `platform.ts`, which are left out on purpose. This file computes the hash and picks the CMake
 * build directory, `nativeHash.ts` computes the hash, and the hash covers what the shared naming
 * helpers in `platform.ts` answer rather than their text, so an edit to them that leaves the
 * builds alone opens no manifest pull request.
 */
export const BUILD_SCRIPTS = ['scripts/build-native.mts', 'src/platform.ts'];

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
