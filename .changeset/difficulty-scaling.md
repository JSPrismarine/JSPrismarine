---
'@jsprismarine/prismarine': patch
---

Scale a mob's blow to a player for the difficulty, as Java's `Player.hurtServer` does for a damage type that scales: nothing on Peaceful, `min(d / 2 + 1, d)` on Easy, the blow on Normal and half again on Hard, unrounded. `scaleForDifficulty` now follows that formula rather than rounding a multiplier, and `damageScalingOf` in `entity/damageTypes` reads a damage type's `scaling`.
