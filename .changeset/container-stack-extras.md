---
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

Keep what a stack may be placed on and may break, whether it is kept on death, its lock and its script dynamic properties when it sits in a block container, so a chest saves them to disk under Bedrock's own tags and a script reads back what it wrote to a `ContainerSlot`. `ItemDrop` gains the optional `canPlaceOn`, `canDestroy`, `keepOnDeath`, `lockMode` and `dynamicProperties` fields.
