# NetherNet transport

Started 2026-11-10. Work happens on `dev/nethernet-transport`, tracked in a draft pull request. This
plan is a working document: tick slices off, and add or reshape them as the work teaches us things.

## Goal

Accept Bedrock clients over NetherNet, the WebRTC transport that Bedrock Dedicated Server (BDS) has
defaulted to since 1.26.50, alongside RakNet. Make the server visible on the LAN again. Leave the
transport seam generic enough that a Java Edition transport can be added later without reshaping
it.

Requirements from the request:

- Use [`nethernet`](https://github.com/PrismarineJS/node-nethernet) (npm `nethernet`, PrismarineJS's
  node-nethernet) for the WebRTC side. **No longer holds**, from 2026-11-11:
  [ADR 0007](../adr/0007-own-nethernet-protocol.md) replaced it with our own protocol code, and
  [ADR 0006](../adr/0006-libdatachannel-for-nethernet-server.md) moved the WebRTC stack from werift
  to libdatachannel ([webrtc-backend.md](webrtc-backend.md)).
- `enable-raknet` and `enable-nethernet` config keys, both on by default, so both transports run side
  by side.
- `enable-lan-visibility`, named as BDS names it and on by default, as BDS ships it.

## Status

Updated 2026-11-11: NetherNet now runs on `NetherNetServer` and `NetherNetClient` in
`@jsprismarine/nethernet`, over libdatachannel in `@jsprismarine/native-network`; werift, npm
`nethernet` and `protodef` are gone. `port` is `server-port`, and with the defaults RakNet and
NetherNet share its UDP port. The rest of this section is as of 2026-11-10, and names werift and
`nethernet` where they were.

As of 2026-11-10. Both transports run side by side, on by default:

- **RakNet** works as before, now behind the transport-neutral seam, and also listens on IPv6 at
  `server-portv6`.
- **NetherNet** joins work two ways: by address over HTTP signaling on the TCP side of `port`, and
  on the local network over UDP 7551, where the server also advertises itself. `server-udp-ports`
  constrains and advertises its UDP ports.
- **Our own client** joins our server and Bedrock Dedicated Server 1.26.51.1 over NetherNet, by
  address, in offline and online mode, and spawns.
- **A retail client** (iOS 1.26.62, on mobile data) joins our server by address over NetherNet,
  logs in online and spawns, then disconnects within seconds with `ClientDisconnection-90`. See
  slice 17.
- **Left before the pull request merges:** the cinnabar run (slice 9) and the rearchitecture plan
  note (slice 10). The retail post-spawn disconnect (slice 17) can follow in its own pull request
  if it turns out not to be NetherNet's.

## What we know

Facts gathered on 2026-11-10, from the sources listed.

**BDS 1.26.51.1, run locally with `transport=nethernet`:**

- It listens on TCP `server-port` (dual-stack) for HTTP signaling, and on UDP 7551 for LAN discovery.
  Gameplay runs over UDP ports that WebRTC allocates per client.
- `GET /v1/join` answers `200` with `application/json`:
  `{"name":"Dedicated Server","protocol":2193,"version":"1.26.51","level":"Bedrock level","players":0,"maxPlayers":10,"gameType":0}`.
  Any other path answers `404` `text/plain` `Not Found`.
- `POST /v1/join/{networkId}` answers `200` `application/sdp`. An offer without `a=identity` got the
  body `37`, not an SDP answer. That code is not in the error tables we have, so its meaning is open.
- `server.properties` documents `enable-lan-visibility=true`: "Listen and respond to clients that are
  looking for servers on the LAN." With `transport=raknet`, BDS also binds the default ports
  (19132, 19133) for LAN even when `server-port` differs.

**[Mojang's NetherNet HTTP signaling guide](https://mojang.github.io/bedrock-protocol-docs/guides/nether-net-onboarding-guide/):**

- The client probes `GET /v1/join`. A 2xx means NetherNet, and the JSON fills the server list. Any
  other status means the client does not try WebRTC.
- The client POSTs its complete SDP offer (full ICE, no trickle) with `Content-Type: application/sdp`
  to `/v1/join/{networkId}`, where `networkId` is the client's own ID as an opaque string. The
  response body is the complete SDP answer. One request per attempt, no retry.
- The client creates the data channels: `ReliableDataChannel` (ordered, reliable) and
  `UnreliableDataChannel` (unordered, `maxRetransmits: 0`). Each message starts with a byte that
  counts the fragments still to follow.
- The answer must carry a session-level `a=identity`: base64 of
  `{"idp":{"domain":…,"protocol":"default"},"assertion":"<JSON string>"}`, where the assertion holds
  `token` (a JWT self-signed with the key in its `cpk` claim, a JWK) and `fingerprints` (a detached
  JWS over canonical `{"fingerprint":[{"algorithm":"sha-256","digest":"<SDP fingerprint>"}]}`). The
  client rejects an answer without one. Over plain HTTP the client pins the `cpk` digest and prompts
  the player the first time it sees a key, so the server key must persist across restarts.
- The offer carries the client's own `a=identity` with a GameServerToken. Verifying it is "a server
  policy decision".
- The guide leaves open: the outer base64 variant, the JWS signature encoding, and how a server
  learns its reflexive address behind NAT.

**[`nethernet` 1.1.2](https://www.npmjs.com/package/nethernet):**

- `Server` does LAN discovery and signaling on UDP 7551 (`listen()`), answering discovery requests
  with the buffer given to `setAdvertisement`. It does not implement HTTP signaling, but
  `handleOffer(signal, respond)` and `handleCandidate` accept signals from any channel. Werift waits
  for ICE gathering, so the answer SDP already lists its candidates.
- Connections are keyed by a `bigint` connection ID, not an IP address. `encapsulated` delivers
  reassembled messages.
- Pure JavaScript WebRTC through werift by default. Needs Node 24 or newer; the workspace requires
  26.4.

**[`bedrock-protocol` 3.61](https://github.com/PrismarineJS/bedrock-protocol), the other `nethernet`
consumer:**

- Over NetherNet a batch has no `0xFE` header. bedrock-protocol's client still reads
  `ServerToClientHandshake` and answers it, but never turns encryption on; DTLS covers the wire.
  (The hill climb below confirmed BDS does the same.)
- The LAN advertisement is version 7: varint-prefixed strings and zigzag varints for MOTD, protocol,
  game version, level name, player counts, game mode, editor and hardcore flags, accepted auth kinds,
  a nonce, and a connection type.

**[cinnabar](https://github.com/cinnabar-mc/cinnabar)**, the client the e2e harness drives, joins
addressed servers over NetherNet through a go-nethernet fork. Its source answers the encoding
questions above, and it can verify the join end to end.

**This repository, when the work started:**

- `packages/prismarine/src/network/transport/Transport.ts` already defines the seam the
  [rearchitecture plan](server-rearchitecture.md#network-stack) describes. It still speaks RakNet's
  `InetAddress` in `onDisconnect`, `onFrame` and `onRaw`, and `ClientConnection` takes a
  `RakNetTransportConnection`.
- `BatchCodec` and `EncryptionCodec` in `@jsprismarine/protocol` read and write the `0xFE` byte, and
  `@jsprismarine/client` uses them too.
- The query protocol rides RakNet's raw datagrams.

## Design

- **The server names every connection.** A `ConnectionId` is allocated once per accepted connection
  from one `ConnectionIds` allocator that every transport of a server shares: 1, 2, 3 in accept
  order, never reused. The session registry, the per-connection frame queues, and packet traces and
  their replay all key on it. A transport's own peer key (RakNet's `address:port`, the connection ID
  a NetherNet client picks) stays private to that transport, in `KeyedTransport`. So two transports
  can never hand the dispatcher the same identity, a client reconnecting from the same port is a new
  connection, and a trace captured on one server replays against a fresh one because both number
  connections the same way. `MultiTransport` owns the allocator and hands it to the transports it
  builds, so no wiring can give two of them separate sequences.
- **Transport-neutral seam.** Frames and disconnects carry the `ConnectionId`; each connection
  describes its peer with an `InetAddress`, used as a plain IP-and-port value. Raw datagrams
  (`onRaw`) are optional, and only RakNet provides them.
- **Frames are Bedrock batches as RakNet carries them**, starting with `0xFE`. The NetherNet transport
  adds the byte to what it receives and strips it from what it sends, so the protocol codecs and the
  client package stay as they are. A Java transport would carry Java packet frames to its own
  session pipeline; the seam only moves opaque frames and never interprets them.
- **Capabilities describe the transport, the login follows BDS.** `capabilities.encrypted` says
  DTLS covers the wire: the login still sends `ServerToClientHandshake` but leaves encryption off, as
  BDS does over NetherNet. `maxFrameSize` is `nethernet`'s message limit, which its fragmenting
  allows.
- **One dispatcher, several transports.** A `MultiTransport` merges the enabled transports into one
  `Transport`, so `NetworkDispatcher` serves them all through one subscription.
- **Networking owns the listeners.** `ServerNetworking` starts each enabled transport and the LAN
  advertiser from config, and keeps the advertisement current as players join and leave.
- **Shared parts get one home.** What two transports or two advertisers would both write lives in one
  module: `Subscription` runs one event's listeners; `BaseTransport` holds subscriptions and
  per-connection ordering; `KeyedTransport` maps wire keys to connection IDs; one server status snapshot
  (MOTD, level, version, player counts, game mode) feeds the RakNet pong, the LAN advertisement and
  `GET /v1/join`; the data channel's fragment framing stays in `nethernet`.
- **One package per transport.** `@jsprismarine/nethernet` sits beside `@jsprismarine/raknet` and
  holds what the server and the client share: signaling, identities, the LAN advertisement and the
  ES384 JWS. Each side's transport adapts it to Bedrock batches. A Java transport gets its own
  package the same way.
- **The advertised player count has one owner.** `ServerNetworking` counts live connections across
  transports and calls `ServerName.ownPlayerCount()`, so RakNet's sockets stop setting it.
- **Signaling sits apart from the WebRTC peer.** The HTTP signaling server on TCP `server-port` and
  the LAN signaling on UDP 7551 both feed the same `nethernet` `Server` through `handleOffer`. The
  answer gets `a=identity` from a server identity key stored beside the world data.

## Slices

Each slice is one or more small commits that leave the tree building, linted and tested. Check off a
slice when it lands on the branch.

1. [x] **Plan.** This document.
2. [x] **Connection identity and a neutral transport seam.** `ConnectionId` from one allocator keys the
   session registry, frame queues and traces; frames and disconnects carry it; every
   `TransportConnection` has its peer `address`; `onRaw` is optional; `ClientConnection` and
   `LoginHandler` read the address from the transport connection. `BaseTransport` and
   `KeyedTransport` hold what `RakNetTransport` used to own. `InetAddress` stays as the peer address
   value type: every transport, including a future Java one, has an IP address and port.
3. [x] **Capability-driven encryption.** On a transport that reports `encrypted`, send
   `ServerToClientHandshake` but leave encryption off, as BDS 1.26.51 does over NetherNet. (First
   written to skip the handshake; the BDS hill climb showed BDS sends it.)
4. [x] **Multiple transports.** `MultiTransport` owning the shared allocator, forwarding events with
   each child's ordering intact, and `close` fanning out. `ServerNetworking` builds it from the
   enabled transports (after the config slice). Unit tests with manual transports.
5. [x] **Config.** `enable-raknet`, `enable-nethernet` and `enable-lan-visibility`, all defaulting to
   `true`, in `Config`, the JSON schema and the generated settings docs. Refuse to start with both
   transports off.
6. [x] **NetherNet transport over LAN signaling.** Add `nethernet` to `@jsprismarine/prismarine`.
   `NetherNetTransport` wraps `nethernet`'s `Server`: connections, frames with the `0xFE` adaptation,
   disconnects and close. The peer's address comes from the ICE candidate pair werift chose. A
   loopback test drives a real `nethernet` `Client` through WebRTC; it skips itself when another
   program holds UDP 7551, which a running dev server does.
7. [x] **LAN visibility.** The version 7 advertisement is byte-identical to a captured BDS
   1.26.51.1 answer and follows the shared `ServerName`; UDP 7551 is bound only with LAN visibility
   on. RakNet LAN visibility stays as it is: the RakNet socket answers broadcast pings on the
   configured port, which is the default one unless changed. Binding 19132 as well when `port`
   differs, as BDS does, is left out: current clients discover LAN games over NetherNet.
8. [x] **HTTP signaling.** `HttpSignaling` serves `GET /v1/join` (the shared status, as BDS spells it)
   and `POST /v1/join/{networkId}` on TCP `port`, under a connection ID it picks, with go-nethernet's
   refusals and limits. `NetherNetIdentity` signs `a=identity` into each answer the way go-nethernet
   does (ES384 token with `x5u` and a JWK `cpk`, detached ES384 over canonical fingerprints, padded
   base64, domain `self`) and keeps its key in `nethernet-identity.pem`. The offer's `a=identity`
   is stripped and not checked (see open questions). A loopback test joins a real `nethernet`
   client by address over HTTP and exchanges batches; no fixed port is involved.
9. [ ] **End-to-end verification.** Join over NetherNet with cinnabar through the client e2e
   harness: cinnabar picks NetherNet when `GET /v1/join` answers 2xx, so the PR's Client E2E job
   exercises it once its pinned cinnabar has addressed NetherNet joins. Not runnable on the
   development host (no Go toolchain). Add a scenario that names the transport if the harness
   gains a way to choose it.
10. [ ] **Docs and release.** Done: the running guide's Networking section (ports, firewall, NAT
    limits, the identity file, with the LAN port and file name as docs facts), Changesets for each
    slice, and this plan. Left: mark NetherNet done in the
    [rearchitecture plan](server-rearchitecture.md) once the client e2e run confirms a real join.

11. [x] **`@jsprismarine/nethernet`.** A transport package beside `@jsprismarine/raknet`, so the
    server and the client share one home for NetherNet: SDP helpers, the ES384 JWS, `a=identity`
    signing and verification (the server's JWK `cpk`, the client's base64 DER `cpk`), the LAN
    advertisement codec, the join status and HTTP signaling for both ends. It depends on
    `@jsprismarine/binaryutils` and npm `nethernet`, with its own small logger interface; the `0xFE`
    batch id stays in each side's transport, which already knows the Bedrock batch. LAN discovery
    from the client side is not written yet.
12. [x] **Client NetherNet transport.** `@jsprismarine/client` gets a NetherNet `ITransport` that
    joins by address: probe `GET /v1/join`, post a signed offer, verify the answer's identity, then
    carry batches. `Client` picks it with `network: 'nethernet'`. The login test joins the in-process
    server over NetherNet and spawns.
13. [x] **Hill climb against BDS.** The client joins BDS 1.26.51.1 (`transport=nethernet`,
    `online-mode=false`) and spawns. What it took, on 2026-11-10:
    - BDS answers `37` to an offer without `a=identity` and accepts a self-signed client identity
      (base64 DER `cpk`, domain `self`).
    - With LAN visibility off, BDS answers `GET /v1/join` with `200` and an empty body, so the probe
      treats any 2xx as NetherNet and the status as optional.
    - BDS sends `ServerToClientHandshake` over NetherNet but keeps batches in the clear; an
      encrypted `ClientToServerHandshake` stalls the login. Client and server now both leave
      encryption off on an encrypting transport.
    Next rungs: online mode (slice 16), and a real game client through cinnabar (slice 9).
14. [x] **One owner for the player count.** RakNet's sockets report sessions through
    `ServerName.setSessionCount`, which `ServerName.ownPlayerCount()` turns off. `ServerNetworking`
    and the RakNet worker's mirror of the main thread's name both own the count.
15. [x] **`server-udp-ports`.** BDS's setting, in BDS's syntax: a local UDP port range for WebRTC,
    and optionally the external address and ports clients should be told about, for a server behind
    NAT or a firewall. `constrainIcePorts` gives werift the range (`nethernet` 1.1.2 has no option
    for it), and `withMappedCandidates` adds a server-reflexive candidate for each mapped host
    candidate in the answer. Werift takes a port per player, so a single local port is refused.
    - Corrected 2026-11-11: [webrtc-backend.md](webrtc-backend.md) slice 9 replaced this. NetherNet
      runs on libdatachannel, a single port serves every player, and the setting and
      `server-public-ip` follow Bedrock Dedicated Server 1.26.70.24.
16. [x] **Hill climb online mode.** What it took, on 2026-11-10:
    - Online BDS still accepts a self-signed offer identity; it refuses the login with
      `NOT_AUTHENTICATED` until the Login packet carries an Xbox Live chain.
    - Our client, signed in through prismarine-auth, joins online BDS and our online server with
      the chain and the multiplayer token, and `NetherNetIdentity` can carry that token in the
      offer instead of a self-signed one.
    - Our server answers offers without checking the token, as go-nethernet leaves identity to the
      Minecraft layer, and checks the Login packet as it does over RakNet.
17. [ ] **A retail client.** An iOS client on mobile data, against a server on a public address
    with no firewall. Found so far:
    - [x] ICE connects with the client's private and IPv6 host candidates alone: the server learns
      the client's peer-reflexive address from its checks, so no STUN is needed for this case.
      Signaling logs each join's candidates, the answer and the ICE pair, so the next stall shows
      where it stopped.
    - [x] The client sends `RequestNetworkSettings` as soon as its reliable channel opens, before
      `nethernet` reports the peer open, and the transport dropped it. It now holds a peer's early
      messages and delivers them once the peer opens.
    - [ ] After spawning, the client leaves within seconds with `ClientDisconnection-90`, and
      nothing on the server side reports an error. Next: join the same client over RakNet to tell
      the transport from the game, then read the last packets at log level `silly`.

18. [x] **`XboxAuthProvider` in `@jsprismarine/auth`.** The provider signs in through
    prismarine-auth, an optional peer dependency loaded on first sign-in, and puts its own link,
    naming Mojang's root key, in front of the chain Minecraft services issue. It shares the
    identity key and client data signing with `OfflineAuthProvider` through `KeyedAuthProvider`.
    `getMultiplayerToken()` gives `Client` the token its NetherNet offer carries. The server's
    `verifyLogin` moved into the package too, so one package issues and checks a login, and a
    test checks that the verifier admits what the provider sends. Every JWT and JWS, in auth and
    in `@jsprismarine/nethernet`, is signed, verified and decoded by `jose` rather than by hand.

## Open questions

- BDS answers `37` (`200 application/sdp`) to an offer without `a=identity`. Our signaling answers
  a refused offer with a non-2xx status, as go-nethernet does; whether game clients treat BDS's
  form differently is untested.
- What `ClientDisconnection-90` means, and whether it is NetherNet's (slice 17).

## Future work

Not needed for a viable NetherNet transport, but known and worth doing:

- **A real game client in CI.** Once cinnabar joins over NetherNet, add a client e2e scenario that
  names the transport, so a RakNet fallback cannot hide a NetherNet regression. Then mark NetherNet
  done in the [rearchitecture plan](server-rearchitecture.md).
- **Joining from outside the local network.** Beyond `server-udp-ports`: STUN to learn a reflexive
  address without configuring one, and TURN for players behind symmetric NAT. Mojang's guide
  advises against STUN and TURN for HTTP signaling, so start with the static mapping.
- **Verifying the offer's token.** A server could check the multiplayer token in `a=identity`
  before answering, and refuse a join before WebRTC starts. Nothing needs it yet: the Login
  packet is checked either way.
- **Friends and Realms joins.** BDS signs in to Microsoft's signaling service at startup ("Signed in
  to signaling service successfully"), which is how friends join a server they have not typed the
  address of. That needs an Xbox Live identity for the server.
- **LAN discovery in the client.** `@jsprismarine/client` joins by address only; `LanDiscovery` in
  `@jsprismarine/nethernet` now finds servers on the local network, and the client does not use it
  yet.
- **NetherNet load.** Whether the WebRTC stack keeps up with many players. Measure by counts (messages, bytes,
  allocations, tasks), not wall-clock time, as [AGENTS.md](../../AGENTS.md#measuring-performance)
  asks, and decide from that whether NetherNet needs a worker thread like RakNet's.
- **A LAN peer's candidates.** `NetherNetServer`, like `nethernet` before it, keys peers on the
  connection ID the client picks, and applies a `CANDIDATEADD` to whichever peer that ID names,
  whoever sent it. Check whether one LAN peer can disturb another's negotiation.
- **A Java Edition transport.** The seam is ready for one: a `KeyedTransport` over TCP drawing from
  the same `ConnectionIds`, in a package of its own, feeding a Java session pipeline rather than the
  Bedrock dispatcher.
- **Dropped:** binding RakNet's default port as well when `port` differs, as BDS does with
  `transport=raknet`. Current clients discover LAN games over NetherNet.
