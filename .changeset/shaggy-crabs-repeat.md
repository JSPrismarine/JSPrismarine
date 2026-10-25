---
'@jsprismarine/prismarine': patch
---

Let a comparator read a container, and keep what the engine remembers across a restart. `EngineWorld` held its block entity records in a map local to the call that built it, and nothing ever filled the container fill level, so a comparator behind a chest read zero and forgot its own output the moment the server stopped. The records now live in the chunk's block entities, which save with the chunk: `analogOutput` is computed from the container's own slots on every read, so it cannot drift from what the chest holds, and `comparatorOutput` is written back as Java's `ComparatorBlockEntity.outputSignal`.

A piston's `extended_bit` goes the same way. Bedrock's palette has no room for it and Java keeps it in the block state, so it used to live in the same local map and a piston came back from a restart thinking it was retracted.
