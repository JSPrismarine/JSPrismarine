---
'@jsprismarine/prismarine': minor
---

The query protocol is part of the server's networking now, with a new `query-port` setting beside `enable-query`, which stays on by default. A `query-port` equal to `port`, which a fresh config writes, answers on the RakNet socket as before; any other port gets a UDP socket of its own. Query replies now require the challenge token from the handshake, so a forged source address gets no status reply, and full stat requests get the full key list and player names. Basic stat replies follow the protocol, with the host port as a little-endian short.

Breaking: `QueryManager`, `Server.getQueryManager()` and the `queryToken` kernel token are removed, `NetworkDispatcherOptions` no longer takes a `query` option, and a `RakNetTransportSource` needs `sendBuffer`.
