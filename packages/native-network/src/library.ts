import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { platformKey, sharedLibraryName } from './platform';

/** The environment variable that names a library file to load in place of the installed build. */
export const LIBRARY_ENV = 'JSP_NATIVE_NETWORK_LIBRARY';

/** The package's root: two levels above this file in both `src/` and `dist/`. */
export const packageRoot = (): string => resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Why the library cannot be loaded, with the platform and what to do about it in the message. */
export class NativeLibraryError extends Error {
    public override readonly name = 'NativeLibraryError';

    /**
     * @param message - What went wrong and what to do.
     * @param options - The underlying error, when there is one.
     */
    public constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
    }
}

/**
 * Where the library for this machine is: the file `JSP_NATIVE_NETWORK_LIBRARY` names, or the
 * package's build for the platform. Finding it downloads nothing.
 * @param env - The environment to read the override from.
 * @returns The file's path.
 * @throws {NativeLibraryError} When there is no file to load.
 */
export const locateLibrary = (env: NodeJS.ProcessEnv = process.env): string => {
    const override = env[LIBRARY_ENV];
    if (override !== undefined && override !== '') {
        if (!existsSync(override)) {
            throw new NativeLibraryError(`${LIBRARY_ENV} names ${override}, which does not exist`);
        }
        return resolve(override);
    }

    const key = platformKey();
    const installed = join(packageRoot(), 'prebuilds', key, sharedLibraryName());
    if (existsSync(installed)) return installed;
    throw new NativeLibraryError(
        `@jsprismarine/native-network has no build for ${key} at ${installed}. ` +
            `Build it with \`pnpm --filter @jsprismarine/native-network run build:native\`, ` +
            `or point ${LIBRARY_ENV} at a build.`
    );
};
