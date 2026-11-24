---
'@jsprismarine/commands': minor
'@jsprismarine/prismarine': patch
---

`execute if items` counts the items in the slots it names that match Java's item predicate, instead of reading the slot name as an NBT path, and takes its `block <pos>` form and every entity a selector matches. `DataCommandHost` has a new required verb, `countSlotItems`, which a host implements to answer it. The `minecraft:item_predicate` argument reads component tests in brackets, with spaces inside quotes, and is no longer a loot table id.
