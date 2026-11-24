---
'@jsprismarine/protocol': patch
'@jsprismarine/prismarine': minor
---

The server advertises Java's special recipes, transmutes and armor trims to a joining client, and crafts them when the client names their net id. Repairing, fireworks, map extending and cloning, book cloning, banner duplicating and the decorated pot go out as the multi recipe UUIDs the Bedrock Dedicated Server sends. Each `crafting_transmute`, such as dyeing a shulker box or a bundle, goes out as one user data shapeless entry per input item, and a dyed shulker box keeps its contents. Every `smithing_trim` recipe goes out as the server's one trim entry.

`buildCraftingData` in `@jsprismarine/protocol/bedrock/payload` fills `multi`, `userDataShapeless` and the new `recipesByNetId`, which names the Java recipes behind each net id. `NetworkContentPayloads` carries the same map. `ContentPayloadReport` no longer has `smithingTrimRecipes`, since trims are no longer held back.
