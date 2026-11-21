import type { InstallOptions, InstallOutcome } from '@jsprismarine/native-library';

import { nativeNetworkLibrary } from './library';
import { platformKey } from '@jsprismarine/native-library/platform';

/** Skips the download, for an install that brings its own library through `JSP_NATIVE_NETWORK_LIBRARY`. */
export const SKIP_DOWNLOAD_ENV = nativeNetworkLibrary.skipDownloadEnv;
/** Downloads from another release host or a directory, such as a mirror or a test's fixtures. */
export const BASE_URL_ENV = nativeNetworkLibrary.baseUrlEnv;

/**
 * Where the build for a platform is installed in the package.
 * @param packageDir - The package's directory.
 * @param platform - The platform key; this machine's by default.
 * @returns The library's path.
 */
export const installedLibraryPath = (packageDir: string, platform: string = platformKey()): string =>
    nativeNetworkLibrary.installedLibraryPath(packageDir, platform);

/**
 * Downloads the build for this machine into the package, once, and checks its SHA-256 against
 * the manifest. It is what the package's `postinstall` runs; loading the library never downloads.
 * @param options - The package and, for tests, the platform, environment and network.
 * @returns What it did.
 */
export const installBuild = (options: InstallOptions): Promise<InstallOutcome> => nativeNetworkLibrary.install(options);
