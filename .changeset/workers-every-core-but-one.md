---
'@jsprismarine/prismarine': patch
---

Size the chunk generation pool to every core but the server thread's, rather than `min(6, cores - 2)`. A four-core host now generates on three workers instead of two. The generation process already runs at a lowered priority, and the pool keeps a worker clear while a player waits on a chunk, so the extra worker does not compete with the tick. `chunk-workers` still overrides it.
