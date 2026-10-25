---
'@jsprismarine/entity-brains': patch
---

Add `@jsprismarine/entity-brains`, Java Edition's brain AI. Java runs two unrelated mob AI systems:
the goal system, which Bedrock's `minecraft:behavior.*` components mirror, and the brain system,
for which Bedrock publishes no memory, sensor or activity registry at all. This package is the
second one, written against Java's model and read out of the pinned 26.3 server jar rather than
from memory.

The core is `Brain`, `MemorySlot`, the three-member memory precondition map, `Sensor` with its scan
interval, the activity priority stack with its always-active core activities, and the
`BehaviorControl` lifecycle. The combinators are `GateBehavior` with its order and run policies,
`RunOne`, `TriggerGate`, `OneShot` and a fluent `BehaviorBuilder` that accumulates its memory
accessor types. All 115 memory module types, all 24 sensor types and all 26 activities are present,
with the registered names and the Java value types taken from the jar; the measured counts match
the research note exactly.

All twenty mobs that build a brain are wired through one `registerBrainMobs(registry)` call, each
with its real activity table, priorities, memory conditions and constants: allay, armadillo,
axolotl, breeze, camel, copper golem, creaking, frog, goat, happy ghast, hoglin, nautilus, piglin,
piglin brute, sniffer, tadpole, villager, warden, zoglin and zombie nautilus. The villager carries
its schedule from `data/minecraft/timeline/villager_schedule.json` and its nine activity packages,
the piglin its bartering and gold-armor rules, and the warden its `AngerManagement` with the three
`AngerLevel` bands. `Camel` and `HappyGhast` are reported as the two mobs that also run the goal
scheduler.

`BrainWorld`, `BrainMob` and `BrainNavigation` are the seam for everything a brain reads from and
writes to the world, and `TestWorld` is a typed double for all three. The navigation interface is
this package's own so a server can satisfy it with the path finder in `@jsprismarine/entity-goals`
without this package depending on it. 151 tests cover the memory expiry rule, the precondition map,
the activity stack, each combinator, each sensor, and one representative situation per mob.
