---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
---

A Java Edition player sees blocks change around them: a block placed, broken or filled reaches their client as Java's block state. A session's presenter now shows block changes, which the replicator hands a non-Bedrock viewer as plain data. `@jsprismarine/protocol` gains Java's `Block Update` and `Update Section Blocks` packets and the `VarLong`, `Position` and section position wire types.
