# @jsprismarine/native-network

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/native-network)](https://www.npmjs.com/package/@jsprismarine/native-network)

JSPrismarine's networking in native code. It holds one library, built from pinned sources, and the
TypeScript that binds it:

- `PeerConnection` and `DataChannel`, WebRTC on
  [libdatachannel](https://github.com/paullouisageneau/libdatachannel) with Mbed TLS, built without
  media or WebSocket support. `@jsprismarine/nethernet` runs NetherNet on them.
- `SharedPort`, a UDP port that RakNet and NetherNet share. libjuice, libdatachannel's ICE library,
  owns the socket, and the library sorts each datagram by its bytes before libjuice looks it up:
  RakNet's datagrams go to RakNet through shared-memory rings, and WebRTC's stay in native code.
  [ADR 0008](../../docs/adr/0008-shared-udp-port-in-native-code.md) has the design.

## How it is called

The library has a flat C interface, `native/include/jsp_native_network.h`. Node.js binds it with
`node:ffi` and Bun with `bun:ffi`. Every call is synchronous, and native code never calls into
JavaScript:

- libdatachannel's threads queue their events in native memory. When the queue stops being empty,
  the library sends one byte to a UDP socket on `127.0.0.1` that `NativeNetwork` listens on, and
  the socket's handler reads every queued event. A burst of events costs one wake.
- RakNet's datagrams on a shared port cross through two rings in a `SharedArrayBuffer`, in the
  layout of `SharedByteRing` in `@jsprismarine/raknet`. Each side wakes the other with one byte to
  a loopback socket, and only when the other side was idle. A RakNet worker thread can own the
  rings without loading this package.

## Building it

`pnpm --filter @jsprismarine/native-network run build:native` builds the library for this machine
into `prebuilds/<platform>/`. It needs CMake 3.20 or newer, a C and C++ compiler, `tar` and `git`.
`CMAKE` names a CMake that is not on the path. The script downloads every source in
`native/sources.json` into `node_modules/.cache/jsprismarine/native-network`, checks its SHA-256,
applies `native/patches/libjuice-mux-hooks.patch`, and runs CMake.

`--tls openssl` builds against OpenSSL instead, for comparison; it also needs Perl and make.

`JSP_NATIVE_NETWORK_LIBRARY` names a library file to load instead of the build in `prebuilds/`.

## The libjuice patch

The patch adds two functions to libjuice's mux mode, and nothing else:

- `juice_mux_set_hooks`, which binds a mux port and keeps it open with no peer on it, with a filter
  that sees each datagram before the address lookup and a callback for each datagram no peer
  claims.
- `juice_mux_sendto`, which sends a datagram from a mux port's socket.

The classifier itself lives in this library, so the patch stays generic.
