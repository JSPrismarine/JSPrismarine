# Can Java's published world generation data produce Bedrock-identical worlds?

Researched 2026-10-24. Scope: whether the vanilla Java Edition datapack (26.3, from the data generator output in `/tmp/bds-research-java/out/`) describes the same terrain, biomes, surfaces, features and structures that Bedrock 1.26.51.1 generates for the same seed; what Mojang has said about it release by release; how the two editions' random number generators differ; and how to verify parity against a real Bedrock Dedicated Server (BDS). Builds on [bedrock-data-extraction.md](bedrock-data-extraction.md), sections 3 and 9, and does not repeat it. Every claim names its source. Statements from Mojang (changelogs, bug tracker resolutions, docs) are marked as such; statements from seed-cracking projects and the wiki are marked non-primary. Nothing here is legal advice.

## Summary

- Mojang's own words stop short of "identical". The Bedrock 1.18.0 changelog says only that overworld generation "has changed entirely"; the Java 1.18 changelog says "New random number generator for overworld generation"; the 1.18.30 changelog says 64-bit seeds "can be used between Bedrock Edition and Java Edition to produce the same world (MCPE-144994, MCPE-148168)". The "We're not 100% there yet, but close" line from Minecraft Live 2021 reaches us only through press coverage.
- Mojang treats the Java structure-set parameters as shared. Bedrock's two data-driven structure sets carry the same salt, spacing and separation as Java's (`trail_ruins` 83469867/34/8, `abandoned_camp` 91231127/37/8), and the nether multinoise points in Bedrock's biome JSON equal Java's `biome_parameters/nether.json` value for value.
- The Java overworld generator is small as data: `noise_settings/overworld.json` is 3881 bytes and reaches 24 density function files, 27 noise files and 29 density function types; the surface rules span 44 files and 352 nodes; there are 4 carvers and 21 structure sets. The overworld biome parameter list is not in the datapack (`multi_noise_biome_source_parameter_list/overworld.json` is `{"preset": "minecraft:overworld"}`); the data generator's `reports/biome_parameters/minecraft/overworld.json` expands it to 7594 entries over 56 biomes.
- Bedrock surface builders and Java surface rules agree on materials for plains, desert, badlands, swamp, frozen ocean and windswept hills, down to the stone threshold (Bedrock `noise_range [0.121, 1.0]`, Java `min_threshold 0.1212...`), but Bedrock's JSON names an engine builder type (`minecraft:mesa`, `minecraft:swamp`, `minecraft:frozen_ocean`) where Java spells out the rule tree. Desert sandstone depth is in Java's data and not in Bedrock's.
- Bedrock's decoration data is less complete than the earlier note said. 87 of the 217 feature identifiers that feature rules and aggregate features reference have no JSON in the packs; 29 are `minecraft:legacy:*` tree and flower features that exist only in the engine, 25 live in the server-root `definitions/features/`, and 33 (reeds, cactus, kelp, seagrass, pumpkin, melon, dead bush, tall grass, mushrooms, bamboo, sand and gravel discs, coral) have no JSON anywhere.
- Bedrock's `structures/*.nbt` are Java-format big-endian gzipped NBT with Java block ids (`minecraft:oak_planks`, `white_bed[part=foot,...]`) and `DataVersion 1935`, a 1.14-era Java snapshot. 1038 of the 1300 Bedrock template names match Java 26.3's 1511. `plains_small_house_1.nbt` has the same size `[7,7,7]` and 24 palette entries in both.
- The RNG is the parity ceiling. Java's overworld uses Xoroshiro128++ (`legacy_random_source: false`). Mojang documents nothing about Bedrock's generator; seed-cracking projects (non-primary) describe MT19937 for structure placement with the Java salts and a different region-seed formula, and "Java-style" RNG for trail ruins and trial chambers. Any step that consumes random numbers (feature placement, structure piece selection, carver paths, mob spawning) cannot be bit-identical without Bedrock's generator.
- A BDS parity run is feasible in CI: `level-seed` is honored, `/tickingarea` can hold up to 10 areas of up to 100 chunks each, the Script API's `TickingAreaManager` adds a per-pack budget, and the repository already decodes `Data3D` (heightmap plus biomes) and version 9 sub chunks from LevelDB.
- `misode/deepslate` 0.27.2 (MIT, published 2026-09-27) implements density functions (54 types including 26.x's `find_top_surface` and `interval_select`), the noise router, aquifers, surface rules, the multi-noise biome source, Xoroshiro and legacy randoms, and structure-set placement, and already parses the 26.3 `material_rule` and `aquifers` shapes. It has no carvers, no ore veins in the surface pass (`minecraft:ore_vein` rule type), no placed features, and its surface pass takes one biome per chunk.
- Recommendation: use Java's density-function stack for terrain shape, aquifers, surface materials and biome placement, with deepslate as the reference and a possible dependency; layer Bedrock's biome, feature and feature-rule JSON on top; and stop claiming parity at the first RNG-dependent step.

## 1. Do Java and Bedrock generate the same terrain for the same seed?

### What Mojang said, release by release

All changelog text below comes from the Zendesk JSON API behind feedback.minecraft.net (`/api/v2/help_center/en-us/articles/<id>.json`), which returns the same body as the HTML page without the browser challenge.

| Release | Article | Statement |
|---|---|---|
| Bedrock 1.17.0 (2021-06-04) | 4402427632013 | No sentence about seeds or Java world generation. Seeds were 32-bit; the 1.18.20.21 note below describes the upgrade "from using only the lower 32 bits". |
| Bedrock beta 1.18.0.20 (2021-10-06) | 4410756779405 | "Changed ore generation rates to be in parity with Java Edition"; "Old cave carver placement is now on parity with Java Edition"; "Updated feature placement of Granite, Andesite, Diorite, Dirt, and Gravel to match Java Edition". |
| Bedrock beta 1.18.0.22 (2021-10-21) | 4411774334605 | "Strongholds can no longer generate mid-air in large caves". The fix comment on MCPE-144994 says negative seeds were fixed in this build. |
| Bedrock beta 1.18.0.24 (2021-10-27) | 4412150636941 | "Ore generation has now been tweaked to be in parity with Java Edition". |
| Bedrock 1.18.0 (2021-11-30) | 4414284658701 | "World generation for the Minecraft Overworld has changed entirely with this release. This means old seeds will no longer spawn players in the same positions when playing 1.18." Headline: "Drastically updated and improved biome, cave, and ore generation". No sentence says generation matches Java. |
| Java 1.18 (2021-11-30) | 4415128577293 | "The terrain shape and elevation varies dramatically, indepedently from biomes"; under Technical: "Bedrock layers now generate dependent on the world seed" and "New random number generator for overworld generation". No sentence mentions Bedrock Edition. |
| Bedrock beta 1.18.20.21 (2022-01-27) | 4423151445901 | Under "Vanilla Parity": "Worlds can now be created with 64-bit seeds (-9223372036854775808 to 9223372036854775807) and those can be copied between Bedrock and Java to produce the same world (MCPE-144994) (MCPE-148168)"; "Non-numeric seed UI inputs now produce the same seeds as Java Edition"; "A world with "StorageVersion" 8 or lower will be increased to 9 and have its "RandomSeed" upgraded from using only the lower 32 bits of a 64-bit number to using the full 64-bit range while still representing the same number." |
| Bedrock 1.18.30 (2022-04-13) | 5520890863245 | Same three sentences as 1.18.20.21, now under "World Generation": "These seeds can be used between Bedrock Edition and Java Edition to produce the same world (MCPE-144994, MCPE-148168)". |
| Bedrock 1.19.0 (2022-06-01) | 6613754674829 | Describes the deep dark and mangrove swamp; no sentence about seeds, structure placement or generation parity. |
| Bedrock 1.20.0 (2023-06-05) | 16421714461453 | Adds the cherry grove; no generation parity sentence. |
| Bedrock 1.21 (2024-06-10) | 27451789924237 | Trial chambers: "The layout of each Trial Chamber is procedurally generated"; "Never starts inside a Deep Dark biome, but can sometimes overlap it". No seed sentence. |
| Bedrock 1.21.50 (2024-12-02) | 32344904160397 | Pale garden "is a biome variation of Dark Forest". No seed sentence. |
| Bedrock preview 26.30.25/26 (2026-04-30) | 45497683432333 | "Iron doors and stone buttons now generate in strongholds"; "Fixed wooden doors in strongholds being placed with the wrong orientation" (two of the stronghold differences MCPE-91621 listed). |

The Minecraft Live 2021 quote "We're not 100% there yet, but close. It's very similar. Details will be different." appears in Windows Central and Gamepur coverage of the show; this note could not fetch a Mojang transcript, so it is press-reported. The reporter of MCPE-148168 paraphrases the show the same way: "The scenario given was a that Java player can generate a random world and that seed can be given to a bedrock player and they will get the same world. I realise this likely only covers biomes, terra[in]".

### Bug tracker (Mojira mirror at mojira.dev; keys are Mojang's)

| Key | Title | Resolution | What it establishes |
|---|---|---|---|
| MCPE-144994 | Negative seeds are not in parity | Resolved, Fixed (affects 1.18.0.21 beta) | Mojang treated a seed producing different biomes on the two editions as a bug and fixed it; the fix is the 64-bit sign extension above. |
| MCPE-148168 | Seed parity for random seeds only works in one direction | Resolved, Fixed | Random Java seeds (full 64-bit) did not reproduce on Bedrock until 64-bit seeds landed. Mojang fixed it, which is the strongest primary evidence that terrain and biomes are meant to match. |
| MCPE-154947 | The Nether only uses the bottom 32 bits of the world seed, rather than all 64 like the Overworld does | Open | Nether generation differs for seeds that differ only above bit 31. |
| MCPE-149849 | Bedrock pattern at bottom of worlds ignores seed | Open | Java made the bedrock floor seed-dependent in 21w40a; Bedrock did not. The bedrock layer differs. |
| MCPE-91621 | (Parity) Stronghold Generation | Resolved, Invalid | The report ("3 strongholds generate from 0,0 within a ring of radius between 640 and 1152 blocks then other strongholds are randomly generated throughout the world") was closed as invalid, so Bedrock's stronghold placement differing from Java's rings is intended. |

The Minecraft Wiki's "Parity issue list" (non-primary, `https://minecraft.wiki/w/Parity_issue_list`) is a useful index of further keys: MCPE-84455 (nether fortresses rare), MCPE-108400 (ocean ruins and buried treasure more common, Invalid), MCPE-158726 (nether caves not filling with lava), and its unsourced lines "Placement of small end islands is different", "Icebergs generate twice as often", "Canyons are generally larger and deeper", "Mineshafts are much more frequent".

### What matches today for equal seeds

Legend for the evidence column: M = Mojang statement, B = Mojang bug resolution, D = data comparison in this note, P = player or tool report only (non-primary), none = no evidence found.

| Stage | Match? | Evidence |
|---|---|---|
| Overworld terrain shape (density functions) | Yes, in Mojang's intent and in practice | M (1.18.30: "produce the same world"), B (MCPE-144994, MCPE-148168 fixed because terrain and biomes differed), P (seed tools compare them routinely) |
| Overworld biome placement | Yes | B (MCPE-144994 was a biome mismatch), P |
| Aquifers | Expected yes; unverified | Aquifers are density-function driven in Java (`aquifers` block in `noise_settings/overworld.json`); Bedrock 1.18.0 "Added aquifers". No statement that they match. |
| Ore veins (large copper and iron veins) | Unverified | Java: `minecraft:ore_vein` surface rule plus `vein_toggle`, `vein_ridged`, `vein_gap` router entries. Bedrock 1.18.0 "Added large ore veins". No statement. |
| Cave carvers | No | M (1.18.0.20: "Old cave carver placement is now on parity") covers placement counts, not paths; carvers consume RNG. P: "Canyons are generally larger and deeper". |
| Surface rules | Materials yes, algorithm engine-side | D (section 3) |
| Feature placement (trees, ores, flowers) | No, by design | Feature rules say "Order is not guaranteed within each pass" (docs, section 2). Counts and heights match for ores and geodes; D (section 4). |
| Structure placement (which chunks) | Partly | Trail ruins and abandoned camps share Java's structure-set JSON (D). For the rest, Bedrock uses the same salts with a different RNG and formula (P, section 2). Strongholds: B (MCPE-91621 Invalid). |
| Nether terrain and biome placement | Biome parameters yes; seed only 32-bit | D (section 3: Bedrock multinoise points equal Java's), B (MCPE-154947 Open) |
| End terrain and end cities | No evidence | P: "Placement of small end islands is different" (wiki) |
| Spawn point | No evidence | Bedrock's Script API returns `getDefaultSpawnLocation()` with "Y coordinate is 32767, indicating a player's spawn height is not fixed" (docs). Wiki: "Default player spawn point radius is larger" on Java. |
| Slime chunks | No | P: SeedFinder README: "in Bedrock Edition, slime chunks do not use the world seed; every Bedrock world shares the same layout". No Mojang statement. |
| Mushroom islands | Same biome placement rule | Java places `mushroom_fields` at continentalness `[-1.2, -1.05]` (`biome_parameters/overworld.json`); as a biome it follows the biome placement row. |
| Bedrock floor pattern | No | B (MCPE-149849 Open) |

## 2. 64-bit seeds and the RNG

### Seeds

Bedrock accepted 64-bit seeds first in beta 1.18.20.21 (2022-01-27) and in release 1.18.30 (2022-04-13), with the quoted range and the `StorageVersion` 8 to 9 upgrade of `RandomSeed`. "Non-numeric seed UI inputs now produce the same seeds as Java Edition" (same articles). Java hashes a non-numeric seed string with `String.hashCode()` into a 32-bit int; Mojang's sentence says Bedrock now does the same. BDS reads `level-seed` as "Any string" (`server.properties`), so the harness in section 6 should pass a decimal integer to avoid the hashing path.

The nether still keys off the low 32 bits (MCPE-154947, Open).

### Java's generator

`noise_settings/overworld.json` has `"legacy_random_source": false`, which selects Xoroshiro128++ for the `RandomState` (the Java 1.18 changelog: "New random number generator for overworld generation"). deepslate mirrors this in `src/worldgen/RandomState.ts` line 27: `(settings.legacyRandomSource ? new LegacyRandom(seed) : XoroshiroRandom.create(seed)).forkPositional()`. Noise instances are seeded from the positional random by their registry name (`fromHashOf(Identifier...)`), so two implementations that agree on the noise registry and the Xoroshiro algorithm produce the same noise fields.

### Bedrock's generator

Mojang documents none of it. The closest statements are the world generation overview ("The generation starts with a "seed," a random number, that's fed into gradient noise generators", `learn.microsoft.com/en-us/minecraft/creator/documents/world-generation`), the Molang reference (`query.noise` "Queries a Perlin Noise Map"; `query.get_level_seed_based_fraction` "Returns a value in range [0.0, 1.0] based on the level seed"), and the features introduction (`MicrosoftDocs/minecraft-creator`, `creator/Reference/Content/FeaturesReference/Examples/FeaturesIntroduction.md`): "Earlier passes in the list are guaranteed to occur before later passes. Order is not guaranteed within each pass." That last sentence means Bedrock does not promise a deterministic decoration order even to itself.

Bedrock feature rules do reference `query.noise` and `query.heightmap` in Molang distributions; `plains_after_surface_flowers_feature_rules.json` has `"iterations": "(query.noise((variable.originx + 8) / 200.0, (variable.originz + 8) / 200.0) < -0.8) ? 4 : 1"`. Whether that noise is seeded from the level seed is not documented.

Non-primary descriptions, from seed-cracking projects whose results depend on being right:

- Alist2930/MCBE-seedcracker README: "Minecraft Bedrock Edition uses a 64-bit integer as the world seed. When generating structures, the system calculates a "region seed" based on region coordinates and the seed, then uses the MT19937 random number generator to determine the structure's offset position within the region." Formula: `r_base = (rx * 2570712328 + rz * 4048968661 + salt) & 0xFFFFFFFF`, `r_seed = world_seed_low32 + r_base`. Its example salts (desert temple 14357617, ocean monument 10387313, shipwreck 165745295) equal Java's `structure_set/desert_pyramids.json`, `ocean_monuments.json` and `shipwrecks.json` salts in the 26.3 data.
- zebedelu/SeedFinder README: Bedrock's "classic" structures are "the Mersenne-Twister structures" on the low 32 bits, while "Trail Ruins and Trial Chambers, whose placement RNG is Java-style and keyed on the whole 48-bit seed"; "Mineshaft, which is never crackable"; slime chunks "do not use the world seed".

Java's `random_spread` placement uses `LegacyRandom` seeded with `rx * 341873128712 + rz * 132897987541 + seed + salt` (deepslate `StructurePlacement.ts` reproduces it and its test pins village chunks for a seed). If the cracker descriptions hold, Bedrock shares Java's spacing, separation and salts but not the generator or the region-seed arithmetic, which is exactly what makes the two editions place villages in different chunks for the same seed while agreeing on the grid density.

### What this implies

Density functions and the surface rules consume no per-call random numbers beyond the seeded noise fields, so an implementation of Java's stack with Xoroshiro128++ reproduces Java's terrain shape, aquifer decisions, surface materials and biome placement. If Bedrock's engine implements the same stack (the bug fixes above say it does for terrain and biomes), the result is also Bedrock's. Everything after that (carver paths, feature positions, tree shapes, structure piece selection, mob spawning) draws from a generator Mojang has not described, so it cannot be bit-identical from Java's data, and the harness in section 6 must compare those stages statistically.

## 3. What Java publishes that would run Bedrock's overworld

Measured on the 26.3 data generator output (`/tmp/bds-research-java/out/generated/data/minecraft/worldgen/`), which also exists on the `data` branch of `misode/mcmeta`.

| Registry | Files | Notes |
|---|---|---|
| `noise_settings` | 7 | `overworld.json` 3881 bytes: `noise {min_y -64, height 384}`, `sea_level 63`, `default_block stone`, `default_fluid water`, `legacy_random_source false`, `aquifers {barrier, exclusion, fluid_level_floodedness, fluid_level_spread, lava, surface_level}`, `material_rule "minecraft:overworld"`, `noise_router` with 15 entries, `spawn_target` 2 entries, `debug_functions` 9. |
| `density_function` | 55 | The overworld router's closure reaches 24 files and 27 `noise` files and uses 29 types: abs, add, beardifier, blend_alpha, blend_density, blend_offset, cache, clamp, cube, div, find_top_surface, gradient, half_negative, interpolated, interval_select, lerp, max, min, mul, noise, old_blended_noise, quarter_negative, range_choice, shift_a, shift_b, spline, square, squeeze, sub. |
| `noise` | 64 | |
| `multi_noise_biome_source_parameter_list` | 2 | `overworld.json` is 37 bytes: `{"preset": "minecraft:overworld"}`. The list itself is code. The data generator's `reports/biome_parameters/minecraft/overworld.json` (3499270 bytes) expands it to 7594 `{biome, parameters}` entries over 56 biomes; `nether.json` has 5. |
| `material_rule`, `material_condition` | 42, 8 | New registries in 26.x; 1.21 kept the tree inline as `surface_rule`. The overworld closure reaches 44 files and 352 object nodes; rule types: bandlands, block, condition, sequence; condition types: above_preliminary_surface, biome, hole, noise_threshold, not, ore_vein, steep, stone_depth, vertical_gradient, water, y_above. |
| `carver` | 4 | `cave` (probability 0.15, count very_biased_to_bottom 0..14), `cave_extra_underground` (0.07), `canyon` (0.01), `nether_cave` (0.2). 26.x flattened the old `config` object. |
| `structure_set` | 21 | Table in section 5. |
| `structure`, `template_pool`, `processor_list` | 52, 245, 40 | |
| `placed_feature`, `feature` (configured) | 273, 240 | |
| `biome` | 67 | Each lists its placed features per decoration step and its carvers. |

The 26.3 shape differs from 1.21 in three places a loader must handle: `material_rule` as a registry reference, `aquifers` as an object of density functions (1.21 had `aquifers_enabled`/`ore_veins_enabled` booleans), and structure template palettes keyed `id`/`properties` (1.21: `Name`/`Properties`).

### Surface rules versus Bedrock surface builders

Bedrock files from `/tmp/bds-research-worldgen/composed/*.biome.json` (layers composed, later layer wins); Java from `material_rule/overworld/*.json` and `material_rule/overworld/surface.json`.

| Biome | Bedrock `surface_builder` | Java rule | Agreement |
|---|---|---|---|
| plains | type `overworld`: top `grass_block`, mid `dirt`, foundation `stone`, sea floor `gravel` depth 7, sea `water` | `biome_surface/default`: `grass_block` if not underwater else `dirt`; `under_biome_surface/default` `dirt`; sea floor `gravel_or_stone_if_ceiling`; `not_under_deep_water` is `water` offset -6 | Same blocks. Java's "deep water" offset -6 and Bedrock's `sea_floor_depth 7` describe the same band. |
| desert | type `overworld`: top `sand`, mid `sand` | `sand_or_sandstone_if_ceiling` on floor; `sandstone` when `very_deep_under_floor`; `sandstone` under floor for beaches | Top and mid agree. Bedrock's JSON has no sandstone layer; the engine places it (Bedrock deserts have sandstone), so the data under-specifies. |
| badlands (`mesa`) | type `mesa`: `clay_material white_terracotta`, `hard_clay_material hardened_clay`, top `red_sand`, mid `hardened_clay`, flags `bryce_pillars false`, `has_forest false` | `bandlands` rule plus `terracotta` at three `surface` noise bands when above y 74, `orange_terracotta` above 256 and when not in a hole, `red_sand` (or `red_sandstone` on ceiling) when not underwater, `white_terracotta` when not under deep water, gravel sea floor | Same material set. Bedrock names an engine builder; Java spells out the bands, thresholds (-0.909, -0.5454, -0.1818, 0.1818, 0.5454, 0.909) and heights. |
| swamp (`swampland`) | type `swamp`: grass/dirt/stone/gravel, `max_puddle_depth_below_sea_level 1` | `swamp` block: y above 62 and not above 63 and `surface_swamp` noise >= 0 then `water` | Same intent (one-block puddles below sea level, noise-gated). Bedrock gives the depth, Java gives the noise and band. |
| frozen ocean | type `frozen_ocean`: grass/dirt/stone/gravel | default grass/dirt, plus `frozen_ocean`/`deep_frozen_ocean` with `hole` then `air` (above water) or `water` (on floor), gravel sea floor. Icebergs are placed features in Java (`iceberg_packed`, `iceberg_blue`). | Same floor materials. Bedrock's builder type carries the icebergs inside the engine; the wiki (non-primary) says they "generate twice as often". |
| windswept hills (`extreme_hills`) | type `overworld` plus `surface_material_adjustments`: `noise_frequency_scale 0.0625`, `noise_range [0.121, 1.0]` gives top and mid `stone` | `biome_surface/windswept_hills`: `noise_threshold` on `surface` with `min_threshold 0.12121212...` then `stone` | Same threshold to three decimals, same block. |

So the material tables agree where both are data. Where Bedrock has `type: minecraft:<biome>`, the algorithm is engine code and Java's rule tree is the only written form of it.

### Nether biome parameters

Bedrock `minecraft:multinoise_generation_rules` versus Java `reports/biome_parameters/minecraft/nether.json`:

| Biome | Bedrock (temperature, humidity, altitude, weirdness, weight) | Java (temperature, humidity, depth, weirdness, offset) |
|---|---|---|
| nether_wastes (`hell`) | 0, 0, 0, 0, 0 | 0, 0, 0, 0, 0 |
| crimson_forest | 0.4, 0, 0, 0, 0 | 0.4, 0, 0, 0, 0 |
| warped_forest | 0, 0.5, 0, 0, 0.375 | 0, 0.5, 0, 0, 0.375 |
| soul_sand_valley | 0, -0.5, 0, 0, 0 | 0, -0.5, 0, 0, 0 |
| basalt_deltas | -0.5, 0, 0, 0, 0.175 | -0.5, 0, 0, 0, 0.175 |

Identical. The Bedrock docs call this component "a pre-Caves and Cliffs component and is unused for custom biomes" (earlier note, section 3), so the engine reads these numbers for vanilla only.

## 4. Features and decoration

Bedrock files are the composed pack layers; the layer each file comes from is in `composed/features.origins.tsv` and `composed/feature_rules.origins.tsv`. Java files are `worldgen/feature/*.json` and `worldgen/placed_feature/*.json`.

| Feature | Bedrock | Java | Agreement |
|---|---|---|---|
| Oak tree in plains | `plains_surface_trees_feature.json` (layer 1.18.0): `surface_pass`, biome tag `plains`, 1 iteration at `query.heightmap`, places `minecraft:legacy:plains_tree_feature`, which has no JSON. The pack's `oak_tree_feature.json` (1.26.50): trunk 4..7 `oak_log`, blob canopy with offsets -3..0 and variation chances, used by other biomes. | `placed_feature/trees_plains.json`: count weighted {0: 19, 1: 1}, `in_square`, `surface_water_depth_filter 0`, heightmap `OCEAN_FLOOR`, `would_survive oak_sapling`; `feature/trees_plains.json`: `oak_bees_005` default, `fancy_oak_bees_005` at 1/3, `fallen_oak_tree` at 0.0125; `feature/oak.json`: straight trunk base 4 plus 0..2, blob foliage radius 2 height 3. | Not comparable from data. Bedrock's plains tree is engine code; the rate (Java: one tree in 20 chunks) is not written anywhere on the Bedrock side. |
| Coal ore | `coal_ore_upper_feature.json`: count 17, no discard; rule `overworld_underground_coal_ore_upper_feature`: 30 iterations, uniform y [136, 320], tags `overworld` or `overworld_generation`. `coal_ore_feature.json`: count 17, `discard_chance_on_air_exposure 0.5`; rule `..._lower_feature`: 20 iterations, triangle y [0, 192]. The rule `overworld_underground_coal_ore_feature` has `iterations 0` (disabled). | `ore_coal_upper`: count 30, uniform 136..`below_top 0` (= 320), `ore_coal` size 17 discard 0. `ore_coal_lower`: count 20, trapezoid 0..192, `ore_coal_buried` size 17 discard 0.5. | Counts, heights, sizes, discard chances and distributions agree exactly. |
| Flower patch (plains) | `scatter_plains_flower_feature.json` (1.21.60): 64 iterations, triangle x/z [-6, 6], y [-2, 2], places `minecraft:legacy:plains_flower_feature` (engine). Rule `plains_after_surface_flowers_feature_rules.json`: `after_surface_pass`, iterations `noise < -0.8 ? 4 : 1`, `scatter_chance 1/8`, uniform x/z in chunk, y heightmap. | `placed_feature/flower_plains.json`: `noise_threshold_count` level -0.8 below 15 above 4, `rarity_filter 32`, `in_square`, heightmap `MOTION_BLOCKING`, count 64, trapezoid offsets x/z +-6 y +-2, air filter; `feature/flower_plain.json`: `simple_block` with provider `flower_plain`. | Patch shape agrees (64 tries, +-6/+-2). Rates differ: Bedrock 1/8 chance with 4 or 1 patches, Java 1/32 with 15 or 4. The flower-type gradient is engine code on Bedrock (the wiki notes "Additional randomness is applied during terrain generation"). |
| Sugar cane (reeds) | Rule `overworld_after_surface_reeds_feature_rules.json` (1.26.50): `after_surface_pass`, overworld tags minus desert, swamp, mesa, 1 iteration, `scatter_chance 1/6`, uniform x/z, y heightmap, places `minecraft:reeds_feature`, which has no JSON in the packs or in `definitions/features`. | `placed_feature/patch_sugar_cane.json`: rarity 6, `in_square`, heightmap, count 20, trapezoid +-4, predicate air and `would_survive sugar_cane` and water adjacent at y-1; `feature/sugar_cane.json`: `block_column` height biased_to_bottom 2..4. | The 1/6 chance agrees. The patch (20 tries, +-4) and the column height are inside Bedrock's engine feature. |
| Amethyst geode | `amethyst_geode_feature.json` (1.17.0): filler air, inner `amethyst_block`, alternate `budding_amethyst`, middle `calcite`, outer `smooth_basalt`, buds, wall distance 4..7, points 3..5, offsets 1..3, radius 16, crack chance 0.95, alternate layer chance 0.083, invalid threshold 1. Rule `overworld_amethyst_geode_feature`: `after_surface_pass`, 1 iteration, `scatter_chance 1/24`, x 0, z 0, uniform y [-58, 30]. | `feature/amethyst_geode.json`: same block set, `outer_wall_distance` uniform 4..6, `generate_crack_chance 0.95`, `use_alternate_layer0_chance 0.083`, `invalid_blocks_threshold 1`; `placed_feature/amethyst_geode.json`: rarity 24, `in_square`, uniform `above_bottom 6` (= -58) to 30. | Chance, height range, block layers and probabilities agree; only the wall distance upper bound (7 versus 6, possibly exclusive versus inclusive) and the in-chunk offset (Bedrock fixes x and z at 0, Java randomizes) differ. |

### How much of Bedrock's decoration pass is data

Resolving every `places_feature` and aggregate `features` reference in the composed packs: 217 distinct identifiers are referenced, 87 have no definition in the packs. Of those 87, 29 are `minecraft:legacy:*` (tree features for plains, forest, taiga, savanna, jungle, birch, mega taiga, flower forest, ice, meadow, mesa plateau, bamboo jungle; flower features for plains, forest, swamp, flower forest, overworld; `legacy:emerald_ore_feature`, `legacy:forest_rock_feature`, `legacy:ice_feature`, `legacy:small_mushrooms_feature`), 25 exist in the server-root `definitions/features/` (for example `oak_tree_with_optional_beehive_feature`, `select_oak_tree_feature`, `tall_grass_feature`, `fern_feature`, `grass_double_plant_feature`, `dirt_feature`), and 33 exist nowhere as JSON: `reeds_feature`, `cactus_feature`, `kelp_feature`, `seagrass_feature` and its taller variants, `pumpkin_feature`, `melon_feature`, `dead_bush_feature`, `brown_mushroom_feature`, `red_mushroom_feature`, `bamboo_feature`, `sand_feature`, `gravel_feature`, `grass_disc_feature`, `coral_feature`, `coral_hang_feature`, `coral_crust_feature`, `pickle_feature`, `desert_well_feature`, `eyeblossom_feature`, `leaf_litter_feature`, `pink_petals_feature`, `wildflowers_feature`, `meadow_flower_feature`, `nether_fossil_feature`, `firefly_bush_*`, `sulfur_*`, `vines_single_face_feature`.

This corrects the earlier note's "Vanilla's decoration pass is JSON": the rules (where, how often, which pass) are JSON, the ore, geode, dripstone, sculk, fossil and most tree features are JSON, and the most common surface plants plus the biome-default trees are engine code. A Bedrock-data decoration pass needs this project to write those 62 engine features by hand or to adopt Java's `feature/*.json` for them (Java has `patch_sugar_cane`, `patch_cactus`, `kelp`, `seagrass_*`, `patch_pumpkin`, `patch_melon`, `patch_dead_bush`, `disk_sand`, `disk_gravel`, `coral_*` and the tree configurations).

## 5. Structures

| Structure | Java 26.3 | Bedrock 1.26.51.1 | Placement match for equal seeds |
|---|---|---|---|
| Village | `structure/village_*.json` (jigsaw) plus `structure_set/villages.json`: random_spread salt 10387312, spacing 34, separation 8, 5 structures; `template_pool` 245 files. Code: jigsaw assembly. | Engine ("legacy version of the Jigsaw Structure System", docs). Templates `structures/village/**` (289). Biome JSON carries `minecraft:village_type` (10 biomes: default 3, desert, ice, savanna, taiga 4). | No. Same spacing per the crackers (non-primary), different RNG. Not a Mojang statement. |
| Stronghold | `concentric_rings` distance 32, count 128, spread 3, biased to `#stronghold_biased_to`. Code: piece generator. | Engine. MCPE-91621 (Invalid) describes 3 near 0,0 within 640..1152 blocks, then random. No templates. | No (B). |
| Mineshaft | `structure_set/mineshafts.json`: salt 0, spacing 1, separation 0, frequency 0.004, 2 structures. Code. | Engine. Wiki (non-primary): "much more frequent". SeedFinder: "never crackable". | No. |
| Desert temple | `desert_pyramids`: salt 14357617, spacing 32, separation 8. Code (single piece). | Engine. Cracker salt 14357617 (non-primary). | Grid matches; chunk differs (RNG). |
| Ocean monument | `ocean_monuments`: salt 10387313, spacing 32, separation 5, triangular. Code. | Engine. Cracker salt 10387313. Wiki: roof always at y 56. | Grid matches; chunk differs. |
| Nether fortress and bastion | `nether_complexes`: salt 30084232, spacing 27, separation 4, 2 structures (fortress code; bastion jigsaw with `template_pool/bastion/**`). | Engine for both. Bastion templates `structures/bastion/**` (168). MCPE-84455: fortresses "extremely rare". | No. |
| End city | `end_cities`: salt 10387313, spacing 20, separation 11, triangular. Code: piece generator with templates. | Engine. Templates `structures/endcity/` (21, Java-only names `end_city/` 20). | No evidence. |
| Ancient city | `structure/ancient_city.json` jigsaw, `ancient_cities`: salt 20083232, spacing 24, separation 8. | Engine (legacy jigsaw). Templates `structures/ancient_city/**` (58). | No evidence. |
| Trial chambers | `structure/trial_chambers.json` jigsaw, `trial_chambers`: salt 94251327, spacing 34, separation 12. | Engine (not among the two data-driven ones). Templates `structures/trial_chambers/**` (171). SeedFinder: placement "Java-style ... keyed on the whole 48-bit seed" (non-primary). | Possibly yes (P only). |
| Trail ruins | `trail_ruins`: salt 83469867, spacing 34, separation 8; jigsaw `start_pool trail_ruins/tower`, size 7, `start_height absolute -15`, `terrain_adaptation bury`, step `underground_structures`. | `worldgen/structure_sets/trail_ruins.json` (layer 1.19.80): `random_spread`, salt 83469867, spacing 34, separation 8, `spread_type linear`; `worldgen/structures/trail_ruins.json`: `minecraft:jigsaw`, `start_pool minecraft:trail_ruins/tower`, `max_depth 7`, `start_height constant absolute -15`, `terrain_adaptation bury`, `step underground_structures`, biome filter `has_biome_tag has_structure_trail_ruins`. | Parameters identical (D). Whether the RNG matches: P only. |
| Abandoned camp (1.26.50) | `abandoned_camp`: salt 91231127, spacing 37, separation 8, 18 structures. | `worldgen/structure_sets/abandoned_camp.json`: salt 91231127, spacing 37, separation 8, 18 structures (one per biome variant). | Parameters identical (D). |

Java's `structure_set` placements in full (type, salt, spacing, separation): ancient_cities random_spread 20083232/24/8; buried_treasures 0/1/0 frequency 0.01; desert_pyramids 14357617/32/8; end_cities 10387313/20/11 triangular; igloos 14357618/32/8; jungle_temples 14357619/32/8; mineshafts 0/1/0 frequency 0.004; nether_complexes 30084232/27/4; nether_fossils 14357921/2/1; ocean_monuments 10387313/32/5 triangular; ocean_ruins 14357621/20/8; pillager_outposts 165745296/32/8 frequency 0.2 with exclusion zone 10 chunks from villages; ruined_portals 34222645/40/15 (7 structures); shipwrecks 165745295/24/4; strongholds concentric_rings; swamp_huts 14357620/32/8; trail_ruins 83469867/34/8; trial_chambers 94251327/34/12; villages 10387312/34/8; woodland_mansions 10387319/80/20 triangular.

### Template files

Bedrock ships 1300 templates after layer composition (1285 `.nbt`, 15 `.mcstructure`): abandoned_camp 297, village 289, trial_chambers 171, bastion 168, trail_ruins 84, mansion 74, ancient_city 58, ruin 49, endcity 21, shipwreck 20, nether_fossils 14, ruined_portal 13, coralcrust 11, minecraft 10, pillageroutpost 9, fossils 8, igloo 4. Java 26.3's inner jar (`META-INF/versions/26.3/server-26.3.jar`, `data/minecraft/structure/`) ships 1511 `.nbt`. 1038 names are common. Bedrock-only names are mostly renamed folders (`mansion` versus `woodland_mansion`, `ruin` versus `underwater_ruin`, `endcity` versus `end_city`, `fossils` versus `fossil`, `pillageroutpost` versus `pillager_outpost`) plus 36 bastion and 17 village files; Java-only names include 211 village files (the `zombie/` variants and others), `spring/` and `desert_well`.

Both editions' `village/plains/houses/plains_small_house_1.nbt` are gzipped, big-endian, Java-format NBT (`1f 8b` header; parsed by `/tmp/bds-research-worldgen/tools/nbt-summary.mjs` in big-endian mode; the little-endian mode fails). Both have `size [7,7,7]`, 24 palette entries and no entities. Bedrock: `DataVersion 1935` (a Java 1.14 snapshot; the 1.14 release is 1952), 187 block entries, palette entries `{Name, Properties}` with Java ids and states such as `minecraft:oak_stairs[half=bottom,waterlogged=false,shape=outer_left,facing=south]`, `minecraft:white_bed[part=foot,facing=east,occupied=false]`, `minecraft:jigsaw[facing=west]`, `minecraft:structure_block[mode=data]`. Java 26.3: `DataVersion 5023`, 343 block entries (air stored), palette entries `{id, properties}`. So Bedrock's village pieces are a frozen 2019 copy of Java's, keyed by Java block ids that the engine maps to Bedrock states at placement. The 15 `.mcstructure` files (Bedrock's own little-endian format) are the exception, not the rule.

## 6. Verification method against a real BDS

### Facts the harness relies on

- BDS honors the seed. `server.properties`: `level-seed=` "Use to randomize the world. Allowed values: Any string"; the how-to: "The seed to be used for randomizing the world. If left empty a seed will be chosen at random." Pass a decimal integer. The server writes it to `level.dat` as `RandomSeed` (long); the repository already reads and writes that field (`packages/prismarine/src/world/providers/leveldb/LevelDB.ts` line 234, `LevelDB.test.ts` line 112). The Script API exposes `world.seed` as a string (`@minecraft/server` World class docs) for a second read.
- `client-side-chunk-generation-enabled=true` (default) means "the server will inform clients that they have the ability to generate visual level chunks outside of player interaction distances"; `server-build-radius-ratio` controls "how much of the player's view it will generate, assigning the rest to the client to build" and is "Only valid if client-side-chunk-generation-enabled is enabled". These govern what the server sends to a connected client, not what a ticking area generates. With no client connected and generation forced by ticking areas, the server generates and saves every chunk itself. Set the property to `false` in the harness anyway so a debugging client sees server chunks only.
- Ticking areas force generation without a player. Limits from Mojang's docs: "A world can have up to 10 separate ticking areas, each area containing up to 100 chunks" (`learn.microsoft.com/en-us/minecraft/creator/documents/simulationrenderdistanceguide`); `radius` "Between 0 and 4" for circles (`.../commands/commands/tickingarea`); "Any chunks that are touched by this column are included" and `preload` exists (`.../documents/tickingareacommand`). The Script API `TickingAreaManager` ("limited by a fixed amount of ticking chunks per pack independent of the command limits", `maxChunkCount`, `hasCapacity` false "if the length or width exceeds the 255 chunk limit") is a second budget.
- The Script API can tell when a chunk exists: `Dimension.isChunkLoaded`, `Dimension.getBlock` "returns 'undefined' if asking for a block at an unloaded chunk", `getBiome`, `getTopmostBlock`, `getGeneratedStructures`, and `calculateClosestBiomeFromSeed` are listed as stable on the `Dimension` page. The `/schedule on_area_loaded add tickingarea <name> <function>` form (ticking area docs) fires a function once an area's chunks are loaded.
- The repository reads what BDS writes: `LevelDBKeys.ts` names the record tags (`Data3D 0x2b`, `Version 0x2c`, `SubChunkPrefix 0x2f`, `FinalizedState 0x36`, `BlendingData 0x40`, ...), `BiomeCodec.ts` decodes `Data3D` ("a heightmap, then one biome palette per sub chunk", palette entries "plain little endian int32 biome ids", `0xff` meaning "the same as the sub chunk below"), and `SubChunkCodec.ts` decodes versions 1, 8 and 9. `VanillaWorld.test.ts` is a byte-exact round trip against a real world when `JSP_VANILLA_WORLD` points at one, and skips otherwise.

### Proposed run

1. Download and unpack the pinned BDS zip as the earlier note's section 7 describes (sha256 `ad91d3b8...`); set `level-seed=<decimal>`, `level-name=parity`, `online-mode=false`, `allow-list=false`, `client-side-chunk-generation-enabled=false`, `transport=raknet`.
2. Install a behavior pack with `@minecraft/server` that, on `world.afterEvents.worldLoad`, adds ten rectangular ticking areas of 10 by 10 chunks (`runCommand('tickingarea add <x1> 0 <z1> <x2> 0 <z2> parity_<n> true')`) covering a 320 by 320 block square around the origin, polls `Dimension.isChunkLoaded` for every chunk in the square, then logs `PARITY GENERATED` and asks the server to `stop`. For a larger region, remove the areas and move them in a second cycle; the 10 by 100 chunk budget is 1000 chunks per cycle. Alternatively use `world.tickingAreaManager` and read `maxChunkCount` to size the batch.
3. Read `worlds/parity/db` with `@jsprismarine/leveldb`, decode `Data3D` and every `SubChunkPrefix` record per chunk, and keep only chunks whose `FinalizedState` record marks population done (check the value BDS writes on a known-complete chunk first; the key is already in `LevelDBKeys.ts`).
4. Generate the same chunks with this server's generator for the same seed and compare.

Pumpkin's test suite is a working precedent for step 4 (`crates/pumpkin-world/src/generation/proto_chunk_test/`): `dumps.rs` compares a generated chunk against a vanilla dump with an `allowed_mismatches` budget ("Chunk noise generation mismatches vanilla!"), `stage_parity.rs` compares per-section hashes after each generation stage, and `structure_starts.rs` compares which structures start in which chunk.

### What to compare, and tolerances

| Measure | Expected | Tolerance |
|---|---|---|
| Biome id per 4x4x4 cell (`Data3D` palettes) | Identical for overworld after terrain and biome stages | Zero, except at cells a Bedrock-only feature or structure rewrote; report mismatches by biome pair |
| Heightmap per column (`Data3D` first 512 bytes) | Identical before decoration; after decoration trees and plants raise it | Compare `getTopmostBlock`-style "world surface ignoring plants": derive from sub chunks by skipping non-terrain blocks, then expect zero |
| Terrain block per cell, restricted to {stone, deepslate, water, lava, air, surface rule outputs} | Identical where no carver, ore, vein or feature touched the cell | Zero on cells both editions classify as "untouched"; the carver and feature footprints are the known non-matching set, so report the fraction of mismatching cells and require it to stay under a threshold measured once against BDS (Pumpkin's `allowed_mismatches` pattern) |
| Surface block per column | Identical | Zero outside carver openings and structures |
| Aquifer water and lava | Identical if aquifers are shared | Report per-cell mismatch fraction separately so a shared-aquifer hypothesis can be confirmed or dropped |
| Ore counts per ore type per chunk | Same distribution, not same positions | Compare means and histograms over the whole region, not per chunk |
| Structure starts per chunk | Expect mismatch except trail ruins, abandoned camp, maybe trial chambers | Record both sets; a match for the data-driven ones confirms the shared `structure_set` semantics |
| Full sub chunk equality | Not expected after decoration | Report as a fraction for tracking only |

Everything after terrain, aquifers, surface and biomes is RNG-dependent (section 2), so a per-cell equality test there would fail on a correct implementation; distributions are the right test.

## 7. Recommendation

Implement Java's published generator stack as this server's terrain engine: the density function types the overworld router uses, the noise router, `RandomState` with Xoroshiro128++, aquifers, the surface rule tree, and the multi-noise biome source fed by the expanded `biome_parameters` report. The inputs are JSON Mojang publishes in the Java client and server jars and that the data generator emits; they are Mojang's content under the same EULA as the Bedrock files the earlier note discusses, and `misode/mcmeta` republishes them without a license grant from Mojang. This note records that fact and does not opine on it.

On top of that stack, keep Bedrock as the source for what Bedrock publishes: biome climate and tags, `surface_builder` materials (which agree with Java's rules where both exist), feature rules for placement passes and rates, the JSON features (ores, geodes, dripstone, sculk, fossils, most trees), structure templates, and the two data-driven structure sets. Where Bedrock's feature is engine code (section 4's 62 names), Java's `feature/*.json` is the only written description and should be the fallback.

Parity stops at the first random draw. Terrain, aquifers, surface materials and biomes can match block for block; carver paths, feature positions, tree shapes, structure chunks for the legacy structures, bedrock floor and slime chunks cannot be matched from published data, because Mojang has not described Bedrock's generator. The harness in section 6 should test the first group for equality and the second for distribution.

### Precedents

- `misode/deepslate` (MIT, `c33b4a65` 2026-09-28, npm 0.27.2 published 2026-09-27, 105 versions): TypeScript, about 4200 lines across `src/worldgen`, `src/worldgen/biome`, `src/worldgen/structure` and `src/math/random`. Implements 54 density function types (including `find_top_surface`, `interval_select`, `mirrored_repeat` from 26.x), `NoiseRouter`, `RandomState`, `NoiseAquifer`, `MaterialSystem` (rule types `block`, `condition`, `sequence`; condition types `above_preliminary_surface`, `biome`, `noise_threshold`, `not`, `stone_depth`, `vertical_gradient`, `water`, `y_above`), `MultiNoiseBiomeSource` from a JSON parameter list, `TheEndBiomeSource`, `XoroshiroRandom`, `LegacyRandom`, `StructurePlacement` (`random_spread` linear and triangular, `concentric_rings`) with tests pinning village and end-city chunks for a seed, and `WorldgenStructure.findGenerationPoint` for jigsaw starts. It parses the 26.3 `material_rule` and `aquifers` shapes. Gaps: no carvers; no `bandlands`, `hole`, `steep`, `ore_vein` rule or condition types (the overworld surface tree uses all four); no ore veins; no placed or configured features; no jigsaw piece assembly beyond the start; `NoiseChunkGenerator.buildSurface` passes one biome per chunk (`() => surfaceBiome`, default plains) instead of sampling per column, so biome-conditioned surface rules do not resolve correctly per column; `NoiseChunkGenerator.test.ts` asserts a hard-coded slice string with no stated provenance. Its dependencies are `gl-matrix`, `md5` and `pako`. Fit: a strong reference and a plausible dependency for density functions, noise, randoms and biome lookup; the surface pass needs a per-column biome getter and the four missing rule types; everything else in this note's "terrain" group would be this project's code.
- `Pumpkin-MC/Pumpkin` (GPL-3.0, `cd9e98c9` 2026-10-24): Rust server that generates Java-parity terrain and now speaks the Bedrock protocol as well (README "Bedrock Edition (W.I.P)", `crates/pumpkin-core/src/net/bedrock/`, `assets/bedrock/biome_definitions.nbt`). Its `pumpkin-world/src/generation` has `noise`, `surface`, `carver` (cave, canyon), `feature` (115 files), `structure` (60 files), `rule` and the fixture tests above. GPL-3.0 rules it out as a dependency for this MIT project; it is a reference for carvers and features.
- `Cubitect/cubiomes` (MIT, C): biome placement for Java; MCBE-seedcracker builds its Bedrock biome cracking on it, which is a second non-primary sign that Bedrock's overworld biome placement equals Java's.

## Open questions

- No Mojang text states that Bedrock's terrain and biome generation is the same algorithm as Java's; the evidence is two fixed parity bugs, the 1.18.30 sentence about seeds producing "the same world", and third-party tooling. Whether aquifers and ore veins match is unverified anywhere.
- Bedrock's random number generator is undocumented. The MT19937 description and the "Java-style" RNG for trail ruins and trial chambers come from seed-cracking projects, not Mojang.
- Whether Bedrock's `query.noise` in feature rule distributions is seeded from the level seed is undocumented.
- The `FinalizedState` value that marks a fully populated chunk was not read from a BDS world in this pass; the harness must confirm it.
- The upper bound of Bedrock range fields (`trunk_height range_max 7`, `max_outer_wall_distance 7`) versus Java's inclusive bounds (4..6, 4..6) may be an exclusive-versus-inclusive convention; the feature docs do not say.
- The `jigsawstructure_metadata_registry.dat` files in layers 1.19.80, 1.21.90 and 1.21.130 were not decoded.
- deepslate's density function and chunk tests pin numbers without saying whether they came from Java; a Java-dump fixture test is the way to trust it.

## Reproduction

```
# Compose Bedrock worldgen folders from the extracted BDS layers (later layer wins by member name)
node /tmp/bds-research-worldgen/tools/compose-layers.mjs /tmp/bds-research/bds/extracted \
  /tmp/bds-research-worldgen/composed biomes features feature_rules structures worldgen

# Java structure templates from the bundler jar
unzip -q -o -j /tmp/bds-research-java/jar/server.jar 'META-INF/versions/26.3/server-26.3.jar' -d /tmp/bds-research-worldgen/java-inner
unzip -l /tmp/bds-research-worldgen/java-inner/server-26.3.jar | grep -c 'data/minecraft/structure/.*\.nbt'

# Both plains_small_house_1 templates parse as big-endian Java NBT
node /tmp/bds-research-worldgen/tools/nbt-summary.mjs /tmp/bds-research-worldgen/composed/structures/village/plains/houses/plains_small_house_1.nbt be
node /tmp/bds-research-worldgen/tools/nbt-summary.mjs /tmp/bds-research-worldgen/java-structures/data/minecraft/structure/village/plains/houses/plains_small_house_1.nbt be

# Trail ruins structure set in both editions
node /tmp/bds-research/tools/list-brarchive.mjs cat:trail_ruins.json \
  /tmp/bds-research/bds/extracted/behavior_packs/vanilla_1.19.80/__brarchive/worldgen/structure_sets.brarchive
cat /tmp/bds-research-java/out/generated/data/minecraft/worldgen/structure_set/trail_ruins.json

# Java overworld biome parameter list is a preset; the report expands it
cat /tmp/bds-research-java/out/generated/data/minecraft/worldgen/multi_noise_biome_source_parameter_list/overworld.json
python3 -I -c "import json;b=json.load(open('/tmp/bds-research-java/out/generated/reports/biome_parameters/minecraft/overworld.json'))['biomes'];print(len(b),len({e['biome'] for e in b}))"

# Changelog bodies without the browser challenge
curl -sS -A "Mozilla/5.0" "https://feedback.minecraft.net/api/v2/help_center/en-us/articles/5520890863245.json" | python3 -I -c "import json,sys,re,html;print(re.sub('<[^>]+>','\n',json.load(sys.stdin)['article']['body'])[:4000])"
python3 -I /tmp/bds-research-worldgen/tools/zd-grep.py /tmp/bds-research-worldgen/web "seed,parity" 4414284658701 4415128577293 4423151445901 5520890863245

# deepslate (read only)
git clone -q --depth 1 https://github.com/misode/deepslate /tmp/bds-research-worldgen/deepslate/repo
grep -oE "case '[a-z_]+'" /tmp/bds-research-worldgen/deepslate/repo/src/worldgen/DensityFunction.ts | sort -u | wc -l
grep -oE "case '[a-z_]+'" /tmp/bds-research-worldgen/deepslate/repo/src/worldgen/MaterialSystem.ts | sort -u
```
