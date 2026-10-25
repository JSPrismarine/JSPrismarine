---
'@jsprismarine/packs': patch
---

Load the real vanilla Bedrock behavior pack without errors. Four fixes, each against a shape Mojang's
own files write:

- A brarchive is keyed by its folder path under `__brarchive/` instead of its name. The vanilla
  layers ship `__brarchive/loot_tables/entities.brarchive` beside `__brarchive/entities.brarchive`,
  so the name alone collided and the loot tables overwrote the entity definitions. The composed
  vanilla entity count goes back from 125 to 129, creeper, witch, ghast and copper_golem among the
  recovered ones, and the 302 loot tables and 20 trade tables that landed under the wrong paths are
  back where they belong.
- An entity section written as `null` reads as absent. 23 vanilla entity files, `area_effect_cloud`
  among them, write `"events": null`.
- The filter parser accepts a group map that carries more than one combinator, reading it as an
  `all_of` over its clauses; a combinator that holds one test instead of an array; a `domain`
  written as a number or boolean, which `FilterTest.domain` now types the way `value` is typed; and
  the legacy shorthand that names the test in the key, as the skeleton's
  `{"other_with_families": "lightning"}` does. Mojang's `Filter Group Map.json` and
  `Filter Test.json` declare the first three; tnt_minecart, mooshroom, villager, villager_v2, witch,
  piglin and skeleton write them.
- The vanilla datapack test finds the Java server jar under `java-server/<version>/`, where
  `fetch:sources` writes it, or `java/<version>/`, where the Java dump and oracle scripts download
  their own copy.

A new test behind `JSP_VANILLA_BEHAVIOR_PACK` loads every registry of both the `bedrock-samples`
publication and the composed BDS vanilla layers and checks the counts.
