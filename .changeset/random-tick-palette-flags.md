---
'@jsprismarine/prismarine': patch
---

Random tick draws read whether a block takes random ticks from a flag per palette slot, kept for as long as the section's storage lives, instead of looking each hashed runtime id up in a map. `ReadonlySubChunk` gains `getBlockStorage(layer)`, which returns one layer's storage without building an array.
