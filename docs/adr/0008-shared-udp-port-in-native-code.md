# Share one UDP port between RakNet and NetherNet in native code

Status: accepted.

Bedrock Dedicated Server 1.26.70 uses `server-port` for NetherNet's UDP when `server-udp-ports` is
unset. It can, because it runs NetherNet alone. We run RakNet and NetherNet together by default,
and RakNet also wants that UDP port. Our native networking library owns the shared port through
libjuice, libdatachannel's ICE library, and sorts each datagram by its structure before libjuice
looks it up. RakNet's datagrams go to RakNet through a shared-memory ring, and WebRTC's stay in
native code. WebRTC traffic never enters JavaScript, and RakNet's traffic enters it in batches.

The research behind it is in
[the research note](../research/nethernet-raknet-shared-port.md), which built and ran a JavaScript
relay first. That relay is the alternative below.

## Why native code owns the port

libdatachannel's point is that ICE, DTLS and SCTP run in native code, off the event loop. A relay
in JavaScript puts each WebRTC datagram through the event loop twice, once received from the
public socket and once sent to libjuice over loopback, for three system calls where libjuice alone
makes one. RakNet's datagrams are handled in JavaScript in any case, so moving the classification
to the native side costs RakNet nothing it does not already pay, and frees WebRTC of the event
loop.

## Why we sort by structure first

libjuice already sorts datagrams on its mux socket: by source address for a known peer, then by
the username fragment in a STUN Binding request. Whatever matches no peer is dropped
(`conn_mux_process` in `src/conn_mux.c`). Routing RakNet through that lookup works, and it costs
more than it looks:

- Every RakNet datagram is a miss. The address table is open addressing with linear probing
  (`find_map_entry`), and a miss scans to the next empty slot.
- A peer that leaves turns its slots into tombstones (`MAP_ENTRY_TYPE_DELETED` in
  `remove_map_entries`), and only a resize clears them. On a server where players come and go, a
  miss scans past more tombstones over time.
- The lookup runs under the registry's mutex, which libjuice's sends for every peer also take.

The protocols on the port tell themselves apart by their bytes
([RFC 7983](https://www.rfc-editor.org/rfc/rfc7983) for STUN and DTLS). So our C layer classifies
each datagram first, on libjuice's thread, and only the ones that can be WebRTC reach the lookup:

| Checked | Bytes | Class | Goes to |
| --- | --- | --- | --- |
| 1 | First byte `0x80` to `0xFF` | Connected RakNet (frame sets, ACK, NACK), and query at `0xFE 0xFD` | RakNet |
| 2 | First byte `0x01` or `0x02`, with RakNet's offline magic at offset 9 | Unconnected ping | RakNet |
| 3 | First byte `0x05` or `0x07`, with the offline magic at offset 1 | Open connection request | RakNet |
| 4 | First byte 0 to 3, with STUN's cookie at bytes 4 to 7 and a length that is a multiple of 4 | STUN | libjuice |
| 5 | First byte 20 to 63 | DTLS | libjuice |
| 6 | Anything else | Unsure | libjuice, then RakNet if libjuice claims it for no peer |

The rules run in that order, and the first that matches decides. A STUN success response also
starts `0x01`, and a RakNet ping can carry STUN's cookie at bytes 4 to 7 by chance, so the RakNet
magic is checked before the cookie. A STUN message that carried the 16-byte magic at offset 9 would
go to RakNet, which drops it.

Almost all of RakNet's traffic is connected datagrams, which the first byte settles. Only an
unsure datagram pays for the lookup, and RakNet's protocol code ignores what is not RakNet.

## What we build

**Three additions to libjuice.** A filter callback that sees each datagram before the lookup and
says whether libjuice keeps it, a callback for each datagram the mux claims for no peer, and a
function that sends a datagram from the mux socket to an address. The classifier itself is in our
C layer, so the patch stays generic. The mux socket is one dual-stack socket (`IPV6_V6ONLY` off in
`src/udp.c`), so it serves RakNet's IPv4 and IPv6 clients on the shared number too. We carry the
change as a patch on the libjuice we build, and offer it upstream.

**Rings between the native side and RakNet.** The classifier copies each RakNet datagram, with
its address, into an inbound ring in shared memory, and wakes the consumer once per batch rather
than once per datagram. RakNet writes outgoing datagrams into an outbound ring, which the native
side sends from the mux socket. With the RakNet worker, the worker is the consumer and the
producer, so the main thread sees none of it. `SharedByteRing` in `packages/raknet` already
carries datagrams between the worker and the main thread in this shape.

**A datagram source in `packages/raknet`.** `ServerSocket` reads from and writes to a source: a
Node.js UDP socket, as today, or the native rings. RakNet's protocol code does not change. Query,
which already answers on RakNet's socket, comes with it.

**Only where the ports collide.** The native side owns a NetherNet port that equals `port` or
`server-portv6` while RakNet is on: a single port, or the one port of a range that equals either.
RakNet keeps its own Node.js sockets for any port it does not share. With RakNet off, nothing
changes for libjuice.

## What it costs

- Our own build of libjuice and libdatachannel, for every platform we ship, since a prebuilt
  node-datachannel cannot take the patch. [ADR 0006](0006-libdatachannel-for-nethernet-server.md)
  makes that build the only driver, so this adds the patch and the rings, not the build.
- A thread boundary in RakNet's path when the port is shared: one copy into the ring per datagram,
  and one wake per batch. A long tick no longer delays WebRTC, and it still delays RakNet as it does
  today.
- Two kinds of datagram source in RakNet, both under its tests.
- An unsure datagram from an address libjuice has mapped goes to that peer. Connected RakNet never
  reaches the lookup, so this only touches a client that sends both transports from one socket.
- The patch stays ours until libjuice takes it.

## Alternatives not taken

**A JavaScript relay.** RakNet's socket sorts each datagram by its first bytes and relays STUN and
DTLS over loopback to libjuice on `127.0.0.1`, with the answer's candidates rewritten. It needs no
native change, and the research note ran it: werift clients moved data through one port while it
answered RakNet pings. It puts every WebRTC datagram through the event loop twice, which undoes
what libdatachannel is for.

**Keep the two port numbers apart by default.** It needs none of this. It gives up BDS's default,
and every server that offers both transports needs two UDP ports open. It is the fallback if a
Bedrock client refuses the shared port.

**`SO_REUSEPORT` with both sockets on the port.** The kernel splits datagrams by a hash of the
sender, not by content. In a run, 200 datagrams split 110 and 90. Steering by content needs BPF,
which is Linux only.

**Route everything through libjuice's lookup**, with only the drop turned into a callback. It is a
smaller patch, and it makes every RakNet datagram pay for a miss that grows with player churn.

**A libjuice connection mode with no socket of its own**, fed by us. libjuice's modes are a table
of functions (`conn.h`), so it is possible. It moves the socket into our code and every receive
into JavaScript or a second native component, for no gain over the callback.

## Room for a native RakNet

RakNet in native code is not part of this decision, and the design leaves room for it. The
classifier hands RakNet's datagrams to a destination in the C layer, which is the rings today. A
native RakNet would be another destination in the same library, and would hand the server
sessions and frames instead of datagrams. On the JavaScript side, `ServerSocket`'s datagram source
is the seam today, and a native RakNet would replace the whole RakNet transport behind the server's
transport interface, as NetherNet sits behind it.
