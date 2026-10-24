---
'@jsprismarine/prismarine': patch
---

Register `/gamerule` under the name its id gives it.

The command's id is `minecraft:gamerule` but its root literal was spelled `gameRule`. The command list sent to the client matches literals against the id suffix case-sensitively, so the server logged `Can't find corresponding command class for "gameRule"` on every join, left the command out of the client's list, and neither `/gamerule` nor `/gameRule` ran. The literal is now `gamerule`, and a test checks that every registered command is reachable under its id suffix.
