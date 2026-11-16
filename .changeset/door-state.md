---
'@jsprismarine/prismarine': patch
'@jsprismarine/entity-goals': patch
---

Show the path finder the doors in the live world: the runtime's navigation view answers `doorAt` from a door's `open_bit` and whether it is iron, so a mob that cannot open doors no longer plans its path through a closed one. `minecraft:behavior.open_door` now opens and closes the door through `GoalWorld.setDoorOpen` instead of writing a `minecraft:open_door` block in its place.

A hopper minecart now collects the items around it, one stack a tick, as Java's `MinecartHopper.suckInItems` does.
