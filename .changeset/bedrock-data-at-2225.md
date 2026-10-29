---
'@jsprismarine/bedrock-data': patch
'@jsprismarine/minecraft': patch
---

Publish the Bedrock 1.26.60 (protocol 2225) data this repository can now capture.

The `packets` pass was run twice against the pinned BDS 1.26.60.6. `required_item_list.json`,
`block_definitions.json` and `biome_definitions_network.nbt` reproduced byte for byte and are
committed under `src/jsp/v2225/`. `jigsaw_structure_data.nbt` is deliberately not: the engine
iterates its template pools out of an unordered container, so two runs agreeing is not the order
being fixed, and the same goes for the block palette — `datagen/manifest.json`'s 2225 entry still
declares no `blocks` for that reason, and 2193 stays `defaultProtocolVersion`.

What the capture says is that the item registry is the only one of the three that moved. Against
2193 it adds four names, removes none, and **moves 82 runtime ids**; the block definitions and
the biome definitions came back identical. `utils/build.js` now builds an item table and the
binary payload conversions for every captured version, not only the default one, joining each
with its own version's CloudburstMC dump for the `Item Version` column the capture does not
record. The default version's generated files are byte-identical to what the previous generator
produced, which was checked by running both.

The result is a new entry point, `@jsprismarine/bedrock-data/v2225`, exporting `item_table`,
`block_definitions` and `biome_definitions_network` for that protocol. It is published beside
the unversioned exports rather than in place of them: picking a table per session is a later
slice, and nothing that imports the unversioned names changes. A `registry.items-2225` parity
family compares the published table against the capture it was built from, which is the way this
goes wrong quietly — a 2225 table rebuilt from the 2193 capture looks right and is 82 items out.

`packages/minecraft`'s 2225 entry also declares `recipes` now. The output is 2193's recipe set
exactly apart from its `minecraftVersion` header, because `vanilla_1.26.60` ships structures and
a manifest and no recipe layer at all: 1.26.60 revised no recipe.
