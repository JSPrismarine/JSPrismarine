---
'@jsprismarine/prismarine': minor
---

Add `Level`, the owner of one `worlds.<name>` entry: its provider, seed, clock, game rules, weather,
spawn, player records and one `World` per level stem, built when first asked for or at `enable` for
a stem marked `eager`. `World` stays the per-dimension runtime and forwards `getTicks`,
`getGameRuleManager`, `getSeed`, `getProvider` and the weather to its level; `getLevel()` and
`getStem()` reach the new objects. The `World` constructor options gain `level` and `stem` and lose
`provider` and `seed`, which is a breaking change for code that built a `World` by hand.
`WorldManager` constructs one `Level` per loaded world and exposes `getLevels()` and
`getLevel(name)`; the server ticks levels, each of which advances its clock once and updates every
loaded world. The level writes the resolved stems as `worldGenSettings` and passes them with the
Nether scale into `level.dat` on save. A generator may report `seaLevel`, which the noise generator
reads from its stem's `noise_settings` and the flat generator fixes at Java's -63; `World.getSeaLevel`
and the content adapter read it from there, replacing the `SEA_LEVELS` table.
