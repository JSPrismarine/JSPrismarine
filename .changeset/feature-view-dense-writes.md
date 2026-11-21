---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

Read a feature pass's blocks without a hash lookup per block. A feature view kept its own writes in a map keyed by block index, so once anything was written, each of a pass's hundred thousand or more reads looked the block up there before reading the terrain tile below. The writes now go to one 16-bit array per tile, made on the tile's first write, and a read goes straight to the tile's slots with an index computed once. The blocks a pass reads and writes are the same.
