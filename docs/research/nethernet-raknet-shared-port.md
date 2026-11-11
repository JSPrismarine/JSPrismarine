# NetherNet and RakNet on one UDP port

Researched 2026-11-11. Scope: whether the server can run RakNet and NetherNet on the same UDP port number, and RakNet's IPv4 and IPv6 listeners on the same port number, once NetherNet's peers run on libdatachannel. Covers how the listeners bind today, how to tell RakNet, query, STUN and DTLS datagrams apart, how WebRTC datagrams can reach libjuice when it does not own the port, the kernel and upstream alternatives, where the work sits when RakNet runs on a worker thread, and a recommended design with tests. [docs/plans/webrtc-backend.md](../plans/webrtc-backend.md) is the plan this feeds, [ADR 0006](../adr/0006-libdatachannel-for-nethernet-server.md) is the decision it builds on, and [bds-server-udp-ports.md](bds-server-udp-ports.md) records what Bedrock Dedicated Server (BDS) does with the setting.

[ADR 0008](../adr/0008-shared-udp-port-in-native-code.md) takes a different design from the one this note recommends: libjuice owns the shared port, and native code sorts the datagrams, so WebRTC traffic never passes through a relay in JavaScript. The findings below are as they were.

Versions: node-datachannel 0.33.6, which pins libdatachannel v0.24.6, which pins libjuice at commit `b89c792e` (version 1.7.4 in its `CMakeLists.txt`); libjuice `master` at `6f37177d` (2026-11-05) for the upstream check; werift 0.27.0 as the client; libwebrtc `main` as fetched on 2026-11-11; libuv `v1.x`; Node.js 26.13.0. Host: Ubuntu 26.04.1, x86-64, Linux 7.0, `net.ipv6.bindv6only` 0, two IPv4 interface addresses and one IPv6.

Each claim is marked as read (from a cited source) or run (from an experiment in the [reproduction](#reproduction) section). Paths under `libjuice/`, `libdatachannel/` and `libwebrtc/` are in those projects' sources at the versions above.

## Summary

- RakNet's IPv4 and IPv6 listeners already work on one port number, in socket mode and in worker mode. `ServerSocket.start` creates the IPv6 socket with `ipv6Only: true`. Both listeners bound port 19702 and answered an unconnected ping on `127.0.0.1` and `::1`. Nothing in the code needs to change. A test and one sentence of documentation are missing. (Read and run.)
- libjuice breaks that as soon as it takes the same number. Its mux socket is one IPv6 socket with `IPV6_V6ONLY` off, so it holds the port for both families. With the mux on a port, Node.js got `EADDRINUSE` for `0.0.0.0` and for an IPv6-only `::`. With Node.js on the port first, libdatachannel failed with `Failed to gather local ICE candidates`. (Read and run.)
- libjuice has no way to take a socket from us, to receive a datagram from us, or to hand on a datagram it does not want. That holds for the bundled commit and for `master`. `juice_mux_listen`, which node-datachannel exposes as `IceUdpMuxListener`, reports only STUN Binding requests for an unknown username fragment. (Read.)
- The classes of datagram are disjoint on a server's inbound side. RakNet accepts first bytes `0x01`, `0x02`, `0x05`, `0x07`, `0xfe` and `0x80` to `0xff`. STUN uses `0x00` to `0x03` and DTLS `0x14` to `0x3f`. Only `0x01` and `0x02` overlap, and RakNet's 16-byte offline magic settles those. (Read and run.)
- A loopback relay works. A script owned UDP 19720 on both families, answered RakNet pings on it, and passed STUN and DTLS through one loopback socket per remote address to a libjuice mux bound on `127.0.0.1`. Two and three werift clients connected through that port and exchanged 500,000 bytes each way per client, with every byte delivered, over IPv4 and over IPv6. All 30 pings got pongs. No RakNet datagram reached libjuice and no WebRTC datagram reached the RakNet handler. (Run.)
- The relay costs one extra loopback datagram for each WebRTC datagram, in each direction. In ten runs that was 1.83 to 2.11 extra datagrams per 1,000 bytes of application data sent as 1,000-byte messages. (Run.)
- Three things need translating, and nothing else on the wire changes. The answer's candidates must name the public addresses and the shared port. `XOR-MAPPED-ADDRESS` in libjuice's Binding responses names the relay socket unless the relay rewrites and re-signs it, which it can, because the server knows its own ICE password. libjuice reports each player's address as `127.0.0.1` and a relay port, so the backend must translate that through the relay table. (Read and run.)
- Kernel-level sharing does not fit. `SO_REUSEPORT` splits datagrams between the two sockets by a hash, 110 to 90 in the test. Steering by content needs `SO_ATTACH_REUSEPORT_CBPF`, which is Linux only, needs a native addon and needs a patched libjuice. (Read and run.)
- Recommendation: build the relay into the code that owns RakNet's socket, turned on only when NetherNet's port equals a RakNet port. The fallback, if a Bedrock client refuses it, is a separate `server-udp-ports` value, which is the plan's slice 6 as it stands.

## 1. IPv4 and IPv6 listeners on one port number

### How they bind today

`ServerNetworking.start` starts one RakNet listener on `server-ip` and `port`, and a second on `::` and `server-portv6` when `server-ip` is `0.0.0.0` (`packages/prismarine/src/modules/network.ts:126-127`, `:220-231`). Each listener is a `ServerSocket`, or a `WorkerServerSocket` whose worker thread builds a `ServerSocket` and starts it with the same arguments (`packages/raknet/src/WorkerServerSocket.worker.ts:132`, `:280`). (Read.)

`ServerSocket.start` picks the socket type from the address (`packages/raknet/src/ServerSocket.ts:90-91`):

```ts
const ipv6 = isIPv6(address);
const socket = Dgram.createSocket(ipv6 ? { type: 'udp6', ipv6Only: true } : { type: 'udp4' }).unref();
```

The IPv6 socket has been IPv6-only since commit `ab14f6b7c3`, which added the second listener. `QuerySocket` binds the same way (`packages/prismarine/src/network/query/QuerySocket.ts:32`). No config check compares `port` with `server-portv6`. (Read.)

### What the experiments show

On this host (run):

| Sockets on one port | Result |
| --- | --- |
| `udp4` on `0.0.0.0`, then `udp6` on `::` with `ipv6Only: true` | Both bind. A datagram to `127.0.0.1` reaches the first and one to `::1` reaches the second |
| The same two in the other order | Both bind |
| `udp4` on `0.0.0.0`, then `udp6` on `::` without `ipv6Only` | The second fails with `EADDRINUSE` |
| `udp6` on `::` without `ipv6Only`, then `udp4` on `0.0.0.0` | The second fails with `EADDRINUSE` |
| `udp4` on `127.0.0.1`, then `udp6` on `::` without `ipv6Only` | The second fails with `EADDRINUSE` |
| One `udp6` on `::` without `ipv6Only` | Receives both, the IPv4 sender as `::ffff:127.0.0.1` |

Two `ServerSocket`s started on `0.0.0.0:19702` and `[::]:19702` both emitted `listening`, the server name advertised 19702 in both port fields, and an unconnected ping to each family got a pong (`0x1c`, 111 bytes) from the same port. Two `WorkerServerSocket`s did the same on 19703. (Run.)

So nothing prevents `server-portv6` from equaling `port` today. What would have prevented it is a dual-stack IPv6 socket, which also claims the IPv4 port on Linux, and the code does not create one.

### The smallest correct change

None to the binding code. Two additions make the behavior a contract:

- A test in `packages/prismarine/src/modules/network.test.ts` that starts a wildcard server with `server-portv6` equal to `port` and gets a pong on both families. The existing test binds both to port 0 and asserts that the two ports differ (`network.test.ts:157-173`), which says nothing about equal ports.
- A sentence in [Running a server](../guide/running.md), which lists the two ports and does not say they may be equal.

One dual-stack socket is the wrong change. It would merge two listeners into one, report IPv4 clients as `::ffff:a.b.c.d`, which changes the address every ban and log entry sees, and behave differently on each platform.

### Other platforms

Not run. From documentation and source:

- Node.js documents `ipv6Only` as "Setting `ipv6Only` to `true` will disable dual-stack support, i.e., binding to address `::` won't make `0.0.0.0` be bound" ([dgram.createSocket](https://nodejs.org/api/dgram.html#dgramcreatesocketoptions-callback)). (Read.)
- On Unix, libuv sets `IPV6_V6ONLY` to 1 when asked for `UV_UDP_IPV6ONLY` (`libuv/src/unix/udp.c:506-512`). The explicit flag is what keeps the families apart on any Unix whose default is off. macOS's default was not looked up for this note. (Read.)
- On Windows the operating system default is IPv6-only, and libuv turns it off unless the flag is set: "On windows IPV6ONLY is on by default. If the user doesn't specify it libuv turns it off." (`libuv/src/win/udp.c:240-249`). (Read.)

With `ipv6Only: true` every platform gets two separate sockets. Without it, whether the second bind fails differs by platform, and this note did not test that outside Linux.

### What NetherNet adds

libjuice creates its socket as IPv6 with `IPV6_V6ONLY` off when no bind address is set: "Listen on both IPv6 and IPv4" (`libjuice/src/udp.c:57-59`), preferring the IPv6 family (`udp.c:159`). It sets neither `SO_REUSEADDR` nor `SO_REUSEPORT`; a search for `REUSE` in its sources finds nothing. (Read.)

So a NetherNet mux on port P conflicts with both RakNet listeners on P (run):

- With the mux on 19730, Node.js got `EADDRINUSE` for `udp4` on `0.0.0.0:19730` and for IPv6-only `[::]:19730`.
- With Node.js holding `0.0.0.0:19731`, a peer connection with `enableIceUdpMux` on 19731 threw `libdatachannel error while creating datachannel: Failed to gather local ICE candidates`.
- A mux bound to `127.0.0.1:19732` failed the same way while Node.js held `0.0.0.0:19732`.

Requirement B therefore depends on requirement A's answer: whatever shares the port must leave libjuice off it.

## 2. RakNet and NetherNet on one port

The problem: libjuice binds its mux socket itself and reads it on its own thread. node-datachannel passes `bindAddress`, `enableIceUdpMux`, `portRangeBegin` and `portRangeEnd` to it (`libdatachannel/src/impl/icetransport.cpp:94-127`) and nothing else that concerns the socket.

BDS 1.26.70.24 does not face this. It dropped the `transport` and `server-portv6` settings and runs NetherNet alone, with `server-port` as the TCP signaling port and the default UDP port ([bds-server-udp-ports.md](bds-server-udp-ports.md)). Our server runs both transports by default, so the same default value puts RakNet and NetherNet on one number.

### a. Telling the datagrams apart

What the RakNet listener accepts inbound (read):

| First byte | Meaning | Where it is decided | Further check |
| --- | --- | --- | --- |
| Any, length 2 or less | Dropped | `ServerSocket.ts:182` | |
| `0x01` | Unconnected ping | `OfflineHandler.ts:80` | Offline magic at bytes 9 to 24 |
| `0x02` | Unconnected ping, open connections | `OfflineHandler.ts:76` | Offline magic at bytes 9 to 24 |
| `0x05` | Open connection request 1 | `OfflineHandler.ts:92` | Offline magic at bytes 1 to 16 |
| `0x07` | Open connection request 2 | `OfflineHandler.ts:120` | Offline magic at bytes 1 to 16 |
| `0xfe` | Query, emitted as `raw` | `ServerSocket.ts:196`, `OfflineHandler.ts:183` | `QueryResponder` requires `0xfe 0xfd` |
| `0x80` to `0xff` except `0xfe` | Connected datagram | `ServerSocket.ts:196`, `Session.ts:301-320` | Bit `0x40` is an ACK, bit `0x20` a NACK, otherwise a frame set. Needs a session for the sender's address |
| Anything else below `0x80` | Discarded as an unknown offline packet | `OfflineHandler.ts:186` | |

The offline magic is `00ffff00fefefefefdfdfdfd12345678` (`packages/raknet/src/Constants.ts`, `OFFLINE_MESSAGE_DATA_ID`).

What a NetherNet client sends to the port. NetherNet has data channels and no media, so only ICE and DTLS arrive:

- STUN. [RFC 7983 section 7](https://www.rfc-editor.org/rfc/rfc7983#section-7) assigns first bytes 0 to 3. ICE uses Binding requests and indications (`0x00`) and Binding success and error responses (`0x01`). Bytes 4 to 7 hold the magic cookie `0x2112A442`, bytes 2 and 3 hold the length of everything after the 20-byte header, and that length is a multiple of 4 ([RFC 8489 section 5](https://www.rfc-editor.org/rfc/rfc8489#section-5)). libjuice checks the same four things (`libjuice/src/stun.c:476-500`). (Read.)
- DTLS. RFC 7983 assigns first bytes 20 to 63. (Read.)

The prototype counted the first bytes of every datagram it relayed. From the client: `0x00` 8 times, `0x01` 10, `0x16` 14, `0x14` 2 and `0x17` 1,944. From libjuice: `0x00` 10, `0x01` 8, `0x16` 8 and `0x17` 1,751. (Run.)

The classes against each other:

| RakNet inbound | STUN `0x00` to `0x03` | DTLS `0x14` to `0x3f` |
| --- | --- | --- |
| `0x80` to `0xff`, `0xfe` | Disjoint | Disjoint |
| `0x05`, `0x07` | Disjoint | Disjoint |
| `0x01`, `0x02` | Same first byte | Disjoint |

The `0x01` collision is between an unconnected ping and a STUN success response. A ping's bytes 1 to 8 are a timestamp the client chooses, so bytes 4 to 7 can spell the STUN cookie by chance or on purpose. The offline magic separates them. A ping has it at bytes 9 to 24. In a STUN message those bytes are 11 bytes of the transaction ID and the first 5 bytes of the first attribute. A response's transaction ID was chosen by libjuice at random, so a real response matches the magic with probability 2^-88 at best. The rule that follows:

1. First byte `0xfe` is query, and `0x80` or above is RakNet.
2. Offline magic at offset 9 or offset 1 is RakNet.
3. First byte 0 to 3, length at least 20, the cookie at bytes 4 to 7, and a length field equal to the datagram length minus 20 and divisible by 4, is STUN.
4. First byte 20 to 63 is DTLS.
5. Everything else goes to RakNet, which discards it as it does today.

A crafted datagram can only move itself between classes. One that passes rule 2 gets a pong. One that passes rule 3 reaches libjuice, which checks the message integrity (`libjuice/src/agent.c:1343-1347`). In the prototype a ping built with the cookie at bytes 4 to 7 and a valid STUN length got its pong all 10 times. (Run.)

RakNet's own replies use bytes in the DTLS range: `0x14` (no free incoming connections), `0x19` (incompatible protocol version) and `0x1c` (unconnected pong). A server never accepts those inbound, so they do not matter here. They would matter for a client socket shared the same way, where rule 2 would have to run before rule 4, as it does above.

### b. Getting WebRTC datagrams to libjuice

With our socket on the port, STUN and DTLS datagrams arrive in Node.js and libjuice has no input for them. The only input libjuice has is its own UDP socket. So bind that socket on loopback and forward to it.

**The relay.** node-datachannel's `bindAddress: '127.0.0.1'` with `enableIceUdpMux` puts the mux on a loopback port. When the bound address is not a wildcard, libjuice offers that one address as its only host candidate (`libjuice/src/udp.c:443-448`). For each remote address that sends WebRTC datagrams, the relay holds one `udp4` socket bound to `127.0.0.1` on a port the system picks. Inbound, it sends the client's datagram from that socket to the mux port. Outbound, whatever the mux sends to that socket leaves through the public socket to the client. This is a NAT in user space.

One socket per remote address is required, not a choice. libjuice's mux finds the agent for a datagram by source address first, then by the username fragment in a STUN request, then by the transaction ID of a STUN response, and drops anything else: "Got non-STUN message from unknown source address" (`libjuice/src/conn_mux.c:338-347`, `:373`, `:411`). DTLS carries neither, so two clients behind one relay socket would be one source to libjuice. (Read.)

What breaks or needs rewriting:

**The answer's candidates.** libjuice's answer has one candidate, `127.0.0.1` and the mux port. The client must see the server's public addresses and the shared port. The prototype replaced the line with one host candidate per interface address. In the server this belongs beside `withMappedCandidates` (`packages/nethernet/src/udpPorts.ts:92`), which already rewrites the answer for `external:internal` mappings. (Run.)

**The offer's candidates.** libjuice cannot reach the client's candidates from a loopback socket. Two ways work, and both ran:

- Rewrite. Open a relay socket for each candidate in the offer and give libjuice the candidate with `127.0.0.1` and the relay port. libjuice then sends its own checks, which the relay forwards to the real candidate. Two clients needed 8 relay sockets.
- Passive. Give libjuice the offer with no candidates and drop trickled ones. libjuice learns the client from its first Binding request as a peer reflexive candidate (`libjuice/src/agent.c:1352-1363`) and answers with a triggered check. Two clients needed 2 relay sockets, and the handshake took 4 inbound STUN datagrams where the rewrite took 18.

Passive loses the server's own first checks toward the client. Those only matter when the client cannot reach the server's advertised address, and a dedicated server that takes RakNet on the same port is reachable there by definition.

**`XOR-MAPPED-ADDRESS` in libjuice's Binding responses.** libjuice writes the source address it saw, which is the relay socket: `127.0.0.1` and a relay port. The attribute is covered by `MESSAGE-INTEGRITY` and `FINGERPRINT`.

- What clients do with a mapped address that is not a local candidate. libwebrtc makes a peer reflexive local candidate from it and continues: "If the transport address does not match any of the local candidates that the agent knows about, the mapped address represents a new candidate -- a peer reflexive candidate" (`libwebrtc/p2p/base/connection.cc`, `Connection::MaybeUpdateLocalCandidate`). It does not fail the pair. werift connected and moved all data with the loopback address left in. (Read and run.)
- The relay can make it right. The key for a response is the password of the agent that received the request, which is the server's own `a=ice-pwd` from its local description. The relay learns the username fragment from each inbound Binding request's `USERNAME`, looks up the password, replaces the attribute with the client's real address, and recomputes HMAC-SHA1 and the CRC-32 fingerprint. An IPv6 client changes the attribute from 8 to 20 bytes, so the message is rebuilt and its length field rewritten. The prototype did this for every success response, and werift accepted them over IPv4 and IPv6. (Run.)

**The mapped address in the client's responses to libjuice.** The client reports the server's public address, which is not libjuice's local candidate. libjuice adds a local peer reflexive candidate and does not signal it (`libjuice/src/agent.c:1543-1557`, `:2343`). Its symmetry check compares the response's source with the address it sent the request to, both of which are the relay socket, so it passes (`agent.c:1572`). Nothing to rewrite. (Read.)

**Consent freshness and keepalives.** libjuice sends consent requests on the selected pair and expires consent after 30 seconds (`CONSENT_TIMEOUT`, `libjuice/src/agent.h:47`). They pass through the relay like any other STUN. The relay entry for a remote address must outlive that, so its idle expiry has to be longer than 30 seconds, or tied to the peer connection closing. (Read.)

**A client whose address changes.** A new source address arrives with a Binding request for a known username fragment. The relay opens a new socket and libjuice sees a new peer reflexive candidate, as it would on its own socket. (Read.)

**IPv6.** The relay sockets are IPv4 loopback whatever the client's family. The relay entry remembers which public socket the client arrived on and replies through it. With only an IPv6 address in the answer, the clients connected through the IPv6-only public socket while libjuice saw IPv4 loopback peers. (Run.)

**The player's address.** libjuice's selected candidate pair names the relay socket. The prototype printed `libjuice sees remote 127.0.0.1:38679 (host), relay table says 51.81.203.68:57197`. The backend's "selected candidate pair" answer must look the relay port up in the relay table, or every NetherNet player is logged and banned as `127.0.0.1`. (Run.)

**The mux port.** Without a port range, libjuice picked a loopback port and the second peer connection got the same one (`127.0.0.1:47835` twice). The mux is released when its last peer closes, as the plan's spike found, so the port can change between players. The answer rewrite reads the port from each answer's candidate, so it can update the relay each time. (Run.)

**The prototype's counts**, for two clients with the offer's candidates rewritten and the mapped address rewritten (run):

- Handshake: 18 STUN and 30 DTLS datagrams in, 48 relayed to the mux, 40 relayed out, 8 success responses re-signed.
- Data: 500 messages of 1,000 bytes each way per client, 2,000,000 bytes in all, every byte delivered. 2,201 datagrams relayed in and 2,016 out, which is 4,217 extra loopback datagrams, or 2.11 per 1,000 bytes.
- The same port in the same run: 10 pings over IPv4, 10 over IPv6 and 10 with the STUN cookie in the timestamp, and 30 pongs. 10 query datagrams and 10 sessionless `0x84` datagrams reached the RakNet handler. 10 DTLS records and 10 STUN requests from an address with no peer were dropped without opening a socket.
- Datagrams of class STUN or DTLS delivered to the RakNet handler: 0. Datagrams of any other class sent by the mux: 0.

Ten runs across the four combinations of rewrite or passive, mapped address kept or rewritten, IPv4 or IPv6, and two or three clients gave 1.83 to 2.11 extra datagrams per 1,000 application bytes. The datagram count differs between runs because SCTP bundles acknowledgments on a timer. The relationship does not differ: every WebRTC datagram on the public socket is exactly one more datagram on loopback. Each relayed datagram costs one extra `send` and one extra receive in the kernel, and one `Buffer` in Node.js.

### c. Kernel-level alternatives

**`SO_REUSEPORT` alone.** Two `udp4` sockets created with Node.js's `reusePort: true` both bound 19733. Of 200 datagrams from 40 senders, one socket got 110 and the other 90. Linux picks the socket by a hash of the addresses and ports, so each transport would receive about half of the other's traffic. (Run.)

**`SO_ATTACH_REUSEPORT_CBPF` or `_EBPF`.** A BPF program "defines how packets are assigned to the sockets in the reuseport group" and returns the index of the socket, numbered "in the order in which they are added to the group" (`socket(7)`, UDP support since Linux 4.5). A program that reads the first payload bytes could implement the rule from section a. It does not fit, for four reasons:

- libjuice sets no `SO_REUSEPORT`, and both sockets must have it before `bind`. That needs a patched libjuice, so it rules out node-datachannel's prebuilt addon. (Read.)
- Node.js's `dgram` has no call for an arbitrary socket option, so attaching the program needs a native addon. Bun was not checked. (Read.)
- The socket indexes depend on bind order, and libjuice binds on its first peer and releases on its last. (Read and run.)
- It is Linux only. Node.js documents `reusePort` as available "only on some platforms, such as Linux 3.9+, DragonFlyBSD 3.6+, FreeBSD 12.0+, Solaris 11.4, and AIX 7.2.5+", and as an error at bind elsewhere ([dgram.createSocket](https://nodejs.org/api/dgram.html#dgramcreatesocketoptions-callback)). libuv returns `UV_ENOTSUP` for `UV_UDP_REUSEPORT` on Windows (`libuv/src/win/udp.c:202-203`). Its Unix source notes that on the BSDs the option does not balance load: Linux, DragonflyBSD and AIX share "the port rather than steals it from the current listener", and "it's not something we can emulate on other platforms" (`libuv/src/unix/udp.c:384-393`). The BPF steering options are Linux socket options. (Read.)

### d. Hooks in libjuice and libdatachannel

libjuice's public API (`libjuice/include/juice/juice.h`) has no call that takes a socket, a send function or an inbound datagram. `juice_config_t` has a bind address, a port range and four callbacks, and `cb_recv` delivers application data after ICE. The exported functions on `master` at `6f37177d` are the same as at the bundled commit. (Read.)

`juice_mux_listen(bind_address, local_port, cb, user_ptr)` is the nearest thing. Its callback fires for a STUN Binding request whose username fragment matches no agent, and passes the two fragments and the sender's address (`libjuice/src/conn_mux.c:381-398`). It never sees a non-STUN datagram, so it cannot hand RakNet traffic on. node-datachannel's `IceUdpMuxListener` wraps it. (Read.)

Two upstream changes are possible:

- **A fallback for unclaimed datagrams.** One callback at the `Got non-STUN message from unknown source address` branch, and one function that sends from the mux socket under its send mutex. About 40 lines in libjuice. It reverses ownership, which section e covers.
- **A connection mode with no socket.** libjuice already separates agents from sockets through a table of functions per concurrency mode (`conn_mode_entry_t`, `libjuice/src/conn.h:35-52`, three entries in `conn.c`). A fourth mode would send through a callback and take inbound datagrams and timer ticks through new calls. `conn_mux.c` is 703 lines, and a mode that reuses its lookup would be a few hundred. libdatachannel would then need a configuration field for it, and node-datachannel a binding.

Neither is small enough to wait for. The first would need three projects to release before a prebuilt addon carries it.

For the scriptc FFI backend, where we build libdatachannel ourselves, a patched libjuice is possible. It would make the scriptc build work differently from the Node.js and Bun build, which runs the prebuilt addon. The relay needs only `bindAddress` and `enableIceUdpMux`, and both are in the C API's `rtcConfiguration` (`libdatachannel/include/rtc/rtc.h:191`, `:195`), so one mechanism serves both backends. (Read.)

### e. libjuice owning the port

With libjuice on port P, RakNet's datagrams arrive in libjuice's receive loop, which drops non-STUN from an unknown source and has no callback for it (`libjuice/src/conn_mux.c:343-347`). There is no path without the first patch in section d. (Read.)

With that patch the design is still worse than the relay:

- Every RakNet datagram, which is most of the server's traffic, would cross from libjuice's thread into JavaScript through a thread-safe function, and every reply would cross back.
- libjuice has one dual-stack socket, so the two RakNet listeners would become one, and requirement B would turn into address unmapping.
- The mux exists only while a peer does. RakNet would lose its socket whenever the last NetherNet player left, unless a mux listener held it open.
- `use-raknet-worker` could not own the socket.

### f. With the RakNet worker

With `use-raknet-worker`, the worker thread owns the UDP socket. The main thread sees only events the worker writes to a shared ring, which the game loop reads once per tick through `pollInbound` (`packages/prismarine/src/Server.ts:272`, `packages/raknet/src/WorkerServerSocket.ts:191-199`). Commands go the other way through a second ring that the worker drains on a 1 ms timer (`WorkerServerSocket.worker.ts:266-270`). (Read.)

The demultiplexer must run where the datagram arrives, which is `ServerSocket.handleMessage` inside the worker. The relay sockets belong there too:

- **Relay in the worker.** A WebRTC datagram costs the worker one classification and one `send` to loopback, and libjuice reads it on its own thread. The main thread is not involved. Per datagram: 0 ring records, 0 `postMessage` calls and no copy beyond the relay's own.
- **Relay on the main thread.** Each inbound datagram would be copied into the ring with a 9-byte header and the address, wait for the next tick's `pollInbound`, and then be sent to loopback. Each outbound datagram would be copied into the command ring and wait for the worker's timer. That is two extra copies per datagram and up to a tick of delay on ICE, DTLS and SCTP, whose timers assume network latency. It also shares the ring's 8 MiB capacity with RakNet.

The worker needs three pieces of control data, none of them per datagram:

- The mux port, when an answer is made and the port differs from the last one.
- Each peer's local username fragment and ICE password, when its answer is made, and its removal when the peer closes. Without them the worker cannot re-sign the mapped address or refuse Binding requests for unknown fragments.
- From the worker to the main thread, each new relay entry's port and real address, so the backend can report a player's address.

That is a few messages per player. A server with both listeners has two workers and two relay tables, and they do not interact, because each relay socket is its own port.

The same code path serves socket mode, where `ServerSocket` runs on the main thread. There the relay shares the event loop with the game, so a long tick delays WebRTC datagrams. That is a change from libjuice reading its own socket on its own thread, and it is the reason to prefer the worker when the port is shared.

## 3. Recommendation

### The design

Share the port through a loopback relay in the code that owns RakNet's socket.

1. **When it applies.** Only when NetherNet's local UDP port equals `port` or `server-portv6` and RakNet is enabled. A `server-udp-ports` value that names another port or a range keeps libjuice on its own sockets, as the plan's slices 4 and 6 have it. With RakNet off, libjuice takes the port itself.
2. **libjuice on loopback.** The node-datachannel backend sets `enableIceUdpMux` and `bindAddress: '127.0.0.1'` with no port range. The FFI backend sets the same two fields.
3. **Classification in `packages/raknet`.** `ServerSocket.handleMessage` applies the five rules from section a before its own dispatch. STUN and DTLS go to the relay. The classifier and the relay are one module in `packages/raknet`, since that package owns the socket and the worker. It knows the two byte ranges from RFC 7983 and nothing else about WebRTC.
4. **One relay socket per remote address.** Created for a Binding request that names a live local username fragment, capped at a number tied to `max-players`, and closed when its peer closes or after an idle period longer than 30 seconds. DTLS from an address with no entry is dropped.
5. **Passive candidates.** The backend strips candidates from the offer it gives libjuice and drops trickled ones.
6. **The answer.** The loopback candidate becomes one host candidate per advertised address with the shared port, next to the existing mapping step.
7. **The mapped address.** The relay rewrites `XOR-MAPPED-ADDRESS` in success responses and signs them again. werift and libwebrtc's source both tolerate the loopback address, so this is not needed for function. It removes the only difference a client can observe between the relay and libjuice on the port, and a Bedrock client refusing the new backend is the plan's first risk.
8. **The player's address.** The backend translates libjuice's selected remote candidate through the relay table.

### The fallback

If a Bedrock client refuses a connection through the relay but accepts libjuice on its own port, the answer is a separate `server-udp-ports` value. That is the configuration BDS 1.26.63.1 documented and the one slice 6 already builds. The default would then keep the two numbers apart, and the docs would say that a server offering both transports needs two UDP ports.

If one number is still required after that, `dev/werift-mux` composes with the classifier without a relay. werift's sockets are Node.js sockets, so the code that owns the port can hand STUN and DTLS datagrams to werift in process. That brings back the costs ADR 0006 lists for werift.

### Risks

- **A Bedrock client.** Every run here used werift as the client. libwebrtc was read, not run. Slice 7's cinnabar and retail joins must run on a shared port.
- **The event loop is in the path.** In socket mode a blocked tick delays ICE, DTLS and SCTP datagrams. The worker avoids it.
- **Loopback drops.** The relay adds a queue between two sockets. A burst that overruns the mux socket's receive buffer is lost and SCTP resends it. libjuice asks for 1 MiB buffers on its socket (`libjuice/src/udp.c:82-84`). The relay sockets should ask for the same through the existing `SocketBufferOptions`.
- **File descriptors.** One per NetherNet player, plus more for a client that changes address. The cap bounds it.
- **A flood of Binding requests.** The username fragment check and the cap keep a flood from opening sockets. A fragment is public to anyone who asks the signaling endpoint for an answer, so the cap is what holds.
- **What libjuice set on its socket no longer reaches the wire.** The don't-fragment flag and the DiffServ value apply to loopback only. The public socket sends with Node.js's defaults.
- **The mux port changes.** The relay must take it from each answer.
- **Two mechanisms.** A separate port and a shared port take different paths through the backend, and both need the plan's tests.

### Tests

All counts. None asserts a duration.

1. **Classifier table.** Each accepted RakNet first byte, built with the real encoders (`UnconnectedPing`, `OpenConnectionRequest1`, `OpenConnectionRequest2`, a frame set, an ACK, a NACK), classifies as RakNet. A query datagram classifies as query. A Binding request, a success response and DTLS records taken from a recorded handshake classify as STUN and DTLS. A ping with the STUN cookie at bytes 4 to 7 and a valid STUN length classifies as RakNet.
2. **Totality.** For every first byte from 0 to 255 with a fixed set of tails, the classifier returns exactly one class, and the classes of the 256 results match the table in section a.
3. **Routing counts on one port.** Two werift clients, one RakNet client and one query sender use the same port number. Assert that the RakNet handler received 0 datagrams of class STUN or DTLS, that the relay forwarded 0 datagrams of class RakNet or query, that pongs equal pings, and that the query got its reply.
4. **Bytes through the shared port.** Bytes received equal bytes sent in both directions on each data channel, while the RakNet session on the same port delivers its frames.
5. **One extra datagram.** Datagrams the relay sent to the mux equal the STUN and DTLS datagrams accepted on the public socket, and datagrams the relay sent on the public socket equal those it received from the mux.
6. **Sockets.** With passive candidates, the relay holds one socket per connected peer, and none after the peers close. A DTLS record and a Binding request with an unknown fragment from a new address leave the socket count unchanged and add 2 to the dropped count.
7. **The answer.** Every candidate port in the answer equals the shared port, and no candidate names `127.0.0.1`.
8. **The mapped address.** Every success response leaving the public socket carries the destination address in `XOR-MAPPED-ADDRESS`, and its `MESSAGE-INTEGRITY` verifies under the peer's local password.
9. **The player's address.** The address the server records equals the address of the client's selected local candidate.
10. **Both families.** A wildcard server with `server-portv6` equal to `port` answers a ping on each family, in socket mode and worker mode, and a NetherNet client connects through each family's socket.
11. **The worker.** During a data exchange over NetherNet with `use-raknet-worker`, the inbound ring gains 0 records.
12. **Client e2e.** The NetherNet suite of slice 7 runs with `server-udp-ports` equal to `port`.

A family in `packages/parity` is not called for. This is transport plumbing with no data-driven comparison against BDS.

## Not checked

- A Bedrock client, cinnabar or retail, through the relay. This is the main unknown.
- macOS and Windows. The binding claims for them are read from Node.js and libuv.
- Bun. The spike ran node-datachannel under Bun 1.3.14. The relay uses only `node:dgram`, and nobody ran it there.
- The relay inside `ServerSocket` or the worker. The prototype is a standalone script with a fake RakNet responder. The repository's `ServerSocket` and `WorkerServerSocket` were run only for the two-family test.
- Load. Nothing measured loopback drops or the relay's cost with many players.
- Whether an `IceUdpMuxListener` on the loopback port keeps the mux, and so its port, alive between players.
- An mDNS candidate or a client that offers no usable candidate. Passive mode does not read the offer's candidates, so neither should matter.
- libwebrtc's behavior was read from `main`, not from the version a Bedrock client ships.

## Reproduction

Everything ran in a scratch directory outside the repository, here `$S`, with the repository at `$R`. No experiment changed a repository file.

Sources:

```sh
mkdir -p "$S/src/libjuice" "$S/src/ldc" "$S/src/ndc" "$S/src/refs"
curl -sL https://codeload.github.com/paullouisageneau/libjuice/tar.gz/b89c792e | tar xz --strip-components=1 -C "$S/src/libjuice"
curl -sL https://codeload.github.com/paullouisageneau/libdatachannel/tar.gz/v0.24.6 | tar xz --strip-components=1 -C "$S/src/ldc"
curl -sL https://codeload.github.com/murat-dogan/node-datachannel/tar.gz/v0.33.6 | tar xz --strip-components=1 -C "$S/src/ndc"
curl -sL https://raw.githubusercontent.com/paullouisageneau/libjuice/master/include/juice/juice.h -o "$S/src/refs/juice-master.h"
diff <(grep JUICE_EXPORT "$S/src/refs/juice-master.h") <(grep JUICE_EXPORT "$S/src/libjuice/include/juice/juice.h")   # no output
grep -rn REUSE "$S/src/libjuice/src" "$S/src/libjuice/include"                                                          # no output
curl -sL "https://webrtc.googlesource.com/src/+/refs/heads/main/p2p/base/connection.cc?format=TEXT" | base64 -d > "$S/src/refs/connection.cc"
curl -sL https://raw.githubusercontent.com/libuv/libuv/v1.x/src/win/udp.c -o "$S/src/refs/uv-win-udp.c"
curl -sL https://raw.githubusercontent.com/libuv/libuv/v1.x/src/unix/udp.c -o "$S/src/refs/uv-unix-udp.c"
man 7 socket   # SO_ATTACH_REUSEPORT_CBPF
```

Section 1. `dualstack.mjs` binds each pair of sockets in the table on port 19701 and sends one datagram per family. The other two scripts import `ServerSocket` and `WorkerServerSocket` from the repository's source, start one on `0.0.0.0` and one on `::` with the same port, and send an unconnected ping to `127.0.0.1` and `::1`:

```sh
TSX="$R/node_modules/.pnpm/tsx@4.23.15/node_modules/tsx/dist/cli.mjs"
node "$S/scripts/dualstack.mjs"
node "$TSX" "$S/scripts/raknet-samep.mts"                                # bound 19702 19702, a 0x1c pong per family
(cd "$R/packages/raknet" && node "$TSX" "$S/scripts/raknet-worker-samep.mts")   # advertised 19703 19703, a 0x1c pong per family
```

Section 2. `extras.mjs` runs the four side experiments: a mux on 19730 and then Node.js binds, Node.js on 19731 and then a mux, a loopback mux with and without a port range, and two `reusePort` sockets on 19733 with 200 datagrams from 40 senders.

```sh
node "$S/scripts/extras.mjs" "$R"
```

`shared-port.mjs` is the prototype. It imports node-datachannel's polyfill and werift by absolute path from the repository's `node_modules/.pnpm`. It binds `udp4` on `0.0.0.0` and IPv6-only `udp6` on `::`, both on `--port`, classifies each datagram with the five rules, answers pings itself, and relays STUN and DTLS through one `127.0.0.1` socket per remote address to a mux made with:

```js
new RTCPeerConnection({ iceServers: [], enableIceUdpMux: true, bindAddress: '127.0.0.1', portRangeBegin: MUX, portRangeEnd: MUX });
```

Each werift client creates `ReliableDataChannel` and `UnreliableDataChannel`, as a NetherNet client does, and the script passes the offer and answer between the two peers in process, rewriting the candidates on the way. It then sends pings, query datagrams, a sessionless connected datagram, and stray STUN and DTLS to the same port, and 500 messages of 1,000 bytes each way on every reliable channel.

```sh
node "$S/scripts/shared-port.mjs" "$R"                                        # offer candidates rewritten, mapped address rewritten
node "$S/scripts/shared-port.mjs" "$R" --candidates passive --mapped keep
node "$S/scripts/shared-port.mjs" "$R" --candidates passive --mapped rewrite --family 6
node "$S/scripts/shared-port.mjs" "$R" --candidates rewrite --mapped keep --family 4
node "$S/scripts/shared-port.mjs" "$R" --candidates rewrite --mapped rewrite --family 6 --clients 3
```

The last lines of the first run:

```text
libjuice sees remote 127.0.0.1:38679 (host), relay table says 51.81.203.68:57197, werift nominated 51.81.203.68:19720
application bytes delivered: [{"atServer":500000,"atClient":500000},{"atServer":500000,"atClient":500000}]
pongs received: 30 of 30
counts at end: {"in":{"stun":28,"dtls":2241,"raknet":40,"query":10,"empty":0},"toMux":2249,"fromMux":2056,"droppedNoRelay":20,
  "raknetHandled":50,"raknetGotWebRtc":0,"muxGotRakNet":0,"mappedRewritten":8,"relaySockets":8}
data phase: 2201 datagrams relayed in, 2016 relayed out, 4217 extra loopback datagrams for 2000000 application bytes
```

The rewrite of `XOR-MAPPED-ADDRESS` in the prototype, in outline: copy the 20-byte header, write the attribute with the client's port XORed with `0x2112` and its address XORed with the cookie (and the transaction ID for IPv6), copy every other attribute up to `MESSAGE-INTEGRITY`, set the header length to include a 24-byte integrity attribute and append HMAC-SHA1 of the message under the local `a=ice-pwd`, then set the length to include an 8-byte fingerprint and append CRC-32 XORed with `0x5354554e`.
