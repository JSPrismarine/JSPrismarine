import { existsSync, readFileSync } from 'node:fs';

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
 * The key a build of the native library is published under, such as `linux-x64-gnu`.
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
 * The file name of the shared library on an operating system.
 * @param platform - The operating system, as `process.platform` names it.
 * @returns The file name.
 */
export const sharedLibraryName = (platform: NodeJS.Platform = process.platform): string => {
    if (platform === 'win32') return 'libjsp_native_network.dll';
    if (platform === 'darwin') return 'libjsp_native_network.dylib';
    return 'libjsp_native_network.so';
};

/**
 * The file name of the static archive the scriptc build links.
 * @param platform - The operating system, as `process.platform` names it.
 * @returns The file name.
 */
export const staticLibraryName = (platform: NodeJS.Platform = process.platform): string =>
    platform === 'win32' ? 'jsp_native_network.lib' : 'libjsp_native_network.a';
