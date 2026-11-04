---
'@jsprismarine/prismarine': patch
---

Make `/teleport` move data-driven mobs. The command wrote the new position onto the mob's body, but the entity runtime owns where a mob stands and copies that onto the body every tick, so the mob snapped back and the client never saw it move. The command now teleports the runtime entity and its body follows.
