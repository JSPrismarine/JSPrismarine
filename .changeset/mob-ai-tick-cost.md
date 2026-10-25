---
'@jsprismarine/entity-goals': minor
'@jsprismarine/entities': patch
---

Cut what a vanilla mob costs to tick, without changing a decision it takes.

Path finding was nearly all of it, and almost none of that was the search itself. One node expansion
asked the world about the same cell several times over. The node tested its own cost, each of its
eight neighbors tested the two cells a diagonal would cut past, and every cell a node bordered was
asked again when that cell was itself expanded. Ninety block reads per expansion. A `CellReader` per
search keeps each answer, hands the view one position object instead of allocating one per read, and
keys its memo on a packed integer rather than an `"x,y,z"` string. A node now costs about
twenty-five reads.

`findPath` also refuses outright when no cell within the goal radius is one the profile could stand
in. A search succeeds only by popping a node inside that radius, and every node but the root came
out of the enterable test, so such a search cannot succeed whatever it does. Saying so costs a few
dozen block reads instead of the whole 512-node budget. That is where the tick spikes lived.
`minecraft:behavior.flee_sun`, `find_cover`, `move_to_land` and `avoid_mob_type` draw up to ten
candidate destinations and ask whether each is reachable, and a candidate three blocks in the air
was costing the full budget: half a million block reads in one `canStart`, on every mob standing in
daylight, on the same tick.

`GoalScheduler` keeps its priority order between ticks rather than sorting the entry map three times
a tick with a `localeCompare` comparator. The comparator is unchanged, so the order is the one it
already produced.

Measured over real vanilla entity definitions, thirty mobs around a player: the mean per-mob cost
fell from 290 to 15 microseconds a tick, the 99th-percentile whole tick from 350 ms to 6 ms, and the
worst tick from 1879 ms to 12 ms. At a hundred mobs the worst tick fell from 3571 ms to 42 ms. Every
goal decision and every resulting path is unchanged, checked by digesting which goals ran on which
mob and where each mob stood, every tick, over five seeded scenarios.

The `entity-goals` bump is `minor` because `NavigationView` now states that the path finder hands
every call the same position object. A view that reads the three numbers and answers, which is what
the package's own `voxelGrid` and the server's view both do, needs no change. One that kept the
object or keyed a cache on it does.
