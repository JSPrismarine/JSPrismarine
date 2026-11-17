import { join } from 'node:path';

/**
 * The operating systems `build:native` builds the library on. Prebuilt libraries for the rest
 * are [#3215](https://github.com/JSPrismarine/JSPrismarine/issues/3215).
 */
export const NATIVE_BUILD_PLATFORMS: readonly NodeJS.Platform[] = ['linux'];

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
 * The directory `build:native` writes this machine's build to.
 * @param packageDir - The package's directory.
 * @returns `prebuilds/<platform>-<arch>` under it.
 */
export const prebuildDir = (packageDir: string): string =>
    join(packageDir, 'prebuilds', `${process.platform}-${process.arch}`);
