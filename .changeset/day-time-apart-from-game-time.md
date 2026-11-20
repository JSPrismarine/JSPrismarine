---
'@jsprismarine/commands': minor
'@jsprismarine/prismarine': patch
---

Hold the time of day still while `doDayLightCycle` is off or a script paused the overworld clock, and keep the game clock running, since scheduled block ticks count by it. `/time set` and `/time add` move the time of day alone, `/time query gametime` reads the game clock, and `level.dat` saves the two as Bedrock does, under `Time` and `currentTick`. A save without `currentTick` loads its `Time` as both. `WorldCommandHost` has a new required `getGameTime()`.
