---
'@jsprismarine/wire': patch
---

New package: the content registries turned into the payloads a Bedrock client needs.
`buildBlockProperties` writes the `StartGamePacket` block definitions, translating a block's JSON
components into the different names and tag types the client reads, including the `blockTags` list,
the `mappings`/`materials` split with its `packed_bools` bitfield, collision boxes in sixteenths and
`vanilla_block_data` with its flattened archetype. `buildItemRegistry` writes the
`ItemRegistryPacket` entries from the Bedrock projection in `@jsprismarine/items`, filling the seven
`item_properties` keys no Java component decides and giving every value its tag type.
`buildCreativeContent` writes the creative groups and entries from a catalog, and `buildCraftingData`
writes the recipe lists from the deterministic order `@jsprismarine/recipes` assigns, reporting the
twelve Java serializers with no Bedrock form rather than dropping them. `blockRuntimeId` and
`assertBlockPaletteAgrees` hash a block state the way the client does and fail a build on a registry
that would disagree with it.

Measured against the Bedrock Dedicated Server 1.26.51.1 captures in `@jsprismarine/bedrock-data`:
all 2250 fields of the 98 data-driven vanilla block definitions match and 97 of the 98 are byte
identical, 326 of 341 derived `item_properties` values match over the 31 items both sides describe,
and all 1065 captured block `network_id` values are reproduced.
