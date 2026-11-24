# @jsprismarine/entity-brains

## 0.25.0

### Patch Changes

- Updated dependencies [[`dda9dbe`](https://github.com/JSPrismarine/JSPrismarine/commit/dda9dbe5ebfdcdc338e37bf24ae8fe561c9308bb), [`2132959`](https://github.com/JSPrismarine/JSPrismarine/commit/2132959244601c90055b091a4273a008eadf0f3d), [`d4adb53`](https://github.com/JSPrismarine/JSPrismarine/commit/d4adb5381a368d2076a0648ce2522c12cf72ab48), [`27c272f`](https://github.com/JSPrismarine/JSPrismarine/commit/27c272f90af03738b7fd9778e2bddea955fe9cb6), [`d1e9714`](https://github.com/JSPrismarine/JSPrismarine/commit/d1e97142dcfdab12f895719eca9bcbee78346c9a), [`47aad59`](https://github.com/JSPrismarine/JSPrismarine/commit/47aad598440fd81e5177c60ffeb49972ce697960), [`fc513cf`](https://github.com/JSPrismarine/JSPrismarine/commit/fc513cf74a16caf6f9da30f3323b094c519d1043), [`253f214`](https://github.com/JSPrismarine/JSPrismarine/commit/253f214c096cad79e6f53cd8a88a828b262af315), [`c053dfc`](https://github.com/JSPrismarine/JSPrismarine/commit/c053dfcdd32006386469c31b8448cdfa33b9333f), [`239659a`](https://github.com/JSPrismarine/JSPrismarine/commit/239659a6927aa7f2b713ad994fe92fab0f2cece9), [`fea2fcd`](https://github.com/JSPrismarine/JSPrismarine/commit/fea2fcd1d4424bf4c766ba996e9eb0ceb742310a), [`055b1ca`](https://github.com/JSPrismarine/JSPrismarine/commit/055b1ca984f47515b42af6109ea88a7ec7b4d451), [`f76f4f2`](https://github.com/JSPrismarine/JSPrismarine/commit/f76f4f25eb0449327fcc06b46797588a0b6879ff), [`c6fc056`](https://github.com/JSPrismarine/JSPrismarine/commit/c6fc056233588d453bcb33febae92189ecfc8b4b)]:
  - @jsprismarine/errors@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [[`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a), [`1f3b347`](https://github.com/JSPrismarine/JSPrismarine/commit/1f3b347d94e934767993eb3506a412b01d334a0b), [`3c19f11`](https://github.com/JSPrismarine/JSPrismarine/commit/3c19f11b712b228563d7af7fc5f6df6995726fe3), [`f4eb592`](https://github.com/JSPrismarine/JSPrismarine/commit/f4eb5921862accbb5e07749c38bd1c63495587a0), [`a19ba96`](https://github.com/JSPrismarine/JSPrismarine/commit/a19ba968ae53bd5c34c9515227a9d08ff7c69e33), [`a64ab41`](https://github.com/JSPrismarine/JSPrismarine/commit/a64ab41bf639ffb0144117810600a4abf306a850), [`05f03f7`](https://github.com/JSPrismarine/JSPrismarine/commit/05f03f78e186000a5e76cc34894a61a384ca5333), [`02d9cb6`](https://github.com/JSPrismarine/JSPrismarine/commit/02d9cb69d53cf22a406dd86e95f08b2bbc48eb5c), [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5), [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a), [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa), [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca), [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4)]:
  - @jsprismarine/errors@0.24.0

## 0.23.2

### Patch Changes

- Updated dependencies [[`5f48cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/5f48cd10e4ca5b53ef19ebd214b70b1de18acca9)]:
  - @jsprismarine/errors@0.23.2

## 0.23.1

### Patch Changes

- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/errors@0.23.1

## 0.23.0

### Minor Changes

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`99439e9`](https://github.com/JSPrismarine/JSPrismarine/commit/99439e9339305dbf12456e4c045f92296185141c) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the `unhandledJavaTypes` module, the reviewed list of Java sensor types the package has no handler for. A test checks it against the pinned Java registry report.

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Errors carry a stable code and a link to their entry in the error reference at https://jsprismarine.dev/errors/, from their catalog in `@jsprismarine/errors`. Messages are unchanged.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0

## 0.22.0

### Patch Changes

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`fa9291f`](https://github.com/JSPrismarine/JSPrismarine/commit/fa9291f7c656691b156c9592d8f64e8ec24641a0) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `Brain.activities` and `Brain.behaviorNames(activity)`, a read-out of a brain's activity table with each gate followed by the behaviors it chooses among, and the optional `BehaviorControl.members` a gate fills.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`9ee0f8e`](https://github.com/JSPrismarine/JSPrismarine/commit/9ee0f8eb6b574793c415feb29a77fbc186ba1988) Thanks [@filiphsps](https://github.com/filiphsps)! - Brain mobs now answer a blow. `BrainMobDefinition` gains `wasHurtBy`, Java's brain side of `hurtServer`, and `targetFromBrain`, set for the eight types whose Java class reads its target from the brain. A hurt hoglin, piglin, piglin brute or zoglin turns on its attacker as Java's `HoglinAi`, `PiglinAi`, `PiglinBruteAi` and `Zoglin` do, and hoglins and piglins pass the target to their kin. A warden grows angry at what hits it, goes for a direct attacker, takes in vibrations through `wardenHearsVibration` and ages its anger every 20 ticks. `BrainWorld` gains the optional `brainMobOf` and `entityById` lookups, and a piglin's grudge now lasts until its target dies instead of ending whenever the target leaves its senses.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`b9bd3f7`](https://github.com/JSPrismarine/JSPrismarine/commit/b9bd3f7f9acfebf7b053607a47d55656c1d38f6d) Thanks [@filiphsps](https://github.com/filiphsps)! - Register the camel's brain for the camel husk, which Java's `CamelHusk` inherits from `Camel`, with a temptation sensor over the `camel_husk_food` tag. The husk now sits and stands by `CamelAi.RandomSitting` like the camel.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`45326a4`](https://github.com/JSPrismarine/JSPrismarine/commit/45326a41f0ddbce0aa7a97c77580dc625b9f84ce) Thanks [@filiphsps](https://github.com/filiphsps)! - Tick the happy ghast's brain only while it is a ghastling, as Java's `HappyGhast.customServerAiStep` does, so a grown ghast's brain no longer drags it away from a player tempting it with a snowball. `BrainMobDefinition` gains an optional `ticksBrain`. `minecraft:behavior.follow_mob` reads a `preferred_actor_type` written without a namespace, such as the ghastling's `player`, so a ghastling follows a nearby player.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`eaa63b1`](https://github.com/JSPrismarine/JSPrismarine/commit/eaa63b1bf84daf43a22083bc48ccd6713fdfb582) Thanks [@filiphsps](https://github.com/filiphsps)! - `interactWithDoor` now runs Java's `InteractWithDoor`: it opens a closed `#mob_interactable_doors` door at the node a mob last left or the one it walks to, and closes the doors it opened once it has passed them, while it is within 3 blocks and no mob of its type stands within 2, rechecking a node 20 ticks after it last changed. It used to wait on a `PATH` memory nothing wrote, so no brain mob ever opened a door. `BrainNavigation.pathStep`, `BrainWorld.isDoorOpen` and `BrainWorld.setDoorOpen` are the new optional host members it reads, and the test doubles answer them.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`d102a7f`](https://github.com/JSPrismarine/JSPrismarine/commit/d102a7fe51ef3db3b42aeef06f108318588ed362) Thanks [@filiphsps](https://github.com/filiphsps)! - Let a piglin fire its crossbow. A piglin holding a crossbow now charges it for 25 ticks, holds the charge for 20 to 39 more and fires an arrow at a target within 8 blocks, stops closing in once the target is within 7, and no longer swings at it. `BrainMob` gains an optional `performRangedAttack`, and `isWithinAttackRange` is Java's `BehaviorUtils.isWithinAttackRange`.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`4c7dec8`](https://github.com/JSPrismarine/JSPrismarine/commit/4c7dec845b53061822107ca8fca00eacf8fe1ff1) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the tadpole's inherited fish goals beside its brain, as Java's tadpole does. `Tadpole` extends `AbstractFish` without overriding `registerGoals`, so Java runs a panic goal at 1.25, a flight from players within 8 blocks and the fish swim goal on top of `TadpoleAi`. `TADPOLE_BRAIN` now reports `alsoRunsGoals` and carries those goals as Bedrock goal bodies in the new optional `BrainMobDefinition.goals`, exported as `TADPOLE_GOALS`; the server runs exactly them in place of the goals the tadpole's file declares, whose tempt and look goals the brain already covers.

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6

## 0.20.0

No changes in this release.

## 0.19.2

No changes in this release.

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
