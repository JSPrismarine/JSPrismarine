---
'@jsprismarine/blocks': patch
---

`BlockHooks` has `beforeOnPlayerPlace`, which runs before a player places a block and refuses the placement when a handler returns true, and `HookActor` carries the entity's runtime id as `entityId` when the host knows it.
