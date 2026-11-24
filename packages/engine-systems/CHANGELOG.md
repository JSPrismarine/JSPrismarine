# @jsprismarine/engine-systems

## 0.25.0

### Patch Changes

- Updated dependencies [[`dda9dbe`](https://github.com/JSPrismarine/JSPrismarine/commit/dda9dbe5ebfdcdc338e37bf24ae8fe561c9308bb), [`d8c99ac`](https://github.com/JSPrismarine/JSPrismarine/commit/d8c99ace8564fd624413a972103b4e057a4a916f), [`2132959`](https://github.com/JSPrismarine/JSPrismarine/commit/2132959244601c90055b091a4273a008eadf0f3d), [`d4adb53`](https://github.com/JSPrismarine/JSPrismarine/commit/d4adb5381a368d2076a0648ce2522c12cf72ab48), [`27c272f`](https://github.com/JSPrismarine/JSPrismarine/commit/27c272f90af03738b7fd9778e2bddea955fe9cb6), [`d1e9714`](https://github.com/JSPrismarine/JSPrismarine/commit/d1e97142dcfdab12f895719eca9bcbee78346c9a), [`47aad59`](https://github.com/JSPrismarine/JSPrismarine/commit/47aad598440fd81e5177c60ffeb49972ce697960), [`fc513cf`](https://github.com/JSPrismarine/JSPrismarine/commit/fc513cf74a16caf6f9da30f3323b094c519d1043), [`253f214`](https://github.com/JSPrismarine/JSPrismarine/commit/253f214c096cad79e6f53cd8a88a828b262af315), [`c053dfc`](https://github.com/JSPrismarine/JSPrismarine/commit/c053dfcdd32006386469c31b8448cdfa33b9333f), [`239659a`](https://github.com/JSPrismarine/JSPrismarine/commit/239659a6927aa7f2b713ad994fe92fab0f2cece9), [`fea2fcd`](https://github.com/JSPrismarine/JSPrismarine/commit/fea2fcd1d4424bf4c766ba996e9eb0ceb742310a), [`055b1ca`](https://github.com/JSPrismarine/JSPrismarine/commit/055b1ca984f47515b42af6109ea88a7ec7b4d451), [`f76f4f2`](https://github.com/JSPrismarine/JSPrismarine/commit/f76f4f25eb0449327fcc06b46797588a0b6879ff), [`c6fc056`](https://github.com/JSPrismarine/JSPrismarine/commit/c6fc056233588d453bcb33febae92189ecfc8b4b)]:
  - @jsprismarine/errors@0.25.0
  - @jsprismarine/blocks@0.25.0
  - @jsprismarine/mapping@0.25.0

## 0.24.0

### Patch Changes

- [#3562](https://github.com/JSPrismarine/JSPrismarine/pull/3562) [`c769189`](https://github.com/JSPrismarine/JSPrismarine/commit/c769189072d249ccc528900df092302793ba747a) Thanks [@filiphsps](https://github.com/filiphsps)! - Tell a block when an entity moves into it. The entity runtime runs `onStepOn` on each block a body's box moves into, as Java's `Entity.checkInsideBlocks` calls `entityInside`, so a pressure plate a player or a mob stands on now powers. A detector rail powers while a minecart is on it, rechecks every second and releases once it has gone, and strongly powers the block below it, as Java's `DetectorRailBlock` does. A sculk shrieker shrieks for a player alone and a sculk sensor ignores the warden, and lava leaves the stacks in it to burn at Java's pace.
- Updated dependencies [[`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a), [`f60848b`](https://github.com/JSPrismarine/JSPrismarine/commit/f60848bcfa396c2070d18a7f9324e08b92b909e5), [`1f3b347`](https://github.com/JSPrismarine/JSPrismarine/commit/1f3b347d94e934767993eb3506a412b01d334a0b), [`3c19f11`](https://github.com/JSPrismarine/JSPrismarine/commit/3c19f11b712b228563d7af7fc5f6df6995726fe3), [`f4eb592`](https://github.com/JSPrismarine/JSPrismarine/commit/f4eb5921862accbb5e07749c38bd1c63495587a0), [`a19ba96`](https://github.com/JSPrismarine/JSPrismarine/commit/a19ba968ae53bd5c34c9515227a9d08ff7c69e33), [`a64ab41`](https://github.com/JSPrismarine/JSPrismarine/commit/a64ab41bf639ffb0144117810600a4abf306a850), [`f601458`](https://github.com/JSPrismarine/JSPrismarine/commit/f601458356766013707b4b0253ff534d73c8ce68), [`9c4bd38`](https://github.com/JSPrismarine/JSPrismarine/commit/9c4bd38bc8532b277ae4eea0b75923ad81993c05), [`05f03f7`](https://github.com/JSPrismarine/JSPrismarine/commit/05f03f78e186000a5e76cc34894a61a384ca5333), [`02d9cb6`](https://github.com/JSPrismarine/JSPrismarine/commit/02d9cb69d53cf22a406dd86e95f08b2bbc48eb5c), [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5), [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a), [`8a41ef4`](https://github.com/JSPrismarine/JSPrismarine/commit/8a41ef432e4274717875eb8bf010cff00ef435ea), [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa), [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca), [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4), [`e515b52`](https://github.com/JSPrismarine/JSPrismarine/commit/e515b52206a0e9ce6223c860ab6bcb0da6483643)]:
  - @jsprismarine/errors@0.24.0
  - @jsprismarine/blocks@0.24.0
  - @jsprismarine/mapping@0.24.0

## 0.23.2

### Patch Changes

- Updated dependencies [[`5f48cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/5f48cd10e4ca5b53ef19ebd214b70b1de18acca9)]:
  - @jsprismarine/errors@0.23.2
  - @jsprismarine/blocks@0.23.2
  - @jsprismarine/mapping@0.23.2

## 0.23.1

### Patch Changes

- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/blocks@0.23.1
  - @jsprismarine/errors@0.23.1
  - @jsprismarine/mapping@0.23.1

## 0.23.0

### Minor Changes

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Errors carry a stable code and a link to their entry in the error reference at https://jsprismarine.dev/errors/, from their catalog in `@jsprismarine/errors`. Messages are unchanged.

- [#3463](https://github.com/JSPrismarine/JSPrismarine/pull/3463) [`bf112a3`](https://github.com/JSPrismarine/JSPrismarine/commit/bf112a37a3e177714837727769bf9613b0c1c1b8) Thanks [@filiphsps](https://github.com/filiphsps)! - Hold a fluid tick in a chunk whose neighbors are not all loaded until they are, as Java holds the ticks of a chunk that is not ticking, so water at the edge of the loaded area flows into the next chunk once it loads instead of stopping for good. `TickList.tick` and `TickScheduler.tick` take an optional check of which chunks may tick.

- [#3413](https://github.com/JSPrismarine/JSPrismarine/pull/3413) [`1698119`](https://github.com/JSPrismarine/JSPrismarine/commit/1698119bbd81926c262f4c0615160b3b732d3025) Thanks [@filiphsps](https://github.com/filiphsps)! - Random ticks no longer allocate per section per tick. The server hands out one reusable section reader and one random tick lookup per content build, and keeps each chunk's section corners until its section list changes. A host may now return the same `sectionRandomTickIds` reader for every section.

- [#3395](https://github.com/JSPrismarine/JSPrismarine/pull/3395) [`74bb4d5`](https://github.com/JSPrismarine/JSPrismarine/commit/74bb4d5f50ac9b16e4ae19805ab1b92a03d5dfe0) Thanks [@filiphsps](https://github.com/filiphsps)! - Random ticks check the server's content build once per section instead of on every draw. `WorldAccess` gains an optional `sectionRandomTickIds`, a per-section reader that returns a block's runtime id only when it takes random ticks, and `runRandomTicks` prefers it over a per-draw tick check.

- [#3218](https://github.com/JSPrismarine/JSPrismarine/pull/3218) [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9) Thanks [@filiphsps](https://github.com/filiphsps)! - Behavior pack scripts hear most of the remaining `world.afterEvents` and `world.beforeEvents` of `@minecraft/server`: a player's block placement, game mode change, change of dimension, emote, button input, input mode, hotbar slot, inventory changes, cursor, crafting, mining, arm swing, item use stages, dropped and picked-up stacks, containers opened and closed, name tags and script messages; an entity's load and removal, melee hits, projectile hits, status effects, heals, health changes, taming and data-driven events; explosions and the blocks they clear, game rule changes, and pistons, levers, buttons and pressure plates. The before-events run as guards of their actions and can cancel them or change what they allow, such as an effect's duration, a blow's damage, a heal's amount, a game mode or the blocks a blast clears. Each subscriber's options pick the events it gets. Block custom components get `onStepOn`, `onEntityFallOn`, `onEntity`, `onRedstoneUpdate` and `onBlockStateChange`.
  
  The server raises a kernel event for each of these, which plugins can listen to as well: `playerPlaceBlock` and `playerBlockPlaced`, `playerGamemodeChanged`, `playerDimensionChanged`, `entityRemove` and `entityRemoved`, `entityEffectAdd` and `entityEffectAdded`, `entityHeal`, `entityHealed` and `entityHealthChanged`, `explosion` and `exploded`, and the rest that `docs/guide/extending.md` lists. `playerSetGamemode`'s mode is writable.
  
  For code that embeds these packages: `ScriptWorld` has an optional `guardGameEvents`, `ScriptWorldEvent` has a `game` variant, engine-systems' `ExplosionOptions` takes a `guard`, entities' `EntityEnvironment` takes `eventApplied`, block-behaviors' `WorldActions` takes `redstoneActivated`, and protocol exports `ScriptMessagePacket`.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`1d022c3`](https://github.com/JSPrismarine/JSPrismarine/commit/1d022c3a59a1d33b6498f96c0aa755d85b252a19), [`9601250`](https://github.com/JSPrismarine/JSPrismarine/commit/9601250aea5e3639b3c1a7b5371eda1d1d3e0daf), [`e8b329d`](https://github.com/JSPrismarine/JSPrismarine/commit/e8b329d3470a38fe4af4a6bbcebba991e599178d), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`14e71bb`](https://github.com/JSPrismarine/JSPrismarine/commit/14e71bb4606e91ca6a57c6f274678f933252d0af), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`2dd8ff2`](https://github.com/JSPrismarine/JSPrismarine/commit/2dd8ff2fda5afab035cae34e1542c73443cfeb3b), [`2d461cb`](https://github.com/JSPrismarine/JSPrismarine/commit/2d461cbe0f493a6482b19ba298df277fb95cf4bb), [`4d92994`](https://github.com/JSPrismarine/JSPrismarine/commit/4d929943617a9cd77d55fb8b2cdd6343665152b4), [`c1f1339`](https://github.com/JSPrismarine/JSPrismarine/commit/c1f1339aea746b7a86016ba68739517049d8967e), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`2e2b61b`](https://github.com/JSPrismarine/JSPrismarine/commit/2e2b61b272cac241dc765cc46c841828e1a89beb), [`a7591d2`](https://github.com/JSPrismarine/JSPrismarine/commit/a7591d22bc0489db3499fc7dbe3a0c6d3537b354), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0
  - @jsprismarine/blocks@0.23.0
  - @jsprismarine/mapping@0.23.0

## 0.22.0

### Patch Changes

- [#3084](https://github.com/JSPrismarine/JSPrismarine/pull/3084) [`c103c08`](https://github.com/JSPrismarine/JSPrismarine/commit/c103c08d6181d51f46cdc927ba949a927a50a9f7) Thanks [@filiphsps](https://github.com/filiphsps)! - Take a chunk's scheduled fluid ticks off the world's tick list when the chunk unloads, after its save has written them to its `PendingTicks` record, as Java's `LevelTicks.removeContainer` does. A reload schedules them again from the record. A chunk with a fluid tick its save did not write stays loaded until the next pass. Block ticks are not persisted, so they stay queued as before. `TickList` gains `ticksInChunk` and `clearChunk`, which find a chunk's ticks through a per-chunk index instead of reading the whole queue.

- [#3109](https://github.com/JSPrismarine/JSPrismarine/pull/3109) [`7dded4e`](https://github.com/JSPrismarine/JSPrismarine/commit/7dded4ea9333ba51d6c0bbc04e291adf7e1b190d) Thanks [@filiphsps](https://github.com/filiphsps)! - Look a random tick's section up once for all the positions drawn in it. `WorldAccess` gains an optional `sectionRuntimeIds`, which the server answers with a reader over the section's own storage, so each of the three draws per section no longer finds the chunk and the sub chunk again.

- [#3084](https://github.com/JSPrismarine/JSPrismarine/pull/3084) [`72d0bca`](https://github.com/JSPrismarine/JSPrismarine/commit/72d0bca20ad6081af2820e57bd6eb462bb45124f) Thanks [@filiphsps](https://github.com/filiphsps)! - Leave nothing on the ground while a freshly generated chunk settles. The fluid generation leaves to tick, and what it sets off, used to wash plants away and drop them, so exploring new terrain left hundreds of items lying in caves. While a generated chunk settles, what the world's own block updates, scheduled ticks and random ticks destroy in it drops nothing. Water that flows out of a settling chunk carries the settling into the chunk it reaches. A chunk settles once it and its eight neighbors are loaded with no fluid tick and no block update queued, or when a player or a command writes a block in it, after which drops are as usual. `TickList` gains `hasTicksInChunk`.
- Updated dependencies [[`51cd835`](https://github.com/JSPrismarine/JSPrismarine/commit/51cd8359d07faf342bb191fefd3d58303ddac488), [`b1b1871`](https://github.com/JSPrismarine/JSPrismarine/commit/b1b18714efe02837d35771b5198bd529a54b6403), [`546c624`](https://github.com/JSPrismarine/JSPrismarine/commit/546c624aaeeefec693909b9e3413819d3bb45f9f)]:
  - @jsprismarine/blocks@0.22.0
  - @jsprismarine/mapping@0.22.0

## 0.21.0

### Minor Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`aaf583a`](https://github.com/JSPrismarine/JSPrismarine/commit/aaf583a5c37a1188708e7077c9b34f3f8d9ffc63) Thanks [@filiphsps](https://github.com/filiphsps)! - Scheduled block and fluid ticks stop on a count only. `TickList.tick` and `TickScheduler.tick` no longer take a `deadline` and never read the clock, so a call that passed one must drop the argument. The server no longer stops a world's scheduled ticks after 25 ms: each list runs up to 65536 due ticks a game tick, and a slow host ticks slower instead of running fewer of them. `SCHEDULED_TICK_TIME_BUDGET_MS` is removed.

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`dd1d776`](https://github.com/JSPrismarine/JSPrismarine/commit/dd1d776ee64bb30a99dbc831c09ad940c13abe0a) Thanks [@filiphsps](https://github.com/filiphsps)! - A world's change log now holds everything the replay digest hashes, so a snapshot of a world plus the sealed ticks after it reaches the digest of any of them. The block update queue and the scheduled block and fluid ticks are logged as `block-update` and `scheduled-tick` entries, so undoing a unit also takes back the updates and ticks its writes queued, and each sealed tick carries a `header` with the level clock, the weather, the game rules, the random tick generator, the depth of the light queue and the chunk loads in flight. `World.replayStateDigest` takes a header to hash, `World.tickHeader` reads the world's own, and `World.replayChunkLeave` applies a logged chunk leave.
  
  Status effect changes are sent from the log as `status-effect` occurrences, so one made in a unit that throws is not sent. `WorldChangeSink.statusEffectChanged` is gone, `World.sendStatusEffect`, `sendWorldEvent`, `sendActorSound` and `sendActorEvent` return nothing, and `EntityStore` no longer takes unit journals (`UnitJournal`, `addUnitJournal`): the block update queue reports to an observer and is undone through the log. The replay recorder counts a packet toward the tick that queued it rather than the tick the transport framed it in.
  
  `TickScheduler.observe` hears each scheduled tick queued and taken off, and `TickList.restore` writes one back without reporting it.

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`b5831ed`](https://github.com/JSPrismarine/JSPrismarine/commit/b5831ed05d09c339c77867d3efcef3d7c95bd13a) Thanks [@filiphsps](https://github.com/filiphsps)! - `TickList.restore` reads its queue only when the tick it restores is queued. An undo or a replay restores one tick per logged entry, and each restore read the whole queue, so a span with many scheduled ticks cost the entry count times the queue length. `TickList.schedule` queues a copy of the position it is given, so a caller that changes its own position object afterwards no longer moves the queued tick away from the record `restore` relies on.
- Updated dependencies [[`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c), [`aed0570`](https://github.com/JSPrismarine/JSPrismarine/commit/aed057021fc0c9169a6e3ec78c2b37b0b54d798a)]:
  - @jsprismarine/blocks@0.21.0
  - @jsprismarine/mapping@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/blocks@0.20.0
  - @jsprismarine/mapping@0.20.0

## 0.19.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/blocks@0.19.2
  - @jsprismarine/mapping@0.19.2

## 0.19.1

### Patch Changes

- Updated dependencies [[`5129bc5`](https://github.com/JSPrismarine/JSPrismarine/commit/5129bc5166f8a781bd3f928e24b687744cdbd8c9)]:
  - @jsprismarine/mapping@0.19.1
  - @jsprismarine/blocks@0.19.1

## 0.19.0

### Patch Changes

- Updated dependencies [[`9a914c5`](https://github.com/JSPrismarine/JSPrismarine/commit/9a914c5e493a7aac47bdf7d1e21fa9f53f3d0622), [`47d5d19`](https://github.com/JSPrismarine/JSPrismarine/commit/47d5d19bdc211dda8ca06b979dc5645791b63801)]:
  - @jsprismarine/blocks@0.19.0
  - @jsprismarine/mapping@0.19.0

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5)]:
  - @jsprismarine/blocks@0.18.0
  - @jsprismarine/mapping@0.18.0

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`b55ed8f`](https://github.com/JSPrismarine/JSPrismarine/commit/b55ed8fdd5389666bfc90b1f0426bf0aeeb1dcd6) Thanks [@filiphsps](https://github.com/filiphsps)! - Include pending simulation queues and random tick state in replay digests.

- [`f138dec`](https://github.com/JSPrismarine/JSPrismarine/commit/f138dec7bdbd36d0bfb06da1475a4debf9790107) Thanks [@filiphsps](https://github.com/filiphsps)! - Read a button's `facing_direction` and a redstone torch's `torch_facing_direction` to find the block each is mounted on, so a pressed button powers its support block and a wall torch stops powering the block it hangs on.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`ac6967c`](https://github.com/JSPrismarine/JSPrismarine/commit/ac6967ce77cd38430626a37e6470503b739c4459) Thanks [@filiphsps](https://github.com/filiphsps)! - Filter random ticks using Bedrock runtime-id properties ([#2818](https://github.com/JSPrismarine/JSPrismarine/issues/2818))

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`2726b0a`](https://github.com/JSPrismarine/JSPrismarine/commit/2726b0a801b97e53d0187989a913c4d01a95aa89) Thanks [@filiphsps](https://github.com/filiphsps)! - Drain due scheduled ticks with one prefix removal while preserving Java's ordering.

- [#2876](https://github.com/JSPrismarine/JSPrismarine/pull/2876) [`8026821`](https://github.com/JSPrismarine/JSPrismarine/commit/8026821d4584b86fe5924f502242c58ad12a6cdc) Thanks [@filiphsps](https://github.com/filiphsps)! - Let a flipped lever power the block it hangs on. The signal code read a state named `attachment_face` that no Bedrock lever has, so every lever fell back to "down" and never powered a block resting on its support block. A lamp touching the lever lit, but a lamp on the lever's wall did not. It now reads `lever_direction`.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`47a0283`](https://github.com/JSPrismarine/JSPrismarine/commit/47a028319f375c43ccb7e5475d775e9e2fa2c1da) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip redstone power scans for block states without redstone update hooks.

- [`f017fc7`](https://github.com/JSPrismarine/JSPrismarine/commit/f017fc7d2aa6e8c458d001fe8a89fb1d1387bbc1) Thanks [@filiphsps](https://github.com/filiphsps)! - Bound the time a world tick spends on scheduled ticks as well as their count, so thousands of due ticks, such as the leaf decay checks of a freshly filled canopy, spread over several ticks instead of stalling one for seconds.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`ea01a93`](https://github.com/JSPrismarine/JSPrismarine/commit/ea01a934ad5452ecbffadd5db67276218d49b668) Thanks [@filiphsps](https://github.com/filiphsps)! - Cache engine block facts by runtime ID
- Updated dependencies [[`09d523c`](https://github.com/JSPrismarine/JSPrismarine/commit/09d523c5fbd04af60800bee5ad2b12f2a7619e02), [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d), [`3934d28`](https://github.com/JSPrismarine/JSPrismarine/commit/3934d281e96f022a0d57c95d8de99794ed6dd244)]:
  - @jsprismarine/blocks@0.17.0
  - @jsprismarine/mapping@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3ce20e2`](https://github.com/JSPrismarine/JSPrismarine/commit/3ce20e248ddf68967062a79a0b5766bf8ac4fa8c) Thanks [@filiphsps](https://github.com/filiphsps)! - Run every destroyed block through one path.
  
  A blast, a stream of water, a piston, fire and a falling block each took blocks out with a rule
  of their own, and none of them raised the block's `onBreak`. A chest the TNT caught kept its
  contents, a double chest left its other half paired to air, and what fell was a hardcoded copy
  of the block rather than Java's loot table.
  
  `WorldAccess` gains `destroyBlock`, which the host answers by running the same path a player's
  break takes: the hook before the write, then the roll with whatever the caller knows, the blast
  radius for an explosion and nothing at all for a plank the fire burned. It also gains
  `moveBlock`, so a pushed block carries its block entity instead of being written twice and
  arriving empty. `WorldAccess.spawnItem` is gone with them.
  
  `World` now raises `onNeighborChanged` for every block write rather than only for the content
  adapter's own, so a torch whose support a command or a generator removed finally hears about it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`fd43ade`](https://github.com/JSPrismarine/JSPrismarine/commit/fd43ade59e80f19e3e7ef994ca80adb15e1f7907) Thanks [@filiphsps](https://github.com/filiphsps)! - Make fire tick on a running server, and gate it on the 1.21.11 game rule.
  
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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`abd3869`](https://github.com/JSPrismarine/JSPrismarine/commit/abd38698ac421ed89eda5afc3e6aac1ab03981ae) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove Engine-owned redstone and piston handlers, and route block behavior through resolved content families.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5e47439`](https://github.com/JSPrismarine/JSPrismarine/commit/5e474396321b54f696760962ceb9d24b85917640) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve redstone conductor overrides from `minecraft:redstone_conductivity` block components.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d0b36e7`](https://github.com/JSPrismarine/JSPrismarine/commit/d0b36e7d517f9f057cadbc261c6a77d3cb58329a) Thanks [@filiphsps](https://github.com/filiphsps)! - Route server fluid ticks through data-driven block families, expose liquid state reading from block behaviors, and remove fluid handling from `Engine`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3093e34`](https://github.com/JSPrismarine/JSPrismarine/commit/3093e340fc9a98a5a408f3c175e844b576289940) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove legacy fire handlers from the engine and dispatch fire ticks through block behavior families.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b6eccf4`](https://github.com/JSPrismarine/JSPrismarine/commit/b6eccf49493ed702c5c13eb831ad9fa54258a47d) Thanks [@filiphsps](https://github.com/filiphsps)! - Route block power changes through data-driven redstone hooks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bd32c08`](https://github.com/JSPrismarine/JSPrismarine/commit/bd32c08eac967ec9e0068cd56cf1788053539a6b) Thanks [@filiphsps](https://github.com/filiphsps)! - Move slope-directed fluid flow, falling levels, and source conversion into the data-driven liquid family.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d231208`](https://github.com/JSPrismarine/JSPrismarine/commit/d231208b7ed03ea5f62f14a2f72741881b57f128) Thanks [@filiphsps](https://github.com/filiphsps)! - Route observer pulses through block family hooks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3cde97f`](https://github.com/JSPrismarine/JSPrismarine/commit/3cde97f56f87dbf9ce3636a6ccf142950fa23cf8) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the weather cycle, which is Java's `ServerLevel.advanceWeatherCycle` over `WeatherData`: three counters, two flags, and the jar's own durations. `advanceWeatherCycle` is a function from one state to the next rather than something that owns a world, so a host steps it, saves the five numbers that come back, and tells its clients when `weatherOf` changed. `weatherCommandState` is the part of `WeatherCommand` that belongs here, which is which counters each of the three forms sets and the duration it uses when the command names none.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7b155cd`](https://github.com/JSPrismarine/JSPrismarine/commit/7b155cdeb90769ec011f29706cb65a95832196f5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/engine-systems`, the four engine systems neither edition publishes as data: the
  tick scheduler, redstone, flowing fluids, and fire spread with the random tick driver. Every
  constant and ordering rule is read out of the pinned Java 26.3 server jar, which carries original
  names since Mojang removed obfuscation in 26.1, rather than from a wiki page.
  
  All four read and write the world through one `WorldAccess` interface covering block state, block
  entity data, tick scheduling and its two queries, item drops, sounds, difficulty, weather, rain,
  dimension, game time, the world random and the height bounds. `createTestWorld` implements it over
  a map of positions and `createTestEngine` returns a world and an engine wired to each other, so a
  test builds a real circuit rather than a mock.
  
  The scheduler is `LevelTicks`, `LevelChunkTicks` and `ScheduledTick`: Java's drain order, the seven
  `TickPriority` values of -3 through 3, the rule that a second tick for the same position and type is
  ignored, and the budget of 65536 ticks per list per game tick. `createNeighborUpdates` is
  `CollectingNeighborUpdater`, which is what keeps an immediate neighbor update apart from a scheduled
  tick.
  
  Redstone implements Java Edition's rules, because redstone is server-decided and invisible to the
  Bedrock client. Power runs 0 to 15 through `SignalGetter` and the per-block signal overrides, dust
  uses `DefaultRedstoneWireEvaluator` rather than the experiment Mojang ships behind a feature flag,
  repeaters take their delay state times 2 game ticks and lock from a diode on either side,
  comparators run compare and subtract and read a container's fill, observers pulse 15 for two game
  ticks on a shape change from the block they face, and pistons use `PistonStructureResolver`
  unchanged, including the 12-block limit and the slime and honey rules. Quasi-connectivity is
  implemented; Bedrock's produce and consume tick split, soft inversion, its dust refresh rule and its
  observer-as-update-detector are not, and the README lists them.
  
  Fluids run `FlowingFluid` over Bedrock's two blocks per fluid, encoding the level into Bedrock's own
  `liquid_depth` by Java's `getLegacyLevel` rule. Water drops 1 level per block, searches 4 for a hole
  and ticks every 5; lava drops 2, searches 2 and ticks every 30 outside the nether, and drops 1,
  searches 4 and ticks every 10 inside it. Obsidian, cobblestone, stone and basalt all come out of
  `LiquidBlock`.
  
  Fire is `FireBlock` with the ignite and burn odds read from `@jsprismarine/mapping` rather than
  restated, running on scheduled ticks 30 to 40 game ticks apart as Java does. The random tick driver
  is `ServerLevel.tickChunk` with `Level.getBlockRandomPos` transcribed exactly, drawing Java's
  absolute three positions per section where Bedrock's rule is documented as relative with no
  published mapping.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3d89810`](https://github.com/JSPrismarine/JSPrismarine/commit/3d89810e3456d9c9108e1b33535197d2bab4786e) Thanks [@filiphsps](https://github.com/filiphsps)! - Cast Java's explosion rays instead of clearing a sphere.
  
  `@jsprismarine/engine-systems` gains `explode`, a transcription of `ServerExplosion` from the
  pinned 26.3 jar: 1352 rays off the surface of a 16 by 16 by 16 grid, each starting at
  `radius * (0.7 + random * 0.6)` and losing `(blastResistance + 0.3) * 0.3` per block it crosses and
  0.22500001 per 0.3-block step. The blocks behind a wall now survive, a one-block moat tames TNT,
  and the crater is the irregular shape vanilla's is. Entity damage comes off
  `getSeenPercent`, which grades cover by sampling a grid of rays over the entity's box, and
  knockback reads `EXPLOSION_KNOCKBACK_RESISTANCE`.
  
  The server no longer holds its own model. `entity/Explosion.ts` and the data-driven runtime's
  `explode` both call the package, so a creeper destroys terrain where it used to leave the hole for
  later, and every block a blast takes out is rolled through its Java loot table with the
  `explosion_radius` parameter that `survives_explosion` and `explosion_decay` turn into a `1 / radius`
  chance.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`276ebd1`](https://github.com/JSPrismarine/JSPrismarine/commit/276ebd1a17e2876e128b41321145a816df6e8918) Thanks [@filiphsps](https://github.com/filiphsps)! - Move redstone placement updates and piston movement into data-driven block families

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c8ed1c5`](https://github.com/JSPrismarine/JSPrismarine/commit/c8ed1c5b88953b3f5f1e3ccec99e8de623faeeb2) Thanks [@filiphsps](https://github.com/filiphsps)! - Route redstone torch ticks through block family hooks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1fa9eda`](https://github.com/JSPrismarine/JSPrismarine/commit/1fa9edaec739e3f7b11648b5662d9860cf569c45) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop a piston and a copper bulb conducting redstone. Java's `Blocks` refuses both through `isRedstoneConductor(Blocks::never)`, but it does so from shared property factories rather than from an inline registration, so the ten blocks they cover were missing from `NON_CONDUCTING_FULL_CUBES` while being opaque enough for `isFullCube` to read them as conductors. `powered_repeater` and `unpowered_repeater` leave the set: Java's `REPEATER` registration calls `isRedstoneConductor` not at all, and the default already refuses them.
  
  The surrounding documentation said "26 blocks override it". 26 is the number of call sites in `Blocks`; they cover 65 blocks and 2.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b3360c0`](https://github.com/JSPrismarine/JSPrismarine/commit/b3360c05087155a4aa71299a2042646fa91d6f14) Thanks [@filiphsps](https://github.com/filiphsps)! - Route repeater and comparator updates and scheduled transitions through their data-driven block behavior hooks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`59f8ec6`](https://github.com/JSPrismarine/JSPrismarine/commit/59f8ec6fcd56487b167a9641cf74d60601d8af7e) Thanks [@filiphsps](https://github.com/filiphsps)! - Run fire spread, burnout, and scheduled ticks through data-driven block behavior hooks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`21887ca`](https://github.com/JSPrismarine/JSPrismarine/commit/21887ca1f152fa69516fb80543e32a5ce047ec39) Thanks [@filiphsps](https://github.com/filiphsps)! - Draw random ticks only where Java draws them, which is also what makes an idle world free.
  `ServerLevel.tickChunks` visits a chunk when a player ticket holds it and draws in a section when
  that section's palette holds something that ticks; this server drew in all 24 sections of all 441
  loaded chunks with nobody online. `WorldSystemsView.randomTickChunks` is the world's answer to both
  halves, and `World` gives it from the players' simulation distance and the chunk's occupied sub
  chunks. Measured over the real loop on a flat world: 29.5 ms per tick to 3.5 with the section half,
  and to nothing at all with no players online, against a 50 ms tick budget.
  
  `EngineOptions.randomTickHandlers` now receives the block with the position. The engine has just
  read it to find the handler, so reading it again cost a chunk lookup and a block-state construction
  in the hottest loop the world has.
- Updated dependencies [[`428fd29`](https://github.com/JSPrismarine/JSPrismarine/commit/428fd2953c93ea8472696575798735a4a36ec51b), [`232a1ce`](https://github.com/JSPrismarine/JSPrismarine/commit/232a1ce20b5ade2e33b703300fb671f0c3f62076), [`ea083fb`](https://github.com/JSPrismarine/JSPrismarine/commit/ea083fb8d67d0c285724b73bf94b41947afc4013), [`f33a57c`](https://github.com/JSPrismarine/JSPrismarine/commit/f33a57c3750488f1ed77a441ab26b7c1086eff68), [`cde1039`](https://github.com/JSPrismarine/JSPrismarine/commit/cde1039d276df8d3787b361e072fafdb32a6da9a), [`f3fa1c6`](https://github.com/JSPrismarine/JSPrismarine/commit/f3fa1c6bf9096223ac9d2b0396bcc71cd04e244e), [`57f252b`](https://github.com/JSPrismarine/JSPrismarine/commit/57f252b2781508290fac2e842cf37fb652467d66), [`f8a43ce`](https://github.com/JSPrismarine/JSPrismarine/commit/f8a43ce910da3d8e1c88091c8886a7c1d09ab0c0), [`d4afedd`](https://github.com/JSPrismarine/JSPrismarine/commit/d4afeddfc1a6016173261b800813e9f248208db8), [`89a02c8`](https://github.com/JSPrismarine/JSPrismarine/commit/89a02c81dd66293ab2b303851aad61c891535081), [`bfb9a31`](https://github.com/JSPrismarine/JSPrismarine/commit/bfb9a31a40c8173f1b811ee63b2308f357c47fd0), [`b6eccf4`](https://github.com/JSPrismarine/JSPrismarine/commit/b6eccf49493ed702c5c13eb831ad9fa54258a47d), [`e17199e`](https://github.com/JSPrismarine/JSPrismarine/commit/e17199e28be25659495b398dc05d6a48baa2b593), [`18f0d0c`](https://github.com/JSPrismarine/JSPrismarine/commit/18f0d0ca7bfb691c75d2d2453eb21b0126e4a4e3), [`9f58b70`](https://github.com/JSPrismarine/JSPrismarine/commit/9f58b7012e39f08ef869149252312f3617c5d057), [`440e164`](https://github.com/JSPrismarine/JSPrismarine/commit/440e164b88f43548c9c4fe8ae896387157f21701), [`e678a6a`](https://github.com/JSPrismarine/JSPrismarine/commit/e678a6a48dd00568f1186f37f2d460b1c898f059), [`a540a4c`](https://github.com/JSPrismarine/JSPrismarine/commit/a540a4cc5879f62d5d3b39d59100200af8e3d313), [`a4abb61`](https://github.com/JSPrismarine/JSPrismarine/commit/a4abb61b7a03101b4f22ebab35da281066530430), [`f370405`](https://github.com/JSPrismarine/JSPrismarine/commit/f37040563ed0cac590fe971ef3a448cb2e01a581), [`c1591b1`](https://github.com/JSPrismarine/JSPrismarine/commit/c1591b1e567a51dc80ecbbdfdbdc8e7c7f4f6c42), [`c9cafc8`](https://github.com/JSPrismarine/JSPrismarine/commit/c9cafc8529e05fe90ea2812920feb76cbcaf4a1b), [`8518afc`](https://github.com/JSPrismarine/JSPrismarine/commit/8518afc7b9ee684ebe4255ce26e7b56d612a145a), [`08de1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/08de1bac21f3c5785a02649e4faa11d9a11f82b0), [`5e47439`](https://github.com/JSPrismarine/JSPrismarine/commit/5e474396321b54f696760962ceb9d24b85917640), [`fc10888`](https://github.com/JSPrismarine/JSPrismarine/commit/fc10888391866037519afbf8e057d4ecece48757), [`6bac6b1`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac6b173e5e283b4e6e3d106268319caa51ed40), [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a), [`4ab02e5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ab02e5cf76b88f09ba19106e971337c1da2d1b9), [`a3db50e`](https://github.com/JSPrismarine/JSPrismarine/commit/a3db50eef709e1d2e3848d71383d6801d5f69773), [`cc8b110`](https://github.com/JSPrismarine/JSPrismarine/commit/cc8b1109b9c174940cdd4549615a05affb459b9a), [`32ce6f2`](https://github.com/JSPrismarine/JSPrismarine/commit/32ce6f2f752e7e89c4445d1936e13a6e243a3a30), [`35e7df5`](https://github.com/JSPrismarine/JSPrismarine/commit/35e7df54b5bba03f65c9e3a972bac32b01ba4fe4), [`13792da`](https://github.com/JSPrismarine/JSPrismarine/commit/13792daea4f024f559c9392e93328694db22e164), [`9e53c61`](https://github.com/JSPrismarine/JSPrismarine/commit/9e53c61399266bf9e26dd87160c45ccd251a21f8), [`a645006`](https://github.com/JSPrismarine/JSPrismarine/commit/a645006caa290b45c728b7ad87435249091cbd56)]:
  - @jsprismarine/mapping@0.16.0
  - @jsprismarine/blocks@0.16.0
