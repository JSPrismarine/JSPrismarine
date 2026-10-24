---
'@jsprismarine/prismarine': patch
---

`InteractHandler` now checks what a client names before acting. An `OpenInventory` whose target is not the sender's own runtime id is dropped, an `NpcOpen` is dropped unless the actor is one the client has been shown and is within reach, and an action no client sends is logged instead of silently falling through.
