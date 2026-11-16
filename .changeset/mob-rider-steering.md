---
'@jsprismarine/entities': patch
'@jsprismarine/prismarine': patch
---

Let a mob that rides another mob steer it, as Java does, and stop running `minecraft:behavior.mount_pathing`, a goal no Java class registers. The rider's walks now move its mount (Java's `Mob.getNavigation` hands a rider its controlled vehicle's navigation), and the mount's own move, look and jump goals stand down while a mob steers it (`Mob.updateControlFlags`). A baby zombie on a chicken used to stay put on a chicken that wandered off on its own; now the chicken runs where the zombie chases and the zombie still attacks. `GoalScheduler` gains `setFlagEnabled`, Java's `GoalSelector.setControlFlag`.
