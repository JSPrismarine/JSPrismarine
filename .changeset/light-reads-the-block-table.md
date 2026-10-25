---
'@jsprismarine/prismarine': patch
---

Light a loaded chunk about five times faster. The light pass asked `World.loadedBlockAt` for a full
block - a `BlockState` out of the chunk palette, wrapped in an identifier and a record of state
values - and then ran that identifier and those values through `@jsprismarine/mapping`'s property
table, which splits state-override keys and merges the row it finds. It did this tens of millions
of times while a world preloads, for two numbers that do not depend on the position at all.

The world now also answers `loadedBlockRuntimeIdAt`, the same read without resolving the id, and
`topOfColumn`, one past the highest y a column stores a block for. `WorldSystems` keeps what each
runtime id does to light in a table of its own and hands the second to the light engine, which uses
it to start a fresh chunk's column scan below the open sky.

Lighting 441 chunks of generated Overworld terrain went from 5.4 s to 1.2 s, with every one of the
86.7 million resulting light levels unchanged. Both reads are optional on `WorldSystemsView`: a
view that supplies neither takes the path it took before.
