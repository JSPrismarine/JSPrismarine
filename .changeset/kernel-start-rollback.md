---
"@jsprismarine/kernel": patch
---

`Kernel.start()` no longer leaves modules running when one fails to start. The modules that had started are stopped in reverse order, the kernel returns to registered so `start()` can run again, and the error is rethrown.
