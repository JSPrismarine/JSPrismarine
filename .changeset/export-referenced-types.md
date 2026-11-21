---
'@jsprismarine/auth': patch
'@jsprismarine/blocks': patch
'@jsprismarine/brigadier': patch
'@jsprismarine/chunkgen': patch
'@jsprismarine/client': patch
'@jsprismarine/console': patch
'@jsprismarine/console-protocol': patch
'@jsprismarine/entities': patch
'@jsprismarine/entity-goals': patch
'@jsprismarine/errors': patch
'@jsprismarine/items': patch
'@jsprismarine/leveldb': patch
'@jsprismarine/mapping': patch
'@jsprismarine/mcfunction': patch
'@jsprismarine/minecraft': patch
'@jsprismarine/native-network': patch
'@jsprismarine/packs': patch
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
'@jsprismarine/raknet': patch
'@jsprismarine/recipes': patch
'@jsprismarine/script-host': patch
'@jsprismarine/worldgen': patch
---

Export the types the public API already uses, so a consumer can name what a function takes or returns. Each package's entry point now exports the interfaces, type aliases and classes its exported signatures reference, and `@jsprismarine/prismarine` and `@jsprismarine/script-host` publish the modules that define them.

`@jsprismarine/protocol` exports five wire types under new names, because the packet API already uses the plain names for other types: `ActorLinkFields`, `AbilityLayerFields`, `SerializedAbilitiesDataFields`, `GameRuleFields` and `UUIDValue`.
