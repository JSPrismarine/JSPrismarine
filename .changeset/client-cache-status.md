---
'@jsprismarine/prismarine': patch
---

Decode the client cache status packet instead of warning about it on every join.

The client sends `ClientCacheStatusPacket` (0x81) once after login to say whether it can keep a blob cache. The server had no class for it, so every join logged `Packet 0x81 isn't implemented`. It now decodes the flag and records it at debug level. Chunks still go out with the cache off, so nothing on the wire changes (#2582).
