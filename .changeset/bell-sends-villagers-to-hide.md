---
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

A bell a player strikes or redstone powers now rings for the entities around it, as Java's `BellBlockEntity` does: every villager within 32 blocks remembers it heard the bell and runs to hide. Block worlds gain an optional `ringBell`, and the content entity access an optional `ringBell`, which the entity runtime answers.
