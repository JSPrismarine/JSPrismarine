---
'@jsprismarine/items': minor
'@jsprismarine/item-behaviors': patch
'@jsprismarine/prismarine': patch
---

The block an item hook receives names its dimension: `BlockReference` has a required `dimension`, such as `minecraft:nether`, and code that builds one must now set it. A script item component's `onUseOn` and `onMineBlock` use it, so they get the block the player used in the dimension the player is in. They used to give every block in the Overworld, at the same coordinates. Closes #3847.
