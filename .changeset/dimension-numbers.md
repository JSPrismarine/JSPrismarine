---
'@jsprismarine/prismarine': patch
---

Each custom dimension keeps its Bedrock number in the level's save, under a UUID of its own, so a dimension finds its chunks again whatever order the config, a datapack or a script names it in, and a number once given never goes to another dimension. A save from before gets the numbers it had, in stem order, on its next start. `LevelOptions` takes the saved `dimensionNumbers`.
