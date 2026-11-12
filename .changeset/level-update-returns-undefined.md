---
"@jsprismarine/prismarine": patch
---

`Level.update` and `Level.closeTick` return `undefined` instead of `void`. The ticker does not wait for a world's update, its tick close or the tick functions, so its world type now rejects an `update` or `closeTick` that returns a promise, and its server type takes a `tickFunctions` that returns the count of command lines it ran.
