---
'@jsprismarine/prismarine': minor
'@jsprismarine/server': patch
---

`/stop` reports a shutdown that failed, such as one whose world save threw, and the process exits with code 1 instead of 0. `Server.shutdown` now resolves `true` when it finished and `false` when a step failed, a second call returns the outcome of the shutdown already running, and `onStopCommandComplete` receives that outcome. Code that typed the result of `shutdown()` as `Promise<void>` has to accept `Promise<boolean>`.
