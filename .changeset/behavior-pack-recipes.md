---
'@jsprismarine/mapping': patch
'@jsprismarine/packs': patch
'@jsprismarine/prismarine': patch
---

Load a behavior pack's Bedrock recipes into the server's recipe book. Shaped, shapeless, furnace, smithing transform, smithing trim, brewing mix and brewing container recipes in a pack's `recipes/` folder are restated as the Java recipes they mean, so a client is sent them in `CraftingData` and the server's recipe book matches them, with or without the Java vanilla datapack. Material reduction recipes go out in `CraftingData` as material reducer entries. A Bedrock pack source takes a new `skipRegistries` option, which the server uses to leave the vanilla Bedrock pack's own recipes unread, and `@jsprismarine/mapping` adds `bedrockIdentifierToJava` and `mappedJavaIdentifiers`.
