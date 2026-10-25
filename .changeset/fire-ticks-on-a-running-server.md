---
'@jsprismarine/engine-systems': minor
'@jsprismarine/prismarine': patch
---

Make fire tick on a running server, and gate it on the 1.21.11 game rule.

`Engine.setBlockAndUpdate` raised the six neighbor updates and the extra ones a signal source
reaches with, and stopped. Nothing ran the work a block's own `onPlace` does, which is the work
that reads the world the new block landed in rather than telling the world about it. Three
systems were dead because of it: fire never got the first of the ticks that spread it and burn it
out, so placed fire sat where it was lit; dust placed beside a live lever stayed dark; and a
piston placed into a position something already powered never extended. `runPlacementUpdates` now
runs `FireBlock.onPlace`, `RedstoneWireBlock.onPlace` and `PistonBaseBlock.onPlace` alongside the
fluid's, and `createTestEngine` wires a notifying write back through `setBlockAndUpdate` so the
package's own harness behaves like the server.

`fireTick` takes an options record in place of its `increasedBurnout` flag, and its new `spreads`
is Java's `ServerLevel.canSpreadFireAround`: false stops the tick after it has booked the next
one, so the fire keeps its place in the tick list and does not even go out. `EngineOptions`
gains `canSpreadFireAround` for the host to answer it.

The host's answer is `minecraft:fire_spread_radius_around_player`, which 1.21.11 folded
`doFireTick` and `allowFireTicksAwayFromPlayer` into. It is an integer with a default of 128 and
a minimum of -1, read out of `GameRules.class` in the pinned 26.3 jar: -1 lifts the limit, and
anything else is a euclidean distance from the block to the nearest non-spectating player. Mojang's
own `GameRuleRegistryFix` converts the two booleans a Bedrock world still spells, so `doFireTick`
off is 0, which no player is ever inside. `gameRuleValue` is the registry-resolved read the content
adapter already did inline, now shared with the world code that reads a rule outside it.
