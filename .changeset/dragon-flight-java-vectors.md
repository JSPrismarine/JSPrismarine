---
'@jsprismarine/entity-goals': patch
---

Fly the ender dragon as Java 26.3 does, checked tick for tick against fights Java's own code flew. The flight now computes in Java's `float` arithmetic with its table sine and `atan2`, and finds paths with Java's binary heap order, so it no longer drifts from Java's course. The fixes:

- The takeoff ends on the outer ring while crystals stand and on the middle ring once none do; it had the two the wrong way round. It aims by the dragon's head yaw, which turns after the body on the ticks the dragon moves, as Java's `BodyRotationControl` turns it, and tilts with the distance to the portal.
- The holding pattern and the strafe keep separate senses of turn, both starting counterclockwise, and the strafe's lap keeps to the middle ring once no crystal stands.
- The path nodes sit on rings around the world's origin and never below 73, as Java's do, and the landing approach aims by the player's direction from the world's origin.
- A climbing target adds the node's height and the draw in `float`, the drag keeps Java's `0.91F`, and the head and the neck strike from where the previous tick placed them, tilted by the dragon's climb.
- The wings and the head strike what their reach meets by its hitbox, which a mob now reports through `GoalMob.size`, and the head and the neck each strike. A wing hurts a mob only when no mob has hurt it in the last two ticks, and the dragon leaves others alone for the 9 ticks after a blow to it lands whole.
- Breaking through blocks draws the particle position Java draws, treats cave air and void air as air, and slows the next tick's flight to `0.8` when the head, the neck or the body meets a block it may not break.
- When a phase hands over to the next in the tick it began, as a landing approach whose path ends as it starts does, the dragon still flies toward that phase's target, as Java's does.
- The scan and the charge only pick a player the dragon can see, and keep the first answer for each player, as Java's dragon keeps its `Sensing`.

`dragonPhasesOf` also reports the phase's fly target, the dragon's Java `yRot` and whether a wall slows it.
