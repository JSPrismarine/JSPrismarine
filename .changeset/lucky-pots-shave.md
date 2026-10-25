---
'@jsprismarine/prismarine': patch
'@jsprismarine/block-behaviors': patch
---

Make lit TNT detonate. Flint and steel and a redstone signal both already cleared the TNT block and spawned a `minecraft:tnt` entity with a fuse, but the entity was an empty class that read no fuse and never went off, so the only live explosion in the server was a creeper's and a player could not blow anything up.

The entity is now Java's `PrimedTnt`: 80 ticks, the hop its launch speed and gravity make, and a radius-4 blast through the existing ray cast, gated on the `tntexplodes` game rule. A blast that reaches another TNT block lights it with `getRandomShortFuse`'s 10 to 29 ticks and drops no item, which is Java's `TntBlock.wasExploded`, so a pile of TNT chains and ripples outward instead of going off at once. The blame is carried through the chain, so a kill three blasts down the line is still the first lighter's.
