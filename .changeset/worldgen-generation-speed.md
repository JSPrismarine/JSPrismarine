---
'@jsprismarine/worldgen': minor
'@jsprismarine/prismarine': patch
---

Generate overworld chunks at a usable rate.

Preloading 25 chunks of the data-driven overworld took the better part of three minutes, which
put the default `preload-radius: 10` at roughly fifty. A profile put the time in four places,
none of them the density function graph the plan expected.

The surface pass asks for the biome of every block it walks, and every ask ran a full
multi-noise lookup: six density functions, every noise octave under them, then a nearest-box
search over 7594 climate boxes. A chunk holds 1536 biome cells and 98304 blocks.
`memoizeBiomeResolver` wraps a `BiomeResolver` so a cell is resolved once, which is what Java
gets for free by reading the chunk's biome array, and the generator now shares one memoized
resolver across the surface pass, the structure level and the biome column.

An interpolated density function reads the eight corners of its cell, and a chunk's 16 by 384
by 16 blocks sit on 1225 of them. `CornerCache` hashed the corner position into 4096 slots, and
at that load factor collisions evicted corners the walk was still using, so a chunk evaluated
its 1225 corners 6139 times. Corners lie on a lattice, so the slot is now the cell index masked
per axis and the count is exactly 1225. `CornerCache.getOrCompute` takes the cell indices
alongside the position, which is the breaking part of this release.

`BiomeManager` derived the eight jitter offsets around a block from a string-keyed map, nine
`long` multiplications per lattice point; they now live in a direct-mapped cache on the same
lattice. And the block oracle handed its cached Bedrock facts back as a fresh record on every
one of the millions of calls a decoration pass makes, where two flags in a number will do.

Generating 25 chunks at seed 1234 fell from 22.2 to about 8 seconds of CPU, and the terrain is
unchanged: every generated chunk hashes identically, over the 5 by 5 region at seed 1234 and a
3 by 3 region at seed 5678.

The terrain fill also handed the event loop back every four columns, 64 times a chunk. A round
trip through the event loop is a trip through the host's scheduler, so on a busy host a preload
spent most of its wall clock waiting rather than generating. It now yields on a 4 millisecond
budget, which is the property the yield was there for.
