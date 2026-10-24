---
'@jsprismarine/prismarine': patch
---

`SubChunk.networkDeserialize` reads version 9 and version 1 records correctly. It skipped the signed index byte a version 9 sub chunk carries after its layer count, so the first layer's header was read one byte early, and it read a layer-count byte from a version 1 record, which has none.
