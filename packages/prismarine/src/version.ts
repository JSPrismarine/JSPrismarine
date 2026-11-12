import pkg from '../package.json' with { type: 'json' };

declare const BUILD_VERSION: string | undefined;

/** The software name this server reports beside its version. */
export const SOFTWARE_NAME = 'JSPrismarine';

/**
 * The version this server reports: the version a release or nightly build stamped in, or the
 * package version when running from source.
 *
 * Reads only the package manifest, so the host process and `--version` can call it without
 * loading the protocol codecs. `about.ts` adds the protocol side.
 * @returns {string} The version, without a leading `v`.
 */
export const serverVersion = (): string => (typeof BUILD_VERSION === 'undefined' ? pkg.version : BUILD_VERSION);

/**
 * The software and its version as every surface names them, such as `JSPrismarine v0.20.0`.
 * @param highlight - Wraps the version in `§e`/`§r`, for the startup log and chat.
 * @returns {string} The software label.
 */
export const softwareLabel = (highlight = false): string =>
    highlight ? `${SOFTWARE_NAME} §ev${serverVersion()}§r` : `${SOFTWARE_NAME} v${serverVersion()}`;
