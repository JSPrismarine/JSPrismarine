---
'@jsprismarine/leveldb': patch
---

Make a LevelDB point lookup a point lookup. `TableReader.seekFrom` found the right data block by
binary search and then threw the answer away: it re-scanned the index block entry by entry to find
the block again, and read that block from its first entry rather than from the target. Every
`Database.get` therefore decoded, and allocated a key and a value Buffer for, every index entry in
the table plus half a data block.

On a 441 chunk world - two tables, 3 MiB - one lookup cost 700 microseconds. A chunk read asks for
about 29 records, so loading a saved world spent most of its time here, and reading a chunk back
was slower than generating it from scratch.

`TableReader.seek` is the new point lookup: one index entry, one data block, and the block's own
restart-point binary search inside it. `seekFrom` keeps its range semantics and now seeks within
the first block instead of replaying it. Measured over the same world, best of five interleaved
rounds in one process: 700 microseconds per lookup before, 16.8 after, 41.8 times faster.
