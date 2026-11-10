---
'@jsprismarine/prismarine': patch
---

The server accepts Bedrock clients over NetherNet, the WebRTC transport Bedrock Dedicated Server defaults to, alongside RakNet. A client joining by address signals over HTTP on the TCP side of the game port (`GET /v1/join` and `POST /v1/join/{networkId}`), and every answer carries the server's signed identity, whose P-384 key the server keeps in `nethernet-identity.pem` in its data directory so returning players are not asked to trust a new one. With `enable-lan-visibility` on, it answers NetherNet discovery on UDP port 7551, so players on the local network see it among their LAN games and join it over NetherNet. The advertisement carries the same MOTD, version and player counts as the RakNet server list entry, and the player count now covers every transport's clients. `NetherNetTransport` carries the peers of a `nethernet` server, adding and removing the `0xFE` batch id the NetherNet wire leaves out.
