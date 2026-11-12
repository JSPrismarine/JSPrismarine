import os from 'node:os';

/**
 * The host the server runs on, as `node:os` describes it, the same for every provider. A provider
 * that needs another form, such as Java's `os.name`, maps these fields itself.
 */
export interface StatsPlatform {
    /** The operating system name, from `os.type()`, such as `Linux`, `Darwin` or `Windows_NT`. */
    readonly type: string;
    /** The kernel release, from `os.release()`, such as `6.1.0` or `23.5.0`. */
    readonly release: string;
    /** The kernel or product version, from `os.version()`, such as `Windows 11 Pro`. */
    readonly version: string;
    /** The CPU architecture, from `os.arch()`, such as `x64`. */
    readonly arch: string;
    /** The CPUs the process may use, from `os.availableParallelism()`. */
    readonly coreCount: number;
    /** The host's memory from `os.totalmem()`, rounded to whole gigabytes (1024³ bytes). */
    readonly memoryGb: number;
}

const BYTES_PER_GB = 1024 ** 3;

/**
 * Reads the host description from `node:os`.
 * @returns The current platform fields.
 */
export const readPlatform = (): StatsPlatform => ({
    type: os.type(),
    release: os.release(),
    version: os.version(),
    arch: os.arch(),
    coreCount: os.availableParallelism(),
    memoryGb: Math.round(os.totalmem() / BYTES_PER_GB)
});
