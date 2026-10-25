---
'@jsprismarine/prismarine': minor
---

Stop spelling out a sub chunk of one biome. Reading a chunk built 24 arrays of 4096 biome ids per
column and then scanned each one to discover what the record had already said: five sections in
six hold a single biome, which the format states outright with a zero bit width and a one entry
palette.

`BiomeSection` is the exchanged form, a single id or one id per block. `decodeData3D` returns it,
`encodeData3D` accepts it, and `ChunkBiomes.toSectionIds` and `fromSectionIds` speak it. The bytes
on disk are unchanged, and a uniform section encodes to exactly what the spelled-out form always
did.

Two callbacks went with it. `Uint16Array.from(section, fn)` walks a typed array through the
iterator protocol, allocating a result object per element, and `section.every(fn)` costs a call
per element; both ran over all 98304 ids of every column. They are plain loops now.

Decoding the biomes of a 256 column world, old against new, interleaved in one process: 4.9 ms
per column before, 0.64 after.
