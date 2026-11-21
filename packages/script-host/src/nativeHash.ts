// `build:native` and scripts/native/packages.mts load this file with no dependencies installed,
// so it imports nothing.

/**
 * Every file outside `native/` that `build:native` reads, relative to the package: the build
 * script, the list of globals the C layer deletes, the platform names it builds for, and the
 * shared helpers it loads from `@jsprismarine/native-library` by path. A change to any of them
 * can change the built library, so the source hash covers them.
 */
export const BUILD_SCRIPTS = [
    'scripts/build-native.mts',
    'src/absentGlobals.ts',
    'src/nativeHash.ts',
    'src/platform.ts',
    '../native-library/src/nativeHash.ts',
    '../native-library/src/platform.ts'
];
