---
'@jsprismarine/mapping': patch
---

New package: the Java Edition to Bedrock Edition identifier seam. Four total lookup functions (`javaBlockStateToBedrock` over all 35723 Java 26.3 block states, `javaItemToBedrock` over 1658 items, `javaEntityTypeToBedrock` over 161 entity types, and `javaIdentifierToBedrock` for biomes and enchantments), backed by tables generated from the pinned GeyserMC/mappings join and this repository's BDS 1.26.51.1 captures, plus a reviewed loss allow list where every known loss carries a reason and a reference. Lookups return typed results and never `undefined`. Chunker's five property tests verify totality, state-set exactness, round-trip identity outside the loss list, and that every output exists in the pinned Bedrock palette.
