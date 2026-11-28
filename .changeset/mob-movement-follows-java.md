---
'@jsprismarine/entity-goals': minor
'@jsprismarine/entity-brains': patch
'@jsprismarine/entities': patch
'@jsprismarine/prismarine': patch
---

Mobs no longer stand still as often. They walk and choose where to go the way Java Edition's do:

- A mob walks down a one-block step, however wide it is. Cows and pigs used to stop on the edge until the walk gave up.
- A walk heads along the closest route when no route reaches its target. A zombie closes in on a player it cannot reach, and a villager walks to its job site and its bed.
- Random strolls land on the ground, so far more of them find somewhere to go. A brain mob that flees heads away from the threat.
- A path no longer crosses a fence or a wall, so penned animals stay in their pens.
- A mob that looks one way while it walks another keeps to its path, and clients see its head turn apart from its body.
- Named, tamed and leashed mobs keep strolling with no player nearby.
- Mobs walk at Java's speed, about 2% slower than before.

`@jsprismarine/entity-goals`: all of a mob's goals share one `Navigator`, from `navigatorOf`. A host advances it every game tick with `sweepNavigation`. `Navigator.moveTo` now follows a route that gets closer to the target without reaching it. `Navigator.plan` says whether such a route exists and whether it is complete, and `Navigator.stuck` reports a walk that stopped making progress. A `NavigationView` may answer `collisionTop`, which the path finder uses to refuse fences and walls. `landPositionAt` and `hasPathMalus` draw a walker's random destination as Java's `LandRandomPos` does.

`@jsprismarine/entity-brains`: `BrainNavigation.canReach` takes an optional accuracy, and a navigation may answer `canApproach` for a route that only gets closer. `MoveToTargetSink` walks such a route and records `CANT_REACH_WALK_TARGET_SINCE` while the target stays out of reach.

`@jsprismarine/entities`: an `EntityActuator` may report the entity's `width` and `movementSpeed`, which a navigator uses to decide when a node is reached and when a walk is stuck.
