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

## Installing it

The package carries no library. Its install script downloads the one build for the machine it is
installed on from the GitHub release `native/manifest.json` names, checks the file's SHA-256
against the manifest, and stores it in the package's `prebuilds/` directory. Loading the library
downloads nothing, and checks the file against the same digest.

Package managers that hold install scripts back need to be told to run this one:

- npm runs it unless install scripts are turned off.
- pnpm runs it after `pnpm approve-builds`, or with
  `allowBuilds: { '@jsprismarine/native-network': true }` in `pnpm-workspace.yaml`.
- Bun runs it once `"@jsprismarine/native-network"` is in the project's `trustedDependencies`.

Without the build, loading fails with a message that says which of these applies.

| Variable | Effect |
| --- | --- |
| `JSP_NATIVE_NETWORK_LIBRARY` | Loads this file instead of the installed build. It is checked against the manifest too. |
| `JSP_NATIVE_NETWORK_SKIP_DOWNLOAD=1` | The install script downloads nothing. |
| `JSP_NATIVE_NETWORK_BASE_URL` | Downloads from another host, or reads from a directory, instead of the release. |

Builds exist for macOS on Apple Silicon, Windows on x64, and Linux on x64 and arm64
against glibc 2.36 or newer and against musl. Each depends only on what every machine of its
platform has. The C++ runtime and TLS are linked in.

A single executable built by `pnpm run package`, or by the release's Bun compile, carries its
platform's build. On its first start it writes the library to its cache directory under the
file's digest, and loads it from there.

## Building it

`pnpm --filter @jsprismarine/native-network run build:native` builds the library for this machine
into `prebuilds/<platform>/`. It needs CMake 3.20 or newer, a C and C++ compiler, `tar` and `git`.
`CMAKE` names a CMake that is not on the path. The script downloads every source in
`native/sources.json` into `node_modules/.cache/jsprismarine/native-network`, checks its SHA-256,
applies `native/patches/libjuice-mux-hooks.patch`, and runs CMake.

`--tls openssl` builds against OpenSSL instead, for comparison; it also needs Perl and make.

The build writes a `build.json` beside the library, and the loader accepts a library whose
digest matches it, so a checkout runs its own build. A checkout's `pnpm install` downloads the
published build only while the native sources still match the manifest's `build` hash.

## Publishing builds

The Native network workflow builds every platform on each change and checks each build's
dependencies. It tests the Linux x64 build under Node.js, and installs the packed package with
npm. When a push to `master` leaves the manifest behind the native sources, it attaches the
builds to a release named `native-network-build-<hash>` for the sources' hash and commits the
manifest that points at them; run by hand with `publish`, it does the same on any branch. Until
then, every CI job that installs the repository builds the library for its own runner, so a pull
request that changes the native sources runs its tests without publishing anything. The release
workflow refuses to publish the package while the manifest does not match the sources.

## The libjuice patch

The patch adds two functions to libjuice's mux mode, and nothing else:

- `juice_mux_set_hooks`, which binds a mux port and keeps it open with no peer on it, with a filter
  that sees each datagram before the address lookup and a callback for each datagram no peer
  claims.
- `juice_mux_sendto`, which sends a datagram from a mux port's socket.

The classifier itself lives in this library, so the patch stays generic.
