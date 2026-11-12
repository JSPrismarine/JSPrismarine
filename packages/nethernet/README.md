# @jsprismarine/nethernet

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/nethernet)](https://www.npmjs.com/package/@jsprismarine/nethernet)

NetherNet is the WebRTC transport Minecraft: Bedrock Edition uses beside RakNet. This package
implements it, for a server and a client:

- `NetherNetServer` turns each client's offer into an answer and keeps the `Connection` it
  negotiates. Offers reach it from HTTP signaling, or from LAN discovery once `listen` binds
  UDP `NETHERNET_LAN_PORT`.
- `NetherNetClient` opens the reliable and unreliable data channels, sends the offer with every
  candidate through whatever carries its signals, and connects on the answer. `LanDiscovery`
  finds servers on the local network and carries those signals there.
- `Connection` splits each message into segments as large as the peer's description allows, each
  led by the number of segments still to come, and joins them back. It delivers messages from
  both channels and closes a peer that sends too much or reads too little.
- `SignalStructure`, `encodeDiscoveryPacket` and `decodeDiscoveryPacket` are the wire formats:
  the signal text, and LAN discovery's packets with their checksum and AES encryption.
- `HttpSignaling`, the HTTP signaling a client joining by address uses: `GET /v1/join` for the
  server's status and `POST /v1/join/{networkId}` to trade an SDP offer for an answer.
- `lookupPublicIp` asks the web services in `PUBLIC_IP_SERVICES`, one after another, for the
  host's public address. `withAdvertisedCandidates` adds the configured and dialed addresses to an
  answer, and uses a looked-up address when the answer has no public candidate.
- `NetherNetIdentity`, which signs the `a=identity` a client requires on every answer, and the SDP
  helpers it is built on.
- `encodeLanAdvertisement` and `decodeLanAdvertisement`, the advertisement a server answers LAN
  discovery with.
- `compactEs384`, `detachedEs384` and `verifiesDetachedEs384`, the ES384 JSON Web Signatures Bedrock signs its tokens with, made and checked by [`jose`](https://github.com/panva/jose).

The WebRTC stack underneath is a `WebRtcDriver`. `loadNativeDriver` loads the one this project
ships, libdatachannel in [`@jsprismarine/native-network`](../native-network/README.md), and
nothing else here names the library. Where it cannot load, `loadNativeDriver` throws
`NetherNetUnavailableError` with the platform and the cause.

It knows nothing about Minecraft packets. The `0xFE` batch id NetherNet leaves out of each message
is the business of whichever transport carries batches over it.
