---
'@jsprismarine/script-host': patch
'@jsprismarine/prismarine': patch
---

`StartupEvent.dimensionRegistry.registerCustomDimension` adds a void dimension with the Overworld's bounds to the level, as on Bedrock Dedicated Server: `world.getDimension` finds it, a joining client hears of it, and its world is built on its first visit. The errors for a name BDS refuses, a second registration, a registration outside `startup` and a dimension a `/reload` registers that the first run did not are BDS's. The save leaves the dimension out, since the scripts register it again each start. `ScriptWorld` and `ScriptWorldSources` take an optional `registerCustomDimension`, and `Level` gains `registerScriptDimension` and `sealScriptDimensions`. Closes #3624 and #3291.
