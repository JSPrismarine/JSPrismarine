---
'@jsprismarine/prismarine': patch
---

Generate the `minecraft:debug` world instead of refusing it. A stem of that kind now lays every
state of the content palette out as Java's `DebugLevelSource` does: one state every two blocks
at y 70, `ceil(sqrt(count))` per row with z fastest, over a barrier floor at y 60, all in plains.
The states come from `content.blocks.states` in runtime id order, so grid index `i` shows palette
runtime id `i`; a state the block state catalog has no schema for is left as air and reported
once. Building a debug stem for a dimension whose bounds miss y 60 to 70 throws at build time.
