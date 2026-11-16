---
'@jsprismarine/entities': patch
'@jsprismarine/prismarine': patch
---

Lava destroys boats, rafts and cushions as it does in Java. `minecraft:hurt_on_condition` hurts an entity that declares no health every tick, since Java's half-second invulnerability belongs to living entities, so a boat in lava breaks on its second tick. A cushion checks for lava and fire every 101 ticks, as Java's `BlockAttachedEntity` does, and burns away on that check, dropping the cushion item of its color.
