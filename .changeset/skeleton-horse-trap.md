---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

Spring the skeleton horse trap. A player who comes within 10 blocks of a trap horse now calls a lightning bolt that hurts nobody, a skeleton mounts the trap horse, and three more skeleton horses with skeleton riders appear beside it; a skeleton that spawned bareheaded wears an iron helmet. The trap springs once, survives a save as sprung, and a trap nobody springs within its duration takes the horse away.

`GoalSpawnOptions` gains `rides`, `fillEmptySlots` and `velocity`, `GoalWorld` gains `self`, and a lightning bolt spawned with `visual_only` data strikes nothing.
