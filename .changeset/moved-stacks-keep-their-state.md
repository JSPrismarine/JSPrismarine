---
'@jsprismarine/prismarine': patch
---

Keep a stack's state when it is crafted, picked from the creative menu or moved. A crafted or
picked pickaxe was built without the server's content, which is where an item reads its tags, so
it matched no `#minecraft:mineable/pickaxe` rule: it did not harvest stone and cracked it at a
fist's pace. A stack split or merged in the inventory, spent in the crafting grid or dropped when
the grid was closed into a full inventory was rebuilt from its name and lost its enchantments,
durability, custom name and content. A second craft onto the same slot also reported the first
one's count to the client.
