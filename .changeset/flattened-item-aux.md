---
'@jsprismarine/mapping': patch
'@jsprismarine/items': patch
---

Map a flattened log, wood, leaves, planks, wool, concrete or other block item with no aux. GeyserMC's item table still carried the aux each one had on the merged item it came from, such as 2 for `minecraft:birch_log`, so recipes named those items with an aux no client stack has: a birch log could not be shift-clicked into a furnace. The item table now keeps an aux only where the pinned Bedrock Dedicated Server's creative menu names the item with it, as for a bed's or a banner's color.
