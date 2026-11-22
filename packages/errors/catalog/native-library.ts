import { JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { defineErrors } from './defineErrors';

/**
 * Why a package's native library cannot be loaded, with the platform and what to do about it in
 * the message. Every package that loads a native library throws its loading errors with this base.
 */
export abstract class NativeLibraryError extends JSPrismarineError {
    public override name = 'NativeLibraryError';
}

/**
 * The errors `@jsprismarine/native-library` throws while it finds, checks and installs a package's
 * prebuilt native library. Each message names the package.
 */
export const NativeLibraryErrors = defineErrors('native-library', {
    /**
     * The Node.js running the server has no `node:ffi`, which native libraries are loaded with. Run
     * a Node.js build with FFI support, and do not pass `--no-experimental-ffi`.
     */
    FfiUnavailable: {
        message:
            'node:ffi is not available in Node.js {version}. Run a Node.js build with FFI support, without --no-experimental-ffi.',
        base: NativeLibraryError
    },
    /**
     * Downloading a package's native library failed with that HTTP status. Retry, or point the
     * package's `_LIBRARY` environment variable at a library you built.
     */
    DownloadFailed: '{url} answered {status}',
    /**
     * The downloaded native library does not match the digest the package publishes, so it was
     * corrupted in transit or replaced. Retry the install.
     */
    DownloadDigestMismatch:
        '{file} has SHA-256 {digest} and {byteLength} bytes; the manifest expects {sha256} and {bytes}',
    /**
     * The package's native library for this platform is not installed: its install script has not
     * run, or in a checkout, `build:native` has not. The message says how to get it.
     */
    LibraryNotInstalled: {
        message: '{packageName} has no build for {platform} at {installed}. {advice}',
        base: NativeLibraryError
    },
    /**
     * The environment variable that overrides a package's native library names a file that does
     * not exist. Point it at a build of the library, or unset it to use the installed one.
     */
    LibraryOverrideMissing: {
        message: '{libraryEnv} names {override}, which does not exist',
        base: NativeLibraryError
    },
    /**
     * The package publishes no prebuilt native library for this platform. Build it from a checkout
     * with the package's `build:native` script and point its `_LIBRARY` environment variable at it.
     */
    NoBuildForPlatform: { message: '{packageName} publishes no build for {platform}.', base: NativeLibraryError },
    /**
     * The native library file has no published digest to check against for this platform, and it
     * was not built locally either, so it is refused.
     */
    NoPublishedBuildToCheck: {
        message: '{path} has SHA-256 {digest}, and {packageName} publishes no build for {platform} to check it against',
        base: NativeLibraryError
    },
    /**
     * The native library file is not the build the package publishes, so it was altered or comes
     * from another version. Reinstall the package.
     */
    DigestDoesNotMatchPublishedBuild: {
        message: '{path} has SHA-256 {digest}, not the {published} {packageName} publishes for {platform}',
        base: NativeLibraryError
    },
    /**
     * The package's native manifest is malformed, so the package was published broken. Reinstall
     * it, or report it.
     */
    InvalidNativeManifest: {
        message: 'The native manifest needs `build` and `baseUrl` strings',
        base: NativeLibraryError
    },
    /**
     * The package's native manifest has a malformed platform entry, so the package was published
     * broken. Reinstall it, or report it.
     */
    InvalidNativeManifestEntry: {
        message: "The native manifest's entry for {key} is malformed",
        base: NativeLibraryError
    }
});
