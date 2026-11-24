---
'@jsprismarine/worldgen': patch
'@jsprismarine/features': patch
'@jsprismarine/prismarine': patch
---

Carvers, ore veins, large speleothems and mega jungle trunks use Java 26.4's `Mth.sin` and `Mth.cos` when the target reads data pack format 128 or later. 26.4 rounds to the nearest table entry, mirrors negative angles and holds exact quarter turns. `parseCarver` and `FeatureLoader` take the target's format.
