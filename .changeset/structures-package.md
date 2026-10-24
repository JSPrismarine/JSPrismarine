---
'@jsprismarine/structures': patch
---

Add `@jsprismarine/structures`, the structure template layer. It reads both template formats Mojang
ships (Java's gzip big-endian `.nbt`, under either palette key spelling, and Bedrock's little-endian
`.mcstructure` with its two block layers), translates a Java palette into Bedrock states through
`@jsprismarine/mapping` with every loss reported rather than dropped, and places a template under a
rotation and a mirror. The direction-valued state rules are not written by hand: a dumper compiled
against the pinned Java 26.3 server jar records what `BlockState.rotate` and `BlockState.mirror`
return for all 35723 Java states, and the generated table is keyed by Bedrock state, which catches
asymmetries such as `StairBlock.mirror` swapping a corner shape under one mirror axis and not the
other. It also implements the eleven structure processor types with their ten rule tests, three
position tests and four block entity modifiers; jigsaw assembly over template pools with weights,
joint types, depth limits and bounding-box rejection; and the three structure set placement types
with the four frequency reduction methods, over a `java.util.Random` reproduction tested against the
JDK. A gated corpus test reads all 1511 Java templates (100% of 1170664 blocks translate cleanly)
and all 1311 Bedrock Dedicated Server templates (97.70% of 1137782, the rest naming 47
pre-flattening identifiers).
