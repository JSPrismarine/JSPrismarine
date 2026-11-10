---
"@jsprismarine/prismarine": minor
---

Keep one entity index per dimension, as ADR 0007 decides. `EntityIndex` in `entity/data/entityIndex` replaces both `entity/data/entityGrid` and `world/EntityGrid`, and `World.getEntityIndex()` replaces `World.getEntityGrid()`. It holds the data-driven mobs and the world's other entities, players and dropped items among them, and every query answers in ascending runtime id order. A position write refiles the entity before it returns, so item merging, pickup and explosions now see an entity where it moved to earlier in the same tick instead of where it stood when the tick began. The per-tick rebuild is gone.

`Entity.position` is now private. A subclass reads it through `getPosition()` and writes it through `relocate()`, which refiles the entity in its world's index and chunk membership. `World.broadcastMove` only announces a move, and `World.entityRelocated` is the new hook `relocate` calls.
