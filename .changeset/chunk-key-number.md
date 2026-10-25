---
'@jsprismarine/prismarine': minor
---

Key loaded chunks by a number instead of a `bigint`. `Chunk.packXZ` returned a 64 bit `bigint`,
so every lookup of the chunk a block is in allocated a BigInt and hashed it. Anything that walks
blocks does that per block: the light engine's column scan during a start region preload, and mob
pathfinding during a tick.

It now packs 22 bits an axis into an exact integer, which covers chunks from -2097152 to 2097151
against a world border at 1875000 chunks, so every coordinate the game can reach still has its own
key. `Chunk.packXZ` returns `number` and `Chunk.unpackXZ` takes one; `World.chunks` and
`PlayerSession`'s loaded and loading sets are keyed by number.

Measured: packing a key and looking the chunk up is 69 nanoseconds as a `bigint` and 36 as a
number. The pair was 37% of the self time of a 441 chunk preload, and an independent profile of
the entity tick put `World.getLoadedChunk` at 15% and `Chunk.packXZ` at 9%.
