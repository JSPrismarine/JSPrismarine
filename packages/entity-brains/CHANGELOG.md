# @jsprismarine/entity-brains

## 0.19.1

No changes in this release.

## 0.19.0

### Patch Changes

- [`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Point the Discord link in each package README at the project's current invite.

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

- [#2684](https://github.com/JSPrismarine/JSPrismarine/pull/2684) [`15dc167`](https://github.com/JSPrismarine/JSPrismarine/commit/15dc167df09a9595ea31ad475259f2c489bd3519) Thanks [@filiphsps](https://github.com/filiphsps)! - Route sniffer seed drops, warden sonic boom damage and knockback, and villager raid effects through host capabilities.

### Patch Changes

- [`0e4b2a8`](https://github.com/JSPrismarine/JSPrismarine/commit/0e4b2a81759a4c44262bed5c36936ada2c6e5581) Thanks [@filiphsps](https://github.com/filiphsps)! - Villagers trade with players: the trade screen opens on a villager, shows its offers with their live prices, and a trade spends the payment, hands over the result and moves the villager's stock, demand, experience and level. A villager that works at its job site restocks, up to twice a day. Villagers also work with the world: farmers bake bread, compost seeds, harvest, sow and bone-meal crops, villagers share food, thank a hero of the village and have children, and a villager takes its profession and job site from its trade table. A villager remembers the player who cured it and charges that player less, and holds up its trades to a player who talks to it.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`ca3cabc`](https://github.com/JSPrismarine/JSPrismarine/commit/ca3cabc9d123d5bccb6fc06b7b9e323f6676c37e) Thanks [@filiphsps](https://github.com/filiphsps)! - Match Java liquid and land search rules.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`12a2355`](https://github.com/JSPrismarine/JSPrismarine/commit/12a2355ad468ccf73d0b9e2372c420210938ce42) Thanks [@filiphsps](https://github.com/filiphsps)! - Reuse brain worlds and entity views while keeping mutable values live; cache tag lookups and behavior priority order.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`bc2d048`](https://github.com/JSPrismarine/JSPrismarine/commit/bc2d04837063c4e3e5f4aae8904e42c84eb29b44) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Java nearest-first brain block searches.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`ecb2e37`](https://github.com/JSPrismarine/JSPrismarine/commit/ecb2e37d2b970a65964be4f809945515c242495b) Thanks [@filiphsps](https://github.com/filiphsps)! - Match Java nearest-living AABB query bounds.

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
