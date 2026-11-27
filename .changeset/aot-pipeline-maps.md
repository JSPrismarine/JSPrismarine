---
'@jsprismarine/prismarine': patch
---

The data-driven generator keeps its per-pipeline key digests and old-chunk lookups in `Map`s instead of `WeakMap`s. Bun's AOT compiler treated each pipeline handed to a `WeakMap` as an object outside code could change, so the executable looked up every pipeline field read by name.
