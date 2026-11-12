import pkg from '../package.json' with { type: 'json' };

declare const BUILD_VERSION: string | undefined;

/**
 * The version this server reports: the version a release or nightly build stamped in, or the
 * package version when running from source.
 * @returns {string} The version, without a leading `v`.
 */
export const serverVersion = (): string => (typeof BUILD_VERSION === 'undefined' ? pkg.version : BUILD_VERSION);
