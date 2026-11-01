# @jsprismarine/spawning

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- Updated dependencies [[`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d)]:
  - @jsprismarine/entities@0.17.0
  - @jsprismarine/packs@0.17.0
  - @jsprismarine/predicates@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`88f05b1`](https://github.com/JSPrismarine/JSPrismarine/commit/88f05b1e498a83f210e0fc02ca2f039746bad0f9) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop the underground spawn pass putting mobs inside rock. It drew a y uniformly between the world
  floor and the surface and spawned there without asking what was at the position, so in a world
  with few caves almost every hostile spawn landed inside a solid block. Measured on a flat world
  with two players connected: 11 of 11 zombies, 3 of 3 spiders, 3 of 3 creepers and the one witch
  were standing inside dirt or stone. None of them could path anywhere, none of them despawned, and
  between them they held the monster pool at its cap so nothing else could spawn either.
  
  `SpawnWorld` gains `solid(at)`, and a draw whose own block or the block over its head is solid is
  refused, which is what Java's `NaturalSpawner.isSpawnPositionOk` does with one. The server answers
  it from the flattened solidity column indexed by runtime id, so a pack's own block answers for
  itself, and an unloaded position counts as solid.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2df14f8`](https://github.com/JSPrismarine/JSPrismarine/commit/2df14f843bce26edf0b4da6ddc83b1fa2fef323a) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix fish surface placement and forward guardian monument spawn overrides.

- [#2638](https://github.com/JSPrismarine/JSPrismarine/pull/2638) [`7ba8c73`](https://github.com/JSPrismarine/JSPrismarine/commit/7ba8c737b299535506345222fe87ea88b3b49ff1) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep natural mobs outside the 24-block player and world-spawn exclusion.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d63f254`](https://github.com/JSPrismarine/JSPrismarine/commit/d63f2548bda8ae87f6406309f6cf7c6428ebf188) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop slimes from taking the whole monster pool. `spawn_rules/slime.json` carries no brightness
  filter, no height filter and a weight of 100, so on its own it made the slime the only monster that
  passes a daylit surface position. On a live server that filled the 70-entity monster cap with
  slimes and left nothing for the zombie, the skeleton, the creeper or the spider.
  
  The rule Bedrock actually applies is not in the file. The engine holds a two-branch condition in
  code, and `Spawn Rules.json`'s 24 components cannot express either branch: one is a hash of the
  chunk coordinates, the other a draw against the moon phase. `Spawner` now asks an `EngineSpawnRule`
  for the entity, if there is one, before it evaluates the file's conditions, and
  `SpawnerOptions.engineRules` lets a host replace the set or pass an empty map to run the file alone.
  
  `slimeSpawnRule` is Bedrock's, read out of the function at virtual address `0xbb80040` of BDS
  1.26.51.1's `bedrock_server` rather than out of Java's `Slime.checkSlimeSpawnRules`, because the two
  editions disagree about the parts a player builds farms on. At Y 38 and below the position has to be
  in a slime chunk and nothing else is asked. Above that it has to be in a biome tagged
  `spawns_slimes_on_surface`, between Y 50 and Y 68, with a light level at or under a draw over
  `[0, 8)`, and a float draw under the moon's brightness for the day. Everything else spawns no slimes.
  
  `isSlimeChunk` is the Bedrock hash: a Mersenne twister seeded with `chunkX * 0x1f1f1f1f ^ chunkZ`,
  first draw modulo ten. The world seed is not an input, which is why a Bedrock slime farm sits at the
  same chunk coordinates in every world, and why Java's seeded `WorldgenRandom.seedSlimeChunk` is the
  wrong formula here. A test pins the hash against a twister written from the reference
  implementation, so a drift in either the seed or the generator fails the build.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5daf9a4`](https://github.com/JSPrismarine/JSPrismarine/commit/5daf9a40ab0e55c6bd8e2242e440c3df070ca381) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/spawning`, the Bedrock natural spawning runtime. It parses all 24 condition
  components `Spawn Rules.json` declares, including the three no vanilla file writes, and reads the
  shapes vanilla varies: a block filter as a name, a list or `{name}` objects, a herd as one object
  or a list of alternatives, a biome filter as a test, a bare array or a group map, and a
  permutation's third field under both the schema's `min_guaranteed` and the docs page's
  `guaranteed_count`. The biome filter goes through the filter evaluator of
  `@jsprismarine/entities`, because spawn rules, entity definitions and trade tables share one filter
  grammar; the spawn context answers `has_biome_tag`, `is_biome`, `is_snow_covered`, `is_underground`,
  `is_underwater` and `in_lava` at a position with no entity yet.
  
  `evaluateSpawnCondition` decides one condition and names the component that rejected a position.
  `Spawner` runs the six steps of Mojang's spawn cycle diagram over an injected `SpawnWorld` and an
  injected `RandomSource`, so one seed reproduces one set of spawns: the pool cap, a surface and an
  underground pass per sampled chunk, a weighted draw between every condition that passed, the `rarity`
  roll, the herd with its `initial_event` and `event` members, and `minecraft:permute_type` with its
  guaranteed members and the `type<event>` form. `despawnReason` carries the two population-level
  rules, the published Y floor of -128 and the simulation edge; the per-entity `minecraft:despawn`
  policy stays in `@jsprismarine/entities`.
  
  Mojang publishes no spawn attempt rate, no cap value, no spawn radius, no herd placement rule and no
  light algorithm, and the only numbers in print are the tilde-hedged "Typical Cap" column of
  `EntitySpawningDeepDive.md`. Every constant the algorithm needs therefore lives in
  `src/tables/spawnConstants.json` with a `source` string naming where it came from, a host replaces
  the whole table through `SpawnerOptions.constants`, and the README states which numbers are Mojang's
  (none) and which are this project's (all). A gated corpus test parses all 60 vanilla spawn rules
  with zero diagnostics and pins the measurements: 21 of the 24 components used, the pools at
  `animal` 27, `monster` 24, `water_animal` 5, `pillager` 2, `cat` 1 and `ambient` 1, four rules with
  no conditions, and no biome filter test left unanswered.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0527ffa`](https://github.com/JSPrismarine/JSPrismarine/commit/0527ffacdbf37e49d105227c719d73b7ca4683e7) Thanks [@filiphsps](https://github.com/filiphsps)! - Honor Java structure-only natural spawn overrides
- Updated dependencies [[`35dc8ab`](https://github.com/JSPrismarine/JSPrismarine/commit/35dc8ab56ba8acf18a68357c3c0ca1e4ed1f8801), [`3f0e622`](https://github.com/JSPrismarine/JSPrismarine/commit/3f0e6228843e07f161a665424b7d7fad69273188), [`e96d1b7`](https://github.com/JSPrismarine/JSPrismarine/commit/e96d1b76f18207192a9e815e6a2a558a8c4005ff), [`0d64a00`](https://github.com/JSPrismarine/JSPrismarine/commit/0d64a00ec60a7c2064030bfdcec0b2ca26de5236), [`376f8e2`](https://github.com/JSPrismarine/JSPrismarine/commit/376f8e258ba349d5fa5d7c496b3aa6b8045dec46), [`91eaefa`](https://github.com/JSPrismarine/JSPrismarine/commit/91eaefae197242e2476901190792924edcabb0fe), [`b194cc3`](https://github.com/JSPrismarine/JSPrismarine/commit/b194cc3b8a647bd944f78b60903cf23edcc04d1b), [`9617d18`](https://github.com/JSPrismarine/JSPrismarine/commit/9617d187fd9dad87384a46b57548d94441123eeb), [`c59762e`](https://github.com/JSPrismarine/JSPrismarine/commit/c59762eb7d8d7e58bd477e48de087667c565045b), [`2e922ce`](https://github.com/JSPrismarine/JSPrismarine/commit/2e922ce3b1e06c27fbcfac65d2d01a977f2e5ccc), [`9dffb9a`](https://github.com/JSPrismarine/JSPrismarine/commit/9dffb9aa993febd34d79d0bd40afb4334bcd09fa), [`59a3e5c`](https://github.com/JSPrismarine/JSPrismarine/commit/59a3e5c5b910027bcb07b47ed65faa177a2c8d98), [`3a673cf`](https://github.com/JSPrismarine/JSPrismarine/commit/3a673cf89f9c11a8c3ba503c7a62dfc21ca1b5b0), [`931294b`](https://github.com/JSPrismarine/JSPrismarine/commit/931294b82cad6bc2ed4d65a68c36e3c7c560bf00), [`bf9bb09`](https://github.com/JSPrismarine/JSPrismarine/commit/bf9bb0905c5278e4ffc2fd88a7eebe62db6c7ea3), [`c0ccdfe`](https://github.com/JSPrismarine/JSPrismarine/commit/c0ccdfeb805c0869006d380408dc74f84496ddaf), [`d66cf52`](https://github.com/JSPrismarine/JSPrismarine/commit/d66cf527b79391e194f85137e1e5b573993c7947), [`a825e54`](https://github.com/JSPrismarine/JSPrismarine/commit/a825e5478baccfc586fc3acd3fd5d8d9fc17a02d), [`985c08e`](https://github.com/JSPrismarine/JSPrismarine/commit/985c08e1f93cbb557a8ce8be02fb2e0a04587f31), [`609b543`](https://github.com/JSPrismarine/JSPrismarine/commit/609b543617f8731ab597322cf5a6132e4d4ca519), [`582536f`](https://github.com/JSPrismarine/JSPrismarine/commit/582536f53c4ed407b065155dc6dce7f5f48982d8), [`97fde37`](https://github.com/JSPrismarine/JSPrismarine/commit/97fde374f2812e33f4b6a71bbbcf268b78963700), [`03e6df9`](https://github.com/JSPrismarine/JSPrismarine/commit/03e6df9845bc83a24309e667bb10a7bcd17c2d88), [`d29e1d4`](https://github.com/JSPrismarine/JSPrismarine/commit/d29e1d4ef750af20698531f32a3e36040312d3a9), [`c1f0bc3`](https://github.com/JSPrismarine/JSPrismarine/commit/c1f0bc3fe5abfffa6c43d9cc44a407e4e25fd10a), [`cd8645c`](https://github.com/JSPrismarine/JSPrismarine/commit/cd8645c9b8bfcb48162a0c9f99a5d4c7449ea613), [`f94da48`](https://github.com/JSPrismarine/JSPrismarine/commit/f94da4841180543ba50be440c4bc796a8a472fcb), [`701c6e7`](https://github.com/JSPrismarine/JSPrismarine/commit/701c6e7e83b91ae2eaa8aa2bbadbf049c6ef75cf), [`6237d25`](https://github.com/JSPrismarine/JSPrismarine/commit/6237d2570ef950f83dcc0111de283340ff35aca3), [`1d905e2`](https://github.com/JSPrismarine/JSPrismarine/commit/1d905e27de007bc64a3f8c4f3c87c46955573e2a), [`c132c90`](https://github.com/JSPrismarine/JSPrismarine/commit/c132c9073992d5a0e8a7f9203298ec8711b0d585), [`b503085`](https://github.com/JSPrismarine/JSPrismarine/commit/b503085d2c068c27dbb4087e00e3e1a12a42e384), [`67546be`](https://github.com/JSPrismarine/JSPrismarine/commit/67546bec49a4f299b2be9b54b10a7d42865884a9), [`542da3b`](https://github.com/JSPrismarine/JSPrismarine/commit/542da3b62a4895905847cd14c0952a97d254d472), [`8196ea9`](https://github.com/JSPrismarine/JSPrismarine/commit/8196ea9e576d0acc3e17fe6b159791e25dc1092e), [`62df686`](https://github.com/JSPrismarine/JSPrismarine/commit/62df68684596605007aef673182fc0b5d61d1a1f), [`2bea6ac`](https://github.com/JSPrismarine/JSPrismarine/commit/2bea6ac82e3a0a100ee254c7e536df73262bef9f), [`c67300a`](https://github.com/JSPrismarine/JSPrismarine/commit/c67300a6cef6ec68daa9f720bc31c7f238874e01), [`0d53afd`](https://github.com/JSPrismarine/JSPrismarine/commit/0d53afdc4b0f42260231d56bbdeb2b4874f8bae7), [`d647e47`](https://github.com/JSPrismarine/JSPrismarine/commit/d647e4746b3533fbc61afac8414b749a253a32c1), [`7b70cc7`](https://github.com/JSPrismarine/JSPrismarine/commit/7b70cc76fb8f1584746b76ee406ad48811d5d6a2), [`68cef3f`](https://github.com/JSPrismarine/JSPrismarine/commit/68cef3f794575714fef335397e8d6e21aa7ae512), [`7562d04`](https://github.com/JSPrismarine/JSPrismarine/commit/7562d044dae9cefb977dc5f24a9a82c7121d8365), [`c5ae5e6`](https://github.com/JSPrismarine/JSPrismarine/commit/c5ae5e6e2e231751c82840c05dbc34435ccd7304), [`1e9ada2`](https://github.com/JSPrismarine/JSPrismarine/commit/1e9ada27d7fd15b209521870328a5257440ee4a7), [`cd3077c`](https://github.com/JSPrismarine/JSPrismarine/commit/cd3077c55d5ee9984512f8e34660e7aae5b55680), [`321a017`](https://github.com/JSPrismarine/JSPrismarine/commit/321a0170b36a2946fa3d06fe5924336222275de2), [`4355293`](https://github.com/JSPrismarine/JSPrismarine/commit/4355293f75d669659511516448b9c600900c351b), [`fee1601`](https://github.com/JSPrismarine/JSPrismarine/commit/fee1601bb697b8ba9625b0d10e292d66f33d3391), [`da1793e`](https://github.com/JSPrismarine/JSPrismarine/commit/da1793e286c051351c49dfb1e35b002a6e787bce), [`a0c479e`](https://github.com/JSPrismarine/JSPrismarine/commit/a0c479e0ab28de8ba46bac842ddc90a50d9e679f), [`d490871`](https://github.com/JSPrismarine/JSPrismarine/commit/d49087199730fb9eac7d8ee1976ad36df8475394), [`b98742b`](https://github.com/JSPrismarine/JSPrismarine/commit/b98742b80037c69e51cf6059bff2b45147e6a53e), [`f4ec478`](https://github.com/JSPrismarine/JSPrismarine/commit/f4ec4787eb307bbeefe5d51034f43b0728088c55), [`68febb8`](https://github.com/JSPrismarine/JSPrismarine/commit/68febb838436b90836c311f7cc435676dff5a438), [`0626058`](https://github.com/JSPrismarine/JSPrismarine/commit/06260585d51d8ce0668b7cf854663bb1aea9aee9), [`2fcd89f`](https://github.com/JSPrismarine/JSPrismarine/commit/2fcd89f8ff551915692aedca68cd556735432590), [`91fcf8b`](https://github.com/JSPrismarine/JSPrismarine/commit/91fcf8b9a7c4334c8fab86bc4fae2b94356351d5), [`015a810`](https://github.com/JSPrismarine/JSPrismarine/commit/015a8102014c24f224797dec0b1919d3a045e1c3), [`29aa940`](https://github.com/JSPrismarine/JSPrismarine/commit/29aa940e8ddc1db5bf37b213179adad8e3eb21a5), [`78694d1`](https://github.com/JSPrismarine/JSPrismarine/commit/78694d1577b8bc994963b5eb53d712858ee363df), [`908645b`](https://github.com/JSPrismarine/JSPrismarine/commit/908645b1f8ea87a6e511dbe25675f39760b41627), [`c32bfed`](https://github.com/JSPrismarine/JSPrismarine/commit/c32bfededb57b65bab45897dda54e0fa621d0ff1), [`d42e7c3`](https://github.com/JSPrismarine/JSPrismarine/commit/d42e7c33d23361c5b159078ae6635a230ff70701), [`33c3920`](https://github.com/JSPrismarine/JSPrismarine/commit/33c39204cf625a581b63f3f133bfc68f7adb6510), [`5121b88`](https://github.com/JSPrismarine/JSPrismarine/commit/5121b88dab4fbfd3c6f14476ef2ae0014a710086), [`738a665`](https://github.com/JSPrismarine/JSPrismarine/commit/738a66555ddfad7912d7b6c61f28e78a575996cc), [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a), [`5445a16`](https://github.com/JSPrismarine/JSPrismarine/commit/5445a16a437bddc8726e71d4ae135d5286e351bb), [`0e7d345`](https://github.com/JSPrismarine/JSPrismarine/commit/0e7d345611f49a463d03f3762f3006f5cab2aaf6), [`259282c`](https://github.com/JSPrismarine/JSPrismarine/commit/259282cf8da2397f26bea2bea8816eb6e4ec91d4), [`949785e`](https://github.com/JSPrismarine/JSPrismarine/commit/949785e4be1ae2ffd834354fefe993990d5000d6), [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247), [`a1c9fe5`](https://github.com/JSPrismarine/JSPrismarine/commit/a1c9fe587b5d6eb19a990c16766962c49f9614fe), [`d304979`](https://github.com/JSPrismarine/JSPrismarine/commit/d3049792f9f15adc6936c8049c56a913732ce036), [`9258ef1`](https://github.com/JSPrismarine/JSPrismarine/commit/9258ef152ef8c0802eefc2cad93e1f8ddb950f46), [`13147a3`](https://github.com/JSPrismarine/JSPrismarine/commit/13147a33e36e0f0a00fc5935b9b7f4862e8d686d), [`3c86e27`](https://github.com/JSPrismarine/JSPrismarine/commit/3c86e279350e4b8dd7c67c6ab84e9ab5b617faea), [`e3fbb5f`](https://github.com/JSPrismarine/JSPrismarine/commit/e3fbb5f7f4db31c80f4d07a51065fc3b28a726c6), [`1b08aed`](https://github.com/JSPrismarine/JSPrismarine/commit/1b08aed5a46a79b19ee36c0cc644c958663d3c4b), [`aedac18`](https://github.com/JSPrismarine/JSPrismarine/commit/aedac183fbdabb86c1140c67feab3cf21b8f0ce9), [`163c611`](https://github.com/JSPrismarine/JSPrismarine/commit/163c611a935d954736c43f98aad3bf7ffa875917), [`d06d825`](https://github.com/JSPrismarine/JSPrismarine/commit/d06d8258b8a875f15fbf4ae7b5a249377639742c), [`7ddfa43`](https://github.com/JSPrismarine/JSPrismarine/commit/7ddfa4319dcf42685218014950ad48dafbacc051), [`de16ae0`](https://github.com/JSPrismarine/JSPrismarine/commit/de16ae07c1f0167885a280a1fc91030b9fbfe0cf), [`9e53c61`](https://github.com/JSPrismarine/JSPrismarine/commit/9e53c61399266bf9e26dd87160c45ccd251a21f8), [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c), [`03e7f72`](https://github.com/JSPrismarine/JSPrismarine/commit/03e7f729a0fd42a8c6cb42582914f646b4a6762d), [`5a1ab40`](https://github.com/JSPrismarine/JSPrismarine/commit/5a1ab4010008ca1065cc934efb11701831d2c8ac), [`bed113d`](https://github.com/JSPrismarine/JSPrismarine/commit/bed113d91a2de02b80d5688c3f43eadf802271c4), [`2e24f49`](https://github.com/JSPrismarine/JSPrismarine/commit/2e24f499570960f91e53c0388e6ea00a7f662116), [`2291a0d`](https://github.com/JSPrismarine/JSPrismarine/commit/2291a0d0ce40d73af8eb09cf0e46cfa2ab79db5c)]:
  - @jsprismarine/entities@0.16.0
  - @jsprismarine/packs@0.16.0
  - @jsprismarine/predicates@0.16.0
