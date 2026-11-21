// `build:native` and scripts/native/packages.mts load this file with no dependencies installed,
// so it imports nothing.

/**
 * Every platform `build:native` builds the library on and a release publishes a build for, as
 * `platformKey` names it: the platforms the other native packages publish. The Native worldgen
 * workflow builds this list, and a release fails when the manifest lacks one of them.
 */
export const PUBLISHED_PLATFORMS = [
    'darwin-arm64',
    'linux-arm64-gnu',
    'linux-arm64-musl',
    'linux-x64-gnu',
    'linux-x64-musl',
    'win32-x64'
] as const;

/**
 * Whether a release publishes a build for a platform.
 * @param key - A platform key, such as `platformKey()` gives.
 * @returns True when {@link PUBLISHED_PLATFORMS} lists it.
 */
export const isPublishedPlatform = (key: string): boolean => PUBLISHED_PLATFORMS.some((platform) => platform === key);

/** The library's file name without its extension. */
export const LIBRARY = 'libjsp_native_worldgen';
