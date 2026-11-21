import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NativeLibrary } from '@jsprismarine/native-library';
import type { LocateOptions } from '@jsprismarine/native-library';
import type { NativeManifest } from '@jsprismarine/native-library/manifest';

import manifest from '../native/manifest.json' with { type: 'json' };
import { BUILD_SCRIPTS } from './nativeHash';
import { LIBRARY } from './platform';

/** The package's root: one level above this file in both `src/` and `dist/`. */
export const packageRoot = (): string => resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The package's native library: its name, its environment variables and its published builds. */
export const scriptHostLibrary = new NativeLibrary({
    packageName: '@jsprismarine/script-host',
    library: LIBRARY,
    envPrefix: 'JSP_SCRIPT_HOST',
    packageDir: packageRoot(),
    manifest,
    buildScripts: BUILD_SCRIPTS
});

/** The environment variable that names a library file to load in place of the installed build. */
export const LIBRARY_ENV = scriptHostLibrary.libraryEnv;

/** The npm package's name, as the messages name it. */
export const PACKAGE_NAME = scriptHostLibrary.packageName;

/**
 * The manifest this package was built with. It is imported, not read from disk, so a bundled
 * executable carries it.
 */
export const bundledManifest = (): NativeManifest => scriptHostLibrary.bundledManifest();

/**
 * What to tell a user whose install did not fetch the library: the package managers that hold
 * install scripts back, how to let this one run, and the way around it.
 * @param platform - The platform key.
 * @returns The advice, as sentences.
 */
export const approvalAdvice = (platform: string): string => scriptHostLibrary.approvalAdvice(platform);

/**
 * Checks a library file against the digest the manifest publishes for the platform, or the one a
 * local `build:native` recorded beside it.
 * @param path - The file.
 * @param platform - The platform key.
 * @param manifest - The package's manifest.
 * @throws {NativeLibraryError} When neither digest matches.
 */
export const verifyLibrary = (path: string, platform: string, manifest: NativeManifest): void =>
    scriptHostLibrary.verify(path, platform, manifest);

/**
 * Where the library for this machine is, checked against its published digest: the file
 * `JSP_SCRIPT_HOST_LIBRARY` names, or the build the install script or `build:native` put in the
 * package. Finding it builds and downloads nothing.
 * @param options - The environment, package, platform and manifest; the defaults are this process's.
 * @returns The file's path.
 * @throws {NativeLibraryError} When there is no file, or it is neither the published build nor a local one.
 */
export const locateLibrary = (options?: LocateOptions): string => scriptHostLibrary.locate(options);

/**
 * The file name of the shared library on an operating system.
 * @param platform - The operating system, as `process.platform` names it.
 * @returns The file name.
 */
export const sharedLibraryName = (platform?: NodeJS.Platform): string => scriptHostLibrary.sharedLibraryName(platform);

/**
 * Where a platform's library goes in the package, whether `build:native` built it or the install
 * script downloaded it.
 * @param packageDir - The package's directory.
 * @param platform - The platform key; this machine's by default.
 * @returns `prebuilds/<platform>/<library>` under it.
 */
export const installedLibraryPath = (packageDir: string, platform?: string): string =>
    scriptHostLibrary.installedLibraryPath(packageDir, platform);
