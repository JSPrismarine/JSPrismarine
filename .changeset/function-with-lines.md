---
'@jsprismarine/mcfunction': patch
---

The executor hands a `function <id> with block|entity|storage …` line to its command runner, which has the world to read the compound from, instead of failing to read `with …` as an argument compound.
