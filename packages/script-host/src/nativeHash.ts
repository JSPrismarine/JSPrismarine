// `build:native` and scripts/native/packages.mts load this file with no dependencies installed,
// so it imports nothing.

/**
 * Every file outside `native/` whose text can change what `build:native` builds, relative to the
 * package: the build script, the list of globals the C layer deletes, and the library's name and
 * the platforms it builds for. The source hash covers them, and every change it sees publishes new
 * builds.
 *
 * The build also imports this file and `@jsprismarine/native-library`'s `nativeHash.ts` and
 * `platform.ts`, which are left out on purpose. The first two only compute the hash, and the hash
 * covers what the shared naming helpers in `platform.ts` answer rather than their text, so an
 * edit to them that leaves the builds alone opens no manifest pull request.
 */
export const BUILD_SCRIPTS = ['scripts/build-native.mts', 'src/absentGlobals.ts', 'src/platform.ts'];
