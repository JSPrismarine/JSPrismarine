---
'@jsprismarine/features': patch
---

Add an optional `FeatureWorld.scheduleFluidTick`, Java's `WorldGenLevel.scheduleTick` for a fluid. A spring asks for a tick at the fluid it opens, and a geode asks for one at each fluid beside its crack, as their Java features do, so a world that schedules the tick starts the stream instead of leaving the fluid standing.
