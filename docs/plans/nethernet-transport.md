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
  node-nethernet) for the WebRTC side.
- `enable-raknet` and `enable-nethernet` config keys, both on by default, so both transports run side
  by side.
- `enable-lan-visibility`, named as BDS names it and on by default, as BDS ships it.

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

- Over NetherNet a batch has no `0xFE` header, and there is no Minecraft-level encryption (no
  `ServerToClientHandshake`); DTLS covers the wire.
- The LAN advertisement is version 7: varint-prefixed strings and zigzag varints for MOTD, protocol,
  game version, level name, player counts, game mode, editor and hardcore flags, accepted auth kinds,
  a nonce, and a connection type.

**[cinnabar](https://github.com/cinnabar-mc/cinnabar)**, the client the e2e harness drives, joins
addressed servers over NetherNet through a go-nethernet fork. Its source answers the encoding
questions above, and it can verify the join end to end.

**This repository:**

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
- **Capabilities drive the session.** `capabilities.encrypted` makes the login skip the encryption
  handshake. `maxFrameSize` stays infinite because `nethernet` fragments for us.
- **One dispatcher, several transports.** A `MultiTransport` merges the enabled transports into one
  `Transport`, so `NetworkDispatcher` serves them all through one subscription.
- **Networking owns the listeners.** `ServerNetworking` starts each enabled transport and the LAN
  advertiser from config, and keeps the advertisement current as players join and leave.
- **Shared parts get one home.** What two transports or two advertisers would both write lives in one
  module: `Subscription` runs one event's listeners; `BaseTransport` holds subscriptions and
  per-connection ordering; `KeyedTransport` maps wire keys to connection IDs; one server status snapshot
  (MOTD, level, version, player counts, game mode) feeds the RakNet pong, the LAN advertisement and
  `GET /v1/join`; the data channel's fragment framing stays in `nethernet`.
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
3. [x] **Capability-driven encryption.** Skip `ServerToClientHandshake` when the transport reports
   `encrypted`. Unit test both paths.
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
7. [ ] **LAN visibility.** (Advertisement done: version 7, byte-identical to a captured BDS
   1.26.51.1 answer, refreshed from the shared `ServerName`.) Encode the version 7 advertisement from the server's MOTD, level, version
   and player counts, refresh it on join and leave, and bind UDP 7551 only when LAN visibility is on.
   Decide what RakNet LAN visibility needs: BDS binds 19132 when `server-port` differs, and today we
   answer pings only on the configured port.
8. [ ] **HTTP signaling.** A small `node:http` server on TCP `server-port`: `GET /v1/join` metadata,
   `POST /v1/join/{networkId}` offer to answer through `handleOffer`, `404` for everything else, body
   and time limits. HTTP signaling carries no connection ID, so the server picks the `nethernet` one
   for each offer, unused by any live peer. Persist an ES384 server identity key and sign `a=identity` into each answer.
   Settle the open encoding questions against go-nethernet. Strip the offer's `a=identity` and accept
   offers without one for now (see open questions).
9. [ ] **End-to-end verification.** Join over NetherNet with a werift client and with cinnabar
   through the client e2e harness. Add a scenario if the harness can select the transport.
10. [ ] **Docs and release.** Running and configuration guides, a Changeset per touched package, and
    a note in the [rearchitecture plan](server-rearchitecture.md) that the NetherNet transport
    landed.

## Open questions

- What does BDS's `37` mean, and does BDS reject offers without `a=identity` even with
  `online-mode=false`?
- Should an online-mode server verify the offer's GameServerToken before answering? It is a second
  check on top of the login chain, and it needs the auth service's keys.
- NAT: BDS's `server-udp-ports` pins the UDP range and advertises an external mapping. We start with
  host candidates only and record a follow-up if a remote join needs more.
- Does werift keep up with many players? Measure by counts (messages, bytes, allocations), not by
  wall-clock time, as [AGENTS.md](../../AGENTS.md#measuring-performance) asks.
- RakNet's `ServerSocket` still sets the advertised player count to its own session count on
  each RakNet open and close; `ServerNetworking` overwrites it with the all-transport count right
  after. Give `@jsprismarine/raknet` a way to leave the count to its owner.
- Worker mode (`use-raknet-worker`) stays RakNet-only. Does NetherNet need a worker later?
- `nethernet` keys peers on the connection ID the client picks, and its LAN path applies a
  `CANDIDATEADD` to whichever peer that ID names, whoever sent it. Report upstream if a LAN peer can
  disturb another's negotiation that way.
