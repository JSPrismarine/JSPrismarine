---
'@jsprismarine/prismarine': patch
---

Give the block behavior families their random ticks, so crops grow. `WorldManager` builds
`randomTickHandlers` from the content registries - one per block whose content declares an
`onRandomTick` - and the engine's draws now reach the families instead of being discarded. A world
started with `content-packs` off gets no handlers and behaves exactly as before, and a family that
throws is reported once by identifier rather than taking the world tick down with it.
