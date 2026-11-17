---
'@jsprismarine/prismarine': patch
---

A bouncy mob, such as a sulfur cube with the bouncy archetype, now bounces off the floor and the ceiling as Java's `Entity.restituteMovementAfterCollisions` does. The part of the tick's move made before the hit gets that share of the tick's gravity and drag back before the bounciness reverses it, a fall slower than one tick of gravity lands instead of bouncing, and a mob takes the tick's gravity and drag after the bounce. The server reversed the velocity alone, so a bouncy cube left the floor about 5% too fast.
