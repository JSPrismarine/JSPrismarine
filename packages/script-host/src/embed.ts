import { scriptHostLibrary } from './library';

/**
 * The bytes of a platform's library, for a packager to embed in an executable: the build in the
 * package if it is the published one or a local `build:native`, else the published build,
 * downloaded and checked.
 * @param platform - The platform key the executable is for.
 * @returns The library, or undefined when there is no build for that platform.
 */
export const libraryForPlatform = (platform: string): Promise<Uint8Array | undefined> =>
    scriptHostLibrary.forPlatform(platform);

/**
 * Writes an embedded library to a cache directory under its digest, and points
 * `JSP_SCRIPT_HOST_LIBRARY` at it, unless the user already set it. An operating system loads
 * a shared library only from a file, so an executable has to write it once.
 * @param library - The embedded bytes.
 * @param cacheDir - A writable directory.
 * @param env - The environment to set the variable in.
 * @returns The file's path.
 */
export const provideEmbeddedLibrary = (library: Uint8Array, cacheDir: string, env?: NodeJS.ProcessEnv): string =>
    scriptHostLibrary.provideEmbedded(library, cacheDir, env);
