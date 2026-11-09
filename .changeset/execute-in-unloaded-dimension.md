---
'@jsprismarine/prismarine': patch
---

A command run in a dimension nobody has entered yet, such as `execute in minecraft:the_nether run fill`, no longer acts on the Overworld instead. The dimension's world is started and the command sees it with no chunks loaded, so a block write there places nothing, as Java's "That position is not loaded" does.
