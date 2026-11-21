import type { InstallOptions, InstallOutcome } from '@jsprismarine/native-library';

import { scriptHostLibrary } from './library';

/** Skips the download, for an install that brings its own library through `JSP_SCRIPT_HOST_LIBRARY`. */
export const SKIP_DOWNLOAD_ENV = scriptHostLibrary.skipDownloadEnv;
/** Downloads from another release host or a directory, such as a mirror or a test's fixtures. */
export const BASE_URL_ENV = scriptHostLibrary.baseUrlEnv;

/**
 * Downloads the build for this machine into the package, once, and checks its SHA-256 against
 * the manifest. It is what the package's `postinstall` runs; loading the library never downloads.
 * @param options - The package and, for tests, the platform, environment and network.
 * @returns What it did.
 */
export const installBuild = (options: InstallOptions): Promise<InstallOutcome> => scriptHostLibrary.install(options);
