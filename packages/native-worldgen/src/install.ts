import type { InstallOptions, InstallOutcome } from '@jsprismarine/native-library';

import { nativeWorldgenLibrary } from './library';

/**
 * Downloads the build for this machine into the package, once, and checks its SHA-256 against
 * the manifest. It is what the package's `postinstall` runs; loading the library never downloads.
 * @param options - The package and, for tests, the platform, environment and network.
 * @returns What it did.
 */
export const installBuild = (options: InstallOptions): Promise<InstallOutcome> =>
    nativeWorldgenLibrary.install(options);
