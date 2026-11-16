---
'@jsprismarine/entity-goals': minor
'@jsprismarine/prismarine': patch
---

Cast the evoker's spells the way Java's evoker does. With a target it first summons three vexes it owns, then casts fangs: two rings 1.5 and 2.5 blocks out when the target is within 3 blocks, otherwise a line of sixteen toward it that rises one fang a tick. With no target it turns a blue sheep within 16 blocks red.

`GoalWorld.spawn` now takes a fourth `options` argument (owner, facing and entity data) and returns the spawned mob, and `GoalWorld` gains `fireOn` and `gameTime`. `SummonChoice`, `SummonStep` and `SendEventChoice` describe the spell tables in full, so their fields changed.
