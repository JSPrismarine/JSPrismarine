---
'@jsprismarine/prismarine': patch
---

The `redstone_strength_at_position` filter now measures the redstone power reaching the block an entity is in, as Java's `getBestOwnOrNeighbourSignal` does, so an explosive sulfur cube primes itself on a powered block.
