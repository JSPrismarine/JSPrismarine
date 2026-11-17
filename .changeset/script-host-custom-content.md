---
'@jsprismarine/script-host': patch
---

`system.beforeEvents.startup` hands a pack `customCommandRegistry`, `blockComponentRegistry` and `itemComponentRegistry`, and a version 1 pack's `world.beforeEvents.worldInitialize` hands it the two component registries. Each registration throws the error the pinned BDS throws when BDS refuses it. After `startup`, `WorldScripts` hands the world its custom commands through the new optional `ScriptWorld.registerCommands` and runs each callback in restricted execution while the command runs, and hands it a `ScriptComponentSink` through `ScriptWorld.bindComponents`. `beforeOnPlayerPlace` runs at once and returns its cancel; every other hook runs in the script flush.
