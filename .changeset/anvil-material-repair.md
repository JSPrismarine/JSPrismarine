---
'@jsprismarine/enchantments': patch
'@jsprismarine/prismarine': patch
---

Repair an item on an anvil with the materials its `minecraft:repairable` names. The registry's repair check now resolves a tag-named material through the host's item tags, and every vanilla material is named by a tag, while the server's stacks now carry their type's `minecraft:repairable` for the anvil rule to read. Before, no item repaired with its material.
