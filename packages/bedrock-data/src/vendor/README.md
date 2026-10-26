# Vendored data

Copies of files from other projects, committed here rather than pulled in at build time.

Each one exists because the `resources/` submodule, https://github.com/CloudburstMC/Data, does not
carry it. The submodule is the primary source; nothing belongs here that it already has.

## `item_tags.json`

Tag name to the items carrying it, at 1.26.50. 77 tags.

- Source: https://github.com/df-mc/dragonfly, `server/item/recipe/item_tags.json`
- Commit: `1793369709ceed934675d69e86ff6c828e4216c8`
- License: MIT, reproduced in `LICENSE-dragonfly`

The MIT license requires the notice to travel with the data, so `LICENSE-dragonfly` ships in the
published package alongside this file.

The table this replaced came from pmmp/BedrockData at 1.21.40 and had 57 tags. The three it was
missing - `minecraft:egg`, `minecraft:metal_nuggets` and `minecraft:mushrooms_for_stew` - are
named by 21 vanilla recipes, which `VanillaRecipes` dropped because an ingredient nothing can
satisfy is an ingredient nothing can satisfy.

## `r16_to_current_item_map.json`

Legacy item name to the name the flattened item table uses, at 1.26.30. The recipe generator reads
it because Mojang's own recipe files still name items the way the game did before the rename; the
`legacy_item_aliases` export also lets the runtime resolve those names in vanilla entity data.

- Source: https://github.com/pmmp/BedrockData, tag `bedrock-1.26.30`
- Commit: `bdb44a48fb6beffb6e9f6864f06d2232eb62b6a3`
- License: CC0 1.0, no attribution required

That repository was archived in July 2026 and `bedrock-1.26.30` is its last tag, so this is the
newest version of the file there will be.
