# @jsprismarine/mapping

## 0.23.0

### Minor Changes

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Errors carry a stable code and a link to their entry in the error reference at https://jsprismarine.dev/errors/, from their catalog in `@jsprismarine/errors`. Messages are unchanged.

- [#3259](https://github.com/JSPrismarine/JSPrismarine/pull/3259) [`2dd8ff2`](https://github.com/JSPrismarine/JSPrismarine/commit/2dd8ff2fda5afab035cae34e1542c73443cfeb3b) Thanks [@filiphsps](https://github.com/filiphsps)! - Map Java 26.3 onto Bedrock 1.26.60. Fire, redstone wire and chorus plants carry the connection states 1.26.60 added, read off the Java block state, so they are no longer listed as losses, and `minecraft:ice_caves` is a reviewed inverse biome loss.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`2d461cb`](https://github.com/JSPrismarine/JSPrismarine/commit/2d461cbe0f493a6482b19ba298df277fb95cf4bb) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/mapping/itemMapping` exports `createJavaItemMapping`, which builds `javaItemToBedrock`'s lookup over a given release's generated item table, so a tool can map a Java release other than the default.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`4d92994`](https://github.com/JSPrismarine/JSPrismarine/commit/4d929943617a9cd77d55fb8b2cdd6343665152b4) Thanks [@filiphsps](https://github.com/filiphsps)! - The package ships tables for the Java preview, `26.4-snapshot-10`, mapped onto Bedrock preview protocol 2259. Every block, item, entity type, biome, mob effect and potion 26.4 adds has a 2259 counterpart, so the preview adds no losses. `BedrockBiomeLoss` takes an optional `javaSince`, the first pinned Java release with a biome for it: `minecraft:ice_caves` is a loss in the 26.3 tables and mapped in the preview's. The package's exports still read the default release's tables.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`c1f1339`](https://github.com/JSPrismarine/JSPrismarine/commit/c1f1339aea746b7a86016ba68739517049d8967e) Thanks [@filiphsps](https://github.com/filiphsps)! - The generated tables moved under the release directory, `src/tables/<release>/`, beside a `pair.json` naming the Bedrock protocol they map onto. `generate:tables`, `generate:block-states` and `generate:block-properties` take `--java <release>`. The package's exports are unchanged and read the default release's tables.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`b29c5de`](https://github.com/JSPrismarine/JSPrismarine/commit/b29c5deca0848f515161b10344af46b7a2d8b430), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0
  - @jsprismarine/minecraft@0.23.0

## 0.22.0

### Patch Changes

- [#3084](https://github.com/JSPrismarine/JSPrismarine/pull/3084) [`546c624`](https://github.com/JSPrismarine/JSPrismarine/commit/546c624aaeeefec693909b9e3413819d3bb45f9f) Thanks [@filiphsps](https://github.com/filiphsps)! - `bedrockBlockStateToJava` returns one frozen result per Bedrock state instead of building a new one on every call. Fluid searches and tag checks ask about the same few states thousands of times a tick. The returned objects were already typed read-only; they are now frozen too.
- Updated dependencies []:
  - @jsprismarine/minecraft@0.22.0

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6
- Updated dependencies [[`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c)]:
  - @jsprismarine/minecraft@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`4871ae6`](https://github.com/JSPrismarine/JSPrismarine/commit/4871ae64bf290095e3af06a7d7e13206d2989d16)]:
  - @jsprismarine/minecraft@0.20.0

## 0.19.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/minecraft@0.19.2

## 0.19.1

### Patch Changes

- [#2935](https://github.com/JSPrismarine/JSPrismarine/pull/2935) [`5129bc5`](https://github.com/JSPrismarine/JSPrismarine/commit/5129bc5166f8a781bd3f928e24b687744cdbd8c9) Thanks [@filiphsps](https://github.com/filiphsps)! - A broken bed or banner now drops the item of its own color instead of the black one. Bedrock keeps their color in the block entity, so the loot lookup reads it from there: `blockEntityRecord` exposes a bed's `color` and a banner's `Base` as `dyeIndex`, `blockLootTableOf` and `rollBlockDrops` use it to pick the Java table, and `/loot mine` passes it too. `@jsprismarine/mapping` adds `bedrockBlockEntityDyeIndexOf` and `javaBlockOfBedrockDyeIndex` to convert between a Java colored block and that index.
- Updated dependencies []:
  - @jsprismarine/minecraft@0.19.1

## 0.19.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/minecraft@0.19.0

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5)]:
  - @jsprismarine/minecraft@0.18.0

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- Updated dependencies [[`183e92c`](https://github.com/JSPrismarine/JSPrismarine/commit/183e92c7f577bc34608555a13aaa88fd64f61530), [`09d523c`](https://github.com/JSPrismarine/JSPrismarine/commit/09d523c5fbd04af60800bee5ad2b12f2a7619e02), [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d)]:
  - @jsprismarine/minecraft@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`232a1ce`](https://github.com/JSPrismarine/JSPrismarine/commit/232a1ce20b5ade2e33b703300fb671f0c3f62076) Thanks [@filiphsps](https://github.com/filiphsps)! - Read a Bedrock biome and a Bedrock block state back into Java's vocabulary.
  
  The seam was one-way, and three things were stuck behind that. A chunk stores a numeric biome id,
  so `blocks.biome` and `blocks.biomeTags` on the content world adapter both refused - block
  behaviors and the spawn rules' `is_biome` and `has_biome_tag` had nothing to read. And
  `@jsprismarine/engine-systems` carries Java's redstone, fluid and piston models, so it spells a
  direction as a word where Bedrock spells it as a number, which meant a piston arm resolved to no
  palette state at all and pistons never extended.
  
  `bedrockBiomeToJava` takes the number a chunk holds, or the Bedrock identifier, and answers both
  the Bedrock biome and the Java 26.3 biome behind it. It is total over the 89 biomes the pinned
  Bedrock data lists: 62 carry a Java source, and the 27 legacy terrain biomes Java deleted in its
  1.18 rewrite are `BEDROCK_BIOME_LOSSES`, each with a reason rather than a guessed stand-in.
  
  `bedrockBlockStates` and `javaBlockStates` translate a whole state record each way. The
  correspondence is per block and cannot be worked out from a state's name: a dropper's
  `facing_direction` calls north 2 and a piston's calls it 3, a redstone torch spells north `south`,
  and a door spells it `east`. The write direction also drops the states a Bedrock block does not
  carry, which is how Java's piston `extended` disappears. 309 blocks share thirty vocabularies; the
  27 `(block, state)` pairs with no vocabulary at all are `BLOCK_STATE_LOSSES`.
  
  Both tables are generated from the pinned sources and committed, so a version bump regenerates them
  and the diff is reviewable, and both join the property tests the other domains already have.
  
  In `@jsprismarine/prismarine`, the world subsystem answers `blocks.biome` through the biome inverse
  and `blocks.biomeTags` out of the `minecraft:tags` component of the pack stack's biome definitions,
  which nothing parsed; `EngineWorld` translates every block it hands the engine and every block it
  takes back.
  
  Breaking: `worldContentGroups` takes a `content` option, the biome registry it reads the tags from.
  `registriesTable.bedrock.biome` is gone, replaced by the richer `registriesTable.bedrockBiomes`.
  
  Also fixes every piston letting light through: when the generated block property table collapses a
  Java property Bedrock does not carry, it now keeps the value of the Java state nearest the block's
  default rather than whichever came first. Java lists a boolean's `true` ahead of its `false`, so
  all twelve piston states took the extended row's `lightDampening` of 0 where Java's retracted
  piston, which is what a Bedrock piston almost always is, dampens the full 15.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9e53c61`](https://github.com/JSPrismarine/JSPrismarine/commit/9e53c61399266bf9e26dd87160c45ccd251a21f8) Thanks [@filiphsps](https://github.com/filiphsps)! - Refuse to start when a Java identifier has no Bedrock mapping and no reviewed loss.
  
  This is the rule plan section 5 gives the loader, and the reason the mapping module can promise
  totality rather than hope for it. The machinery existed and nothing ran it: `reportIdentifiers`
  and `createPackIdentifierResolver` had no caller outside their own tests, the resolver covered 5
  of the 21 registries the vanilla datapack references, and the one assertion about the vanilla
  corpus expected every identifier to resolve as `unknown`, which is the opposite of what Phase 0
  asks for.
  
  The content build now resolves every Java identifier the pack stack references. A strict build
  throws `UnmappedIdentifierError`, naming the identifier, its registry and the pack and file it
  came from. A normal build keeps going and writes one `identifier.unmapped` error per identifier,
  the way it already reports the defaults it had to invent, so the startup line that counts content
  errors counts these too.
  
  Closing the gap took three things. `@jsprismarine/packs` falls back to the loaded stack when the
  resolver has no answer, which closes a `#tag` whose tag file the stack carries and a reference
  into a registry a datapack fills, such as one loot table calling another; 359 of the vanilla
  corpus's references resolve that way and never cross to a client. It also reads an `id` field from
  the keys beside it rather than always as an item, because 26.3 spells five unrelated things `id`
  and the other four were reaching the report as missing items.
  
  `@jsprismarine/mapping` maps mob effects and potions, joined by name against the pinned
  bedrock-samples metadata, and answers the registries with no Bedrock side from a generated Java
  26.3 census: a reference into one of them resolves only when Mojang's own data publishes the
  entry, so a typo still fails the load. The nine registries the server evaluates in Java's own
  shape are listed with a reason each in `packRegistries.ts`. Five new per-entry losses cover the
  four mob effects and the one potion Bedrock has no id for, and three registry-wide rows cover
  banner patterns, goat horn instruments and painting variants, which do reach a Bedrock client but
  as a short code, a data value and a texture name that no pinned source pairs with the Java id.
  Each registry-wide row pins its entry count, so a version that adds an entry fails the property
  test instead of widening the row in silence.
  
  Against the real 26.3 datapack: 4088 referenced identifiers, 3977 mapped, 111 allow-listed, none
  left over.
  
  Breaking: `ReferencedIdentifier` carries `source`, `pack` and `path`, and a reference the stack
  closes itself now reports `known` rather than `unknown`. `MAPPED_REGISTRIES` and the
  `RegistryLoss` registry union gained `mob_effect` and `potion`, and `RegistriesTable` gained the
  two tables and their Bedrock name sets.

### Patch Changes

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`428fd29`](https://github.com/JSPrismarine/JSPrismarine/commit/428fd2953c93ea8472696575798735a4a36ec51b) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the Bedrock dimension overlay: `bedrockDimensionOverlay(javaDimensionTypeId)` and
  `javaDimensionTypeOf(bedrockName)`.
  
  Java describes a dimension in `dimension_type` JSON; the Bedrock client has three built-in
  dimensions with fixed integer ids, its own spelling of the Nether's name, and a Nether ceiling of
  128 where Java's type says 256. The new three-row table `src/tables/dimensions.json` carries, per
  Java type id, the Bedrock id, the Bedrock name, the `Generator` value `StartGame` sends, and a
  `minY` and `height` only where the client disagrees with the Java type. A type with no row is a
  custom dimension and returns `undefined`.
  
  `@jsprismarine/minecraft` moves from a development dependency to a dependency, because the
  overlay's `generatorType` is typed as its `Generator` enum.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cde1039`](https://github.com/JSPrismarine/JSPrismarine/commit/cde1039d276df8d3787b361e072fafdb32a6da9a) Thanks [@filiphsps](https://github.com/filiphsps)! - Translate what a Java block entity holds, so a block entity a structure template saved arrives
  furnished rather than named. A structure template saves the whole compound and the generator read
  three fields out of it, the loot table, the spawner's mob and the end gateway's exit, and dropped
  everything else.
  
  A census of Java 26.3's 1511 templates decided what to write and where to stop. They declare 1124
  block entities once the jigsaws and the structure blocks consumed during placement are set aside,
  and 149 of those carry contents. The translation covers all 149: 107 banners, 48 containers with
  stacks or timers, 19 comparators, 14 trial spawners, 5 signs, 5 decorated pots, 2 vaults and 2
  monster spawners. The census also said where not to go. Every one of the 128 campfires is empty and
  all their cooking timers are zero, no lectern holds a book, and the bells, skulls, ender chests and
  sculk sensors carry nothing at all.
  
  None of it is a copy. Bedrock keeps a banner's color in the block entity where Java keeps it in the
  block, and counts the sixteen dyes backwards, so a brown banner is 12 on one side and 3 on the
  other. It draws the raid banner from one `Type` field and refuses patterns beside it, which is how
  a pillager outpost banner comes out blank when both are sent. It joins a sign's four text
  components into one newline-separated string, packs the text color into one ARGB integer and calls
  the glow flag `IgnoreLighting`. It orders a decorated pot's sherds back, left, right, front where
  Java names the four faces. It takes a trial spawner's configuration inline where Java may write a
  reference, and defaults the spawn interval to 20 ticks where Java defaults it to 40.
  
  `@jsprismarine/mapping` gains the three vocabularies this needs: Bedrock's short code for each of
  Java 26.3's 43 banner patterns, checked for totality against the pinned Java census; the Bedrock dye
  index, derived from the generated item table rather than listed again; and the packed ARGB a Bedrock
  sign draws each dye in.
  
  Six fields are reviewed losses rather than omissions, listed in `BLOCK_ENTITY_CONTENT_LOSSES` and
  counted on the parity dashboard: a sign's operator-click permission and its Realms-filtered text, a
  furnace's per-recipe experience tally, a trial spawner configuration written as a registry reference
  with nothing loaded to resolve it, a banner pattern a datapack shipped, and a named potion, which
  Bedrock tells apart by a data value no pinned source publishes.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f8a43ce`](https://github.com/JSPrismarine/JSPrismarine/commit/f8a43ce910da3d8e1c88091c8886a7c1d09ab0c0) Thanks [@filiphsps](https://github.com/filiphsps)! - Drop the right items from the blocks Bedrock spells as a name where Java spells a state.
  
  `@jsprismarine/mapping` gains `bedrockBlockStateToJava` and `bedrockBlockToJava`, the inverse of
  `javaBlockStateToBedrock`, derived from the same generated table. The round trip is exact for all
  15953 Bedrock states the Java palette reaches.
  
  The server resolved a block's loot table by mapping each Java table forward through the block's
  default state, which never produced the 113 Bedrock identifiers that only a non-default state
  reaches, so all 59 double slabs, the lit furnace, smoker, blast furnace and redstone ore, the
  powered repeater and comparator, the inverted daylight detector, the unlit redstone torch and the
  berried cave vines dropped nothing at all. Resolving the block's own state back to Java reaches
  them, and carries the Java properties into the roll's `block_state`, so the tables that branch on
  it are right: a double slab yields two slabs and a grown shelf mushroom yields two mushrooms.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f370405`](https://github.com/JSPrismarine/JSPrismarine/commit/f37040563ed0cac590fe971ef3a448cb2e01a581) Thanks [@filiphsps](https://github.com/filiphsps)! - New package: the Java Edition to Bedrock Edition identifier seam. Four total lookup functions (`javaBlockStateToBedrock` over all 35723 Java 26.3 block states, `javaItemToBedrock` over 1658 items, `javaEntityTypeToBedrock` over 161 entity types, and `javaIdentifierToBedrock` for biomes and enchantments), backed by tables generated from the pinned GeyserMC/mappings join and this repository's BDS 1.26.51.1 captures, plus a reviewed loss allow list where every known loss carries a reason and a reference. Lookups return typed results and never `undefined`. Chunker's five property tests verify totality, state-set exactness, round-trip identity outside the loss list, and that every output exists in the pinned Bedrock palette.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c1591b1`](https://github.com/JSPrismarine/JSPrismarine/commit/c1591b1e567a51dc80ecbbdfdbdc8e7c7f4f6c42) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the Java data generator step the pipeline was missing. `pnpm --filter
  @jsprismarine/bedrock-data run datagen:java` re-checks the fetched server jar's sha1, runs
  Mojang's `net.minecraft.data.Main` against it, and writes the vanilla datapack to
  `node_modules/.cache/jsprismarine/vanilla-datapack/<version>/` and the data reports to
  `node_modules/.cache/jsprismarine/java-reports/<version>/generated/reports/`, the two
  directories every Java-data reader already looks in. A re-run is a no-op unless `--force` is
  passed.
  
  Nothing produced those directories before, so the data-driven overworld generator failed on
  every server start with a message naming `fetch:sources` and `dump:java`, neither of which
  writes them. Those messages now name `datagen:java`, and so does the pack stack diagnostic for
  a missing Java vanilla datapack.
  
  The mapping and item table generators read `java -version` from stdout, which is empty
  because the banner goes to stderr, so their own fallback run of the data generator always
  threw "No JDK >= 25 found". They read `java --version` now.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c9cafc8`](https://github.com/JSPrismarine/JSPrismarine/commit/c9cafc8529e05fe90ea2812920feb76cbcaf4a1b) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `bedrockBlockPropertiesOf`: the Java-sourced per-state block property table (hardness, blast
  resistance, friction, light emission and dampening, correct-tool requirement, random tick, push
  reaction, fire odds) keyed by Bedrock block state, with `BEDROCK_ONLY_BLOCKS` naming the blocks
  that have no Java source and `BLOCK_PROPERTY_CONFLICTS` listing the reviewed collapse
  disagreements.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8518afc`](https://github.com/JSPrismarine/JSPrismarine/commit/8518afc7b9ee684ebe4255ce26e7b56d612a145a) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `createPackIdentifierResolver`: the `IdentifierResolver` implementation for the
  `@jsprismarine/packs` identifier report, answered from the mapping tables. Items, blocks, entity
  types, biomes and enchantments resolve through their lookups, with `mapped` and `passthrough`
  reporting as `known` and reviewed losses as `loss`; tag references and uncovered registries report
  as `unknown`.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`08de1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/08de1bac21f3c5785a02649e4faa11d9a11f82b0) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the Bedrock capture pipeline multi-version and remove the last manual step.
  
  `sources.json` pinned exactly one Bedrock Dedicated Server, so a capture could only ever target
  one Bedrock version while `packages/minecraft` was already keyed per protocol. The `bds` entry
  now carries a `versions` map, the same shape `cloudburstData` uses, and `fetch:sources` and
  `dump:bedrock` take `--protocol <n>`. Protocol 2225 is pinned to BDS 1.26.60.6, whose sha256 was
  measured from the download and whose sha1 and byte count match Bedrock-OSS/BDS-Versions. Each
  version caches under `bds/v<protocol>/`, so two servers coexist, and only the selected one is
  downloaded, because the zips are ~95 MB each.
  
  The captures themselves move to `src/jsp/v<protocol>/`, mirroring `src/generated/v<protocol>/`.
  Generated re-export modules keep `jsp/block_definitions` and `jsp/required_item_list` resolving
  at the paths they already had, so a consumer deep-importing either is unaffected and the
  published surface only gains the versioned entries. `src/jsp/java/` stays unversioned: it tracks
  Java Edition releases, which have no Bedrock protocol version.
  
  The block palette was the one artifact a human still had to make, through two server runs with
  two hand edits between them. It is now the `palette` pass of the same job, reusing the manifest
  writer the other passes already had, so
  `pnpm --filter @jsprismarine/bedrock-data run dump:bedrock --pass palette` produces
  `snapshot/v<protocol>/block-palette.json` with no manual step. `generate-recipes.js` defaults to
  the server `fetch:sources` already unpacks instead of needing a hand-set path, keeping
  `BEDROCK_SERVER` as the escape hatch.
  
  Also fixes four readers in `@jsprismarine/mapping` that still used the pre-versioning
  `datagen/snapshot/block-palette.json`; two were tests that had been failing with ENOENT.
  
  Two unreferenced files, `src/jsp/block_id_map.json` and `src/jsp/runtime_block_states.dat`, are
  deleted. No code read either, and nothing in the pipeline regenerated them.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-driven entity dyeing through the item behavior runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`32ce6f2`](https://github.com/JSPrismarine/JSPrismarine/commit/32ce6f2f752e7e89c4445d1936e13a6e243a3a30) Thanks [@filiphsps](https://github.com/filiphsps)! - Preserve Java water states for kelp and water plants during fluid spread, and use Java's sturdy-face rule for kelp support.
- Updated dependencies [[`f5ea701`](https://github.com/JSPrismarine/JSPrismarine/commit/f5ea701bd7297d63eb524be1d4b76c07cf204569), [`91a7a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/91a7a0bfac2eac8c81961d5263e54b53dc0c3fc5), [`28b5c00`](https://github.com/JSPrismarine/JSPrismarine/commit/28b5c00af0d5377e7030e82d409b6def544619ba), [`08de1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/08de1bac21f3c5785a02649e4faa11d9a11f82b0), [`9d93172`](https://github.com/JSPrismarine/JSPrismarine/commit/9d931725e8d48fab773c2fe9f659b2f3e1d26325), [`f0584a3`](https://github.com/JSPrismarine/JSPrismarine/commit/f0584a381c6bab5c61e5aa2cd3782218bc8d74e7), [`8b1bf1b`](https://github.com/JSPrismarine/JSPrismarine/commit/8b1bf1b337e7cb9e1d8f61d8df8b42e2b2badcb6), [`23450ee`](https://github.com/JSPrismarine/JSPrismarine/commit/23450ee6e61092c05e2cebeca492c95b28e8da0d)]:
  - @jsprismarine/minecraft@0.16.0
