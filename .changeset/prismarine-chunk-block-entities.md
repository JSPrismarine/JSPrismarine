---
'@jsprismarine/prismarine': patch
---

A chunk's block entities now travel with the chunk. `Chunk.networkSerialize` appends one network NBT compound per block entity after the border block byte, the way a Bedrock server does, so a chest or sign loaded from a world reaches the client with the terrain it stands in instead of never being sent. Adding or removing a block entity also drops the chunk's cached payload.
