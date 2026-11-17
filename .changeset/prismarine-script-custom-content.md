---
'@jsprismarine/prismarine': patch
---

Custom commands that behavior pack scripts register in `startup` join the command tree, with their parameter types, permission levels and namespaced names, and an alias without the namespace when no other command holds it. The console, players, functions and scripts run them, the callback's result message reaches the sender, and clients see them in `AvailableCommandsPacket`. Blocks and items that name a script's custom component, as a version 2 component key or in `minecraft:custom_components`, run its `onPlace`, `onBreak`, `onPlayerBreak`, `onPlayerInteract`, `beforeOnPlayerPlace`, `onTick`, `onRandomTick`, `onUse`, `onUseOn`, `onConsume` and `onMineBlock` hooks, and a block with `minecraft:tick` ticks on its interval. A block a world pack defines gets a state schema when the content builds, so it can be placed. `World.onBlockWritten` tells a listener of every block write.
