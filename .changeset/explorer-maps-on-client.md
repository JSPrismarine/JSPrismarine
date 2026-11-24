---
'@jsprismarine/predicates': patch
'@jsprismarine/loot': patch
'@jsprismarine/block-behaviors': patch
'@jsprismarine/mapping': patch
'@jsprismarine/items': patch
'@jsprismarine/protocol': patch
'@jsprismarine/prismarine': patch
---

Explorer maps show their marker on a Bedrock client. `LevelView.newMapId` now receives the map to make (a `NewMap`: a position it covers, its zoom and its decorations), which `exploration_map` passes when it falls back to the level. `ItemDrop` gains `mapId`. The mapping gives each of the 16 Java structure locator maps its Bedrock aux value (`EXPLORER_MAP_DATA`), so a buried treasure map is a Treasure Map. `@jsprismarine/protocol` exports `ClientboundMapItemDataPacket`. The server saves each map a level makes (center, scale, dimension and markers, placed as Java's `MapItemSavedData` places them) under the LevelDB key `jsprismarine:maps`, and the structures explorer maps point at under `jsprismarine:structure_references`, both as NBT lists that a provider's `LevelRecords` carry as `maps` and `referencedStructures`; it carries the id on the stack as `map_uuid` in its NBT and its client user data, keeps two maps with different ids in separate slots, and answers `MapInfoRequest` with the map's markers and Java's biome preview. Cartographer trades offer the Bedrock filled map with its id. With `skip_existing_chunks`, a search also passes over the structure it starts in, as Java 26.3's `claimStructureAt` does.
