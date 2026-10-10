---
'@jsprismarine/prismarine': minor
---

Give worlds their real vertical range. The Overworld is now -64 to 319 across 24 sub chunks, as it has been in vanilla since 1.18, instead of 0 to 255 across 16.

A new `Dimension` describes where a world's floor sits and how tall it is, and every vertical bound - sub chunk indices, the serialiser's loops, generator and decorator depth bands - derives from it rather than from a constant. Sub chunk indices are signed, so index -4 is the Overworld's bottom sub chunk, which is also exactly how a Bedrock world stores it.

`Chunk.networkSerialize` no longer prepends four hardcoded empty sub chunks to fake the space below y=0; that space is real now, and a dimension whose floor is above the client's still gets the padding it needs, derived rather than hardcoded.

Fixes four defects in the chunk stack that this uncovered, all of which broke reading a chunk back:

- `Chunk`'s constructor ignored the sub chunks it was handed, so every chunk read from disk came out empty and the Filesystem provider silently regenerated the terrain instead.
- `SubChunk.networkDeserialize` skipped the version byte and read its value, 8, as the layer count.
- `Chunk.networkDeserialize` always read a fixed 16 sub chunks however many were written, and never consumed the biome and border trailer.
- `getSubChunk` accepted an index one past the top of the world.

`Chunk.getHighestBlockAt` now returns `null` for an empty column rather than `-1`, which is a height a real block can occupy once the floor is below zero.
