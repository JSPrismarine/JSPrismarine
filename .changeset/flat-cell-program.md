---
'@jsprismarine/worldgen': patch
---

`CellProgram` is now a flat program: one record per distinct node in `nodes`, the constants in `constants` and every node's buffer in `buffers`, run by one interpreter instead of a closure per node. Its values are unchanged, bit for bit. The records are the form a native interpreter will read.
