import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every platform `build:native` builds the library on and a release publishes a build for, as
 * {@link platformKey} names it. They are the platforms ADR 0006 lists for the native networking
 * library. The Script host workflow builds this list, and a release fails when the manifest lacks
 * one of them.
 */
export const PUBLISHED_PLATFORMS = [
    'darwin-arm64',
    'linux-arm64-gnu',
    'linux-arm64-musl',
    'linux-x64-gnu',
    'linux-x64-musl',
    'win32-x64'
] as const;

/**
 * Whether a release publishes a build for a platform.
 * @param key - A platform key; this machine's by default.
 * @returns True when {@link PUBLISHED_PLATFORMS} lists it.
 */
export const isPublishedPlatform = (key: string = platformKey()): boolean =>
    PUBLISHED_PLATFORMS.some((platform) => platform === key);

/** The C library a Linux build is linked against. */
export type LinuxLibc = 'gnu' | 'musl';

/**
 * Which C library this Linux process runs on. Node.js reports glibc's version in its process
 * report and leaves it out under musl; Bun has no report, so the loader's name decides there.
 * @returns `gnu` or `musl`.
 */
export const linuxLibc = (): LinuxLibc => {
    const report = process.report?.getReport?.();
    // The report's type is not exported, so read it as the plain object it is.
    const header: unknown =
        typeof report === 'object' && report !== null && 'header' in report ? report.header : undefined;
    if (typeof header === 'object' && header !== null && 'glibcVersionRuntime' in header) return 'gnu';
    for (const loader of ['/lib/ld-musl-x86_64.so.1', '/lib/ld-musl-aarch64.so.1']) {
        if (existsSync(loader)) return 'musl';
    }
    try {
        return readFileSync('/usr/bin/ldd', 'latin1').includes('musl') ? 'musl' : 'gnu';
    } catch {
        return 'gnu';
    }
};

/**
 * The key a build of the library is published under, such as `linux-x64-gnu`.
 * @param platform - The operating system, as `process.platform` names it.
 * @param arch - The processor, as `process.arch` names it.
 * @param libc - The C library, for Linux; ignored elsewhere.
 * @returns The key.
 */
export const platformKey = (
    platform: NodeJS.Platform = process.platform,
    arch: string = process.arch,
    libc: LinuxLibc = platform === 'linux' ? linuxLibc() : 'gnu'
): string => (platform === 'linux' ? `linux-${arch}-${libc}` : `${platform}-${arch}`);

/**
 * The operating system a platform key is for.
 * @param key - A key from {@link platformKey}, such as `linux-x64-gnu`.
 * @returns The operating system, as `process.platform` names it.
 */
export const operatingSystemOf = (key: string): NodeJS.Platform => {
    const os = key.slice(0, key.indexOf('-'));
    return os === 'win32' || os === 'darwin' ? os : 'linux';
};

/**
 * The file name of the shared library on an operating system.
 * @param platform - The operating system, as `process.platform` names it.
 * @returns The file name.
 */
export const sharedLibraryName = (platform: NodeJS.Platform = process.platform): string => {
    if (platform === 'win32') return 'libjsp_script_host.dll';
    if (platform === 'darwin') return 'libjsp_script_host.dylib';
    return 'libjsp_script_host.so';
};

/**
 * Where a platform's library goes in the package, whether `build:native` built it or the install
 * script downloaded it.
 * @param packageDir - The package's directory.
 * @param platform - The platform key; this machine's by default.
 * @returns `prebuilds/<platform>/<library>` under it.
 */
export const installedLibraryPath = (packageDir: string, platform: string = platformKey()): string =>
    join(packageDir, 'prebuilds', platform, sharedLibraryName(operatingSystemOf(platform)));
