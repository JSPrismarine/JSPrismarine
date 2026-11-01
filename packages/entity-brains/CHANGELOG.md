# @jsprismarine/entity-brains

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a825e54`](https://github.com/JSPrismarine/JSPrismarine/commit/a825e5478baccfc586fc3acd3fd5d8d9fc17a02d) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement piglin admire and barter interactions

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`23bfa3d`](https://github.com/JSPrismarine/JSPrismarine/commit/23bfa3dcd39e963d7cc41aef68a7be74e4d4a06a) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply Java's creative and spectator combat target rules, including releasing targets when players change modes.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`82679b5`](https://github.com/JSPrismarine/JSPrismarine/commit/82679b595802f95dd7012e756215776ee1883a81) Thanks [@filiphsps](https://github.com/filiphsps)! - Aim entity AI at entity eye positions

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2a0ba1b`](https://github.com/JSPrismarine/JSPrismarine/commit/2a0ba1b22a2a9018de410940b9a2ff955df9e341) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/entity-brains`, Java Edition's brain AI. Java runs two unrelated mob AI systems:
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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7c2858f`](https://github.com/JSPrismarine/JSPrismarine/commit/7c2858f600ef68f5dd63702be8a230fc15bcabc4) Thanks [@filiphsps](https://github.com/filiphsps)! - Document the exports that shipped without a description, so the generated `.d.ts` and the API docs
  say what each one does.
  
  `@jsprismarine/entity-brains` carried 101 of them: the `Brain` class itself, the three
  `BehaviorControl` implementations in `behavior/control.ts`, `ShufflingList` and `GateBehavior`, the
  `MemorySlot` readers, `BrainMobRegistry`, the `TestWorld` doubles, and the `<mob>Activities`
  function and `<MOB>_BRAIN` definition of each of the twenty mobs. Each mob's entry now states what
  is specific to it rather than repeating its name: that the camel and the happy ghast keep running
  goals, that the frog and the goat start with a full cooldown so a fresh one does not act on its
  first tick, and that the creaking falls back to its default activity while it cannot move.
  
  In `@jsprismarine/prismarine`, the eight `Scoreboard` readers, `Item.getMeta` and the `ChunkBiomes`
  class gain descriptions, and `EXHAUSTION`'s own JSDoc block is back above it after a merge left
  `ADVANCEMENT_CHECK_TICKS` sitting between the two.
