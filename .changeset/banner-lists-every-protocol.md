---
'@jsprismarine/prismarine': patch
---

Report every protocol version the server speaks, not just the newest

The startup banner and `/version` named one Minecraft version and one protocol while the server
registers a codec per protocol version and negotiates per session, so a player on the older of two
supported versions saw a banner that said the server did not speak their protocol. Both now list
each registered protocol with its Minecraft versions, newest first, and mark the one the MOTD
advertises. The refusal log names every protocol the server speaks instead of only the newest.

The codec registry grew `registeredCodecs`, newest protocol version first, and
`describeSupportedProtocols()`, which both diagnostics read, so a new codec appears in them
without a second list to maintain. The MOTD still advertises only the newest version, matching
Bedrock Dedicated Server.
