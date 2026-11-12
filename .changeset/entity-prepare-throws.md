---
"@jsprismarine/prismarine": patch
---

An `EntityRuntime.spawn` or `restore` whose `prepare` callback throws takes the entity back out before the error reaches the caller. The entity stayed in the runtime's queries with no change log entry and no client actor.
