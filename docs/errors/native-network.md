---
title: '@jsprismarine/native-network errors'
description: The code, message and meaning of every error @jsprismarine/native-network throws.
group: Documents
category: Errors
---

# @jsprismarine/native-network errors

These are the errors `@jsprismarine/native-network` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.native-network -->
## `NATIVE_NETWORK_EVENT_QUEUE_NOT_OPENED`

`The native networking library could not open its event queue ({opened})`

Thrown as `NativeNetworkErrors.EventQueueNotOpened`, which extends `NativeLibraryError`.

The native library could not start its event queue. The number is its error code.

## `NATIVE_NETWORK_FFI_UNAVAILABLE`

`node:ffi is not available in Node.js {version}. Run a Node.js build with FFI support, without --no-experimental-ffi.`

Thrown as `NativeNetworkErrors.FfiUnavailable`, which extends `NativeLibraryError`.

The Node.js running the server has no `node:ffi`, which the native networking library is
loaded with. Run a Node.js build with FFI support, and do not pass `--no-experimental-ffi`.

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
