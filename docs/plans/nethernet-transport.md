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

- **Transport-neutral seam.** A connection is identified by its `token`, which its transport namespaces
  (`raknet:…`, `nethernet:…`), and describes its peer with a plain `{ address, port }` rather than
  RakNet's `InetAddress`. Raw datagrams (`onRaw`) become an optional capability that only RakNet
  provides.
- **Frames are Bedrock batches as RakNet carries them**, starting with `0xFE`. The NetherNet transport
  adds the byte to what it receives and strips it from what it sends, so the protocol codecs and the
  client package stay as they are. A Java transport would carry Java packet frames to its own
  session pipeline; the seam only moves opaque frames and never interprets them.
- **Capabilities drive the session.** `capabilities.encrypted` makes the login skip the encryption
  handshake. `maxFrameSize` stays infinite because `nethernet` fragments for us.
- **One dispatcher, several transports.** A `MultiTransport` merges the enabled transports into one
  `Transport`, so `NetworkDispatcher` stays as it is.
- **Networking owns the listeners.** `ServerNetworking` starts each enabled transport and the LAN
  advertiser from config, and keeps the advertisement current as players join and leave.
- **Signaling sits apart from the WebRTC peer.** The HTTP signaling server on TCP `server-port` and
  the LAN signaling on UDP 7551 both feed the same `nethernet` `Server` through `handleOffer`. The
  answer gets `a=identity` from a server identity key stored beside the world data.

## Slices

Each slice is one or more small commits that leave the tree building, linted and tested. Check off a
slice when it lands on the branch.

1. [ ] **Plan.** This document.
2. [ ] **Neutral transport seam.** Replace `InetAddress` in `Transport` with a token and a neutral
   peer address, make `onRaw` optional, and have `ClientConnection`, `LoginHandler` and the disconnect
   path read the address from the transport connection. RakNet behavior and tokens are unchanged.
3. [ ] **Capability-driven encryption.** Skip `ServerToClientHandshake` when the transport reports
   `encrypted`. Unit test both paths.
4. [ ] **Multiple transports.** `MultiTransport` with namespaced tokens, ordered delivery per
   connection, and `close` fanning out. Unit tests with fake transports.
5. [ ] **Config.** `enable-raknet`, `enable-nethernet` and `enable-lan-visibility`, all defaulting to
   `true`, in `Config`, the JSON schema and the generated settings docs. Refuse to start with both
   transports off.
6. [ ] **NetherNet transport over LAN signaling.** Add `nethernet` to `@jsprismarine/prismarine`.
   `NetherNetTransport` wraps `nethernet`'s `Server`: connections, frames with the `0xFE` adaptation,
   disconnects and close. Integration test: a `nethernet` `Client` on loopback completes
   `RequestNetworkSettings` against the server.
7. [ ] **LAN visibility.** Encode the version 7 advertisement from the server's MOTD, level, version
   and player counts, refresh it on join and leave, and bind UDP 7551 only when LAN visibility is on.
   Decide what RakNet LAN visibility needs: BDS binds 19132 when `server-port` differs, and today we
   answer pings only on the configured port.
8. [ ] **HTTP signaling.** A small `node:http` server on TCP `server-port`: `GET /v1/join` metadata,
   `POST /v1/join/{networkId}` offer to answer through `handleOffer`, `404` for everything else, body
   and time limits. Persist an ES384 server identity key and sign `a=identity` into each answer.
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
- Worker mode (`use-raknet-worker`) stays RakNet-only. Does NetherNet need a worker later?
