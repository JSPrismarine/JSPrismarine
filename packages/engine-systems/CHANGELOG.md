# @jsprismarine/engine-systems

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- Updated dependencies [[`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d)]:
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
