import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
 * The key a build of a native library is published under, such as `linux-x64-gnu`.
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

/** Every operating system `process.platform` can name. */
const OPERATING_SYSTEMS = [
    'aix',
    'android',
    'cygwin',
    'darwin',
    'freebsd',
    'haiku',
    'linux',
    'netbsd',
    'openbsd',
    'sunos',
    'win32'
] as const satisfies readonly NodeJS.Platform[];

/**
 * The operating system a platform key is for.
 * @param key - A key from {@link platformKey}, such as `linux-x64-gnu`.
 * @returns The operating system, as `process.platform` names it.
 */
export const operatingSystemOf = (key: string): NodeJS.Platform => {
    const os = key.slice(0, key.indexOf('-'));
    return OPERATING_SYSTEMS.find((platform) => platform === os) ?? 'linux';
};

/**
 * The file name of a shared library on an operating system.
 * @param library - The library's name without its extension, such as `libjsp_native_network`.
 * @param platform - The operating system, as `process.platform` names it.
 * @returns The file name.
 */
export const sharedLibraryFile = (library: string, platform: NodeJS.Platform = process.platform): string => {
    if (platform === 'win32') return `${library}.dll`;
    if (platform === 'darwin') return `${library}.dylib`;
    return `${library}.so`;
};

/**
 * The file name of the static archive a scriptc build links.
 * @param library - The library's name without its extension.
 * @param platform - The operating system, as `process.platform` names it.
 * @returns The file name.
 */
export const staticLibraryFile = (library: string, platform: NodeJS.Platform = process.platform): string =>
    platform === 'win32' ? `${library}.lib` : `${library}.a`;

/**
 * Where a platform's library goes in its package, whether `build:native` built it or the install
 * script downloaded it.
 * @param packageDir - The package's directory.
 * @param platform - The platform key.
 * @param library - The library's name without its extension.
 * @returns `prebuilds/<platform>/<library file>` under it.
 */
export const installedLibraryFile = (packageDir: string, platform: string, library: string): string =>
    join(packageDir, 'prebuilds', platform, sharedLibraryFile(library, operatingSystemOf(platform)));
