---
'@jsprismarine/engine-systems': patch
'@jsprismarine/prismarine': patch
---

Take a chunk's scheduled fluid ticks off the world's tick list when the chunk unloads, after its save has written them to its `PendingTicks` record, as Java's `LevelTicks.removeContainer` does. A reload schedules them again from the record. A chunk with a fluid tick its save did not write stays loaded until the next pass. Block ticks are not persisted, so they stay queued as before. `TickList` gains `ticksInChunk` and `clearChunk`, which find a chunk's ticks through a per-chunk index instead of reading the whole queue.
