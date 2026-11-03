---
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

Answer `WorldActions.hasBlockTag` with undefined for a tag the loaded stack does not declare, which is not the same answer as `false`. A rule whose tag nobody loaded read every block as being outside it, so on a server booted without the Java vanilla datapack a tag-driven rule silently flipped: crops would have stopped growing and popped off their farmland. Each rule now falls back to its own names, the way it already did for a host that answers no tags at all.
