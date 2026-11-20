import { defineErrors, JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';

/** Why the library cannot be loaded, with the platform and what to do about it in the message. */
export abstract class NativeLibraryError extends JSPrismarineError {
    public override name = 'NativeLibraryError';
}

/** The errors `@jsprismarine/native-network` throws. */
export const NativeNetworkErrors = defineErrors('native-network', {
    /**
     * The Node.js running the server has no `node:ffi`, which the native networking library is
     * loaded with. Run a Node.js build with FFI support, and do not pass `--no-experimental-ffi`.
     */
    FfiUnavailable: {
        message:
            'node:ffi is not available in Node.js {version}. Run a Node.js build with FFI support, without --no-experimental-ffi.',
        base: NativeLibraryError
    },
    /**
     * Downloading the native networking library failed with that HTTP status. Retry, or point
     * `JSP_NATIVE_NETWORK_LIBRARY` at a library you built.
     */
    DownloadFailed: '{url} answered {status}',
    /**
     * The native library could not share the UDP port with RakNet. The error number is the
     * library's.
     */
    RaknetRingsNotAttached: "Attaching RakNet's IPv{family} rings failed (error {result})",
    /** A WebRTC call in the native library failed. The error number is libdatachannel's. */
    LibdatachannelCallFailed: '{what} failed (libdatachannel error {result})',
    /**
     * The native networking library for this platform is not installed. The message says how to get
     * it.
     */
    LibraryNotInstalled: {
        message: '{packageName} has no build for {platform} at {installed}. {advice}',
        base: NativeLibraryError
    },
    /**
     * The downloaded native library does not match the digest the package publishes, so it was
     * corrupted in transit or replaced. Retry the install.
     */
    DownloadDigestMismatch:
        '{file} has SHA-256 {digest} and {byteLength} bytes; the manifest expects {sha256} and {bytes}',
    /**
     * The environment variable that overrides the native library points at a file that does not
     * exist.
     */
    LibraryOverrideMissing: {
        message: '{libraryEnv} names {override}, which does not exist',
        base: NativeLibraryError
    },
    /**
     * The package's native manifest has a malformed platform entry, so the package was published
     * broken. Reinstall it, or report it.
     */
    InvalidNativeManifestEntry: "The native manifest's entry for {key} is malformed",
    /**
     * The package's native manifest is malformed, so the package was published broken. Reinstall
     * it, or report it.
     */
    InvalidNativeManifest: 'The native manifest needs `build` and `baseUrl` strings',
    /**
     * The operating system refused to load the native networking library, usually because it was
     * built for another platform or misses a system library. The message ends with the loader's
     * reason.
     */
    LibraryDoesNotLoad: {
        message: 'The native networking library at {path} does not load on {platform}-{arch}: {value}',
        base: NativeLibraryError
    },
    /**
     * The native library was built for a different version of this package. Reinstall the package
     * so the two match, or rebuild the library.
     */
    LibraryInterfaceMismatch: {
        message: 'The native networking library at {path} speaks interface {version}; this package needs {abiVersion}',
        base: NativeLibraryError
    },
    /** The native library could not start its event queue. The number is its error code. */
    EventQueueNotOpened: {
        message: 'The native networking library could not open its event queue ({opened})',
        base: NativeLibraryError
    },
    /**
     * No prebuilt native networking library exists for this platform. Build it from source with
     * `pnpm --filter @jsprismarine/native-network run build:native`.
     */
    NoBuildForPlatform: { message: '{packageName} publishes no build for {platform}.', base: NativeLibraryError },
    /**
     * The native library could not bind the UDP port it shares between RakNet and NetherNet,
     * usually because another process holds the port.
     */
    SharedUdpPortNotBound: 'UDP port {port} cannot be bound for RakNet and NetherNet together (error {handle})',
    /** The native library reported an error on a peer connection. The message is the library's own. */
    PeerConnectionFailed: '{message}',
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
    }
});
