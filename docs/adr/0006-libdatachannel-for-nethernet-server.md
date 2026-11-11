# Run NetherNet on our own build of libdatachannel, and remove werift

Status: accepted.

The server's NetherNet peers, and our client's, ran on werift, a WebRTC stack written in
TypeScript that the `nethernet` package picks by default. Bedrock Dedicated Server takes a single
port in `server-udp-ports` and serves every player on it. Werift binds a UDP socket for each peer
and rejects a port range whose two ends are equal, so we refused that setting. We move the server
and the client to libdatachannel, a native WebRTC library whose `enableIceUdpMux` option serves
every peer connection from one port, and remove werift from the workspace. There is no fallback to
werift.

We build libdatachannel ourselves, with a small patch to libjuice, its ICE library, and ship it as
a prebuilt native library for each platform. The prebuilt node-datachannel addon proved
libdatachannel in the spike, and cannot take the patch that lets RakNet share a port with it
([ADR 0008](0008-shared-udp-port-in-native-code.md)).

The spike and its numbers are in [the plan](../plans/webrtc-backend.md), and the FFI findings are
in [the research note](../research/scriptc-libdatachannel.md).

## What we build

**A native networking library with a flat C interface, in a package of its own.** libdatachannel
and libjuice, with the libjuice patch, linked statically with a TLS library and a C layer of our
own. libdatachannel is built with `NO_MEDIA` and `NO_WEBSOCKET`, and the C layer exposes only what
NetherNet uses: peer connections, data channels, candidates, state and the selected pair. It sends
every libdatachannel event to one sink, registered once, because libdatachannel keeps one user
pointer per object and an FFI cannot pass its configuration struct. It also owns the shared UDP
port's classifier and the rings that carry RakNet's datagrams
([ADR 0008](0008-shared-udp-port-in-native-code.md)).

The library and its bindings live in a new package, not in `@jsprismarine/nethernet`, because they
are networking in native code, not NetherNet: the shared port already serves RakNet, and a native
RakNet would be the library's next module. `@jsprismarine/nethernet` depends on it for its WebRTC
driver. `@jsprismarine/raknet` does not depend on it; the server hands RakNet the rings. CI builds
the library for every platform we ship, and each machine downloads the one build it runs (see
[Platforms and distribution](#platforms-and-distribution)).

**One binding per runtime, all over that interface.** scriptc's FFI for the scriptc build, which
the research note ran end to end. For Node.js and Bun, the same flat interface through `node:ffi`
and `bun:ffi`, which the server already loads for its terminal UI, or through a Node-API addon if
an FFI cannot carry callbacks from libdatachannel's threads. The first slice of the work decides.

**One driver interface.** `packages/nethernet` owns a WebRTC driver interface. A driver builds
peer connections from a configuration and answers the three questions the server asks beyond the
W3C API: which candidate pair a peer selected, whether a peer still holds data the other side has
not received, and what happened on a connection, for the log. Our own NetherNet code
([ADR 0007](0007-own-nethernet-protocol.md)) takes a driver as an option, and nothing outside the
driver names the library under it. The native library is the one driver. A later driver, on
another library, implements the same interface.

**Link conditions through a relay.** `jsp-client --latency` and `--loss` simulate a slow path by
patching `dgram.Socket.prototype.send`, which libdatachannel's own sockets never call. With either
flag set, the client binds libjuice to `127.0.0.1` and rewrites the server's candidates to loopback
sockets that a Node.js relay owns, so every WebRTC datagram crosses a socket the patch reaches.
Without the flags the client connects directly. This is a test tool, and its extra hop is the
point.

## Platforms and distribution

**The platforms.** macOS on Apple Silicon, Windows on x64 and arm64, and Linux on x64 and arm64,
each Linux architecture against both glibc and musl, since Docker images built on Alpine use musl.
Android on arm64 is a stretch goal, built with the NDK.

Changed 2026-11-11: Windows on arm64 is dropped for now. Its build passed, but scriptc, a root
dependency, has no build for it, so the repository cannot install there to test it, and no
executable targets it. The install script and the loader say a platform has no build, so adding it
back needs only the workflow's matrix entries and the manifest check's list.

**A build is too big to ship them all.** Linked on Linux x64 with OpenSSL, without media or
WebSocket support and before any size tuning, the stripped library is 10,036,544 bytes, and
3,592,262 compressed with gzip. Linux builds also link the C++ runtime in, so they run on an Alpine
image without libstdc++, which brings that one to 11,677,192 bytes, 4,095,405 compressed. Eight
builds in one package would cost every install about 30 MB to use one of them.

**One package, and one build downloaded per machine, at install.** The native networking package
carries a manifest: for each platform, the release URL of its build and the build's SHA-256. Its
`postinstall` script downloads the build for the machine it is installed on, checks the digest,
and writes it into the package's own directory. Loading the library reads that file and downloads
nothing. There are no per-platform packages.

The download is an install script on purpose, so it runs only where the user allowed it. npm runs
a dependency's install scripts unless told not to. pnpm runs them only for packages the user
approves, with `pnpm approve-builds` or `allowBuilds` in `pnpm-workspace.yaml`. Bun runs them only
for packages listed in `trustedDependencies`. When the script has not run, loading the library
fails with a message that names the package and the way to approve it for the package manager in
use, and names `JSP_NATIVE_NETWORK_LIBRARY` as the way around it.

- `JSP_NATIVE_NETWORK_LIBRARY` names a library file to load instead, for machines that install
  without scripts or cannot reach the release host. The digest is still checked against the
  manifest.
- In a checkout the package is a workspace project, so its `postinstall` runs on `pnpm install`
  with no approval, and a script builds from source for the host when the C side changes.
- The builds live on the repository's GitHub releases, attached to the native package's release,
  so the manifest's URLs never change for a published version.

**Nothing to install.** A build links TLS, libjuice, usrsctp and the C++ runtime in, and depends
only on what every machine of its platform has: on Linux, glibc 2.36 or newer, which is Debian 12,
the oldest Debian release still in LTS (until 2028-06-30), or musl's `libc`; system DLLs on
Windows, with the C runtime linked statically; `libSystem` and the system's `libc++` on macOS. No user installs a system package to run NetherNet, and CI fails
a release whose build names any other dependency.

**Built in CI, never committed.** A job per platform builds the shared library for `node:ffi` and
`bun:ffi` (or the Node-API addon), and the static archives the scriptc build links, on a native
runner for that platform. musl builds run in an Alpine container on the Linux runners, and Android
is cross-compiled. The release workflow attaches every build to the release and writes the
manifest into the package before it publishes.

**One executable.** `pnpm run package` builds a Node.js single executable from a bundle and its
assets. The library for the platform being packaged becomes one more asset, so the executable
downloads nothing for NetherNet. On start, it writes the library to its cache directory under a
name that carries its digest, and loads it from there, the way `provision.ts` extracts the data
bundle. An operating system loads a shared library only from a file, so the extraction cannot be
skipped. A scriptc executable links the static archives and extracts nothing.

## What it costs

- A native dependency, with no way around it. On a platform we publish no build for, or wherever
  the library fails to load, the server refuses to start with NetherNet enabled, as it does for
  any transport that cannot start. The error names `enable-nethernet` as the way to run on RakNet
  alone.
- A native build to own: libdatachannel, libjuice, usrsctp and a TLS library, for each operating
  system, architecture and C library we ship, with the patch kept applying across libjuice
  releases. The scriptc build needed this anyway.
- An install from npm needs the release host, and the user's approval for the install script
  under pnpm and Bun. Without both, or a library named by `JSP_NATIVE_NETWORK_LIBRARY`, the server
  cannot start with NetherNet on.
- The glibc floor moves with Debian's LTS. When Debian 12's LTS ends, Debian 13's glibc 2.41
  becomes the floor.
- The single executable writes a library to disk on its first start, and needs a writable cache
  directory to run NetherNet. It already needs one for its data.
- A C layer and the bindings to write, where node-datachannel would have given us both. The
  research note sizes the C layer at about 110 lines and the TypeScript over it at 200 to 300, and
  supporting only what NetherNet uses keeps it there.
- A new published package, with a public interface of its own to keep compatible.
- Less to observe than werift showed. libdatachannel exposes the selected candidate pair and a
  channel's buffered amount. Our C layer can add what usrsctp knows, if the kick drain needs it.
- Our client and the server run the same stack, so a bug they share passes our own tests. Joins
  against Bedrock Dedicated Server and cinnabar clients are the checks against other stacks.

## Alternatives not taken

**Every build in one package.** Nothing is downloaded after the package itself, and every install
pays for eight builds to use one, about 30 MB as measured above.

**Download the build on first load** instead of at install. It needs no approval, which is also
what is wrong with it: a package manager's rule about install scripts would not cover a download
that happens anyway at run time.

**A package per platform**, as node-datachannel and scriptc publish theirs, selected through
optional dependencies and the `os`, `cpu` and `libc` fields. Each install downloads one build and
needs no network at run time. Every release publishes a package per platform beside the main one,
nine in all. It is the way out if the download at install proves a problem.

**The prebuilt node-datachannel addon.** It needs no build of our own and covers Node.js and Bun
on every common platform. It cannot take the libjuice patch, so a port shared with RakNet would go
through a relay in JavaScript, and the scriptc build would still need our own build.

**Keep werift as a fallback** for platforms without a build. It would keep NetherNet on more
platforms, at the cost of two stacks to test, werift internals read by the server, and a setting
that means one thing on one stack and another on the other.

**Keep werift for the client**, for its link simulation. It keeps a second stack and its
workarounds alive for one feature, which the relay gives us on libdatachannel.

**Share one socket under werift.** `dev/werift-mux` does it by replacing werift's
`UdpTransport.init` at runtime and routing datagrams by ICE username fragment, STUN transaction ID
and sender address. It works, and it reads werift's private fields, so a werift release can break
it without a type error.

**Wait for a shared-socket option in werift.** That removes the runtime patch and keeps one stack.
It depends on a release we do not control, and werift's SCTP has stalled on lossy paths before
(werift issue 806, fixed in 0.27).

**`@roamhq/wrtc`.** `nethernet`'s other backend wraps libwebrtc and exposes no port settings.

**Pion or str0m.** Both serve one port by design. Pion needs a second process, and str0m needs a
native binding we would write and maintain. libdatachannel has a C API and an ICE library small
enough to patch.
