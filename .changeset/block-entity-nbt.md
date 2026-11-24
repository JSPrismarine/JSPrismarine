---
'@jsprismarine/prismarine': patch
---

`/data`, `execute if data`, `execute store … <nbt path>`, `/function … with` and the NBT argument of `/summon` read and write blocks and entities instead of refusing. An entity reads in Java's shape for the fields the server models (`Pos`, `Motion`, `Rotation`, `Health`, `Tags`, `CustomName`, equipment and a player's inventory among them), and a container block reads its `Items`. Writes apply the fields the server models; a player's data cannot be written, as in Java.
