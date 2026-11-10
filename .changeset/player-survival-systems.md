---
"@jsprismarine/prismarine": minor
---

Run a player's hunger, breath, falls, meals and mining cracks as one set of rules that a legacy `Player` and a store player share. The rules live in `entity/playerHunger.ts`, `playerBreath.ts`, `playerFall.ts`, `playerMeal.ts`, `playerMining.ts` and `playerRespawn.ts`, and `PlayerSystems` (`entity/data/playerSystems.ts`) runs them over store players from the entity pass, logging every write and hurting through the store's damage pipeline. A `StorePlayer` built with `EntityRuntime.playerSystems` shares its components with them.

`PlayerComponents` now logs a player's air, breathing, sprinting, the block being mined, the meal in progress and every attribute it did not log before, such as movement speed, absorption and luck. `Entity.setAttributeValue` sets an attribute, and a player logs the write.

The breath, landing and mining checks read loaded chunks only. A player whose block is in a chunk that is not loaded waits, where the breath and landing checks used to load the chunk.

Fixed: hay, slime and the other blocks that break a fall now do so for a player standing on them. The landing check read the blocks under the player's eyes, not under their feet.

Breaking: `Player.beginConsuming` takes the tick and the meal's length, and a finished meal runs the held item's `onConsume` itself, so the third argument is gone. `EXHAUSTION` moved from `Player` to `entity/playerHunger`.
