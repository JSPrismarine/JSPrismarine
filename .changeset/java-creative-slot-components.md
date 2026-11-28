---
'@jsprismarine/prismarine': patch
---

A stack a creative Java Edition player puts in a slot keeps what it changes from its item: its custom name, lore, damage, enchantments, an enchanted book's stored enchantments, and the item name, model, custom model data, cooldown, food, stack size and flags a stack carries. A custom item comes back as itself rather than as the paper it is sent as. Before, the server kept only the item and its count. The `setCreativeSlot` intent's `item` is a `ShownStack`.
