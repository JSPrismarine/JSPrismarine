---
'@jsprismarine/block-behaviors': patch
---

A planted mangrove propagule now grows into a mangrove tree. It follows Java's `MangrovePropaguleBlock.randomTick`: a planted propagule grows on one random tick in seven whatever the light, and a hanging one ages a `propagule_stage` on every random tick until it reaches 4. Bedrock has no state for Java's intermediate sapling `stage`, so the tree grows on the first successful tick rather than the second.
