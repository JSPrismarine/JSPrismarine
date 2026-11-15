---
'@jsprismarine/prismarine': patch
---

Save chunks with less work on the server thread. A finalized sub chunk writes its stored index words instead of reading 4096 blocks back one at a time, and the biome encoders share one packer that reads a column's sections without copying them. The bytes written to disk and to the client are unchanged.
