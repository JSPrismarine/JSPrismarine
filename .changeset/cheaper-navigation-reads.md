---
'@jsprismarine/prismarine': patch
---

Mob pathfinding reads blocks faster. Each block read checked its chunk's revision by summing every section's write counts, and looked up its world by scanning the level's worlds. A chunk now reuses its revision until a block is written, and a level remembers its ready worlds by dimension type. In a CPU profile of a server with eight players and their mobs, tick-loop busy time fell from about 84% to about 53%.
