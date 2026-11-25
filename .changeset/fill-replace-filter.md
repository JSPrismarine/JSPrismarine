---
'@jsprismarine/commands': patch
'@jsprismarine/prismarine': patch
---

`/fill … replace <filter>` replaces only the blocks the filter names. The `fill` tree read no filter after `replace`, so the command filled the whole region. It now takes Bedrock's `replaceTileName` and `replaceBlockStates` after `replace`, and refuses a filter after any other mode. A filter with no states matches every state of its block, so `replace minecraft:portal` finds a portal on either axis; one with states matches only the states it lists.
