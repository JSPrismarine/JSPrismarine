---
'@jsprismarine/entities': patch
---

Run `minecraft:drying_out_timer`. Out of water and rain it counts up to `total_time` and fires `dried_out_event`; water or rain stops it with `stopped_drying_out_event`, or `recover_after_dried_out_event` once the entity had dried out. `minecraft:damage_over_time` now lands its first blow on its first active tick, as Java hurts a vex the tick its life runs out and a dolphin the tick it dries.
