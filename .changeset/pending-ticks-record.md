---
'@jsprismarine/prismarine': patch
---

Read and write a chunk's fluid ticks in Bedrock's `PendingTicks` LevelDB record (key tag 0x33), in the layout Bedrock Dedicated Server writes. A save that passes its world's scheduled fluid ticks writes the record, or deletes it when the chunk has none, and a load hands the ticks to the chunk.
