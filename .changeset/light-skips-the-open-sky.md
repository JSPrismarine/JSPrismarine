---
'@jsprismarine/lighting': patch
---

Let a view tell the engine where a column's blocks stop. `BlockLightView` gains an optional
`topOfColumn(x, z)`, one past the highest y that emits or dampens light, and a chunk's first scan
starts there instead of at `maxY`.

That scan is the engine's hottest loop by a wide margin: it reads every block of all 256 columns of
every chunk that loads, and in an Overworld most of what it reads is the open sky above the ground,
which moves neither the heightmap nor a source. Lighting 441 chunks of generated terrain went from
44.2 million block reads to 16.6 million, and from 506 ms to 204 ms, with every one of the 86.7
million resulting levels unchanged.

A view that leaves `topOfColumn` out is scanned from `maxY`, as every view was before. An answer
above `maxY` is taken as `maxY`.
