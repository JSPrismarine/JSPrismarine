---
'@jsprismarine/prismarine': patch
'@jsprismarine/entity-goals': patch
---

Flying mobs send `minecraft:flap` game events as they fly, so sculk sensors and wardens hear them. Each type whose `minecraft:game_event_movement_tracking` sets `emit_flap` flaps when its Java class's `isFlapping` holds: an allay whenever it is off the ground, a bat every 10 ticks, a bee every 2 ticks in the air, a phantom every 25, a chicken or a parrot by the distance it flies, and the ender dragon on each wingbeat. `@jsprismarine/entity-goals` exports `isSittingDragonPhase`.
