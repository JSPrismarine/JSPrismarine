import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { prebuildDir, sharedLibraryName } from './platform';

/** The environment variable that names a library file to load in place of the local build. */
export const LIBRARY_ENV = 'JSP_SCRIPT_HOST_LIBRARY';

/** The npm package's name, as the messages below name it. */
export const PACKAGE_NAME = '@jsprismarine/script-host';

/** The package's root: one level above this file in both `src/` and `dist/`. */
export const packageRoot = (): string => resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Why the library cannot be loaded, with what to do about it in the message. */
export class NativeLibraryError extends Error {
    public override readonly name = 'NativeLibraryError';
}

/**
 * Where the library for this machine is: the file `JSP_SCRIPT_HOST_LIBRARY` names, or the one
 * `build:native` wrote into the package. Finding it builds and downloads nothing.
 * @param env - The environment to read the override from.
 * @param packageDir - The package's directory.
 * @returns The file's path.
 * @throws {NativeLibraryError} When there is no file.
 */
export const locateLibrary = (env: NodeJS.ProcessEnv = process.env, packageDir: string = packageRoot()): string => {
    const override = env[LIBRARY_ENV];
    if (override !== undefined && override !== '') {
        if (!existsSync(override)) {
            throw new NativeLibraryError(`${LIBRARY_ENV} names ${override}, which does not exist`);
        }
        return resolve(override);
    }
    const built = join(prebuildDir(packageDir), sharedLibraryName());
    if (existsSync(built)) return built;
    throw new NativeLibraryError(
        `${PACKAGE_NAME} has no build for ${process.platform}-${process.arch} at ${built}. ` +
            `\`pnpm --filter ${PACKAGE_NAME} run build:native\` builds it, or set ${LIBRARY_ENV} to a build of the library.`
    );
};
