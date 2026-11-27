---
'@jsprismarine/entity-goals': patch
---

Fly the ender dragon as Java 26.3 does, checked tick for tick against fights Java's own code flew. The flight now computes in Java's `float` arithmetic with its table sine and `atan2`, and finds paths with Java's binary heap order, so it no longer drifts from Java's course. The fixes:

- The takeoff ends on the outer ring while crystals stand and on the middle ring once none do; it had the two the wrong way round. It aims by the dragon's head yaw, which Java never turns, and tilts with the distance to the portal.
- The holding pattern and the strafe keep separate senses of turn, both starting counterclockwise, and the strafe's lap keeps to the middle ring once no crystal stands.
- The path nodes sit on rings around the world's origin and never below 73, as Java's do, and the landing approach aims by the player's direction from the world's origin.
- A climbing target adds the node's height and the draw in `float`, the drag keeps Java's `0.91F`, and the head and the neck strike from where the previous tick placed them, tilted by the dragon's climb.

`dragonPhasesOf` also reports the phase's fly target and the dragon's Java `yRot`.
