---
'@jsprismarine/spawning': patch
---

Add `@jsprismarine/spawning`, the Bedrock natural spawning runtime. It parses all 24 condition
components `Spawn Rules.json` declares, including the three no vanilla file writes, and reads the
shapes vanilla varies: a block filter as a name, a list or `{name}` objects, a herd as one object
or a list of alternatives, a biome filter as a test, a bare array or a group map, and a
permutation's third field under both the schema's `min_guaranteed` and the docs page's
`guaranteed_count`. The biome filter goes through the filter evaluator of
`@jsprismarine/entities`, because spawn rules, entity definitions and trade tables share one filter
grammar; the spawn context answers `has_biome_tag`, `is_biome`, `is_snow_covered`, `is_underground`,
`is_underwater` and `in_lava` at a position with no entity yet.

`evaluateSpawnCondition` decides one condition and names the component that rejected a position.
`Spawner` runs the six steps of Mojang's spawn cycle diagram over an injected `SpawnWorld` and an
injected `RandomSource`, so one seed reproduces one set of spawns: the pool cap, a surface and an
underground pass per sampled chunk, a weighted draw between every condition that passed, the `rarity`
roll, the herd with its `initial_event` and `event` members, and `minecraft:permute_type` with its
guaranteed members and the `type<event>` form. `despawnReason` carries the two population-level
rules, the published Y floor of -128 and the simulation edge; the per-entity `minecraft:despawn`
policy stays in `@jsprismarine/entities`.

Mojang publishes no spawn attempt rate, no cap value, no spawn radius, no herd placement rule and no
light algorithm, and the only numbers in print are the tilde-hedged "Typical Cap" column of
`EntitySpawningDeepDive.md`. Every constant the algorithm needs therefore lives in
`src/tables/spawnConstants.json` with a `source` string naming where it came from, a host replaces
the whole table through `SpawnerOptions.constants`, and the README states which numbers are Mojang's
(none) and which are this project's (all). A gated corpus test parses all 60 vanilla spawn rules
with zero diagnostics and pins the measurements: 21 of the 24 components used, the pools at
`animal` 27, `monster` 24, `water_animal` 5, `pillager` 2, `cat` 1 and `ambient` 1, four rules with
no conditions, and no biome filter test left unanswered.
