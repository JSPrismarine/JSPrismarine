---
'@jsprismarine/commands': patch
---

`/gamerule` now takes a rule's pre-1.21.11 camelCase name and Bedrock's lowercase name as well as its 1.21.11 id, so `gamerule doMobSpawning false` and `gamerule domobspawning false` set `minecraft:spawn_mobs`. Before, only the 1.21.11 id parsed, although the module header said the old names did.
