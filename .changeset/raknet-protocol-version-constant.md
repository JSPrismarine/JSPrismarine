---
'@jsprismarine/raknet': patch
---

Adds `RAKNET_PROTOCOL_VERSION` (11), the RakNet version byte Bedrock sends in `OpenConnectionRequest1`. `MINECRAFT_PROTOCOL_VERSION` still exports the same value but is deprecated: it named RakNet's version, not Minecraft's network protocol.
