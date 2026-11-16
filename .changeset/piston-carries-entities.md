---
'@jsprismarine/block-behaviors': patch
---

Let an extending piston carry the entities standing where its head or a pushed block arrives one block along, as Java's `PistonMovingBlockEntity.moveCollidedEntities` does. A world gets this by implementing the new optional `WorldActions.moveEntity`; one that leaves it out keeps today's behavior.
