---
'@jsprismarine/prismarine': minor
---

Drive `@jsprismarine/engine-systems` from the world tick, so redstone, fluid flow and fire spread
actually run. `WorldSystems` builds the engine over a `WorldAccess` the world supplies and drains
both scheduled tick lists into it, where every tick used to be routed into the legacy
`BlockPhysics`; `World.setLoadedBlockState` is the synchronous write the engine goes through, and
every block change runs Java's `setBlockAndUpdate` updates, which is what starts a circuit when a
lever goes down and what gives a placed bucket of water its first fluid tick. Random tick positions
reach the engine's driver instead of being drawn and dropped, with the per-block handlers arriving
through the new `WorldData.randomTickHandlers`.

Breaking: `WorldSystems` takes one options object, `{ view, world, randomTickHandlers }`, rather
than a view and a handler pair, and `WorldSystemsHandlers` is gone.

The liquid half of `BlockPhysics` is gone with it, along with the `liquid_depth` bit helpers and
the spread rate and reach fields in `BlockRules` that only it read. The engine carries Java's own
`FlowingFluid`, and two spread models writing the same state on two clocks would have fought. The
support and gravity rules are untouched.
