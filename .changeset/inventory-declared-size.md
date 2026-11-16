---
'@jsprismarine/entities': patch
---

Record whether a `minecraft:inventory` states its `inventory_size`, as `InventoryParams.declaresSize`, so a mount that leaves it out, such as the camel or the nautilus, holds only its equipment. Move the item-name matching `has_equipment` filters use into `itemNames.ts`, where `itemMatchesName` reads a pre-flattening name such as `carpet` the way the filters do.
