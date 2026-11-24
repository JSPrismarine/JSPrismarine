---
'@jsprismarine/prismarine': patch
---

`/item modify` runs a datapack's item modifier over the stacks in the slots it names, and the modifier on `/item replace|fill|override … from` runs over each copied stack, instead of refusing. A stack keeps its name, lore, enchantments, durability and contents through the modifier.
