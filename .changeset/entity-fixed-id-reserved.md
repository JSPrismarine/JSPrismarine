---
"@jsprismarine/prismarine": patch
---

An `EntityRuntime` that draws its own runtime ids no longer hands out an id that an entity restored under a fixed id holds, and `restore` returns `undefined` with a report instead of replacing an entity already under the id it was asked for.
