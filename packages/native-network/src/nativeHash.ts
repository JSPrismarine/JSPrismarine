import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/** Every file the native build reads, relative to the package, sorted: `native/` but its manifest, and the build script. */
const buildInputs = (packageDir: string): string[] => {
    const files: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (entry.name !== 'manifest.json') files.push(relative(packageDir, path).split(sep).join('/'));
        }
    };
    walk(join(packageDir, 'native'));
    files.push('scripts/build-native.mts');
    return files.sort();
};

/**
 * Whether a package directory holds the native sources, which a checkout does and a published
 * package does not.
 * @param packageDir - The package's directory.
 * @returns True in a checkout.
 */
export const hasNativeSources = (packageDir: string): boolean => existsSync(join(packageDir, 'native', 'sources.json'));

/**
 * The hash that names a build of the native library. A release of builds is tagged with it, and
 * the manifest records the hash its builds were made from, so a checkout can tell whether its
 * native sources still match the published builds.
 * @param packageDir - The package's directory, holding `native/`.
 * @returns The first 16 hex digits of the SHA-256 over the build's inputs.
 */
export const nativeSourceHash = (packageDir: string): string => {
    const hash = createHash('sha256');
    for (const file of buildInputs(packageDir)) {
        // Line endings are normalized, so a Windows checkout hashes the same.
        const text = readFileSync(join(packageDir, file), 'utf8').replace(/\r\n/g, '\n');
        hash.update(file).update('\0').update(text).update('\0');
    }
    return hash.digest('hex').slice(0, 16);
};

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
