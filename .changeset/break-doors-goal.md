---
'@jsprismarine/entity-goals': patch
---

Run Java's `BreakDoorGoal` for `minecraft:annotation.break_door`: a mob whose path a closed wooden door blocks beats on it and breaks it after 240 goal ticks, on a difficulty at or above the component's `min_difficulty` and only with `mobGriefing` on. The path finder now plans a door breaker's path through a closed wooden door, as Java's `setCanBreakDoors` turns on `setCanOpenDoors`, and no longer plans one for a mob with a Java navigator that cannot open doors and carries no `minecraft:annotation.break_door`.

`GoalWorld` gains the optional `horizontalCollision`, `breakDoor`, `doorBreakProgress` and `knockOnDoor`, and `GoalSupport.pathAhead` reads the path any of an entity's goals planned last.
