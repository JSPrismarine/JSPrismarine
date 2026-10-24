---
'@jsprismarine/protocol': patch
---

Add `UpdateSubChunkBlocksPacket` (id 172) and the `UpdateSubChunkNetworkBlockInfo` structure it carries, so a sub chunk's block changes for one tick can be read and written as one packet.
