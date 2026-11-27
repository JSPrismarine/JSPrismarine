---
'@jsprismarine/entity-goals': patch
---

Fly the ender dragon on the entity's own velocity, as Java's dragon flies on its `deltaMovement`. `GoalWorld.moveSelf` now takes the velocity the move leaves, and the new `GoalWorld.velocity` hands it back on the next tick, so a blow that knocks the dragon back between two ticks changes its flight.
