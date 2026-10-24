---
'@jsprismarine/bedrock-data': minor
'@jsprismarine/prismarine': minor
---

Read the game data from CloudburstMC/Data at 1.26.50, because pmmp/BedrockData is gone.

The `resources` submodule pointed at pmmp/BedrockData, pinned to 1.21.40. That repository was archived in July 2026 at 1.26.30 and will never carry the version this server targets, so the submodule now points at [CloudburstMC/Data](https://github.com/CloudburstMC/Data) at commit `659ce1e`, which is the 1.26.50 drop. The pin is a commit rather than a branch on purpose: the branch head carries 1.26.60, whose item runtime ids disagree with protocol 2193. Its item table was checked against this project's own capture of a 1.26.51 server and agrees on all 2076 items, ids and component flags included.

**21 vanilla recipes come back.** `item_tags` stopped at 1.21.40 and had never heard of `minecraft:egg`, `minecraft:metal_nuggets` or `minecraft:mushrooms_for_stew`, so every recipe asking for one was dropped as unsatisfiable - correctly, for the wrong reason. The table is now dragonfly's, at 1.26.50 and 77 tags, vendored under `src/vendor` with its MIT notice.

**The creative menu gains its headings and 62 entries.** The old list had 1919 entries, 1918 of which the item table could name, and no group data at all, so `CreativeContentPacket` filed everything under one anonymous group. The new one has 1980 entries and 124 groups across the four tabs. `CreativeContentPacket.items` becomes `entries`, each an item and the group it sits under, and `CreativeInventory` gains `getEntries` and `getGroups`.

Removed, none of which had a consumer: `banner_patterns`, `biome_id_map`, `entity_id_map`, `block_id_map`, `biome_definitions` (superseded by `biome_definitions_network`), `canonical_block_states` and `r12_to_current_block_map`. `item_tags` is now typed by the question a caller asks - a tag name is a string, not one of the 77 keys the file happens to hold. The published `dist` drops from 22 MB to 5.3 MB, because the submodule's raw files are inputs to the generator and were never meant to be bundles.
