import pkg from '../package.json' with { type: 'json' };

declare const BUILD_VERSION: string | undefined;
declare const BUILD_TYPE: string | undefined;
/** True in the package's `vite build` output when CI made it, which is the code npm installs. */
declare const BUILD_DIST: boolean | undefined;
declare const BUILD_UPDATE_SOURCE: string | undefined;

/** The software name this server reports beside its version. */
export const SOFTWARE_NAME = 'JSPrismarine';

/** The values a build stamps in. Each is undefined in a server run from source. */
export interface BuildDefines {
    /** `BUILD_VERSION`, the version a release or nightly build stamped in. */
    readonly version?: string | undefined;
    /** `BUILD_TYPE`, which a release or nightly executable build stamps in. */
    readonly type?: string | undefined;
    /** `BUILD_DIST`, true in the package build CI makes for npm. */
    readonly dist?: boolean | undefined;
    /**
     * `BUILD_UPDATE_SOURCE`, where a release or nightly executable reads the update feed: the site
     * for JSPrismarine's builds, the fork's `owner/repo` for a fork's.
     */
    readonly updateSource?: string | undefined;
}

/**
 * The values this build stamped in, read from the globals the build defines.
 * @returns {BuildDefines} The stamped values.
 */
export const buildDefines = (): BuildDefines => ({
    version: typeof BUILD_VERSION === 'undefined' ? undefined : BUILD_VERSION,
    type: typeof BUILD_TYPE === 'undefined' ? undefined : BUILD_TYPE,
    dist: typeof BUILD_DIST === 'undefined' ? undefined : BUILD_DIST,
    updateSource: typeof BUILD_UPDATE_SOURCE === 'undefined' ? undefined : BUILD_UPDATE_SOURCE
});

/**
 * The version this server reports: the version a release or nightly build stamped in, or the
 * package version when running from source.
 *
 * Reads only the package manifest, so the host process and `--version` can call it without
 * loading the protocol codecs. `about.ts` adds the protocol side.
 * @param build - The stamped values, this build's by default.
 * @returns {string} The version, without a leading `v`.
 */
export const serverVersion = (build: BuildDefines = buildDefines()): string => build.version ?? pkg.version;

/** How a server was built: `release` or `nightly` for a built server, `dev` from source. */
export type BuildType = 'dev' | 'nightly' | 'release';

/**
 * The `BUILD_TYPE` a release or nightly executable build stamps in, through
 * `.github/scripts/set-build-metadata.mjs`. The npm package carries no stamp.
 * @param build - The stamped values, this build's by default.
 * @returns {'nightly' | 'release' | undefined} The stamp, or undefined when there is none.
 */
export const buildStamp = ({ type }: BuildDefines = buildDefines()): 'nightly' | 'release' | undefined =>
    type === 'release' || type === 'nightly' ? type : undefined;

/**
 * The build type of a package build at a version: `nightly` for a prerelease, such as the npm
 * `unstable` snapshots (`0.21.0-unstable-20261112121906`), and `release` otherwise.
 * @param version - The package version the build was made at.
 * @returns {'nightly' | 'release'} The build type.
 */
export const packageBuildType = (version: string): 'nightly' | 'release' =>
    version.includes('-') ? 'nightly' : 'release';

/**
 * How this server was built. An executable carries a {@link buildStamp}. The npm package has
 * none, so its version decides, as {@link packageBuildType} reads it. A checkout is neither, and
 * is `dev`, whether it runs from source or from a build made on that machine.
 * @param build - The stamped values, this build's by default.
 * @returns {BuildType} The build type.
 */
export const buildType = (build: BuildDefines = buildDefines()): BuildType => {
    const stamp = buildStamp(build);
    if (stamp !== undefined) return stamp;
    if (build.dist) return packageBuildType(serverVersion(build));
    return 'dev';
};

/**
 * The software and its version as every surface names them, such as `JSPrismarine v0.20.0`.
 * @param highlight - Wraps the version in `§e`/`§r`, for the startup log and chat.
 * @returns {string} The software label.
 */
export const softwareLabel = (highlight = false): string =>
    highlight ? `${SOFTWARE_NAME} §ev${serverVersion()}§r` : `${SOFTWARE_NAME} v${serverVersion()}`;
