---
'@jsprismarine/prismarine': patch
'@jsprismarine/block-behaviors': patch
'@jsprismarine/engine-systems': patch
---

Tell a block when an entity moves into it. The entity runtime runs `onStepOn` on each block a body's box moves into, as Java's `Entity.checkInsideBlocks` calls `entityInside`, so a pressure plate a player or a mob stands on now powers. A detector rail powers while a minecart is on it, rechecks every second and releases once it has gone, and strongly powers the block below it, as Java's `DetectorRailBlock` does. A sculk shrieker shrieks for a player alone and a sculk sensor ignores the warden, and lava leaves the stacks in it to burn at Java's pace.
