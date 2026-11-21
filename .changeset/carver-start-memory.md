---
'@jsprismarine/worldgen': patch
'@jsprismarine/prismarine': patch
---

`createCarverStarts` remembers which carvers start in each source chunk, and `carveChunk` takes it as `starts`, so a chunk's carvers are decided once instead of by every chunk within eight of it. The generator keeps one per seeded dimension. The caves are the same.
