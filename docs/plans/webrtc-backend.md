# NetherNet on libdatachannel, with BDS's port settings

Started 2026-11-11. Work happens on `dev/webrtc-backend`. This plan is a working document: tick
slices off, and add or reshape them as the work teaches us things.

## Goal

Make the server's NetherNet ports behave as Bedrock Dedicated Server (BDS) 1.26.70 does, and own
the code that gets us there. Four decisions carry it:

- We implement the NetherNet protocol in `@jsprismarine/nethernet` and stop depending on the npm
  `nethernet` package ([ADR 0007](../adr/0007-own-nethernet-protocol.md)).
- The server and our client run on our own build of libdatachannel, in a new native networking
  package bound through FFI, and werift leaves the workspace
  ([ADR 0006](../adr/0006-libdatachannel-for-nethernet-server.md)).
- RakNet and NetherNet can share one UDP port number, sorted in native code so WebRTC never enters
  JavaScript ([ADR 0008](../adr/0008-shared-udp-port-in-native-code.md)).
- An enabled transport that cannot start stops the server's start.

What done looks like:

- `server-udp-ports` and the new `server-public-ip` accept what BDS 1.26.70.24 accepts, refuse
  what it refuses, and open the same ports.
- `port` is renamed `server-port`, as BDS names it.
- A fresh config writes `server-port` and leaves `server-portv6` and `server-udp-ports` out. With
  only `server-port`, RakNet on IPv4 and IPv6, NetherNet's signaling and NetherNet's UDP all use
  it. Setting `server-udp-ports` moves NetherNet's UDP there, and setting `server-portv6` moves
  RakNet's IPv6 listener there.
- A RakNet port may also be one of the ports in a NetherNet range.
- How a range picks a port for a player is one strategy behind an interface. The first strategy is
  the port with the fewest players.
- A Bedrock client joins, plays and is kicked with the kick's reason on screen.
- The workspace no longer installs werift, `nethernet` or `protodef`, and `packages/prismarine`
  reads no WebRTC stack's internals. The WebRTC driver sits behind an interface that a later driver
  can implement.
- `jsp-client --latency` and `--loss` work over NetherNet on libdatachannel.
- Where libdatachannel cannot load, the server refuses to start and names `enable-nethernet` as the
  way to run on RakNet alone.

Out of scope:

- BDS 1.26.70 removes `transport` and `server-portv6`, because it runs NetherNet only. We keep
  `enable-raknet`, `enable-nethernet` and `server-portv6`.
- The scriptc binding is planned here and built later, once the server compiles under scriptc
  (slice 15).
- LAN discovery on UDP 7551 and the query port keep warning when their port is taken. They are not
  transports.
- RakNet in native code. ADR 0008 leaves room for it as a second module of the native networking
  library, behind the server's transport interface.

## What we know

- Werift binds a UDP socket for each peer connection, and its configuration rejects an
  `icePortRange` whose two ends are equal. `parseUdpPorts` refuses a single port for that reason.
- `dev/werift-mux` (commit `a3abb49e14`) makes a single port work on werift anyway. It replaces
  werift's `UdpTransport.init` at runtime for that port, shares one socket per address family, and
  routes datagrams to peers by ICE username fragment, STUN transaction ID and sender address. It
  reads werift's private fields to find each peer's username fragment. It passed two integration
  tests and a smoke run of three concurrent peers on a real server. ADR 0006 does not take it.
  It is the way back to one port if a Bedrock client refuses libdatachannel.
- A pull request to werift could add a supported shared-socket option, which would retire the
  runtime patch without changing backends.
- [`node-datachannel`](https://github.com/murat-dogan/node-datachannel) binds libdatachannel, a
  native WebRTC library. Version 0.33.6's configuration has `enableIceUdpMux`, which shares one UDP
  port across peer connections, and `portRangeBegin` and `portRangeEnd`. Its W3C wrapper,
  `node-datachannel/polyfill`, passes the whole configuration through to the native peer
  connection. It ships prebuilt binaries and requires Node.js 18.20 or newer. We used it for the
  spike only: its prebuilt addon cannot take the libjuice patch that ADR 0008 needs, so ADR 0006
  builds libdatachannel ourselves.
- `@roamhq/wrtc`, `nethernet`'s optional native backend, exposes no port settings, so it does not
  solve the trigger.
- `nethernet` 1.1.2 is about 1,500 lines of JavaScript. `packages/nethernet` already owns HTTP
  signaling, the identity, the LAN advertisement format and join by address. We import three
  things from `nethernet`: its `Server`, its `Client`, and `SignalStructure` with `SignalType`.
- `nethernet` builds its LAN packet codec at run time with `protodef`'s compiler, which generates
  code with `eval` (`protodef/src/compiler.js`). An ahead-of-time build cannot
  do that in compiled code.

## What ties us to werift

Everything below reaches past the W3C API. Each goes away with werift and `nethernet`, or moves
behind the driver interface:

- **`nethernet` 1.1.2** picks its stack by name (`werift` or `wrtc`), with no way to pass one in.
  Its werift subclass also has werift-only behavior: `setRemoteDescription` checks `this.sctp`,
  `setLocalDescription` clears werift's default STUN server, and `close` stops SCTP before DTLS.
- **`adaptPeerConnections`** (`packages/nethernet/src/peerConnections.ts`) works around that subclass
  on werift 0.27.
- **`constrainIcePorts`** sets werift's `icePortRange`.
- **`tracePeerConnection`** subscribes to werift's own events and reads `iceTransports`.
- **`selectedCandidateAddress`** (`packages/prismarine/src/network/transport/NetherNetTransport.ts`)
  reads the selected candidate pair from werift's ICE transport, to learn the client's address.
- **`hasUndeliveredData`** in the same file reads werift's SCTP association (`outboundQueue`,
  `flightSize`) so a kick's `DisconnectPacket` is delivered before the connection closes.
- **`LinkConditions`** (`packages/client/src/net/LinkConditions.ts`) simulates latency and loss by
  patching `dgram.Socket.prototype.send` for the whole process. libdatachannel sends from its own
  sockets, so the patch does not reach it. Slice 7 puts Node.js sockets back in the client's path.

## `server-udp-ports` as BDS 1.26.70 has it

From [the research note](../research/bds-server-udp-ports.md), which read the comments of three BDS
versions and ran the 1.26.70.24 binary against about 35 values. The rules we match:

- **Two modes.** A single port that every player shares, or a range. In a range, players are spread
  over the ports, and a port is reused once every port has a player. BDS binds one socket for each
  interface address and port, and never one per player.
- **Default.** Unset or empty, the UDP port is `server-port`.
- **Mappings.** `public:local` for a port or a range, with both sides the same length.
- **`server-public-ip`.** A new key for the address to advertise: a raw IPv4, or a raw or bracketed
  IPv6. A hostname or a port in it is an error.
- **IP prefixes are deprecated.** `IP:public:local` still works and logs a warning that names
  `server-public-ip`. Two different prefixes, or one that differs from `server-public-ip`, is an
  error. A prefix needs both ports.
- **Commas and repeated lines still work.** The local ports of every entry must form one continuous
  range. Adjacent and overlapping ranges merge, duplicates and empty entries are fine, and a gap is
  an error. Our config is JSON, so the repeated-line form becomes the comma form.
- **Errors stop the start.** Each has its own message: a gap, a reversed range, mismatched lengths,
  an invalid port, a hostname, conflicting addresses.

**Port selection is a strategy.** A range hands each new peer a port through a selection
strategy: given the ports and the peers on each, return one. The first strategy is the port with
the fewest peers, lowest port first on a tie. A later strategy plugs in without changing the
parser, the driver or the port sharing.

What changes from our parser today: a single port is accepted, the default is `port` where it was
the operating system's choice, disjoint local ranges become one error where every entry had to be
the same range, and the address moves to `server-public-ip`.

**The config comment.** `Config.ts` describes each setting, and the docs table is generated from
it. The descriptions of `server-udp-ports` and `server-public-ip` must say at least what BDS's
comments say, in our own words: both modes, reuse in a range, the default, mappings and their equal
lengths, the examples, and when the setting is ignored (`enable-nethernet` off).

## One port for RakNet and NetherNet

From [the research note](../research/nethernet-raknet-shared-port.md), which ran a prototype on
Linux, and [ADR 0008](../adr/0008-shared-udp-port-in-native-code.md), which takes a different
design from it.

- **`server-portv6` equal to `port` already works.** RakNet's IPv6 socket is created with
  `ipv6Only`, in socket mode and worker mode. It needs a test and a sentence in the guide.
- **libjuice owns its socket.** libdatachannel's ICE library binds the mux port itself and has no
  way to take a socket or a datagram from us. Two programs' sockets on one port cannot split
  traffic by content without Linux-only BPF steering.
- **The research note's design was a JavaScript relay.** RakNet's socket sorted each datagram by
  its first bytes and relayed STUN and DTLS to libjuice over loopback. It ran: two and three werift
  clients moved 500,000 bytes each way through one port, on IPv4 and IPv6, while the same port
  answered 30 of 30 RakNet pings. It costs each WebRTC datagram two trips through the event loop
  and three system calls where libjuice alone makes one, which gives back what native code is for.
- **We sort in native code instead, by structure first.** libjuice owns the shared port. Our C
  layer classifies each datagram by its bytes on libjuice's thread before libjuice looks it up:
  `0x80` and above is connected RakNet or query, 20 to 63 is DTLS, 0 to 3 with STUN's cookie is
  STUN, and an unconnected ping or open connection request carrying RakNet's offline magic is
  offline RakNet. Anything else falls through to libjuice's lookup, and what libjuice claims for
  no peer goes to RakNet.
- **The lookup is not free for RakNet.** libjuice's address table is open addressing with linear
  probing, every RakNet datagram is a miss, a miss scans to the next empty slot, and a peer that
  leaves leaves tombstones that only a resize clears. Classifying first keeps connected RakNet out
  of the table and its mutex entirely.
- **RakNet's datagrams cross in batches.** The classifier copies each into a shared-memory ring for
  RakNet, with one wake per batch, and RakNet writes its replies into a second ring. WebRTC
  datagrams stay in native code.
- **The mux socket is dual-stack** (`IPV6_V6ONLY` off in `src/udp.c`), so it carries RakNet's IPv4
  and IPv6 clients on the shared number.
- **With the RakNet worker**, the worker reads and writes the rings, so the main thread sees none
  of it. `SharedByteRing` in `packages/raknet` already moves datagrams this way between the worker
  and the main thread.
- **It applies only to the ports that collide.** With the default, NetherNet's single port is
  `port`. A range that contains `port` or `server-portv6` shares that one port and leaves the
  others to libjuice alone. A `server-udp-ports` that collides with nothing shares no port, and
  RakNet keeps its Node.js sockets for every port it does not share.

## Defaults and the written config

BDS calls the game port `server-port`. Our config calls it `port`, and slice 12 renames it. Slices
before slice 12 still say `port`.

Today a fresh config writes `port: 19132`, `server-portv6: 19133` and `server-udp-ports: ""`, and
`ConfigBuilder.get(key, defaults)` writes any key it reads that is missing. After this plan:

| Written in the config | RakNet IPv4 | RakNet IPv6 | NetherNet signaling (TCP) | NetherNet UDP |
| --- | --- | --- | --- | --- |
| `server-port` only | `server-port` | `server-port` | `server-port` | `server-port`, shared with RakNet |
| `server-port` and `server-udp-ports` | `server-port` | `server-port` | `server-port` | `server-udp-ports` |
| `server-port` and `server-portv6` | `server-port` | `server-portv6` | `server-port` | `server-port`, shared with RakNet |
| all three | `server-port` | `server-portv6` | `server-port` | `server-udp-ports` |

- A fresh config writes `server-port` and leaves out `server-portv6` and `server-udp-ports`.
  Reading them must not write them, so they need a read that does not persist the default.
- An empty `server-udp-ports` means unset, as in BDS. An existing config with `""` therefore moves
  NetherNet's UDP from the operating system's choice to `server-port`. An existing config with
  `server-portv6: 19133` keeps RakNet's IPv6 listener on 19133.
- `query-port` follows the same rule: a fresh config leaves it out, and it then answers on
  `server-port`, as it does today when the two are equal.
- An existing config's `port` is renamed `server-port` in the file when the server loads it, with
  its value kept. A config with both keys stops the start with an error that names them.
- The server's `--port` command-line option keeps its name.
- The `server-port` description says what it carries when the other keys are absent.

## Platforms and packaging

[ADR 0006](../adr/0006-libdatachannel-for-nethernet-server.md#platforms-and-distribution) has the
decision. The targets and how each is built:

| Platform | Built on | Library | Static archives |
| --- | --- | --- | --- |
| macOS arm64 | macOS on Apple Silicon | `.dylib` | `.a` |
| Windows x64 | Windows x64 | `.dll` | `.lib` |
| Windows arm64 | Windows on Arm | `.dll` | `.lib` |
| Linux x64, glibc | Linux x64, in a Debian 12 container | `.so` | `.a` |
| Linux arm64, glibc | Linux on Arm, in a Debian 12 container | `.so` | `.a` |
| Linux x64, musl | Linux x64, in an Alpine container | `.so` | `.a` |
| Linux arm64, musl | Linux on Arm, in an Alpine container | `.so` | `.a` |
| Android arm64 (stretch) | Linux x64, with the NDK | `.so` | `.a` |

- **One build is several megabytes.** On Linux x64 with OpenSSL, `NO_MEDIA` and `NO_WEBSOCKET`,
  and no size tuning, the stripped library is 10,036,544 bytes and 3,592,262 gzipped; with the C++
  runtime linked in, 11,677,192 and 4,095,405. Eight in one package would cost every install about
  30 MB. Slice 4 measures again with Mbed TLS, section garbage collection and only the calls
  NetherNet uses.
- **Each machine downloads its own build, at install.** The package carries a manifest of each
  platform's release URL and SHA-256. Its `postinstall` script downloads the build for the
  platform, checks the digest and writes it into the package's directory. That runs where the user
  allows install scripts: by default under npm, after `pnpm approve-builds` or `allowBuilds` under
  pnpm, and through `trustedDependencies` under Bun. Loading the library downloads nothing, and
  when the script has not run it fails with a message that says how to approve it.
  `JSP_NATIVE_NETWORK_LIBRARY` points at a local file instead, checked against the same digest. No
  per-platform packages.
- **Nothing to install.** A build depends only on what every machine of its platform has, so no
  user runs `apt install`, `apk add` or a Visual C++ installer:
  - TLS, libjuice, usrsctp and the C++ runtime are linked in on every platform.
  - Linux glibc builds need only `libc`, `libm` and the dynamic loader, built in a Debian 12
    container against its glibc 2.36. Debian 12 is the oldest Debian release in LTS, until
    2028-06-30 (Debian 11's LTS ended 2026-08-31). The build measured above, made on this host's
    glibc 2.43, needed `GLIBC_2.38`, so the floor has to be set on purpose. It moves to Debian 13's
    glibc 2.41 when Debian 12's LTS ends.
  - Linux musl builds need only musl's `libc`, which every Alpine image has.
  - Windows builds link the C runtime statically (`/MT`), so they need no Visual C++
    redistributable, only system DLLs such as `kernel32.dll` and `ws2_32.dll`.
  - macOS builds need only `libSystem` and the system's `libc++`, which every macOS has.
  - Android builds link the NDK's static `libc++`.
- **A checkout** fetches through the same manifest, and a script builds from source for the host
  when the C side changes.
- **The single executable** embeds its platform's library as a SEA asset and writes it to the cache
  directory on start, under a name with its digest, before it loads it. It downloads nothing. A
  cached copy with the right digest is loaded as it is.
- **The scriptc executable** links the static archives.

## Open questions

1. **Does a Bedrock client join over libdatachannel, and on a port shared with RakNet?** Our own
   client runs libdatachannel too after slice 6, so its joins do not answer this. Slice 13 does,
   with cinnabar and a retail client.
2. **Does a close lose data?** The spike lost data with node-datachannel sending and werift
   receiving. The research note's probe lost nothing in 22 runs with libdatachannel on both ends,
   over five close orders. With werift gone, what is left to learn is what a Bedrock client
   receives. Slice 8 settles our side and slice 13 the client's.
3. **Does the kick drain still have something to wait on?** libdatachannel shows a channel's
   buffered amount and nothing inside SCTP. If its close already delivers what was queued, the
   drain is not needed. If it does not, our C layer can ask usrsctp.
4. **How does BDS pick a port within a range?** Six players on two ports used both, and that is
   all we saw. The strategy interface leaves room to match it once we know.
5. **Does libjuice serve several mux ports at once?** The spike ran one. A range needs one mux per
   port. Slice 9 checks it first.
6. **What does a client receive for a mapping in BDS?** The candidates in the answer for
   `public:local` and for `server-public-ip` were not read. Slice 9 reads them from BDS's answer.
7. **Can the client's relay run libjuice on loopback while the server is on another machine?** The
   relay rewrites the server's candidates to loopback addresses, so libjuice never sends off the
   machine. Slice 7 proves it against a remote server.
8. **How do Node.js and Bun call the native library?** `node:ffi` is experimental in Node.js 26,
   and libdatachannel calls back from its own threads. Slice 4 tries `node:ffi` and `bun:ffi`, and
   falls back to a Node-API addon, which Bun also loads.
9. **How does the native side wake RakNet's consumer?** Its thread writes the ring, and the worker
   or main thread has to notice without polling. Candidates are a foreign-thread callback through
   the binding, and a byte on a pipe or socket pair that libuv watches. Slice 4 picks one, and
   wakes once per batch.

## Spike results

From 2026-11-11, on `spike/node-datachannel`, with node-datachannel 0.33.6 on Linux x64 (glibc).
The spike swaps the `nethernet` `Server`'s backend for `node-datachannel/polyfill`, sets
`enableIceUdpMux` for a one-port range, and leaves our werift client as it is.

1. **Bun: yes.** The server runs under Bun 1.3.14 with `"server-udp-ports": "19556"`. Three bots
   from `jsp-client bot --network nethernet` joined, played for 10 seconds and left. Under Node.js,
   the integration tests pass.
2. **One port: yes.** Two concurrent peers in the integration test and three on the real server
   shared one port, and the port was free again once the last peer left. The server offered the
   port on all three interfaces, and one test peer's selected pair was IPv6.
3. **A Bedrock client: not yet checked.** Our own client logs in and spawns, but it runs werift,
   not libwebrtc.
4. **Werift-only reads: one yes, one no.**
   - The selected candidate pair is at `rtcConnection.sctp.transport.iceTransport.getSelectedCandidatePair()`,
     in the same `{ local, remote }` shape werift returns. `selectedCandidateAddress` reads
     `iceTransports[0]`, so the server logged players as `0.0.0.0:0` until it reads the new path.
   - Undelivered data is still a gap. The probe sent 200 messages of 10,000 bytes and then closed.
     Werift with no drain delivered none of it. node-datachannel with no drain delivered 10,000
     bytes, and after waiting for `bufferedAmount` to reach 0 it delivered 1,010,000 and 1,020,000
     bytes in two runs. The receiver in every run was werift. A later probe with libdatachannel
     on both ends delivered all 2,000,000 bytes in 22 runs
     ([research note](../research/scriptc-libdatachannel.md#closing-and-undelivered-data)), so the
     loss is probably on werift's receiving side. See open question 2.
5. **Platforms:** prebuilt binaries for Android arm64, macOS arm64 and x64, Linux arm64 and x64
   (glibc and musl), and Windows arm64 and x64.

Also found:

- The polyfill hands on libdatachannel's SDP line, `a=candidate:...`, as the trickled candidate
  string, where the W3C format is `candidate:...`. Werift refuses it. The spike's wrapper strips the
  prefix; this is worth reporting to node-datachannel.
- libdatachannel finishes gathering before it answers: the answer already carries every candidate
  and `a=end-of-candidates`.
- Sending on a closed data channel throws (`DataChannel is closed`) where werift dropped the
  message. The server logged that error once when the bots left, so the transport needs a guard.

## scriptc

From [the research note](../research/scriptc-libdatachannel.md), run on Linux x64 with scriptc
0.4.11:

- Compiled code cannot load node-datachannel's addon. scriptc's FFI can call libdatachannel's C API
  (`rtc/rtc.h`), with libdatachannel v0.24.6 and OpenSSL linked into the executable. The test
  executable was 10.8 MB and served two clients on one port.
- libdatachannel calls back on its own threads. The FFI's `invoke: "foreign"` mode queues each call
  and runs the TypeScript callback on the event loop, in order, so nothing has to poll.
- The FFI cannot pass structs, and libdatachannel keeps one user pointer per object. A C layer of
  about 110 lines sends every event to one sink. About 200 to 300 lines of TypeScript then stand in
  for the polyfill.
- The module with the FFI declarations must load only in the scriptc build. A named import of them
  fails under Node.js.
- scriptc can also run node-datachannel in an embedded Node.js, at the cost of a 131 MB library
  beside the executable. That is the stopgap if a scriptc build is needed before slice 15, with our
  own Node-API addon in place of node-datachannel's if slice 4 ends up with one.

## How we measure

No slice claims a speedup, and no test asserts a duration. The checks count what the code decides:

- The ports in the answer's candidates, and the UDP sockets the server holds, for each mode.
- Players per port in a range.
- Bytes delivered against bytes sent, for a close and for the shared port.
- Datagrams of each kind delivered to RakNet and to libjuice on a shared port, with zero on the
  wrong side.
- JavaScript entries per WebRTC datagram on a shared port, which is zero, and ring wakes per batch
  of RakNet datagrams, which is one.
- Address-table lookups per connected RakNet datagram, which is zero, and the classifier's class
  for each of the 256 first bytes.
- The address the server records for a player, against the address the client connected from.

## Slices

Each slice is a commit or a few, with its tests, on `dev/webrtc-backend`.

1. [x] **Spike.** node-datachannel as the server's backend on `spike/node-datachannel`, under
   Node.js and Bun. Results above.
2. [x] **Decide.** ADRs [0006](../adr/0006-libdatachannel-for-nethernet-server.md),
   [0007](../adr/0007-own-nethernet-protocol.md) and
   [0008](../adr/0008-shared-udp-port-in-native-code.md).
3. [ ] **Stop the start when a transport cannot start.** Today some listeners only warn.
   - A transport that is enabled and cannot start stops the server's start with an error that
     names the transport, the port and the cause. That covers RakNet on `port`, RakNet on
     `server-portv6` (today a warning), and NetherNet's HTTP signaling on `port`'s TCP side
     (today a warning). Slice 5 adds a native library that fails to load.
   - LAN discovery and the query port keep their warnings.
   - `ServerNetworking.start` waits for every listener to bind before it returns, so the failure
     reaches `bootstrap`. Today it starts the listeners and returns at once.
   - `packages/server/src/Server.ts` logs the error's own message in place of "Cannot start the
     server, is it already running on the same port?", which is wrong for most causes.
   - Update [Running a server](../guide/running.md), which says the server starts anyway when
     another program holds `server-portv6`, and the doc comments in `network.ts` that say the same.
   - Changeset for `@jsprismarine/prismarine`: a server that started with a warning now refuses to
     start.
   - Tests: each listener's port held by another socket stops the start with its message, replacing
     the test that IPv4 keeps running when the IPv6 port is taken.
4. [ ] **The native networking library, on one platform.** Linux x64 first, and the gate for the
   rest.
   - Create the package for it (working name `@jsprismarine/native-network`, in
     `packages/native-network`), with its README.
   - Build libdatachannel with `NO_MEDIA` and `NO_WEBSOCKET`, and libjuice, from source at pinned
     versions, with the libjuice patch: a filter callback before the lookup, a callback for each
     datagram the mux claims for no peer, and a send from the mux socket.
   - Write the C layer: one event sink for libdatachannel's callbacks, as the research note's
     experiment had, only the calls NetherNet uses, the classifier, and the inbound and outbound
     rings for RakNet's datagrams.
   - Settle open questions 8 and 9: call it from Node.js and Bun, and wake the ring's consumer once
     per batch.
   - Build against Mbed TLS, which libdatachannel supports beside OpenSSL and GnuTLS, and record
     the library's size in bytes with each TLS library, so the choice rests on a number. scriptc's
     own runtime links Mbed TLS (`libscriptc-mbedtls.a` in `@scriptc/runtime-linux-x64-gnu`), so
     check whether the scriptc build can share it or clashes with it.
   - Tests: a peer connection opens and moves data under Node.js and Bun; the classifier's class
     for every first byte, with real RakNet encodings, STUN messages and DTLS records; a ping
     carrying STUN's cookie still classes as RakNet; connected RakNet reaches the ring with no
     address-table lookup; a datagram written to the outbound ring leaves from the mux port; a
     burst of N RakNet datagrams costs one wake.
5. [ ] **Build and ship it for every platform.** As
   [Platforms and packaging](#platforms-and-packaging) has it.
   - A CI job per target in the table builds the shared library and the static archives, on that
     target's runner or in an Alpine container, and records each build's digest and size.
   - The release workflow attaches every build to the native package's GitHub release and writes
     the manifest into the package before it publishes.
   - The package's `postinstall` downloads and verifies the build for the platform into its
     directory. Loading honors `JSP_NATIVE_NETWORK_LIBRARY`, downloads nothing, and fails without a
     build with a message that names the package and how to approve its install script under npm,
     pnpm and Bun. In a checkout the script runs on `pnpm install`, and a script builds from source
     for the host.
   - When there is no build for the platform, the install script did not run, the digest does not
     match, or the library fails to load, the server's start stops, as slice 3 has it, with a
     message that names the platform and the cause, and says that `enable-nethernet: false` runs
     the server on RakNet alone.
   - `scripts/package-sea.mts` embeds the platform's library as an asset, and the executable writes
     it to the cache directory on start and loads it from there.
   - Tests: a digest mismatch is refused; an install downloads exactly one build; loading never
     downloads; a missing build fails with the approval message; the environment variable's file
     is used and checked.
   - CI checks each build's dependencies and fails the release on one more: `readelf -d` lists only
     `libc`, `libm` and the loader, and `objdump -T` names no glibc symbol version above 2.36;
     `dumpbin /dependents` lists only system DLLs; `otool -L` lists only `libSystem` and `libc++`.
   - Load each build in a bare container or VM of its platform with nothing installed: Debian 12, a
     plain Alpine image, and a clean Windows image.
   - Install the package from a consumer project with npm, with pnpm before and after
     `pnpm approve-builds`, and with Bun before and after `trustedDependencies`.
   - Checks: the built package from a consumer project on each platform CI runs, an Alpine
     container among them, and the packaged executable opening a NetherNet peer connection on each.
6. [ ] **Our own NetherNet protocol on the native driver, for the server and the client.**
   - Define the WebRTC driver interface in `packages/nethernet`: build a peer connection from a
     configuration, the selected candidate pair of a peer, whether a peer holds undelivered data,
     and tracing. Implement it over the native networking package, which `@jsprismarine/nethernet`
     now depends on. Nothing else in `@jsprismarine/nethernet` names the library.
   - Write the server and client sides in TypeScript over the driver: the signal format, offer,
     answer and candidate handling, the accept timeout, the two data channels, the connection's
     message segmentation, and the LAN discovery packets on UDP 7551 with their encryption.
   - Write each packet with an encoder and a decoder, and a round-trip test.
   - Switch `packages/prismarine`, `packages/client` and `HttpSignaling` to our classes. Move
     `selectedCandidateAddress` and `hasUndeliveredData` out of
     `packages/prismarine/src/network/transport/NetherNetTransport.ts` into the driver.
   - Remove `nethernet`, `protodef`, werift and the werift override in `pnpm-workspace.yaml`, with
     `adaptPeerConnections`, `constrainIcePorts` and the werift parts of `tracePeerConnection`.
   - Until slice 7 lands, `--latency` and `--loss` with `--network nethernet` is a usage error.
   - Changeset: exports leave and arrive in `@jsprismarine/nethernet`, so read
     [the versioning policy](../guide/versioning.md) for the bump.
   - Check: our client's tests against BDS pass over NetherNet, our bots join our server over
     NetherNet, and `pnpm run e2e:client` passes on RakNet.
7. [ ] **Link conditions through a client relay.**
   - With `--latency` or `--loss`, the client binds libjuice to `127.0.0.1`, strips its own
     candidates from the offer, and rewrites each of the server's candidates in the answer to a
     loopback socket that the relay owns. The relay forwards between that socket and the server's
     real address through a Node.js socket, which `LinkConditions` already reaches.
   - Without them, the client connects directly and opens no relay.
   - Tests: with loss set, the relay drops the share of datagrams the link's seeded generator
     picks; bytes sent equal bytes received once SCTP has resent them; with neither flag, the
     client holds no relay socket. A join through the relay to a server on another machine.
8. [ ] **Close and drain.** Settle open questions 2 and 3 on our side.
   - Repeat the close probe through our own connection code, in the close order the server uses
     for a kick.
   - Keep the drain only if the probe shows something to wait for, and read usrsctp's queue in the
     C layer if it does.
   - Test: every byte sent before a close reaches the receiver.
9. [ ] **`server-udp-ports` and `server-public-ip` as BDS 1.26.70 has them.**
   - First check open questions 5 and 6: several mux ports at once in libjuice, and the candidates
     BDS answers with for a mapping.
   - Parse as BDS does. Take the table in the research note as the test fixture: every value BDS
     starts with parses, and every value it refuses is refused for the same reason.
   - Add `server-public-ip`, with BDS's validation and its two conflict errors. Keep the IP prefix,
     with a deprecation warning that names the new key.
   - A single port puts every peer on it in mux mode. A range runs every port in mux mode and asks
     the selection strategy for each new peer's port, so ports are reused once all are in use.
     Define the strategy interface, and implement the fewest-peers strategy.
   - Advertise mappings in the answer as BDS does, from `withMappedCandidates`.
   - Rewrite both settings' descriptions in `Config.ts` to carry at least what BDS's comments say,
     and run `pnpm run docs:facts`. Correct slice 15 of
     [nethernet-transport.md](nethernet-transport.md).
   - The default stays the operating system's choice until slice 12, since `server-port` can only
     be the default once slice 11 shares it with RakNet.
   - Changeset for `@jsprismarine/nethernet` and `@jsprismarine/prismarine`.
   - Tests: two peers at once on one port, the port released after the last peer, peers per port
     in a range, a full range reused, a fake strategy's choices followed, the answer's candidates
     for each mapping form, and the fixture table.
10. [ ] **`server-portv6` on the same number as `port`.**
    - Tests: a wildcard server with both settings equal answers a ping on each family, in socket
      mode and worker mode.
    - Say in [Running a server](../guide/running.md) that the two may be equal.
11. [ ] **RakNet and NetherNet on one port.** The design is in ADR 0008.
    - `ServerSocket` in `packages/raknet` reads and writes through a datagram source: a Node.js UDP
      socket, as today, or a pair of rings. RakNet's protocol code and query do not change, and
      `packages/raknet` does not depend on `packages/nethernet`.
    - When a NetherNet port equals `port` or `server-portv6` and RakNet is on, the server takes the
      rings from the native library's mux on that port and gives them to RakNet. With the RakNet
      worker, the worker holds them. `packages/raknet` takes the rings as a datagram source and
      does not import the native package.
    - It covers a single port equal to `port` or `server-portv6`, and the one port of a range that
      equals either. The selection strategy treats that port like the others. With `port` and
      `server-portv6` equal and shared, the one dual-stack mux socket carries both families.
    - Tests: RakNet handshakes, frame sets, ACKs and query on a shared port reach RakNet and none
      reach libjuice; WebRTC datagrams reach libjuice and none reach RakNet; bytes through a data
      channel equal bytes sent while a RakNet session on the same port delivers its frames; with
      the RakNet worker, the main thread receives nothing per datagram; a range containing `port`
      serves peers on every port and RakNet on that one.
    - Run it under Bun, and on macOS and Windows where we can.
12. [ ] **`server-port`, the new defaults and the written config.** As the table above has it.
    - Rename `port` to `server-port`: the key, its description, `JsonConfigTypes.ts`, the config
      schema, the client-e2e harness's config, and the docs. Rename it in an existing file on load,
      and refuse a config that has both.
    - Read `server-portv6`, `server-udp-ports` and `query-port` without persisting their defaults.
      Unset `server-portv6` and `query-port` mean `server-port`, and unset `server-udp-ports` means
      `server-port`, shared with RakNet.
    - Rewrite the descriptions of `server-port`, `server-portv6` and `query-port` to say so, and run
      `pnpm run docs:facts`. Update [Running a server](../guide/running.md)'s port table.
    - Changeset for `@jsprismarine/prismarine`: `port` becomes `server-port`, and an existing config
      with an empty `server-udp-ports` moves NetherNet's UDP to `server-port`.
    - Tests: a fresh config holds `server-port` and none of the three keys; loading it again does
      not add them; a config with `port` is rewritten with the same value; a config with both keys
      is refused; each row of the table opens the ports it lists.
13. [ ] **Prove it with a Bedrock client.**
    - Give the client-e2e server `server-udp-ports` and `server-public-ip` options, and run the
      NetherNet suite with `pnpm run e2e:client -- --transport nethernet` four ways: the default
      shared port, a separate single port, a range, and a range that contains `server-port`. This
      needs the NetherNet cinnabar build, which is not cached on the dev host.
    - Add a kick scenario that asserts the client shows the kick's reason.
    - Join with a retail client from outside the local network, with a mapping and
      `server-public-ip`.
14. [ ] **Offer the libjuice patch upstream.** Ask before filing.
15. [ ] **The scriptc binding.** Starts once the `scriptc` workflow compiles the server.
    - The FFI manifest over the same C layer, as the research note's experiment had it.
    - A scriptc-only entry that imports the FFI module, so Node.js and Bun never load it.
    - `--ffi <manifest>` in `package:scriptc`, with the static builds from slice 5.
    - Shutdown in order: close and delete every peer, clear the sink, then `rtcCleanup`.
    - The driver tests of slices 4, 8, 9 and 11, run against the compiled executable.
16. [ ] **Clean up.** Delete `spike/node-datachannel` and `dev/werift-mux`, and bring
    [nethernet-transport.md](nethernet-transport.md) up to date: its requirement to use npm
    `nethernet` no longer holds, and the backend moved.

## Risks

- **A Bedrock client may not accept libdatachannel, or a shared port.** Slice 13 is the gate, and
  slices 4 to 12 do not merge to `master` before it passes. If the shared port fails and a
  separate one works, the default keeps the two port numbers apart.
- **We own a native build.** Every platform needs libdatachannel, libjuice, usrsctp and a TLS
  library built and published, and the libjuice patch has to keep applying. Slice 4 proves one
  platform before slice 5 commits to all of them.
- **An install from npm needs the network and, under pnpm and Bun, an approval.** Without them, or
  a file named by `JSP_NATIVE_NETWORK_LIBRARY`, the server cannot start with NetherNet on, and the
  message says which. The single executable embeds its build and is not affected. Per-platform
  packages are the way out if this proves a problem, at the cost ADR 0006 lists.
- **The single executable needs a writable cache directory** to load the library. It already needs
  one for its data.
- **A classifier mistake drops a transport's traffic.** The classifier is tested for every first
  byte against real encodings, and an unsure datagram falls through to libjuice and then to RakNet,
  so nothing it cannot place is lost.
- **The binding may not carry libdatachannel's callbacks.** `node:ffi` is experimental. Slice 4
  decides, with a Node-API addon as the way out.
- **Our protocol code may differ from `nethernet` on the wire.** Our client's tests against BDS and
  cinnabar's joins against our server catch it, in both directions.
- **We stop getting `nethernet`'s fixes.** We watch its releases for protocol changes.
- **A shared port puts a thread boundary in RakNet's path.** Each RakNet datagram is copied into a
  ring, and RakNet is woken once per batch. WebRTC no longer waits for a tick.
- **The native library fails to load on a supported platform**, for example under a new Bun
  release. With no fallback, the server does not start there with NetherNet on, and the client
  cannot dial NetherNet, until it is fixed. `enable-nethernet: false` runs the server on RakNet
  alone meanwhile.
- **A server that started before may now refuse to start**, for example with `server-portv6` held
  by another program, or with a `server-udp-ports` value BDS refuses. The error names the cause,
  and the Changesets say so.
- **Existing configs change.** `port` is rewritten as `server-port`, and an empty
  `server-udp-ports` moves NetherNet's UDP to `server-port`. The Changeset says so.
- **The plan is large.** Slices 3 and 10 do not depend on the native library and can merge on
  their own.
