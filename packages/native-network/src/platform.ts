// `build:native` and scripts/native/packages.mts load this file with no dependencies installed,
// so it imports nothing.

/**
 * Every platform a release publishes a build for, as `platformKey` names it. Android is a
 * stretch goal and not listed. The Native network workflow builds this list, and a release fails
 * when the manifest lacks one of them.
 */
export const PUBLISHED_PLATFORMS = [
    'darwin-arm64',
    'linux-arm64-gnu',
    'linux-arm64-musl',
    'linux-x64-gnu',
    'linux-x64-musl',
    'win32-x64'
] as const;

/** The library's file name without its extension. */
export const LIBRARY = 'libjsp_native_network';
