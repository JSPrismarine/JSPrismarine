# @jsprismarine/entity-goals

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- Updated dependencies [[`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d)]:
  - @jsprismarine/content@0.17.0
  - @jsprismarine/entities@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`fee1601`](https://github.com/JSPrismarine/JSPrismarine/commit/fee1601bb697b8ba9625b0d10e292d66f33d3391) Thanks [@filiphsps](https://github.com/filiphsps)! - Cut what a vanilla mob costs to tick, without changing a decision it takes.
  
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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`da1793e`](https://github.com/JSPrismarine/JSPrismarine/commit/da1793e286c051351c49dfb1e35b002a6e787bce) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix two gaps the written entity classes were covering, found by connecting real clients to a
  server running the data path alone.
  
  A data-driven mob dropped nothing when it died. `EntityRuntime.kill` read the loot table off the
  resolved type, which only ever sees an entity's base components, and 29 of the 128 vanilla entity
  files declare `minecraft:loot` only inside a component group. The cow carries it in
  `minecraft:cow_adult`, so every cow, pig, sheep and chicken in the world died empty-handed. The
  table is now read off the live instance through `EntityInstance.lootTable()`, which sees the
  groups the entity's spawn event turned on, and falls back to the type.
  
  `minecraft:behavior.mount_pathing` started on nothing more than the entity having a target. The
  adult zombie carries it at priority 2 and `minecraft:behavior.melee_box_attack` at priority 4, and
  both claim the `move` and `look` control flags, so the moment a zombie picked a player it took
  those flags off every goal below it and stood still. Mojang's wording for the goal is "while
  mounted", and it now refuses unless the entity is riding something.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3f0e622`](https://github.com/JSPrismarine/JSPrismarine/commit/3f0e6228843e07f161a665424b7d7fad69273188) Thanks [@filiphsps](https://github.com/filiphsps)! - Use loaded crafting recipes for `minecraft:shareables` rules with `craft_into` when entities share items.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3e00071`](https://github.com/JSPrismarine/JSPrismarine/commit/3e00071b6842b6a9769032fbfc066ee0c3a75299) Thanks [@filiphsps](https://github.com/filiphsps)! - Avoid a duplicate path search when melee goals start.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`09883cc`](https://github.com/JSPrismarine/JSPrismarine/commit/09883cceba7c537b878891ee0200d8e6d52b8e48) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve dense-world target searches and add opt-in DevTools profiling for server runs.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cfaf00d`](https://github.com/JSPrismarine/JSPrismarine/commit/cfaf00d727b7a3e8a6dc0815fe75fb53c420b325) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply `minecraft:can_fly` to aerial pathfinding and Bedrock actor metadata.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7ee8d6c`](https://github.com/JSPrismarine/JSPrismarine/commit/7ee8d6cfd30248841511bc6fb4f69e2db705b96d) Thanks [@filiphsps](https://github.com/filiphsps)! - Reuse one packed cell key when checking path cost and support.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`23bfa3d`](https://github.com/JSPrismarine/JSPrismarine/commit/23bfa3dcd39e963d7cc41aef68a7be74e4d4a06a) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply Java's creative and spectator combat target rules, including releasing targets when players change modes.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`82679b5`](https://github.com/JSPrismarine/JSPrismarine/commit/82679b595802f95dd7012e756215776ee1883a81) Thanks [@filiphsps](https://github.com/filiphsps)! - Aim entity AI at entity eye positions

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ee83909`](https://github.com/JSPrismarine/JSPrismarine/commit/ee83909459951c39b8e44e48a80c2e1848741f49) Thanks [@filiphsps](https://github.com/filiphsps)! - Use `minecraft:shareables` surplus and wanted amounts when entities share inventory.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a2f93a1`](https://github.com/JSPrismarine/JSPrismarine/commit/a2f93a166aca94ab3cf95d086203693b143843a7) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip breeding partner searches when active entity data makes the entity ineligible.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`31ec74a`](https://github.com/JSPrismarine/JSPrismarine/commit/31ec74a54779952d8bccc0f9dacd8e5131f3e363) Thanks [@filiphsps](https://github.com/filiphsps)! - Reduce allocations when building navigation profiles

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d19be92`](https://github.com/JSPrismarine/JSPrismarine/commit/d19be9216143a40fb546b24d3f4a6196c326508e) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix ground navigators treating floatable water as vertical swim paths

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`03e6df9`](https://github.com/JSPrismarine/JSPrismarine/commit/03e6df9845bc83a24309e667bb10a7bcd17c2d88) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply lethal entity events before removal and finish the data-defined Ender Dragon death behavior.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2708df3`](https://github.com/JSPrismarine/JSPrismarine/commit/2708df314b5234ddebacfcd11119c9c6497e7f40) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/entity-goals`, which implements all 170 vanilla Bedrock AI goals against the
  goal seam of `@jsprismarine/entities`. The work is driven by a generated inventory:
  `utils/build-inventory.ts` reads the composed behavior pack of Bedrock Dedicated Server 1.26.51.1
  and writes `src/generated/goalInventory.json` with every `minecraft:behavior.*` name, its use count
  over the 129 entity files, the union of parameter keys observed under it with their JSON types, and
  which entities carry it. The measured count is 170, matching the research note. A totality test
  asserts every name in that file has a registered factory, so coverage cannot silently regress, and
  the measured result is 170 of 170 goals and 129 of 129 entities fully covered.
  
  Goals are grouped by family: targeting, attacking, looking, movement, social, work, environment and
  the single-entity specials. Thirty of them have a Java counterpart whose class name matches after
  snake-casing, and for those the constants are read out of the unobfuscated 26.3 server jar rather
  than guessed, with the class named in the JSDoc: `LookAtPlayerGoal.DEFAULT_PROBABILITY` of 0.02,
  `MeleeAttackGoal`'s 20-tick swing and 10-tick re-path, `LeapAtTargetGoal`'s 2-to-4-block window,
  `BreedGoal`'s 8-block partner search and 60-tick courtship, `HurtByTargetGoal`'s 300-tick revenge
  memory, and the rest. Where the editions differ the Bedrock parameter wins, and the JSDoc records
  the difference.
  
  Navigation is an A\* search over whole blocks against an injected `NavigationView`, governed by a
  `NavigationProfile` built from the entity's `minecraft:navigation.*` component. It honors
  `can_pass_doors`, `can_open_doors`, `can_open_iron_doors`, `can_break_doors`, `avoid_water`,
  `avoid_damage_blocks`, `avoid_sun`, `avoid_portals`, `blocks_to_avoid`, `can_path_over_water`,
  `can_path_over_lava`, `can_walk_in_lava` and the walk, fly, hover, swim, climb and generic
  variants. `Navigator` is the only caller of the path finder and falls back to
  `EntityActuator.moveTo` when no view is supplied, so every movement goal still runs on a server
  that has not implemented the view yet.
  
  `registerVanillaGoals(registry, { world })` wires every goal, and `createGoalEntityRegistry` builds
  the registry in the order that makes these implementations win over the three reference goals the
  entity runtime ships. `GoalWorld` is the second seam a server implements, beside `EntityActuator`,
  and every member is optional so a goal refuses to start rather than throwing when the world cannot
  answer it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`918f5db`](https://github.com/JSPrismarine/JSPrismarine/commit/918f5dbb0876f076c51e2dc03a21f8db2c634c4e) Thanks [@filiphsps](https://github.com/filiphsps)! - Make `minecraft:can_climb` enable pathfinding and vertical movement on ladders.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0cf1eb0`](https://github.com/JSPrismarine/JSPrismarine/commit/0cf1eb0f08e14c795136a1caa6540f470a7cb7df) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep ground navigation from treating liquids as solid support

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a1c295a`](https://github.com/JSPrismarine/JSPrismarine/commit/a1c295a3fc29e44a4c89a9f5eea9ab1bda99500c) Thanks [@filiphsps](https://github.com/filiphsps)! - Run live entities through the data-driven runtime. `EntityRuntime` was built only by its own
  tests, so the whole `src/entity/data/` layer, and with it `@jsprismarine/entities`,
  `entity-goals`, `entity-brains`, `spawning` and `trading`, never ran on a server. A server with
  `content-packs` on now opens one runtime per dimension as that dimension's content adapter is
  assembled, supplies its host from the live world, and ticks it from `World.update`.
  
  What this turns on, with the flag on: the 60 Bedrock spawn rules and the six-step spawn cycle in
  `@jsprismarine/spawning`, over Bedrock's caps and cadences rather than Java's; the population
  despawn pass; the 170 goals and the 20 brain mobs over the real world; `minecraft:breedable`;
  villager trade tables through `Merchant`; and Java's loot tables on death. `MobSpawner` and the
  written entity classes still run with the flag off, which is the default.
  
  Each data entity carries a `GenericEntity` body so clients see it, and the two stay in step:
  position and health go out to the body, and damage the legacy pipeline dealt to the body comes
  back carrying whoever dealt it. `GenericEntity` rather than one of the written classes, so
  nothing runs the legacy goals against the same body.
  
  `ServerWorldSourceOptions` gained `entityRuntimes`, which is what fills the adapter's `spawning`
  and `ai` groups; without it both stay absent and every projected member still names the subsystem
  that owes it. `Server.getEntityRuntime` and `World.dataEntities` read one back.
  
  `GoalWorld.mobs` now includes players, carrying the `player` and `mob` families a filter can ask
  about. 49 vanilla entities carry `nearest_attackable_target` with an `is_family: player` entry and
  that goal searches `mobs`, so without this no monster ever found anybody.
  
  Two measured costs on the way: `Navigator.randomTarget` asked the path finder about ten candidate
  destinations and a candidate inside a block fails only after the search spends its whole 512-node
  budget, and the path finder's view of the blocks was rebuilt per query and resolved every read
  through the palette. Together these were 623 microseconds per entity per tick; they are now 20.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d1ba51f`](https://github.com/JSPrismarine/JSPrismarine/commit/d1ba51fa3f516153c06103d14b2badd9223fba0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip water destinations when navigation data says to avoid water

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c32bfed`](https://github.com/JSPrismarine/JSPrismarine/commit/c32bfededb57b65bab45897dda54e0fa621d0ff1) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Java-derived mob navigation and path costs, and separate overlapping mobs during movement.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d0e884d`](https://github.com/JSPrismarine/JSPrismarine/commit/d0e884d8a40a80047ec6bb948f1f8e1637ccb804) Thanks [@filiphsps](https://github.com/filiphsps)! - Avoid repeating the destination occupancy check during wander pathfinding.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8a20e74`](https://github.com/JSPrismarine/JSPrismarine/commit/8a20e745347d42e28b8ed38cd8a0e5b80b37dcc5) Thanks [@filiphsps](https://github.com/filiphsps)! - Route `minecraft:shareables` consume items through the carried-item goal.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b14a5c8`](https://github.com/JSPrismarine/JSPrismarine/commit/b14a5c867f0eb00691ee7b0b12a726b3823e7ba4) Thanks [@filiphsps](https://github.com/filiphsps)! - Include declared entity inventory slots when shareable items are offered and transferred.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`6d1b073`](https://github.com/JSPrismarine/JSPrismarine/commit/6d1b07376d4d3285768fc807a557ba0722dffb88) Thanks [@filiphsps](https://github.com/filiphsps)! - Equip items picked up under `minecraft:behavior.pickup_items` when item and goal data allow it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`949785e`](https://github.com/JSPrismarine/JSPrismarine/commit/949785e4be1ae2ffd834354fefe993990d5000d6) Thanks [@filiphsps](https://github.com/filiphsps)! - Use `minecraft:shareables` item names, tags, priorities, and pickup limits when entities collect drops.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`981cf5b`](https://github.com/JSPrismarine/JSPrismarine/commit/981cf5b9b2665ae087e53df6919923b4ad4181bb) Thanks [@filiphsps](https://github.com/filiphsps)! - Use `minecraft:shareables` admiration and barter flags when piglins pick up items.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e924c76`](https://github.com/JSPrismarine/JSPrismarine/commit/e924c76b5fdfad1e0c7e809ece789e98764283aa) Thanks [@filiphsps](https://github.com/filiphsps)! - Match `minecraft:shareables` item tags when entities choose items to share.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`13147a3`](https://github.com/JSPrismarine/JSPrismarine/commit/13147a33e36e0f0a00fc5935b9b7f4862e8d686d) Thanks [@filiphsps](https://github.com/filiphsps)! - Track player bed-sleeping state so cats can fire `minecraft:on_wake_with_owner` when their
  owner wakes.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f24718e`](https://github.com/JSPrismarine/JSPrismarine/commit/f24718e513d296bdf0e07ec042564f7f9eda0f64) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the slime line move. `minecraft:behavior.slime_keep_on_jumping` called
  `EntityActuator.jump` and nothing else, and `minecraft:behavior.slime_random_direction` picked a
  heading that nothing read, so the two goals ran every tick and displaced the slime by zero blocks.
  On a host whose actuator has no vertical impulse the slime did not even leave the ground.
  
  A slime has no walk in either edition. It moves by hopping, and vanilla's four slime goals all talk
  to one `SlimeMoveControl` on the mob rather than to each other. `SlimeHeading` is that shared piece
  here, kept per entity because each goal component builds its own `GoalSupport`.
  `slime_random_direction` and `slime_attack` set the heading, and `slime_keep_on_jumping` spends it:
  on each landing it jumps and sends the slime four blocks along the heading through the navigator, so
  a wandering slime travels and a slime with a target closes in on it.
  
  `slime_attack` also aims the heading at its target now. It holds `look` at a better priority than
  `slime_random_direction`, which is what stops a slime wandering once it has something to land on.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`eca419a`](https://github.com/JSPrismarine/JSPrismarine/commit/eca419a4641cb31e7c2e0e790520a25ce59527e2) Thanks [@filiphsps](https://github.com/filiphsps)! - Reuse neighbor buffers during pathfinding to reduce allocations.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8ab8262`](https://github.com/JSPrismarine/JSPrismarine/commit/8ab82622b9be169bccd794f43b151a9685708cc7) Thanks [@filiphsps](https://github.com/filiphsps)! - Let `minecraft:can_stand_on_powder_snow` affect pathfinding and body collision.
- Updated dependencies [[`35dc8ab`](https://github.com/JSPrismarine/JSPrismarine/commit/35dc8ab56ba8acf18a68357c3c0ca1e4ed1f8801), [`3f0e622`](https://github.com/JSPrismarine/JSPrismarine/commit/3f0e6228843e07f161a665424b7d7fad69273188), [`0d64a00`](https://github.com/JSPrismarine/JSPrismarine/commit/0d64a00ec60a7c2064030bfdcec0b2ca26de5236), [`376f8e2`](https://github.com/JSPrismarine/JSPrismarine/commit/376f8e258ba349d5fa5d7c496b3aa6b8045dec46), [`91eaefa`](https://github.com/JSPrismarine/JSPrismarine/commit/91eaefae197242e2476901190792924edcabb0fe), [`b194cc3`](https://github.com/JSPrismarine/JSPrismarine/commit/b194cc3b8a647bd944f78b60903cf23edcc04d1b), [`9617d18`](https://github.com/JSPrismarine/JSPrismarine/commit/9617d187fd9dad87384a46b57548d94441123eeb), [`c59762e`](https://github.com/JSPrismarine/JSPrismarine/commit/c59762eb7d8d7e58bd477e48de087667c565045b), [`2e922ce`](https://github.com/JSPrismarine/JSPrismarine/commit/2e922ce3b1e06c27fbcfac65d2d01a977f2e5ccc), [`9dffb9a`](https://github.com/JSPrismarine/JSPrismarine/commit/9dffb9aa993febd34d79d0bd40afb4334bcd09fa), [`d4a2a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/d4a2a0b2787e171583e6db0aec1b750e8aeb1e95), [`59a3e5c`](https://github.com/JSPrismarine/JSPrismarine/commit/59a3e5c5b910027bcb07b47ed65faa177a2c8d98), [`3a673cf`](https://github.com/JSPrismarine/JSPrismarine/commit/3a673cf89f9c11a8c3ba503c7a62dfc21ca1b5b0), [`931294b`](https://github.com/JSPrismarine/JSPrismarine/commit/931294b82cad6bc2ed4d65a68c36e3c7c560bf00), [`bf9bb09`](https://github.com/JSPrismarine/JSPrismarine/commit/bf9bb0905c5278e4ffc2fd88a7eebe62db6c7ea3), [`c0ccdfe`](https://github.com/JSPrismarine/JSPrismarine/commit/c0ccdfeb805c0869006d380408dc74f84496ddaf), [`a825e54`](https://github.com/JSPrismarine/JSPrismarine/commit/a825e5478baccfc586fc3acd3fd5d8d9fc17a02d), [`d220519`](https://github.com/JSPrismarine/JSPrismarine/commit/d220519e2e460148a90cbde9d643033e27bf8f5e), [`985c08e`](https://github.com/JSPrismarine/JSPrismarine/commit/985c08e1f93cbb557a8ce8be02fb2e0a04587f31), [`609b543`](https://github.com/JSPrismarine/JSPrismarine/commit/609b543617f8731ab597322cf5a6132e4d4ca519), [`582536f`](https://github.com/JSPrismarine/JSPrismarine/commit/582536f53c4ed407b065155dc6dce7f5f48982d8), [`97fde37`](https://github.com/JSPrismarine/JSPrismarine/commit/97fde374f2812e33f4b6a71bbbcf268b78963700), [`03e6df9`](https://github.com/JSPrismarine/JSPrismarine/commit/03e6df9845bc83a24309e667bb10a7bcd17c2d88), [`d29e1d4`](https://github.com/JSPrismarine/JSPrismarine/commit/d29e1d4ef750af20698531f32a3e36040312d3a9), [`c1f0bc3`](https://github.com/JSPrismarine/JSPrismarine/commit/c1f0bc3fe5abfffa6c43d9cc44a407e4e25fd10a), [`cd8645c`](https://github.com/JSPrismarine/JSPrismarine/commit/cd8645c9b8bfcb48162a0c9f99a5d4c7449ea613), [`f94da48`](https://github.com/JSPrismarine/JSPrismarine/commit/f94da4841180543ba50be440c4bc796a8a472fcb), [`701c6e7`](https://github.com/JSPrismarine/JSPrismarine/commit/701c6e7e83b91ae2eaa8aa2bbadbf049c6ef75cf), [`6237d25`](https://github.com/JSPrismarine/JSPrismarine/commit/6237d2570ef950f83dcc0111de283340ff35aca3), [`1d905e2`](https://github.com/JSPrismarine/JSPrismarine/commit/1d905e27de007bc64a3f8c4f3c87c46955573e2a), [`c132c90`](https://github.com/JSPrismarine/JSPrismarine/commit/c132c9073992d5a0e8a7f9203298ec8711b0d585), [`b503085`](https://github.com/JSPrismarine/JSPrismarine/commit/b503085d2c068c27dbb4087e00e3e1a12a42e384), [`67546be`](https://github.com/JSPrismarine/JSPrismarine/commit/67546bec49a4f299b2be9b54b10a7d42865884a9), [`542da3b`](https://github.com/JSPrismarine/JSPrismarine/commit/542da3b62a4895905847cd14c0952a97d254d472), [`8196ea9`](https://github.com/JSPrismarine/JSPrismarine/commit/8196ea9e576d0acc3e17fe6b159791e25dc1092e), [`62df686`](https://github.com/JSPrismarine/JSPrismarine/commit/62df68684596605007aef673182fc0b5d61d1a1f), [`2bea6ac`](https://github.com/JSPrismarine/JSPrismarine/commit/2bea6ac82e3a0a100ee254c7e536df73262bef9f), [`c67300a`](https://github.com/JSPrismarine/JSPrismarine/commit/c67300a6cef6ec68daa9f720bc31c7f238874e01), [`0d53afd`](https://github.com/JSPrismarine/JSPrismarine/commit/0d53afdc4b0f42260231d56bbdeb2b4874f8bae7), [`d647e47`](https://github.com/JSPrismarine/JSPrismarine/commit/d647e4746b3533fbc61afac8414b749a253a32c1), [`7b70cc7`](https://github.com/JSPrismarine/JSPrismarine/commit/7b70cc76fb8f1584746b76ee406ad48811d5d6a2), [`68cef3f`](https://github.com/JSPrismarine/JSPrismarine/commit/68cef3f794575714fef335397e8d6e21aa7ae512), [`7562d04`](https://github.com/JSPrismarine/JSPrismarine/commit/7562d044dae9cefb977dc5f24a9a82c7121d8365), [`c5ae5e6`](https://github.com/JSPrismarine/JSPrismarine/commit/c5ae5e6e2e231751c82840c05dbc34435ccd7304), [`cd3077c`](https://github.com/JSPrismarine/JSPrismarine/commit/cd3077c55d5ee9984512f8e34660e7aae5b55680), [`321a017`](https://github.com/JSPrismarine/JSPrismarine/commit/321a0170b36a2946fa3d06fe5924336222275de2), [`fee1601`](https://github.com/JSPrismarine/JSPrismarine/commit/fee1601bb697b8ba9625b0d10e292d66f33d3391), [`da1793e`](https://github.com/JSPrismarine/JSPrismarine/commit/da1793e286c051351c49dfb1e35b002a6e787bce), [`a0c479e`](https://github.com/JSPrismarine/JSPrismarine/commit/a0c479e0ab28de8ba46bac842ddc90a50d9e679f), [`d490871`](https://github.com/JSPrismarine/JSPrismarine/commit/d49087199730fb9eac7d8ee1976ad36df8475394), [`b98742b`](https://github.com/JSPrismarine/JSPrismarine/commit/b98742b80037c69e51cf6059bff2b45147e6a53e), [`f4ec478`](https://github.com/JSPrismarine/JSPrismarine/commit/f4ec4787eb307bbeefe5d51034f43b0728088c55), [`68febb8`](https://github.com/JSPrismarine/JSPrismarine/commit/68febb838436b90836c311f7cc435676dff5a438), [`c32bfed`](https://github.com/JSPrismarine/JSPrismarine/commit/c32bfededb57b65bab45897dda54e0fa621d0ff1), [`5121b88`](https://github.com/JSPrismarine/JSPrismarine/commit/5121b88dab4fbfd3c6f14476ef2ae0014a710086), [`738a665`](https://github.com/JSPrismarine/JSPrismarine/commit/738a66555ddfad7912d7b6c61f28e78a575996cc), [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a), [`5445a16`](https://github.com/JSPrismarine/JSPrismarine/commit/5445a16a437bddc8726e71d4ae135d5286e351bb), [`0e7d345`](https://github.com/JSPrismarine/JSPrismarine/commit/0e7d345611f49a463d03f3762f3006f5cab2aaf6), [`259282c`](https://github.com/JSPrismarine/JSPrismarine/commit/259282cf8da2397f26bea2bea8816eb6e4ec91d4), [`949785e`](https://github.com/JSPrismarine/JSPrismarine/commit/949785e4be1ae2ffd834354fefe993990d5000d6), [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247), [`a1c9fe5`](https://github.com/JSPrismarine/JSPrismarine/commit/a1c9fe587b5d6eb19a990c16766962c49f9614fe), [`d304979`](https://github.com/JSPrismarine/JSPrismarine/commit/d3049792f9f15adc6936c8049c56a913732ce036), [`9258ef1`](https://github.com/JSPrismarine/JSPrismarine/commit/9258ef152ef8c0802eefc2cad93e1f8ddb950f46), [`13147a3`](https://github.com/JSPrismarine/JSPrismarine/commit/13147a33e36e0f0a00fc5935b9b7f4862e8d686d), [`3c86e27`](https://github.com/JSPrismarine/JSPrismarine/commit/3c86e279350e4b8dd7c67c6ab84e9ab5b617faea), [`e3fbb5f`](https://github.com/JSPrismarine/JSPrismarine/commit/e3fbb5f7f4db31c80f4d07a51065fc3b28a726c6), [`1b08aed`](https://github.com/JSPrismarine/JSPrismarine/commit/1b08aed5a46a79b19ee36c0cc644c958663d3c4b), [`aedac18`](https://github.com/JSPrismarine/JSPrismarine/commit/aedac183fbdabb86c1140c67feab3cf21b8f0ce9), [`163c611`](https://github.com/JSPrismarine/JSPrismarine/commit/163c611a935d954736c43f98aad3bf7ffa875917), [`d06d825`](https://github.com/JSPrismarine/JSPrismarine/commit/d06d8258b8a875f15fbf4ae7b5a249377639742c), [`7ddfa43`](https://github.com/JSPrismarine/JSPrismarine/commit/7ddfa4319dcf42685218014950ad48dafbacc051), [`de16ae0`](https://github.com/JSPrismarine/JSPrismarine/commit/de16ae07c1f0167885a280a1fc91030b9fbfe0cf), [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c), [`03e7f72`](https://github.com/JSPrismarine/JSPrismarine/commit/03e7f729a0fd42a8c6cb42582914f646b4a6762d), [`5a1ab40`](https://github.com/JSPrismarine/JSPrismarine/commit/5a1ab4010008ca1065cc934efb11701831d2c8ac), [`2e24f49`](https://github.com/JSPrismarine/JSPrismarine/commit/2e24f499570960f91e53c0388e6ea00a7f662116), [`2291a0d`](https://github.com/JSPrismarine/JSPrismarine/commit/2291a0d0ce40d73af8eb09cf0e46cfa2ab79db5c)]:
  - @jsprismarine/entities@0.16.0
  - @jsprismarine/content@0.16.0
