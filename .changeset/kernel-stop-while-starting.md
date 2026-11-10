---
"@jsprismarine/kernel": patch
---

`Kernel.stop()` called while `start()` is still running now stops the modules started so far and the one still starting, so a long start such as a world preload can be cancelled. The pending `start()` rejects with a `KernelError` and starts nothing further. It used to be a no-op until the start finished.
