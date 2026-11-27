---
'@jsprismarine/protocol': minor
'@jsprismarine/prismarine': minor
---

`buildCraftingData` writes each cooking recipe as a shapeless entry of one ingredient under its station's tag (`furnace`, `blast_furnace`, `smoker`, `campfire` or `soul_campfire`), one entry per station and input item, as the Bedrock Dedicated Server does. A client reads these entries to know what a furnace's input slot takes, so shift-clicking raw iron or any other cookable stack now puts it in the furnace. The `furnace` list and the `FurnaceRecipeEntry` type are removed from the protocol package, and the `furnaceRecipes` count is removed from `ContentPayloadReport`.
