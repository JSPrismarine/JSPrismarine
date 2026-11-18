---
'@jsprismarine/commands': patch
---

Answer `/time set` as Bedrock 1.26.60 does. The answer names the source's dimension, `Set the time of 'minecraft:overworld' to 1000`. A negative tick count is refused with `Cannot set time to before 0 ticks, the number must be at least 0`, and a word that names no time marker with `Cannot find time marker 'nonsense' on 'minecraft:overworld'` instead of a syntax error.
