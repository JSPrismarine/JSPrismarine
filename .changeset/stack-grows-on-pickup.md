---
'@jsprismarine/prismarine': patch
---

Show a stack growing when items are picked up onto it. A slot holds its count on the entry and on
the item, and a pickup raised only the entry's, while the client is sent the item's: two dirt
picked up one at a time showed as one in the hotbar. A split stack also lost its enchantments,
durability and name. Both now go through the new `Item.withCount`, which copies the whole stack.

A block whose drop has no item id now drops nothing and logs it, instead of putting an item that
holds air on the ground.
