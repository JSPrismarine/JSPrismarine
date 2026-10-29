---
'@jsprismarine/prismarine': patch
---

Build the module kernel once per `Server` instead of once per enable. The kernel
now splits registration from start and restarts after `stop()`, so `reload()`
reuses the same kernel and the manager modules are constructed once per server
rather than twice per boot.
