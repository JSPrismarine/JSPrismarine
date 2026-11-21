---
'@jsprismarine/script-host': patch
'@jsprismarine/prismarine': patch
---

A `/reload` adds a custom dimension that only it registers, and sends `DimensionData` to the players already in the level, where BDS refuses it with `CustomDimensionReloadNewDimensionError`. It drops a script dimension that it no longer registers once the dimension is empty, after saving the dimension's world. `ScriptWorld` and `ScriptWorldSources` take an optional `settleCustomDimensions`, which the runtime calls after each run's `startup` with the dimensions that run registered. `Level.registerScriptDimension` always answers `registered`, `Level.settleScriptDimensions` replaces `sealScriptDimensions`, and `customDimensionData` moves to `network/customDimensionData`.
