---
'@jsprismarine/blocks': patch
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

Let a fluid pass between two blocks only where their collision shapes leave the face between them open, as Java's `FlowingFluid.canPassThroughWall` does, so a waterlogged bottom slab no longer lets its water out of its floor. `@jsprismarine/blocks/geometry` adds `mergedFaceOccludes` and `faceOccludesIn`, and `WorldActions` an optional `faceOccludes` hook.
