# Getting vanilla Bedrock data from Mojang's own files

This is the first file under `docs/research/`; the repository had no convention for research notes before it, so this directory is the proposal.

Researched 2026-10-24 against primary sources, plus a survey of this repository (section 8): Mojang's download API and CDN, the Linux Bedrock Dedicated Server (BDS) 1.26.51.1 zip, Mojang/bedrock-samples, the Minecraft EULA and Usage Guidelines, learn.microsoft.com/minecraft/creator, and the source of peer servers at pinned commits. Every claim names the source that owns it. Nothing here is legal advice.

## Summary

- A build step can fetch any BDS version from `https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-<version>.zip` without authentication. The current version comes from `https://net-secondary.web.minecraft-services.net/api/v1.0/download/links`. Versions back to 1.18 still download. The CDN drops connections from curl's default User-Agent, so pass `-A`.
- The 1.26.51.1 zip holds the full vanilla behavior pack as 56 layered packs (`vanilla`, `vanilla_1.14` to `vanilla_1.26.51`), packed into `.brarchive` containers. It has 130 entity definitions, 89 biomes, 1892 recipes, 309 loot tables, 60 spawn rules, 27 trade tables, 210 features and 241 feature rules, 1311 structure templates, and jigsaw JSON for two structures. It has 98 block definitions and 74 item definitions; every other vanilla block and item is engine code.
- Mojang/bedrock-samples publishes the same behavior pack as one merged pack of loose JSON, plus `metadata/vanilladata_modules/mojang-blocks.json` (1463 blocks with their state names and value domains). It omits features, feature rules, structures and worldgen. Its license is "(c) Mojang AB. All rights reserved" under the EULA.
- Terrain shaping, cave carving, biome placement in the overworld, item behavior, block behavior, entity AI implementations, loot functions and legacy jigsaw assembly are engine code. The JSON parameterizes them.
- The EULA forbids giving "copies of our game software or content to anyone else"; the Usage Guidelines forbid redistributing "game files". Peer projects that publish extracted data do so under their own licenses without a Mojang grant. Projects that run BDS (Endstone, LeviLamina, itzg) download it at install time and never redistribute it.
- No peer server builds blocks, items or entity AI from Mojang's JSON at runtime. Allay generates Java ids and shells from a BDS dump and hand-writes behavior; Dragonfly and PowerNukkitX hand-write everything and use dumps for palettes and recipes. Nobody ports Bedrock terrain.
- This server hardcodes 260 block, 65 item and 111 entity classes plus name-keyed tables for stats, sizes, loot, physics, spawning and ores; the state palette, item table, creative menu and recipes are already data (section 8). Mojang's files can replace the entity, loot, spawn, recipe, surface and decoration data outright; per-state block properties and most item properties need an out-of-game dump or a Script API pass, and terrain shape stays this project's own (section 9).
- BDS 1.26.51.1 starts on `ubuntu-24.04` GitHub runners in 2 to 3 seconds with no extra packages; a RakNet client with no Xbox identity joins with `online-mode=false`, `allow-list=false`, `transport=raknet`. A public workflow did exactly this against 1.26.51.1 on 2026-09-25.

## 1. Obtaining BDS automatically

### The metadata endpoint

The download page at https://www.minecraft.net/en-us/download/server/bedrock renders its links from this API. It needs no User-Agent and no authentication; `HEAD` returns 405 (the headless-CI agent verified this).

```
curl -sS "https://net-secondary.web.minecraft-services.net/api/v1.0/download/links" | python3 -I -m json.tool
```

Response on 2026-10-24, verbatim:

```json
{"result": {"links": [
  {"downloadType": "serverBedrockWindows",        "downloadUrl": "https://www.minecraft.net/bedrockdedicatedserver/bin-win/bedrock-server-1.26.52.3.zip"},
  {"downloadType": "serverBedrockLinux",          "downloadUrl": "https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.26.52.3.zip"},
  {"downloadType": "serverBedrockPreviewWindows", "downloadUrl": "https://www.minecraft.net/bedrockdedicatedserver/bin-win-preview/bedrock-server-1.26.70.21.zip"},
  {"downloadType": "serverBedrockPreviewLinux",   "downloadUrl": "https://www.minecraft.net/bedrockdedicatedserver/bin-linux-preview/bedrock-server-1.26.70.21.zip"},
  {"downloadType": "serverJar",                   "downloadUrl": "https://piston-data.mojang.com/v1/objects/33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c/server.jar"}
]}}
```

The API lists only the current release and preview. It has no history. itzg/docker-minecraft-bedrock-server reads the same path on the host `net.web.minecraft-services.net` (`bedrock-entry.sh` lines 8-10 at commit `b9de96d39b44d9b1e7fd868e4ae4aab7284ee28d`); LiteLDev/bdsdown and EndstoneMC's `fetch_bds.py` use the `net-secondary` host.

### The zip URL pattern and old versions

`https://www.minecraft.net/bedrockdedicatedserver/{bin-linux|bin-win|bin-linux-preview|bin-win-preview}/bedrock-server-<version>.zip`, served from Azure Blob Storage behind Akamai (`x-ms-blob-type: BlockBlob`, `server-timing: ak_p`). No redirects.

```
for u in bin-linux/bedrock-server-1.26.51.1.zip bin-linux/bedrock-server-1.26.50.5.zip \
         bin-linux/bedrock-server-1.21.44.01.zip bin-linux/bedrock-server-1.20.15.01.zip \
         bin-linux/bedrock-server-1.18.2.03.zip bin-linux-preview/bedrock-server-1.26.60.25.zip; do
  curl -sS -I -A "Mozilla/5.0" "https://www.minecraft.net/bedrockdedicatedserver/$u" | grep -iE '^(HTTP|content-length|last-modified)'
done
```

| Path | Status | Bytes | Last-Modified |
|---|---|---|---|
| bin-linux/bedrock-server-1.26.51.1.zip | 200 | 94926669 | 2026-09-15 18:31:57 |
| bin-linux/bedrock-server-1.26.50.5.zip | 200 | 94923270 | 2026-09-15 15:43:44 |
| bin-linux/bedrock-server-1.21.44.01.zip | 200 | 57830534 | 2026-04-13 19:24:30 |
| bin-linux/bedrock-server-1.20.15.01.zip | 200 | 88509582 | 2026-04-13 19:24:53 |
| bin-linux/bedrock-server-1.18.2.03.zip | 200 | 63042052 | 2026-04-13 19:24:25 |
| bin-linux-preview/bedrock-server-1.26.60.25.zip | 200 | 97261172 | 2026-09-16 15:51:05 |
| bin-linux/bedrock-server-1.26.51.9.zip (does not exist) | 404 | | |

Every pre-2026 zip carries the same 2026-04-13 Last-Modified, which looks like a bulk re-upload. Mojang publishes no retention promise; the only statement is the EULA's "we need all game downloads and updates to come from a source that we authorize" (https://www.minecraft.net/en-us/eula, "USING mods").

The CDN does not reject by status code; it hangs or resets the HTTP/2 stream for some User-Agents. curl 8.7.1 with its default UA got `curl: (28) Operation timed out` over HTTP/1.1 and `curl: (92) HTTP/2 stream 1 was not closed cleanly: INTERNAL_ERROR` over HTTP/2. `python-requests/*` and `Go-http-client/*` fail the same way. `Mozilla/5.0`, `node`, `itzg/minecraft-bedrock-server`, and an empty `-A ""` all get 200. The links API itself works without a UA.

### The 1.26.51.1 Linux zip

```
curl -sS -L -A "Mozilla/5.0" -o bedrock-server-1.26.51.1.zip \
  "https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.26.51.1.zip"
shasum -a 256 bedrock-server-1.26.51.1.zip
```

sha256 `ad91d3b824e51ea50b5bb601c295cbd8f543a29b14315c2ad89ff27311e2d860`, 94926669 bytes. The response header `content-md5: aKqLHOT83xeJsmMh3qCp7Q==` is the only checksum Mojang publishes. sha1 `0610779dc0b8461736fc3aff74d72e53fe8c37e2` matches the Bedrock-OSS index below.

### Bedrock-OSS/BDS-Versions

https://github.com/Bedrock-OSS/BDS-Versions (HEAD `2c50d94112d283b4c45dcf907a1bd181b4a1cbcc`) is a community index, not Mojang. Its README: "This repository acts as an automatic archive of BDS versions. You can consume the `versions.json` file to get the stable build and a history of versions." A workflow (`.github/workflows/fetch.yml`) runs `fetch.sh` every 10 minutes against `${{ secrets.LINUX_MANIFEST_URL }}`, a private Mojang manifest that returns `commit_hash`, `build_id`, `sha1` and `size_in_bytes`, fields the public API lacks. The repo has no LICENSE file.

`versions.json` shape: `{"cdn_root": "https://www.minecraft.net/bedrockdedicatedserver", "linux": {"stable": "1.26.52.3", "preview": "1.26.70.21", "versions": [...183 entries...], "preview_versions": [...]}, "windows": {...}}`. `linux/1.26.51.1.json`:

```json
{"commit_hash": "0559ac59aa24e42d30e238bc55cdb306232a6507", "build_id": "51061372", "date": "2026-09-15T18:31:37",
 "version": "1.26.51.1", "platform": "linux", "sha1": "0610779dc0b8461736fc3aff74d72e53fe8c37e2", "size_in_bytes": 94926669,
 "download_url": "https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.26.51.1.zip",
 "release_notes": "https://www.minecraft.net/bedrockdedicatedserver/bin-linux/release-notes.txt"}
```

Its stable list goes `1.26.45.1` to `1.26.51.1` to `1.26.52.3`, yet `bin-linux/bedrock-server-1.26.50.5.zip` exists on the CDN (table above). The index is useful as a sha1 cross-check, not as the authority.

### How peers pin a version

- EndstoneMC/endstone (`bb0475b64744106b328238b3f51d77576ddc6569`): `endstone/cli/base.py` lines 107-174 fetch `<remote>/<release|preview>/<version>/metadata.json` from https://github.com/EndstoneMC/bedrock-server-data (MIT), read `binary.linux.url` and `binary.linux.sha256`, and raise `SHA256 mismatch: the downloaded file may be corrupted or tampered with.` on a bad hash. The index stores metadata only, not binaries.
- LiteLDev/bdsdown (`1ab0aa466bed5caf5095297fc2163fca56503595`): `main.go` line 14 `VERSION_QUERY_URL = "https://net-secondary.web.minecraft-services.net/api/v1.0/download/links"`, URL templates at lines 18-21, and a prompt "You must agree with the Minecraft End User License Agreement and Privacy Policy to continue".
- itzg: `VERSION=x.y.z.w` rewrites the version in the current URL with `sed -E "s/(bedrock-server-)[^/]+(\.zip)/\1${new_version}\2/"` (`bedrock-entry.sh` lines 210-252).

## 2. What is inside the BDS zip

Unpacked into an empty directory outside the repo and read only with `unzip`, `find`, `ls` and small scripts kept in a separate directory:

```
mkdir -p /tmp/bds-research/bds /tmp/bds-research/tools
unzip -q -o bedrock-server-1.26.51.1.zip -d /tmp/bds-research/bds/extracted
```

### Top level

| Entry | Size | Content |
|---|---|---|
| `bedrock_server` | 256132752 B | ELF 64-bit x86-64 PIE, stripped, interpreter `/lib64/ld-linux-x86-64.so.2` |
| `behavior_packs/` | 32 MB, 2482 files | 72 packs: `vanilla` plus 55 `vanilla_<version>` layers, 8 `chemistry*`, `editor`, 4 `experimental_*`, 3 `server*_library` |
| `resource_packs/` | 38 MB, 196 files | 66 packs with the same layer names plus `vanilla_base` |
| `definitions/` | 1.4 MB, 340 files | `attachables` 55, `disconnection_errors` 2, `feature_rules` 120, `features` 139, `persona` 9, `sdl_layouts` 8, `spawn_groups` 7 |
| `config/default/permissions.json` | | `allowed_modules` for the Script API |
| `data/bootstrap.json` | | log verbosity profile |
| `server.properties`, `allowlist.json`, `permissions.json`, `packetlimitconfig.json`, `profanity_filter.wlist` | | configuration |
| `bedrock_server_how_to.html`, `release-notes.txt` | | the how-to is the only document; the release notes point to aka.ms/MinecraftUpdate |

The zip ships no `.so` files and no license file. `strings` on the binary finds `OpenSSL 1.1.1n  15 Mar 2022` (statically linked) and dlopen candidates `libcurl.so.4`, `libcurl-gnutls.so.4`, `libcurl.so.3`.

### The layered behavior pack

The base `vanilla` manifest has `min_engine_version [1,13,0]` and `pack_optimization_version "0.1.0"`; each later layer adds or replaces files, and the game composes them (this is what `packages/minecraft/datagen/generate-recipes.js` already does). `vanilla_1.26.51` contains only `manifest.json`; the hotfix layer is empty.

Since 1.26.50 each folder is one `__brarchive/<folder>.brarchive` container (format in `packages/minecraft/datagen/brarchive.js`). Loose files are limited to `manifest.json`, `pack_icon.png`, three `worldgen/metadata/jigsawstructure_metadata_registry.dat` files (layers 1.19.80, 1.21.90, 1.21.130) and some duplicate loose `loot_tables/` JSON in layers 1.15 to 1.19.10.

Members across all vanilla layers (a later layer's file replaces an earlier one by name):

| Folder | Members / layers | Distinct names | Notes |
|---|---|---|---|
| `entities` | 1261 / 52 | 190 files, 130 identifiers | base `villager_v2.json` is 46699 B; `format_version` 1.26.0 for 1008 files |
| `items` | 113 / 17 | 79 files, 74 identifiers | 23 members are binary MCB (below) |
| `blocks` | 98 / 1 | 98 | only in `vanilla_1.26.50`, all `format_version 1.26.50` |
| `biomes` | 150 / 13 | 89 | `*.biome.json` |
| `features` | 448 / 23 | 210 | plus 139 in `definitions/features` at the server root |
| `feature_rules` | 314 / 16 | 241 | plus 120 in `definitions/feature_rules` |
| `recipes` | / 34 | 1892 | six recipe types |
| `loot_tables/**` | / 34 | 309 | `blocks` 99, `chests` 61, `entities` 122, `equipment` 7, `gameplay` 9, `spawners` 5, `dispensers` 3, `barrels` 1, `pots` 1, `empty.json` |
| `trading/**` | / 21 | 27 | 13 `*_trades.json` plus `economy_trades/` |
| `spawn_rules` | / 25 | 60 | |
| `structures/**` | | 1311 `.nbt`, 15 `.mcstructure` | village, bastion, ancient_city, trial_chambers, trail_ruins, abandoned_camp, endcity, mansion, shipwreck, ruins, igloo, fossils, pillager outpost, nether fossils, ruined portal |
| `worldgen/**` | 2 layers | | `structures`, `structure_sets`, `template_pools`, `processors` for `trail_ruins` (1.19.80) and `abandoned_camp` (1.26.50) only |
| `shapes` | 218 / 1 | 218 | voxel shapes, all MCB |
| `item_catalog` | 24 / 24 | 1 | `crafting_item_catalog.json`, MCB |
| `behavior_trees` | 22 / 1 | 22 | agent/NPC test trees (`chop_wood.json`, `attack.json`) |
| `aim_assist`, `cameras` | | | presets |

Twenty-three of the `.json` members under `items`, all of `shapes`, `item_catalog` and `trading`, are not text. They start with the bytes `7f 4d 43 42` (`\x7fMCB`), then a version and a length table; strings are length-prefixed and keys are replaced by 32-bit hashes (`red_shrub.json`, 137 bytes, shows `minecraft:item`, `minecraft:red_shrub`, `none`, `tile.red_shrub.name`, `default`, `red_shrub` as the only text). The affected items are the bundles, trial keys, wind charge, breeze rod, `red_shrub` and `shelf_mushroom`. bedrock-samples ships the same files as plain JSON (section 4), so a reader of the BDS zip needs an MCB decoder or must take those files from the samples repo.

Representative files, as shipped:

```json
// behavior_packs/vanilla_1.26.50/__brarchive/blocks.brarchive : black_concrete_double_slab.block.json
{"format_version":"1.26.50","minecraft:block":{"description":{"identifier":"minecraft:black_concrete_double_slab",
 "internal_vanilla_data":{"block_id":1489,"material":"solid","requires_correct_tool_for_drops":true,
   "block_archetype":{"slab_block":{"double_slab_block":"minecraft:black_concrete_slab","is_double":true}}},
 "menu_category":{"category":"none","is_hidden_in_commands":true}},
 "components":{"minecraft:tags":["minecraft:is_pickaxe_item_destructible"],
   "minecraft:destructible_by_mining":{"seconds_to_destroy":1.8},"minecraft:destructible_by_explosion":{"explosion_resistance":1.8},
   "minecraft:map_color":"#191919","minecraft:loot":"loot_tables/blocks/black_concrete_double_slab.json",
   "minecraft:redstone_conductivity":{"redstone_conductor":true},"minecraft:instrument_sound":{"up":"note.bassattack"}}}}
```

```json
// behavior_packs/vanilla/__brarchive/items.brarchive : apple.json
{"format_version":"1.10","minecraft:item":{"description":{"identifier":"minecraft:apple"},
 "components":{"minecraft:use_duration":32,"minecraft:food":{"nutrition":4,"saturation_modifier":"low"}}}}
```

`zombie.json` in `vanilla_1.26.50` (`format_version 1.26.50`) has 33 components, 13 component groups and 11 events; nine of the components are `minecraft:behavior.*` goals (`melee_box_attack`, `nearest_attackable_target`, `random_stroll`, ...). `plains.biome.json` (layer 1.26.0) carries `minecraft:climate`, `minecraft:multinoise_generation_rules`, `minecraft:overworld_height {"noise_type":"lowlands"}`, `minecraft:surface_builder {"type":"minecraft:overworld", top_material grass_block, ...}`, `minecraft:overworld_generation_rules`, `minecraft:village_type`, `minecraft:tags`. `loot_tables/entities/zombie.json` is the standard pools/entries/functions/conditions format with `looting_enchant`, `killed_by_player_or_pets`, `random_chance_with_looting`.

### `definitions/` at the server root

These are engine-bundled feature definitions outside any pack: 139 features (`format_version` 1.13.0 for most; 18 files contain `//` comments and fail a strict JSON parser) and 120 feature rules. The feature types there include the three carvers (`minecraft:cave_carver_feature`, `minecraft:nether_cave_carver_feature`, `minecraft:underwater_cave_carver_feature`) and `minecraft:sequence_feature`, which the packs do not use. 59 of the 139 names also appear in the pack `features` folder. `spawn_groups` holds the seven raid wave definitions.

### Resource packs on the server

The server-side copies carry no textures, models or sounds. Each layer has `manifest.json`, some have a loose `blocks.json` (texture and sound names per block), `vanilla` has `texts/` and a `texts.brarchive` of language files, and the 238 PNGs in the archives are all `ja_JP` and `zh_TW` font glyphs.

### `server.properties` defaults that matter

`online-mode=true`, `allow-list=true`, `transport=nethernet` ("Allowed values: "raknet" or "nethernet""), `enable-lan-visibility=true`, `client-side-chunk-generation-enabled=true`, `block-network-ids-are-hashes=true`, `content-log-console-output-enabled=false`. There is no `emit-server-telemetry` key and no `server-authoritative-movement` key; the strict variants (`server-authoritative-movement-strict` and so on) replaced it.

## 3. What is and is not data-driven in vanilla Bedrock

Mojang's own statement of the boundary, from "Overwriting Vanilla Assets" (https://learn.microsoft.com/en-us/minecraft/creator/documents/overwritingassets): "Vanilla block *definitions* are mostly immutable" and "Some vanilla items are data-driven and can therefore be overwritten like compatible blocks ... Items defined with version 1.10 may have implicit behaviors not shown in the file".

### Entities

All 130 vanilla entity types ship as JSON (`entities` folder; `mojang-entities.json` in bedrock-samples lists 129 names). Across the files there are 379 distinct component keys, 174 of them `minecraft:behavior.*`; the docs list 204 components and 181 AI goals (https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/componentlist and `.../aigoallist`). The JSON is complete as parameters; the implementations are engine. The docs say so in several places: `melee_fov` is "used by the hard-coded sensing component to detect a valid attack target" (https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_melee_attack), `runtime_identifier` exists "to inherit custom mechanics from Vanilla entities that are not yet available as a component" (https://learn.microsoft.com/en-us/minecraft/creator/documents/entitybehaviorintroduction), and each component list ends with components "internal to Minecraft and not usable in custom content". None of the vanilla files uses `runtime_identifier`, so vanilla relies on no hidden per-type hook beyond those components.

### Items

74 identifiers in JSON: 50 foods (`minecraft:food`, `minecraft:use_duration`), 17 bundles (`storage_item`, `bundle_interaction`), 7 spears (`kinetic_weapon`, `piercing_weapon`, `durability`, `damage`), seeds, `camera`, trial keys, `wind_charge`, `breeze_rod`, `red_shrub`, `shelf_mushroom`; 30 component keys in total. Every other vanilla item (tools, armor, bows, shields, buckets, elytra, totems, compasses, maps) has no JSON and no component that could express it; the item component list documents 46 components and the only ranged one is the generic `minecraft:shooter` (https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponentlist). On the wire the item table carries 31 `DataDriven` items and 47 more foods with a non-empty component compound (`packages/bedrock-data/src/index.ts`), which agrees with these counts. The numeric item ids are not in any file; `mojang-items.json` in bedrock-samples has `raw_id` for 1623 items (section 4) and `ItemRegistryPacket` is the authority.

### Blocks

98 of 1463 blocks have JSON (the 1.26.50 wool and concrete stairs and slabs, `red_shrub`, `shelf_mushroom_block`). Even those depend on `description.internal_vanilla_data.block_archetype` (`slab_block`, `stair_block`, `wall_foliage_block`), which selects engine code for states and placement; the stairs file declares no `states` or `permutations`. The key is documented nowhere in MicrosoftDocs/minecraft-creator (`4432fb62a8e0ce5c785bd2bf02a6f981dcffbbe8`). The 26.50 changelog says only "Update Block JSON loader to support future optimization and out of game upgrade" (https://feedback.minecraft.net/hc/en-us/articles/48826825649933). What the files do give for those 98 blocks: mining time, explosion resistance, map color, flammability, redstone conductivity, loot table. The other 1365 blocks have none of that in data; their drops are engine too, because `loot_tables/blocks/` holds exactly the 99 tables for the data-driven blocks. The block state catalog (which properties, which values) comes from a saved world plus the Script API, as `packages/minecraft/datagen/README-palette.md` describes, or from `mojang-blocks.json` (section 4). Voxel shapes for 218 blocks are in `shapes` (MCB in BDS, JSON in samples).

### Biomes and terrain

89 biome files. Component usage across them: `minecraft:climate` 150, `minecraft:tags` 150, `minecraft:surface_builder` 148, `minecraft:overworld_height` 131, `minecraft:overworld_generation_rules` 68, `minecraft:multinoise_generation_rules` 30, `minecraft:map_tints` 23, `minecraft:surface_material_adjustments` 22, `minecraft:village_type` 14, `minecraft:mountain_parameters` 13, `minecraft:creature_spawn_probability` 10, `minecraft:partially_frozen` 6, `minecraft:humidity` 4, `minecraft:subsurface_builder` 1.

What the docs say each does:

- `surface_builder`: "Controls materials used for terrain generation" (top, mid, foundation, sea floor materials and depth). `surface_material_adjustments`: "fine-detail changes to blocks used in terrain generation (based on a noise function)". These are the surface rules, and they are data.
- `overworld_height`: "This is a pre-Caves and Cliffs component. It does not change overworld height, and currently only affects map item rendering." (https://learn.microsoft.com/en-us/minecraft/creator/reference/content/biomesreference/examples/components/minecraftbiomes_overworld_height)
- `overworld_generation_rules` and `multinoise_generation_rules` (the latter is the nether's biome placement): "This is a pre-Caves and Cliffs component and is unused for custom biomes." (`.../minecraftbiomes_overworld_generation_rules`, `.../minecraftbiomes_multinoise_generation_rules`)
- `climate`: "Temperature affects visual effects like snow/ice placement, sponge drying, and sky color. Downfall controls precipitation frequency and intensity."
- `tags`: "Most biome tags are referenced by JSON settings, but some meanings of tags are directly implemented in the game's code."
- Terrain: "The terrain generation pass doesn't offer much customization" and generation "starts with a "seed," a random number, that's fed into gradient noise generators" (https://learn.microsoft.com/en-us/minecraft/creator/documents/world-generation); "the Minecraft engine combines the level seed and the three-dimensional XYZ coordinates of a block to generate a set of smoothly changing noise values ... (This glosses over several other interesting steps like placement of structures and creation of caves.)" (https://learn.microsoft.com/en-us/minecraft/creator/documents/biomes/biomeoverview).

So: overworld noise, overworld climate and biome placement, and the shape of the terrain are engine code with no JSON parameters. Surface materials and the nether's multinoise weights are data. Carving exists as feature types (`cave_carver_feature`, `nether_cave_carver_feature`, `underwater_cave_carver_feature`), and their definitions ship in `definitions/features/` at the server root, but the carver algorithm is engine.

### Features and feature rules

Vanilla's decoration pass is JSON: 210 features (231 `tree_feature` instances across layers, then `scatter_feature`, `ore_feature`, `aggregate_feature`, `vegetation_patch_feature`, `single_block_feature`, `snap_to_surface_feature`, `weighted_random_feature`, `structure_template_feature`, `growing_plant_feature`, `sculk_patch_feature`, `search_feature`, `multiface_feature`, `geode_feature`, `fossil_feature`, and others) and 241 feature rules with `placement_pass`, `minecraft:biome_filter` and Molang distributions. The docs confirm the mechanism: "Features are read from JSON files in the features subfolder of behavior packs ... the feature from the highest pack in the stack will be used" (https://learn.microsoft.com/en-us/minecraft/creator/reference/content/featuresreference/examples/featuresintroduction), and the 26.50 changelog describes vanilla tree features matching leaves via `query.any_tag('minecraft:leaves')`. The 25 feature types are documented at https://learn.microsoft.com/en-us/minecraft/creator/reference/content/featuresreference/examples/featurelist; `sculk_patch_feature` is marked internal.

### Structures

Structure templates ship as 1311 `.nbt` pieces, but assembly is split. Only trail ruins and the 1.26.50 abandoned camps have `worldgen/` JSON (jigsaw structure, structure set, template pools, processors). The docs: "Currently only Trail Ruins can be modified via JSON with the Data-Driven Jigsaw Structure Experimental Toggle turned on. Other Jigsaw Structures such as Villages and Bastions use a legacy version of the Jigsaw Structure System and cannot be modified via JSON." (https://learn.microsoft.com/en-us/minecraft/creator/reference/content/worldgenreference/examples/jigsawjigsawstructures). Strongholds, mineshafts, monuments, fortresses, shipwrecks and the rest appear only as names in `mojang-features.json` (25 entries) and have no JSON. The `JigsawStructureDataPacket` payload the client requires (`packages/bedrock-data/src/index.ts`) is built by the engine from these.

### Loot, trading, spawning, recipes

- Loot tables: 309, in the documented five categories (https://learn.microsoft.com/en-us/minecraft/creator/documents/introductiontoloottables). Functions and conditions (`set_count`, `looting_enchant`, `killed_by_player_or_pets`) are engine; "Max enchantment levels are hard-coded and can't be overwritten" (https://learn.microsoft.com/en-us/minecraft/creator/documents/lootandtradetablefunctions). Block drops exist only for the 98 data-driven blocks.
- Trade tables: 27 files, 13 professions plus economy trades (https://learn.microsoft.com/en-us/minecraft/creator/reference/content/tradetablereference/examples/tradetablelist).
- Spawn rules: 60 files with `population_control`, brightness, difficulty, herd, weight, biome filters. Pool limits are engine: "There are four pools that entities can be assigned to (animal, water_animal, monster, and cat), and each has its own spawn limit." (https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/cliententitydocumentation/datadrivenspawning). `definitions/spawn_groups/` holds the raid waves.
- Recipes: 1892 across `recipe_shaped`, `recipe_shapeless`, `recipe_furnace`, `recipe_brewing_mix`, `recipe_smithing_transform`, `recipe_smithing_trim` (https://learn.microsoft.com/en-us/minecraft/creator/reference/content/recipereference/examples/recipelist). The creative menu is `item_catalog/crafting_item_catalog.json` (MCB in BDS).

### What only the running server knows

Numeric item ids (`ItemRegistryPacket`), the network form of biome definitions (`BiomeDefinitionListPacket`), jigsaw structure data, the actor id list with ids (`AvailableActorIdentifiersPacket`), creative menu NBT, and each block's accepted state values. These are what `packages/client/tools/capture-server-data.mjs` and the palette pack already record, and no file in the zip or in bedrock-samples replaces them.

## 4. Mojang/bedrock-samples

https://github.com/Mojang/bedrock-samples. Branches `main` (release) and `preview`. Tags follow `v<major>.<minor>.<patch>.<build>` with `-preview` for previews; the release matching this project's target is `v1.26.50.4` (commit `46ba6ea985fb5a92d79a9419198f10dda14c199d`, published 2026-09-16). There is no `v1.26.51` tag. Recent tags: `v1.26.60.29-preview`, `v1.26.60.28-preview`, `v1.26.60.24-preview`, `v1.26.50.27-preview`, `v1.26.50.26-preview`, `v1.26.50.25-preview`, `v1.26.50.4`, `v1.26.40.27-preview`, `v1.26.40.26-preview`, `v1.26.40.22-preview`. Each release has two assets, "full" (with textures, models, sounds) and "min" ("Text-only samples (JSON, HTML, MD) with binary files excluded").

### Layout and coverage versus the BDS zip

One merged pack, not layers: `behavior_pack/manifest.json` is "Vanilla Behavior Pack", uuid `ee649bcf-256c-4013-9068-6a802b89d756`, `min_engine_version [1,26,50]`. No `__brarchive`, no MCB; everything is loose JSON.

| Folder | bedrock-samples v1.26.50.4 | BDS 1.26.51.1 (composed layers) |
|---|---|---|
| `entities` | 128 files | 130 identifiers |
| `items` | 79 | 79 files (23 MCB) |
| `blocks` | 98 | 98 |
| `biomes` | 89 | 89 |
| `loot_tables` | 309 | 309 |
| `recipes` | 1892 | 1892 |
| `spawn_rules` | 60 | 60 |
| `trading` | 27 | 27 |
| `shapes` | 218 | 218 (MCB) |
| `features`, `feature_rules` | absent | 210, 241 (plus `definitions/`) |
| `structures`, `worldgen` | absent | 1311 templates, 2 jigsaw definitions |
| `item_catalog`, `behavior_trees`, `aim_assist`, `cameras` | absent | present |

`resource_pack/` in the samples is the full client pack (11756 textures, 4766 sounds, 180 entity files, `biomes_client.json`, `blocks.json`, `sounds.json`), which the BDS zip does not carry.

`metadata/` has `json_schemas/` (674 server schemas: 382 entity, 93 block, 71 item, 64 biome, ...) and `vanilladata_modules/`. `mojang-blocks.json` (394512 B) has `block_properties` (157 state definitions with `type` and `values`, for example `minecraft:cardinal_direction` with `south, west, north, east`) and `data_items` (1463 blocks, each `{name, properties: [{name}], raw_id, serialization_id}`, for example `minecraft:oak_stairs` with `minecraft:corner`, `upside_down_bit`, `weirdo_direction`, `raw_id 53`). It gives names, state names and the global domain per state name, but not per-block subsets (`age` is 0..15 globally and cocoa takes 0..2, per `README-palette.md`), so it cannot by itself reproduce the 17487-state network palette. `mojang-items.json` has 1623 `{command_name, name, raw_id, serialization_id, serialization_name}` entries and no components. `mojang-biomes.json` has 89 `{id, name}`, `mojang-entities.json` 129 names, `mojang-effects.json` 37, `mojang-enchantments.json` 42, `mojang-features.json` 25 structure names.

### License

`LICENSE.md`, full text, byte-identical on `main` and `preview`:

> (c) Mojang AB. All rights reserved.
>
> By downloading the files in this repository, you agree to the [Minecraft End User License Agreement](https://www.minecraft.net/en-us/eula) and that these files are subject to its terms.

GitHub reports `spdx_id: NOASSERTION`. `README.md`: "The following sample files provide the latest resource and behavior examples for creating Add-Ons for Minecraft: Bedrock Edition." `CONTRIBUTING.md`: "due to the nature of how these files are built, we are not able to accept pull request contributions at this time."

### As a build-time source

It is a primary source (Mojang publishes it) and it can be fetched by tag with a pinned commit sha, which fits the pattern `packages/minecraft/datagen/manifest.json` already uses for Mojang/bedrock-protocol-docs. It covers entities, items, blocks, biomes, loot, recipes, spawn rules, trading and shapes as plain text, and adds the block and item id tables. It does not cover features, feature rules, structures or jigsaw worldgen, and its tag is 1.26.50.4 rather than 1.26.51.1. The zip's `vanilla_1.26.51` layer is empty, so the two carry the same pack content.

## 5. Licensing and redistribution

Not legal advice. This records what the documents say.

### Minecraft EULA

https://www.minecraft.net/en-us/eula (the short URL redirects there), section "what you can and can't do with Minecraft software and content":

> you must not distribute anything we've made unless we specifically agree to it. By "distribute anything we've made" what we mean is: give copies of our game software or content to anyone else; make commercial use of anything we've made; try to make money from anything we've made; or let other people get access to anything we've made in a way that is unfair or unreasonable.

> "the game" or "what we have made" includes, but is not limited to, the Services, plus any other games we might publish in the future. It also includes updates, patches, downloadable or Marketplace content, add-ons, or modified versions of a game, part of those things, merchandise, audio-visual content, or anything else we've made.

Summary bullets at the top: "You may develop tools, plug-ins and services as long as they do not seem official or approved by us" and "Do not distribute or make commercial use of anything we've made without our permission." The "USING mods" section is scoped to Java Edition and defines a Mod as "something original that you or someone else created that doesn't contain a substantial part of our copyrightable code or content", adds "You only own what you created; you do not own our code or content", and says "we need all game downloads and updates to come from a source that we authorize." The CONTENT section: "a single Minecraft block (including its textures and its "look and feel") - we own that". The EULA never mentions Bedrock Dedicated Server; its only server sentence is "For the server version of Minecraft: Java Edition, you can install it on a server and host online play."

### Minecraft Usage Guidelines

https://www.minecraft.net/en-us/usage-guidelines (note that `https://minecraft.net/terms`, which itzg's EULA message links, redirects here and not to the EULA):

> Our assets, we mean the code, software, graphics, textures, images, models, sounds and other audio from any of our games and any videos or screenshots taken from our games

> Do not redistribute our games or any alterations of our games or game files

> Do not make commercial use or commercially exploit anything that we have made unless these guidelines say it's okay

> By modifications ("mods") we mean an original plug-in that extends the functionality of Minecraft but that doesn't contain a substantial part of our copyrightable code or content. ... You may create, use, or distribute a mod if: You distribute the mod only and not a modded version of Minecraft

> You may host a server for Minecraft. ... Access to your server: Must only be granted to users who have a genuine paid-for version of Minecraft

> If something isn't covered by these guidelines and we haven't otherwise said it's okay, that probably means we don't want you to do it. In any case if it isn't covered, please don't do it without getting written permission from us.

The guidelines also require the disclaimer "NOT AN OFFICIAL MINECRAFT [PRODUCT/SERVICE/EVENT/etc.]. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT" and limit use of the name to a secondary title ("Kotoba Miners: A Minecraft server for Redstone builds" is their example of an acceptable one).

### The BDS download page

https://www.minecraft.net/en-us/download/server/bedrock shows one checkbox, "I agree to the Minecraft End User License Agreement and Privacy Policy", linking the EULA and the Microsoft Privacy Statement. It states "The Linux version of Bedrock Dedicated Server requires Ubuntu 22.04 (LTS version) or later" (the how-to inside the 1.26.51.1 zip still says "Ubuntu 18 or later"). The page links no separate server license, and the zip contains none.

### What this means for the three questions

(a) Downloading BDS in CI. The EULA grants download and installation to a licensee, the page gates the download behind EULA agreement, and the API is unauthenticated. itzg, Endstone, LiteLDev/bdsdown and the go-test-bds GitHub Actions workflow (section 7) all download from minecraft.net at install or job time and show or require EULA acceptance; none caches the zip in a public artifact. The EULA sentence about downloads coming from "a source that we authorize" argues for fetching from minecraft.net rather than mirroring.

(b) Committing extracted JSON to a public MIT repository. The behavior pack files are "content" and "game files" under the texts above, and bedrock-samples attaches "(c) Mojang AB. All rights reserved" to the identical files. Neither document grants redistribution of them; the only grant is for a "mod" that "doesn't contain a substantial part of our copyrightable code or content". An MIT license on a repository cannot change the license of files Mojang owns. Derived tables (a hash of name plus states, an id-to-name map captured from packets) are a different question from verbatim files, and the documents do not address it.

(c) Publishing derived data to npm. The same clauses apply; `@jsprismarine/bedrock-data` today already publishes captured packet payloads (`src/jsp/*.nbt`, the item table) and relicensed third-party dumps (`src/vendor/`, MIT and CC0). Section 6 lists what peers publish.

### What peers do

| Project | License | Vanilla data: where from, how shipped |
|---|---|---|
| CloudburstMC/Data (`88a2436a2d5c605da082a00fee5f103f888a9160`) | Apache-2.0 (added 2026-07-24) | Packet captures from a vanilla BDS via CloudburstMC/ProxyPass (`DownstreamPacketHandler.java` saves `biome_definitions.json`, `runtime_item_states.json`, `data_driven_blocks`, `creative_items.json`; `RecipeUtils.java` saves `recipes.json`). 17 files committed, no README, no provenance statement. |
| df-mc/dragonfly (`1bf4e242c81f1f66ba6bdf8fcdcc80c70125a499`) | MIT | `//go:embed` of `server/world/block_states.nbt` (3.1 MB), `data_driven_blocks.nbt`, `vanilla_items.nbt`, `chunk/legacy_states.nbt`, `item/creative/creative_items.nbt`, `item/recipe/{crafting_data,smithing_data,smithing_trim_data,potion_data}.nbt`, `item/recipe/item_tags.json`. No provenance comments. Blocks, items, entities and biomes are Go code. |
| pmmp/BedrockData (`bdb44a48fb6beffb6e9f6864f06d2232eb62b6a3`) | CC0-1.0 | README table credits a "BDS mod" (pmmp/bds-mod-mapping, LGPL-3.0, C++ hooking `Level::getBlockPalette()`) and "Vanilla packet traces". Archived; `pushed_at 2026-06-22`; last tag `bedrock-1.26.30`; Packagist marks `pocketmine/bedrock-data` abandoned with no replacement. |
| AllayMC/BedrockData (`5d5e8cfe2cdf404aedcd5f95596da01cc0ccda7f`) | CC0-1.0 | "We use Endstone DevTools to generate the data we need since 1.21.1.03." Per-version folders with `block_palette.nbt`, `block_states.json`, `items.json`, `recipes.json`, `biomes.json`, `block_tags.json`, `item_tags.json`, `creative_items.nbt`. |
| AllayMC/Allay (`f223a12164f2fe0b594a6b83d950307012f23c64`) | LGPL-3.0; `data/` and `codegen/` MIT | Vendors the dump in `data/resources/` (11 MB `block_states.json`, `items.json`, `recipes.json`, `biome_definitions.json` from CloudburstMC/Data, `sound_definitions.json` from bedrock-samples). |
| PowerNukkitX (`37caa9e66690f2d327b33d8a72e7621377ab96c5`) | LGPL-3.0 | Maven artifact `org.powernukkitx:gamedata` from PowerNukkitX/GameData (no license, no README) under `gamedata/kaooot/`; `scripts/kaooot-fetch-all.sh` pulls from `Kaooot/bedrock-network-data`. |
| EndstoneMC/endstone (`bb0475b64744106b328238b3f51d77576ddc6569`) | Apache-2.0 | Runs the official binary. Downloads from minecraft.net via its sha256 index; its DevTools (`src/endstone/core/devtools/devtools.cpp`) dumps `block_types.json`, `block_states.json`, `items.json`, `recipes.json`, `biomes.json`, `block_palette.nbt`, `creative_items.nbt`, `item_components.nbt`. |
| LiteLDev/LeviLamina (`a8983a3bfa27bdd23d475d6e759e07526a5c9b6e`) | LGPL-3.0 (closed parts under its own EULA: "You may not violate the Minecraft EULA.") | `tooth.json` depends on `github.com/LiteLDev/bds`, whose `tooth.template.json` has `"assets": []` and runs `bdsdown` at install. Does not redistribute the binary. |
| itzg/docker-minecraft-bedrock-server (`b9de96d39b44d9b1e7fd868e4ae4aab7284ee28d`) | MIT | README: "the Bedrock server software is not bundled into this image. Instead, it is downloaded/upgraded from Mojang only during container startup." Requires `EULA=TRUE`. |

The pattern: every project that runs BDS downloads it per install. Every project that ships extracted data ships it under its own open license without citing a grant from Mojang, and the dumps are transformations (palette NBT, id tables, recipe NBT) rather than the behavior pack files themselves.

## 6. Runtime consumption precedents

### Allay: generated shells, hand-written behavior

Allay is the closest thing to a data-driven Bedrock server, and its data flow is this (paths relative to AllayMC/Allay at `f223a12`):

- Code generation reads the dump and writes Java. `codegen/src/main/java/org/allaymc/codegen/BlockIdEnumGen.java` lines 63-72 read `data/resources/unpacked/block_palette.nbt` (gzip NBT, list `blocks`, each `{name, states}`) and emit `BlockId`; `BlockPropertyTypeGen` reads `block_property_types.json` (itself derived from the palette by `data/src/main/java/org/allaymc/data/BlockPropertyTypeDataFileGen.java`); `ItemIdEnumGen` reads `items.json`; `EntityIdEnumGen` reads `unpacked/entity_id_map.json`; `BiomeIdEnumGen` reads `unpacked/biome_id_and_type.json`; `TagGen` reads block, item and biome tags; `ComplexRecipeIdsGen` reads `recipes.json`.
- `BlockClassGen.generate()` (lines 102-143) loops over `BlockId`, writes an interface and an empty impl per block only `if (!Files.exists(...))`, so hand edits survive, and emits `BlockTypeDefaultInitializer` (10158 lines) with one null-guarded statement per block:

  ```java
  if (BlockTypes.ACACIA_DOOR == null) {
      BlockTypes.ACACIA_DOOR = AllayBlockType.builder(BlockDoorBehaviorImpl.class)
          .vanillaBlock(BlockId.ACACIA_DOOR)
          .setProperties(BlockPropertyTypes.DOOR_HINGE_BIT, BlockPropertyTypes.MINECRAFT_CARDINAL_DIRECTION, BlockPropertyTypes.OPEN_BIT, BlockPropertyTypes.UPPER_BLOCK_BIT)
          .build();
  }
  ```

- The hand-written `BlockTypeInitializer` (4217 lines) runs first (`registry/populator/BlockTypeRegistryPopulator.java` lines 24-30) and supplies real logic: chests bind a block entity and `BlockChestBaseComponentImpl` (lines 660-666), water sets `BlockWaterBaseComponentImpl` and a redefined shape (lines 1669-1675), wheat uses `GROWTH_8` and `BlockWheatBaseComponentImpl` (lines 2022-2027). The generated default fills whatever is still `null`.
- At runtime `AllayBlockType.Builder.vanillaBlock(BlockId)` (`server/.../block/type/AllayBlockType.java` lines 436-452) looks the block up in `block_states.json` (hardness, explosion resistance, friction, light, map color, collision shape, per state) and `block_types.json` (tags, default state hash), throws if missing, and `build()` (lines 675-700) attaches `BlockBaseComponentImpl` unless a component was supplied, then instantiates the behavior class reflectively. States hash with FNV-1a-32 over `{name, states}` NBT (`api/.../utils/hash/HashUtils.java`).
- Items and entities follow the same builder shape (`ItemTypeInitializer.java` lines 406-411 for the apple, `EntityTypeInitializer.java` lines 286-325 for the zombie). Entity AI is hand-built from generic executors (`MeleeAttackExecutor`, `FlatRandomRoamExecutor`, `NearestPlayerSensor`) in `server/.../entity/ai/`; nothing reads `minecraft:behavior.*` or `component_groups`.
- Loot tables are not parsed; fishing loot is a hand-written weighted table (`registry/loader/FishingLootRegistryLoader.java` lines 40-43), and block and mob drops live in component code.
- World generation is `VOID` and `FLAT` only (`registry/loader/WorldGeneratorFactoryRegistryLoader.java` lines 26-27); the docs point at the Terra plugin for terrain.
- Version pinning: `docs/development/update-to-the-next-protocol-version.md` lines 12-15 name the data source ("`1.26.50.5` at `5d5e8cf`"), `gradle/libs.versions.toml` line 12 pins `bedrock-connection 1.26.50-R1`, and `server/.../network/ProtocolInfo.java` lines 31 and 38 set `FEATURE_VERSION = Bedrock_v2193.CODEC` and `BLOCK_STATE_VERSION = 1.26.50.0.0`.

### Dragonfly: hand-written, with data for validation only

`server/block/` has 331 Go files, `server/item/` 197, `server/entity/` 72. `server/block/stone.go` defines `BreakInfo()` as `newBreakInfo(1.5, pickaxeHarvestable, pickaxeEffective, silkTouchOneOf(Cobblestone{}, Stone{})).withBlastResistance(6)`; `server/block/chest.go` and `wood_door.go` are structs with hand-written methods. `server/block/register.go` lists every `world.RegisterBlock(...)` call, and `block_state.go` lines 26-36 register every state from the embedded `block_states.nbt`; `RegisterBlock` panics "block state returned is not registered" if a Go block encodes to a state the palette lacks. `server/world/network_block_hash.go` computes the same FNV-1a-32 network hash. Biomes are Go constants (`server/world/biome/plains.go`). The only generator is `server/world/generator/flat.go`.

### PowerNukkitX

1327 hand-written `Block*.java` classes with `DEFINITION` builders (`BlockChest.java`: `.hardness(2.5f).resistance(12.5f).toolType(ItemTool.TYPE_AXE)`), a hand-maintained `BlockID.java`, no codegen module. `registry/BlockStateRegistry.java` lines 31-48 cross-check each `network_id` against `gamedata/kaooot/block_palette.nbt`. `level/loot/VanillaLootTables.java` uses Mojang's loot table paths as identifiers and hand-codes the pools (line 111). Its `Normal` generator ports Java Edition's density functions (`generator/densityfunction/DensitySlopedCheese.java` cites misode/mcmeta), not Bedrock's.

### Endstone and LeviLamina

Both skip reimplementation: they patch and hook the official binary (`endstone/cli/base.py`; LeviLamina's `PeEditor.exe -mb` post-install step). Endstone's version pin is `src/bedrock/shared_constants.h` lines 31-34 (`MinorVersion = 26; PatchVersion = 52; NetworkProtocolVersion = 2193`).

## 7. Running BDS headless in CI

### Binary requirements

From the zip, parsed with a throwaway ELF reader run under `python3 -I` from a separate directory:

```
NEEDED: libpthread.so.0 libdl.so.2 libm.so.6 libgcc_s.so.1 libc.so.6 ld-linux-x86-64.so.2 librt.so.1
GLIBC versions in .dynstr: GLIBC_2.17 GLIBC_2.18 GLIBC_2.25 GLIBC_2.26
GLIBCXX in .dynstr: none
```

The highest glibc symbol version is 2.26; libstdc++ and OpenSSL 1.1.1n are statically linked; libcurl is loaded with `dlopen` if present. GitHub's `ubuntu-24.04` image is 24.04.5 LTS (glibc 2.39) and `ubuntu-22.04` is 22.04.5 LTS (glibc 2.35), per https://github.com/actions/runner-images `images/ubuntu/Ubuntu2404-Readme.md` and `Ubuntu2204-Readme.md`. Both satisfy it. x86-64 only; `ubuntu-24.04-arm` would need box64 as itzg's `build/setup-arm64` does. itzg's image installs only `curl openssl unzip jq` (`build/install-packages`), all preinstalled on hosted runners.

The how-to says "The Linux version of the Bedrock Server requires Ubuntu 18 or later. Other distributions are not supported. ... `LD_LIBRARY_PATH=. ./bedrock_server`". With no `.so` in the zip the `LD_LIBRARY_PATH` is harmless.

### Properties for an offline capture client

`server.properties` comment on `online-mode`: "If true then all connected players must be authenticated to Xbox Live. Clients connecting to remote (non-LAN) servers will always require Xbox Live authentication regardless of this setting." A capture client on 127.0.0.1 is LAN. `allow-list=true` is the default and rejects everyone when the list is empty, so set it `false`. `transport=nethernet` is the default; the previous stable, 1.26.45.1, shipped `transport=raknet` (the CI agent downloaded both to compare). The how-to describes nethernet as "A WebRTC-based transport. The server listens on a single dual-stack TCP socket on server-port for an HTTP-based signaling handshake" and raknet as "The traditional Bedrock UDP transport ... the mode used by releases prior to the NetherNet transport being made the default." `packages/client/tools/capture-server-data.mjs` speaks RakNet, so it needs `transport=raknet`. itzg's README notes "Aternos reports that Minecraft 26.60 removes RakNet", which is a reason to pin 1.26.51.1 for captures.

### A public workflow that did this

smell-of-curry/go-test-bds (`f542d0fe4323764bd75efd031abd8ff6d20ecaee`), `.github/workflows/ci.yml`, job "E2E (BDS)" on `ubuntu-latest`:

```yaml
env:
  BDS_LINKS_API: https://net-secondary.web.minecraft-services.net/api/v1.0/download/links
  BDS_UA: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36
run: |
  curl -fsSL -A "$BDS_UA" "$BDS_LINKS_API" -o /tmp/bds-links.json
  DOWNLOAD_URL=$(jq -r '.result.links[] | select(.downloadType == "serverBedrockLinux") | .downloadUrl' /tmp/bds-links.json)
  curl -fL -A "$BDS_UA" "$DOWNLOAD_URL" -o /tmp/bds.zip
  unzip -q /tmp/bds.zip -d bds
```

```bash
set_prop online-mode false; set_prop allow-list false; set_prop transport raknet
mkfifo bds/bds.in; sleep infinity > bds/bds.in &
( cd bds; LD_LIBRARY_PATH=. ./bedrock_server < bds.in > "../${logfile}" 2>&1 ) &
wait_for_log bds-boot.log 'Server started' 120
echo stop > bds/bds.in
```

Run 36186382109 (2026-09-25, image `ubuntu-24.04`, success) logged `BDS version: 1.26.51.1`, `first Server started after 3s`, `bot join observed after 15s`; the download step took 6 s and the whole BDS step 69 s including two boots. Run 36330240881 (2026-09-27) booted 1.26.52.3 in 2 s. The readiness string `Server started.` is in the binary. EndstoneMC/endstone's own CI does not boot BDS; its `.claude/skills/build-ida-db/fetch_bds.py` shows the same links API and a browser User-Agent.

### What a capture job would look like

Download the pinned zip with `-A` and verify sha256 `ad91d3b8...`; set the three properties; copy `packages/minecraft/datagen/palette-pack/` into `development_behavior_packs/` and enable it in `world_behavior_packs.json` as `README-palette.md` describes; start the server behind a FIFO, wait for `Server started`, run `capture-server-data.mjs --host 127.0.0.1 --port 19132`; for the palette, wait for `PALETTE PLACED`, send `stop`, run `extract-block-palette.mjs` on the saved world, then restart with `domains.js`. Budget under five minutes on a hosted runner based on the timings above.

## 8. What the server hardcodes today

Surveyed in `packages/prismarine/src` at the commit this note was written against. Paths below are relative to that directory unless stated.

### Already data

- Block states and runtime ids. `packages/minecraft/src/generated/block-schemas.ts` (1477 blocks, 22079 states, from `datagen/snapshot/block-palette.json`) feeds `block/state/BlockStateSchema.ts`; `block/state/BlockRuntimeIds.ts` hashes `{name, states}` with FNV-1a-32. Chunks store the hashes.
- The item table, item components, creative menu, item tags and recipes. `network/packet/ItemRegistryPacket.ts` writes `item_table` and `item_components` from bedrock-data; `inventory/CreativeInventory.ts` reads `creativeitems`; `crafting/VanillaRecipes.ts` loads `packages/minecraft/src/generated/recipes.json` (1967 recipes composed from the BDS layers by `datagen/generate-recipes.js`).
- Packet payloads replayed verbatim: biome definitions, jigsaw structure data, actor identifiers, data-driven block definitions.

### Still code

| Category | Files | What the code carries | Lookup |
|---|---|---|---|
| Blocks | 260 classes in `block/blocks/`, listed by hand in `block/Blocks.ts` | hardness in the constructor; tool type, harvest tier, drops, blast resistance, flammability, light and fuel time as overridden methods (`block/Block.ts:133-277`). No tick, random tick or neighbor hook. | `BlockManager` by name, plus a linear scan on the legacy `(id, meta)` pair, which `registerBlock` requires to be unique (`block/BlockManager.ts:124-126`). |
| Items | 65 classes in `item/items/` | durability, tool type, tier, armor points, burn time (`item/Item.ts:62-128`); attack damage is one table in `item/TieredTool.ts:19-25` | `ItemManager` by name; numeric ids from `item_table` |
| Entities | 111 classes under `entity/{hostile,neutral,passive,other}/`, listed twice by hand in `entity/Entities.ts` | a `MOB_ID` and, for 16 of them, a goal set | five call sites do `spawnableEntities().find(...)`; unknown types become `GenericEntity` |
| Entity data | name-keyed tables beside the classes | health, attack, knockback resistance and follow range for 71 mobs (`entity/MobStats.ts:103-183`); width and height for 114 (`entity/EntitySize.ts`); loot for 73 (`entity/LootTables.ts:32-127`); six goal sets (`entity/ai/Brains.ts:42-134`); golem targets (`entity/ai/Targeting.ts:27-44`) | read by `Mob`; 42 of the 69 classes in the mob folders extend `Entity` instead, so their rows are never read and they have no AI |
| Spawning | `world/MobSpawner.ts:26-84` | caps, group sizes, seven passive and five hostile species with weights, "night or below y=50 means hostile"; no biomes, no light level | |
| Block physics | `world/physics/BlockRules.ts`, `world/physics/BlockShapes.ts`, `entity/Explosion.ts:47-70`, `entity/ai/BlockView.ts`, `entity/Environment.ts` | support, falling, liquid spread, passability, collision tops, blast proofing, hazards, as name sets (about 140 names) | by state name, bypassing `BlockManager` on purpose, because `World.getBlock` returns air for any of the 1200 unregistered names (`world/World.ts:387-397`, `world/physics/BlockRules.ts:1-11`) |
| World generation | `world/generators/Overworld.ts`, `TerrainShape.ts`, `decoration/*.ts`, `structure/*.ts` | one 2D noise heightmap, a 26-block palette, a 12-row ore table, oak 0.8 / birch 0.2, flower densities, 590 lines of village pieces; every chunk is written as plains (`world/chunk/Chunk.ts:426-432`) | |
| Block entities | 9 classes in `blockentity/BlockEntities.ts` | NBT round-trip, with logic only for sign and furnace; nothing maps a block to its block entity type | |

Tests pin about 60 vanilla numbers across nine files (zombie health 20, sheep 0.9 by 1.3, stone takes 7.5 s by hand, flint one in ten). About eight more assert that a table covers every class. Both kinds become data checks once the values come from data.

### Where the gaps are visible

- Drops resolve through the class registry, so coal ore (`block/blocks/CoalOre.ts:26`) and beds (`block/blocks/WhiteBed.ts:40`) drop nothing today, because no `Coal` or `Bed` item class exists.
- `getBlastResistance`, `getLightLevel`, `getFlammability`, `getFuelTime`, `getLightFilter` and `isTransparent` are declared on `Block` and never called; the features that would use them read the name sets instead.
- Break time is computed bare-handed (`network/handler/PlayerActionHandler.ts:149`).
- `packages/bedrock-data/src/resources/blocks.json` (21 MB, 22091 per-state rows from the CloudburstMC submodule, Apache-2.0) already carries `hardness`, `explosionResistance`, `friction`, `isSolid`, `requiresCorrectToolForDrops`, `lightEmission`, `lightDampening`, `burnOdds`, `flameOdds`, `translucency`, `mapColor` and collision geometry per state. Nothing reads it; `packages/bedrock-data/vite.config.ts:20-24` excludes it from the bundle. The same submodule has `biome_definitions.json` (climate, tags) and `voxel_shapes.json`, also unread.

### Obstacles a data-driven loader has to clear

- `Block` and `Item` constructors require a legacy numeric id, and `BlockIdsType` (553 entries) and `ItemIdsType` (69) are hand-kept enums. `World.dropItem` copies a block's legacy meta into the dropped item (`world/World.ts:967`).
- Properties are overridable methods, not fields, and base-class field initializers call them during construction (`item/Item.ts:29`, `entity/Entity.ts:128`, `entity/Mob.ts:237`), so a definition passed to the constructor arrives too late for them. `entity/GenericEntity.ts:33-37` already works around this for size.
- Callers test `instanceof Item` (`world/World.ts:714,967`) and `instanceof Mob` (`world/MobSpawner.ts:241`).
- `Blocks.ts`, `Items.ts` and `Entities.ts` build their lists lazily to dodge import cycles; `DropTable` value-imports `Item`, and `LootTables` imports the block `DropTable`.
- `BlockStateSchemas`, `BlockRuntimeIds`, `CreativeInventory` and `BlockEntityRegistry` are static singletons with `reset()` methods, so reloadable or per-server data needs their caches made per instance.
- `ItemRegistryPacket` has no hook for entries outside `item_table`, so a plugin item cannot be declared today.

## 9. A design that fits the findings

Not a plan with dates, only the shape the evidence supports. Each part names what it can and cannot deliver.

### What "from Mojang's files" can and cannot give

Sections 2 and 3 set a hard ceiling. Mojang's files parameterize entities, loot, trading, spawn rules, recipes, features, feature rules, biome surfaces and the creative menu in full. They say nothing about 1365 of 1463 blocks and about 1550 of 1623 items, nothing about overworld terrain shape or biome placement, and nothing about how any component behaves. So three sources are needed, not one:

1. Mojang's files, for every category that is data. BDS zip first, because it alone has features, feature rules, structures and worldgen; bedrock-samples by pinned tag for the 23 items, the item catalog, the shapes and the trade tables that the zip stores as undocumented `\x7fMCB`, and for `mojang-blocks.json` and `mojang-items.json`.
2. A running BDS, for what only the engine knows: numeric item ids, the biome and jigsaw packets, actor ids, creative NBT, and per-block state domains. The repository already has both tools for this (`packages/client/tools/capture-server-data.mjs`, `packages/minecraft/datagen/palette-pack/`), and section 7 shows the job runs on a hosted runner in under five minutes. A third Script API pass can ask each item for its `durability`, `food`, `cooldown` and `enchantable` components and each entity type for its components, which would cover tools and armor without a hand-written table. How far the Script API's component coverage goes per item is not verified here.
3. An out-of-game dump, for the per-state block properties the engine defines (hardness, blast resistance, friction, light, flammability, collision). No Mojang file and no Script API call exposes these. The two public producers are a hooked binary: CloudburstMC/Data's `blocks.json` (already pinned in the submodule) and Endstone DevTools, which runs the official binary under its Apache-2.0 loader. Running Endstone in the same CI job as source 2 would remove the last third-party file; whether DevTools can export without its window is not verified here.

Behavior itself (what a door does, how `minecraft:behavior.melee_attack` acts, how a tree feature places logs) is code in every server that exists, and will be here too. The data decides which code runs and with which numbers.

### Extraction pipeline

- A pinned source manifest, extending the pattern of `packages/minecraft/datagen/manifest.json`: BDS version, zip URL, sha256; bedrock-samples tag and commit; the Cloudburst commit until source 3 replaces it. One file to change on a protocol bump.
- A fetch step that downloads the zip with a browser User-Agent into a cache outside the tree (`node_modules/.cache/jsprismarine/bds/<version>/`, or a path from `JSP_BDS_PATH` for offline builds), verifies the hash, and unpacks. CI caches it by hash with `actions/cache`. The zip is 95 MB and the download took 6 s on a hosted runner.
- A composed-pack reader: the brarchive reader plus the layer composition that `generate-recipes.js` already does, generalized to any folder. Later layers win by file name; `chemistry*`, `experimental_*` and `editor` are not layers. An MCB decoder is optional if the samples repo supplies those files.
- Generators per category that write normalized tables into `src/generated/` (gitignored, as `packages/bedrock-data/src/generated/` is today). Outputs should be in this project's own shape with only the fields the runtime reads, not Mojang's files copied through. Generators refuse to emit when two sources disagree on a name, as `utils/build.js` does for the item table.
- The capture job (source 2) stays a separate, Linux-only, CI-run step whose outputs are committed, as `src/jsp/` is today. It runs on a version bump, not on every build, because it needs a server process and ten minutes; `turbo` cannot cache it meaningfully.

### Where the data ends up, and the redistribution question

Fetching at build time does not by itself keep Mojang's content out of what the project distributes. `vite build` inlines the JSON into `dist/*.js`, and `dist/` is what `pnpm publish` ships for `@jsprismarine/bedrock-data` and `@jsprismarine/minecraft`. The published package would then carry the entity definitions, loot tables and biome files in transformed form. Section 5 shows the texts cover verbatim files and are silent on transformed data, and that every peer publishes transformed data under its own license without a grant. Three positions are possible, in order of how much reaches npm:

1. Publish normalized tables, as the item table and block palette are published today. Simplest; this is what the peers do. The entity and loot data would be a larger and more recognizable portion of Mojang's content than an id table is.
2. Publish the code and the id tables, and fetch and generate the rest at first start, gated by an explicit EULA setting, the way itzg and Endstone do. The server then needs network on first start, and a `pnpm install` is no longer enough to run tests offline.
3. Ship nothing derived from the behavior packs and point users at their own BDS copy via `JSP_BDS_PATH`. Safest and least usable.

Position 1 for the id tables and the engine-property dump, and position 2 for the behavior pack content, is the split that matches practice and keeps the development loop offline after one fetch. The Docker image and the single-executable build already have a place for a first-start fetch. This is a maintainer decision, not something the evidence settles.

### Runtime: definitions plus components

Bedrock's own model is a definition (data) that names components, each implemented by the engine. Mirroring it keeps the data format close to Mojang's, which is what makes vanilla parity cheap to check: a component the server does not implement is a line in a log, not a missing class.

- A `Registry<Definition>` per category, keyed by identifier, loaded from the generated tables at `Server` startup where `BlockManager.importBlocks` and `ItemManager.importItems` run today. Registration events and plugin `register` calls stay.
- A `ComponentRegistry` per category, keyed by component name, mapping to a class. Vanilla components come with the server; plugins add their own. A definition with an unknown component loads anyway and logs the name once.
- Blocks: the definition is the palette entry plus the per-state property row (source 3) plus, for the 98 data-driven blocks, their JSON components and loot table. The runtime `Block` becomes an instance built from the definition with a behavior attached by a small mapping this project owns, keyed by archetype (door, slab, stair, crop, liquid, falling, button, bed, chest). Allay's generated null-guarded initializer is the precedent. This removes the 260 classes and the duplicate name sets in `BlockRules`, `BlockShapes` and `Explosion`, which become reads of `isSolid`, `explosionResistance` and `geometry`. The legacy `(id, meta)` requirement goes; `BlockIdsType` is only needed where a legacy id is read from an old world, and `legacy_block_ids.json` in the submodule covers that.
- Items: the definition is the item table row plus the components (74 from JSON, the rest from the Script API pass or a hand table until then). `Tool`, `TieredTool` and `Armor` become components that read `durability`, `damage`, `enchantable` and `wearable`.
- Entities: the definition is the entity JSON: components, component groups and events. The attribute components (`minecraft:health`, `minecraft:attack`, `minecraft:movement`, `minecraft:collision_box`, `minecraft:scale`, `minecraft:type_family`, `minecraft:loot`) replace `MobStats`, `EntitySize`, `LootTables` and `Targeting` on day one, because they are plain numbers and names. `minecraft:behavior.*` goals map onto the existing `entity/ai/goals/` classes by name with the JSON priority; the 174 goal names are implemented one at a time, and the six hand-built brain sets go away as their goals land. Component groups and events give the state machine (baby, converting, angry) that the classes do not model. Spawn rules JSON replaces the `MobSpawner` weight tables once biomes and light exist; its brightness and biome filters are the reason to build those.
- Loot: one loot table evaluator covering pools, rolls, weights, `set_count`, `looting_enchant`, `killed_by_player_or_pets` and `random_chance_with_looting`, fed by the 309 tables. It replaces `DropTable`, `LootTables.ts` and the per-block `getDropsFor...` overrides for the 98 data-driven blocks; the other blocks keep code drops until source 3 or the archetype mapping supplies them.
- World generation: biome JSON supplies the surface builder and climate per biome; features and feature rules supply the decoration pass and replace `OreDecorator`, `TreeDecorator` and `VegetationDecorator` with one `feature_rules` evaluator and implementations of the feature types in use (`ore_feature`, `scatter_feature`, `tree_feature`, `single_block_feature`, `weighted_random_feature`, `aggregate_feature`, `structure_template_feature` first; 25 types in all). Terrain shape and biome placement stay this project's own noise, because Mojang publishes none, and that is where exact parity stops. Structure templates come from the 1311 `.nbt` files, and `VillagePieces.ts` can become a template reader plus this project's own assembler. A biome model has to exist first; `Chunk.ts:426` and the LevelDB writer write plains today.

### Order that pays for itself earliest

1. Read the per-state block properties and geometry that are already in the submodule, and route `BlockRules`, `BlockShapes`, `Explosion.BLAST_PROOF` and break time through them. No new source, no new fetch, and it fixes behavior for the 1200 blocks the registry does not know.
2. Add the BDS fetch step and the composed-pack reader, moving `generate-recipes.js` onto it. This is the infrastructure every later step uses.
3. Entities from JSON: attributes, size, loot, type families, then goals by name. The classes shrink to `GenericEntity` plus the four with real code (arrow, falling block, item, projectile).
4. Loot tables and spawn rules.
5. Blocks as definitions with archetype behaviors, retiring the class files and the legacy id requirement.
6. Features and feature rules in the generator, after a biome model.
7. The Script API item pass, retiring the item classes.

Each step is a Changeset-worthy package change in its own right; the versioning policy applies to `@jsprismarine/bedrock-data` and `@jsprismarine/minecraft` for the data shape and to `@jsprismarine/prismarine` for the registries.

## Open questions

- Mojang publishes no retention policy for old zips and no sha256; the `content-md5` header and the Bedrock-OSS sha1 are the only external checksums. Whether a given old version stays available is observed, not promised.
- The `\x7fMCB` binary serialization used for 23 items, the item catalog, 218 shapes and the trade tables has no public specification. bedrock-samples has the plain-text versions, so decoding it is only needed if the BDS zip is the sole source.
- `internal_vanilla_data` and `block_archetype` in the 98 block files are undocumented; what the engine does with `slab_block`, `stair_block` and `wall_foliage_block` is not written down anywhere public.
- Whether the server-root `definitions/features/` (format 1.13.0, with comments) are still read by the 1.26.51.1 engine or are leftovers was not determined; 59 of 139 names are shadowed by pack features.
- `mojang-blocks.json` gives global state domains; whether its 1463 blocks and the 1477 the palette pack captured differ by the same 14 names was not checked.
- No Mojang text addresses extracting and republishing transformed data (id tables, state hashes) as opposed to the files. Peer projects have done so for years under CC0 and Apache-2.0 without a public takedown, which is a fact about practice, not a grant.
- Whether NetherNet-only builds (the itzg README says 1.26.51 logs that NetherNet is the only supported transport, yet RakNet clients joined 1.26.51.1 and 1.26.52.3 in the go-test-bds runs) will keep accepting `transport=raknet` was not verified past 1.26.52.3.
- The download page now says "requires Ubuntu 22.04 (LTS version) or later" while the shipped how-to says "Ubuntu 18"; the binary's glibc 2.26 requirement matches the older statement.

## Reproduction

```
# Metadata endpoint
curl -sS "https://net-secondary.web.minecraft-services.net/api/v1.0/download/links" | python3 -I -m json.tool
# Old version check
curl -sS -I -A "Mozilla/5.0" "https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.18.2.03.zip" | head -1
# Download and hash
curl -sS -L -A "Mozilla/5.0" -o bedrock-server-1.26.51.1.zip "https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.26.51.1.zip"
shasum -a 256 bedrock-server-1.26.51.1.zip
# Unpack into an empty directory and list
unzip -q -o bedrock-server-1.26.51.1.zip -d extracted
ls extracted; ls extracted/behavior_packs; find extracted/definitions -type f | wc -l
find extracted/behavior_packs -name '*.brarchive' | wc -l
# Archive members: a reader following packages/minecraft/datagen/brarchive.js kept outside the extracted tree
node /tmp/bds-research/tools/list-brarchive.mjs names extracted/behavior_packs/vanilla_1.26.50/__brarchive/blocks.brarchive
# Binary requirements
strings -n 6 extracted/bedrock_server | grep -oE '^GLIBC_[0-9.]+$' | sort -uV | tail -3
grep -vE '^\s*#|^\s*$' extracted/server.properties
```
