# @jsprismarine/nethernet

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/nethernet)](https://www.npmjs.com/package/@jsprismarine/nethernet)

NetherNet is the WebRTC transport Minecraft: Bedrock Edition uses beside RakNet. This package holds
what a server and a client both need on top of [`nethernet`](https://www.npmjs.com/package/nethernet),
which carries the WebRTC connection itself:

- `HttpSignaling`, the HTTP signaling a client joining by address uses: `GET /v1/join` for the
  server's status and `POST /v1/join/{networkId}` to trade an SDP offer for an answer.
- `NetherNetIdentity`, which signs the `a=identity` a client requires on every answer, and the SDP
  helpers it is built on.
- `encodeLanAdvertisement` and `decodeLanAdvertisement`, the advertisement a server answers LAN
  discovery with, on the fixed UDP port `NETHERNET_LAN_PORT`.
- `compactEs384` and `detachedEs384`, the ES384 JSON Web Signatures Bedrock signs its tokens with.

It knows nothing about Minecraft packets. The `0xFE` batch id NetherNet leaves out of each message
is the business of whichever transport carries batches over it.
