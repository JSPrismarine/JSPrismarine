import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { installBuild } from './install';
import { LIBRARY_ENV, localBuildDigest, packageRoot, recordLocalBuild, verifyLibrary } from './library';
import { bundledManifest, sha256 } from './manifest';
import { installedLibraryPath, sharedLibraryName } from './platform';

/**
 * The bytes of a platform's library, for a packager to embed in an executable: the build in the
 * package if it is the published one or a local `build:native`, else the published build,
 * downloaded and checked.
 * @param platform - The platform key the executable is for.
 * @returns The library, or undefined when there is no build for that platform.
 */
export const libraryForPlatform = async (platform: string): Promise<Uint8Array | undefined> => {
    const packageDir = packageRoot();
    const manifest = bundledManifest();
    const path = installedLibraryPath(packageDir, platform);
    if (!existsSync(path)) await installBuild({ packageDir, platform, manifest });
    if (!existsSync(path)) return undefined;
    verifyLibrary(path, platform, manifest);
    return readFileSync(path);
};

/**
 * Writes an embedded library to a cache directory under its digest, and points
 * `JSP_SCRIPT_HOST_LIBRARY` at it, unless the user already set it. An operating system loads
 * a shared library only from a file, so an executable has to write it once; a copy already
 * there with the right digest is used as it is.
 *
 * The digest is recorded beside the file as a local build's is, because {@link libraryForPlatform}
 * checked the bytes when they were embedded. A library built from native sources the manifest
 * does not publish yet would otherwise be refused by the executable it was embedded in.
 * @param library - The embedded bytes.
 * @param cacheDir - A writable directory.
 * @param env - The environment to set the variable in.
 * @returns The file's path.
 */
export const provideEmbeddedLibrary = (
    library: Uint8Array,
    cacheDir: string,
    env: NodeJS.ProcessEnv = process.env
): string => {
    const digest = sha256(library);
    const dir = join(cacheDir, 'script-host', digest);
    const path = join(dir, sharedLibraryName());
    if (!existsSync(path) || sha256(readFileSync(path)) !== digest) {
        mkdirSync(dir, { recursive: true });
        const partial = `${path}.${process.pid}.part`;
        try {
            writeFileSync(partial, library);
            renameSync(partial, path);
        } finally {
            rmSync(partial, { force: true });
        }
    }
    if (localBuildDigest(path) !== digest) recordLocalBuild(path, digest);
    if (env[LIBRARY_ENV] === undefined || env[LIBRARY_ENV] === '') env[LIBRARY_ENV] = path;
    return path;
};
