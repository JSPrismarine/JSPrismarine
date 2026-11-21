import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';
import { NativeLibraryError } from '@jsprismarine/errors/native-library';

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
     * The native library could not share the UDP port with RakNet. The error number is the
     * library's.
     */
    RaknetRingsNotAttached: "Attaching RakNet's IPv{family} rings failed (error {result})",
    /** A WebRTC call in the native library failed. The error number is libdatachannel's. */
    LibdatachannelCallFailed: '{what} failed (libdatachannel error {result})',
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
     * The native library could not bind the UDP port it shares between RakNet and NetherNet,
     * usually because another process holds the port.
     */
    SharedUdpPortNotBound: 'UDP port {port} cannot be bound for RakNet and NetherNet together (error {handle})',
    /** The native library reported an error on a peer connection. The message is the library's own. */
    PeerConnectionFailed: '{message}'
});
