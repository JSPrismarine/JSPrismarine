---
"@jsprismarine/prismarine": patch
---

Take a replay digest without writing to any entity. `World.replayStateDigest` used to call `LiveEntityRuntime.persist` and put each body's compound back afterwards; it now hashes the record a save would write into a copy, through the new `LiveEntityRuntime.savedRecords` and an optional record argument to `EntitySerializer.toNBT`. Digests do not change.
