import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NativeLibrary } from '@jsprismarine/native-library';
import type { LocateOptions } from '@jsprismarine/native-library';

import manifest from '../native/manifest.json' with { type: 'json' };
import { BUILD_SCRIPTS } from './nativeHash';
import { LIBRARY } from './platform';

/** The package's root: one level above this file in both `src/` and `dist/`. */
export const packageRoot = (): string => resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The package's native library: its name, its environment variables and its published builds. */
export const nativeWorldgenLibrary = new NativeLibrary({
    packageName: '@jsprismarine/native-worldgen',
    library: LIBRARY,
    envPrefix: 'JSP_NATIVE_WORLDGEN',
    packageDir: packageRoot(),
    manifest,
    buildScripts: BUILD_SCRIPTS
});

/** The environment variable that names a library file to load in place of the installed build. */
export const LIBRARY_ENV = nativeWorldgenLibrary.libraryEnv;

/**
 * Where the library for this machine is, checked against its published digest: the file
 * `JSP_NATIVE_WORLDGEN_LIBRARY` names, or the build the install script or `build:native` put in
 * the package. Finding it builds and downloads nothing.
 * @param options - The environment, package, platform and manifest; the defaults are this process's.
 * @returns The file's path.
 * @throws {NativeLibraryError} When there is no file, or it is neither the published build nor a local one.
 */
export const locateLibrary = (options?: LocateOptions): string => nativeWorldgenLibrary.locate(options);
