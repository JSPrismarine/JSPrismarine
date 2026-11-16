---
'@jsprismarine/entities': patch
---

Run `minecraft:looked_at` and `minecraft:peek`. A player looking at an entity, by Java's `isLookingAtMe` with the field of view as its tolerance, raises `looked_at_event` once the stare has lasted `min_looked_at_duration`, `not_looked_at_event` when it ends, and makes the player its target unless `set_target` is `never`. A shulker peeks as Java's `ShulkerPeekGoal` has it, opening 30 for 20 to 60 ticks on a one-in-20 roll every other tick, and opens fully while it has a target; `peekAmount` reads how far its shell is open. `EntityEnvironment` gains the optional `lookers` and `targetLooker` hooks.
