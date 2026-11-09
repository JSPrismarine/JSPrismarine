---
'@jsprismarine/prismarine': patch
---

The block pass of a generated chunk's Bedrock translation now runs in a generation worker. The server thread translates each palette entry, a few dozen per chunk, and the worker walks the chunk's blocks into section indices and palettes, which was the largest part of a completed chunk's server-thread work. Chunks are byte-identical to the ones built on the server thread.
