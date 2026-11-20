---
title: '@jsprismarine/native-network errors'
description: The code, message and meaning of every error @jsprismarine/native-network throws.
group: Documents
category: Errors
---

# @jsprismarine/native-network errors

These are the errors `@jsprismarine/native-network` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.native-network -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class                | What its errors mean                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `NativeLibraryError` | Why the library cannot be loaded, with the platform and what to do about it in the message. |

## `NATIVE_NETWORK_DIGEST_DOES_NOT_MATCH_PUBLISHED_BUILD`

`{path} has SHA-256 {digest}, not the {published} {packageName} publishes for {platform}`

Thrown as `NativeNetworkErrors.DigestDoesNotMatchPublishedBuild`, which extends `NativeLibraryError`.

The native library file is not the build the package publishes, so it was altered or comes
from another version. Reinstall the package.

## `NATIVE_NETWORK_DOWNLOAD_DIGEST_MISMATCH`

`{file} has SHA-256 {digest} and {byteLength} bytes; the manifest expects {sha256} and {bytes}`

Thrown as `NativeNetworkErrors.DownloadDigestMismatch`, which extends `Error`.

The downloaded native library does not match the digest the package publishes, so it was
corrupted in transit or replaced. Retry the install.

## `NATIVE_NETWORK_DOWNLOAD_FAILED`

`{url} answered {status}`

Thrown as `NativeNetworkErrors.DownloadFailed`, which extends `Error`.

Downloading the native networking library failed with that HTTP status. Retry, or point
`JSP_NATIVE_NETWORK_LIBRARY` at a library you built.

## `NATIVE_NETWORK_EVENT_QUEUE_NOT_OPENED`

`The native networking library could not open its event queue ({opened})`

Thrown as `NativeNetworkErrors.EventQueueNotOpened`, which extends `NativeLibraryError`.

The native library could not start its event queue. The number is its error code.

## `NATIVE_NETWORK_FFI_UNAVAILABLE`

`node:ffi is not available in Node.js {version}. Run a Node.js build with FFI support, without --no-experimental-ffi.`

Thrown as `NativeNetworkErrors.FfiUnavailable`, which extends `NativeLibraryError`.

The Node.js running the server has no `node:ffi`, which the native networking library is
loaded with. Run a Node.js build with FFI support, and do not pass `--no-experimental-ffi`.

## `NATIVE_NETWORK_INVALID_NATIVE_MANIFEST`

`` The native manifest needs `build` and `baseUrl` strings ``

Thrown as `NativeNetworkErrors.InvalidNativeManifest`, which extends `Error`.

The package's native manifest is malformed, so the package was published broken. Reinstall
it, or report it.

## `NATIVE_NETWORK_INVALID_NATIVE_MANIFEST_ENTRY`

`The native manifest's entry for {key} is malformed`

Thrown as `NativeNetworkErrors.InvalidNativeManifestEntry`, which extends `Error`.

The package's native manifest has a malformed platform entry, so the package was published
broken. Reinstall it, or report it.

## `NATIVE_NETWORK_LIBDATACHANNEL_CALL_FAILED`

`{what} failed (libdatachannel error {result})`

Thrown as `NativeNetworkErrors.LibdatachannelCallFailed`, which extends `Error`.

A WebRTC call in the native library failed. The error number is libdatachannel's.

## `NATIVE_NETWORK_LIBRARY_DOES_NOT_LOAD`

`The native networking library at {path} does not load on {platform}-{arch}: {value}`

Thrown as `NativeNetworkErrors.LibraryDoesNotLoad`, which extends `NativeLibraryError`.

The operating system refused to load the native networking library, usually because it was
built for another platform or misses a system library. The message ends with the loader's
reason.

## `NATIVE_NETWORK_LIBRARY_INTERFACE_MISMATCH`

`The native networking library at {path} speaks interface {version}; this package needs {abiVersion}`

Thrown as `NativeNetworkErrors.LibraryInterfaceMismatch`, which extends `NativeLibraryError`.

The native library was built for a different version of this package. Reinstall the package
so the two match, or rebuild the library.

## `NATIVE_NETWORK_LIBRARY_NOT_INSTALLED`

`{packageName} has no build for {platform} at {installed}. {advice}`

Thrown as `NativeNetworkErrors.LibraryNotInstalled`, which extends `NativeLibraryError`.

The native networking library for this platform is not installed. The message says how to get
it.

## `NATIVE_NETWORK_LIBRARY_OVERRIDE_MISSING`

`{libraryEnv} names {override}, which does not exist`

Thrown as `NativeNetworkErrors.LibraryOverrideMissing`, which extends `NativeLibraryError`.

The environment variable that overrides the native library points at a file that does not
exist.

## `NATIVE_NETWORK_NO_BUILD_FOR_PLATFORM`

`{packageName} publishes no build for {platform}.`

Thrown as `NativeNetworkErrors.NoBuildForPlatform`, which extends `NativeLibraryError`.

No prebuilt native networking library exists for this platform. Build it from source with
`pnpm --filter

## `NATIVE_NETWORK_NO_PUBLISHED_BUILD_TO_CHECK`

`{path} has SHA-256 {digest}, and {packageName} publishes no build for {platform} to check it against`

Thrown as `NativeNetworkErrors.NoPublishedBuildToCheck`, which extends `NativeLibraryError`.

The native library file has no published digest to check against for this platform, and it
was not built locally either, so it is refused.

## `NATIVE_NETWORK_PEER_CONNECTION_FAILED`

`{message}`

Thrown as `NativeNetworkErrors.PeerConnectionFailed`, which extends `Error`.

The native library reported an error on a peer connection. The message is the library's own.

## `NATIVE_NETWORK_RAKNET_RINGS_NOT_ATTACHED`

`Attaching RakNet's IPv{family} rings failed (error {result})`

Thrown as `NativeNetworkErrors.RaknetRingsNotAttached`, which extends `Error`.

The native library could not share the UDP port with RakNet. The error number is the
library's.

## `NATIVE_NETWORK_SHARED_UDP_PORT_NOT_BOUND`

`UDP port {port} cannot be bound for RakNet and NetherNet together (error {handle})`

Thrown as `NativeNetworkErrors.SharedUdpPortNotBound`, which extends `Error`.

The native library could not bind the UDP port it shares between RakNet and NetherNet,
usually because another process holds the port.
<!-- /fact -->
