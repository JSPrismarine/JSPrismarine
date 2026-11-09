---
'@jsprismarine/prismarine': patch
---

`SharedTerrainTileStore` no longer blocks a worker thread while it waits for another owner to finish building a terrain tile. It waited with `Atomics.wait` everywhere but the main thread, which held the whole thread, so an owner running on that thread could not finish until the 100 ms timeout passed. Both waits now use `Atomics.waitAsync`, and releasing a slot also wakes a waiter on its initialization word.
