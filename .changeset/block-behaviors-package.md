---
'@jsprismarine/block-behaviors': patch
---

Add `@jsprismarine/block-behaviors`, the vanilla block behavior families.

Every component in `@jsprismarine/blocks` returns `{}`, so the palette resolves with no behavior
until something fills the `BlockHooks` seam. This package fills it with 49 families covering all
1477 palette blocks, written against a `WorldActions` interface that names everything a block does
to the world and nothing a server class owns. `registerVanillaBlockBehaviors(registry, world)` wires
them to a `BehaviorRegistry`, and a `VoxelWorld` test double plus a per-hook harness ship with it so
a plugin can test its own family the same way.
