---
"@jsprismarine/entities": patch
---

Keep `minecraft:target_nearby_sensor` state out of an entity's saved form. It names the target by runtime id, which the next session draws again and could give to another entity, so a reload now starts the sensor with no target, as it did before component state was saved. `defineComponentState` takes an optional third argument, `{ saved: false }`, which `ComponentStates.snapshot` leaves out and `ComponentStates.restore` ignores, so a record written before this change loads as if it left that state out.
