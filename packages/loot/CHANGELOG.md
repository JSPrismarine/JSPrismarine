# @jsprismarine/loot

## 0.26.0

### Patch Changes

- [#3709](https://github.com/JSPrismarine/JSPrismarine/pull/3709) [`ec53015`](https://github.com/JSPrismarine/JSPrismarine/commit/ec53015a6a6466cc10c65f7ce3df31238b49ac7b) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies

- [#3688](https://github.com/JSPrismarine/JSPrismarine/pull/3688) [`8612a62`](https://github.com/JSPrismarine/JSPrismarine/commit/8612a624714205d633c17fb9dc8cd12cfca922f3) Thanks [@filiphsps](https://github.com/filiphsps)! - Explorer maps get a destination. `LevelView` gains `nearestStructure` and `newMapId`, and an `exploration_map` modifier with no `structures` locator or `mapIds` allocator of its own now uses them, searching from the roll's `origin`. The `mapIds` option receives the roll's context. The server answers both from the world the roll happens in: the search is the one `/locate structure` runs, and map ids come from a counter each level saves. With `skip_existing_chunks`, Java's default, a search passes over a structure an earlier explorer map found, so each map points at a different one; the level saves which structures are taken. Shipwreck and ocean ruin chests, abandoned camp chests and cartographer trades now give a map with a `minecraft:map_id` that points at a structure, instead of dropping the map.

- [#3695](https://github.com/JSPrismarine/JSPrismarine/pull/3695) [`6b879ba`](https://github.com/JSPrismarine/JSPrismarine/commit/6b879ba04da81bbc81e3d9652c70c8699d91130f) Thanks [@filiphsps](https://github.com/filiphsps)! - Explorer maps show their marker on a Bedrock client. `LevelView.newMapId` now receives the map to make (a `NewMap`: a position it covers, its zoom and its decorations), which `exploration_map` passes when it falls back to the level. `ItemDrop` gains `mapId`. The mapping gives each of the 16 Java structure locator maps its Bedrock aux value (`EXPLORER_MAP_DATA`), so a buried treasure map is a Treasure Map. `@jsprismarine/protocol` exports `ClientboundMapItemDataPacket`. The server saves each map a level makes (center, scale, dimension and markers, placed as Java's `MapItemSavedData` places them) under the LevelDB key `jsprismarine:maps`, and the structures explorer maps point at under `jsprismarine:structure_references`, both as NBT lists that a provider's `LevelRecords` carry as `maps` and `referencedStructures`; it carries the id on the stack as `map_uuid` in its NBT and its client user data, keeps two maps with different ids in separate slots, and answers `MapInfoRequest` with the map's markers and Java's biome preview. Cartographer trades offer the Bedrock filled map with its id. With `skip_existing_chunks`, a search also passes over the structure it starts in, as Java 26.3's `claimStructureAt` does.

- [#3680](https://github.com/JSPrismarine/JSPrismarine/pull/3680) [`6d89071`](https://github.com/JSPrismarine/JSPrismarine/commit/6d89071895723672f4ecc0bbf86e3bbf3d06cb3a) Thanks [@filiphsps](https://github.com/filiphsps)! - A datapack's `slot_source/` files load into a new `slotSources` registry, and a loot reference or a `#slot_source` tag resolves them, as it does an item modifier.
- Updated dependencies [[`ab601c6`](https://github.com/JSPrismarine/JSPrismarine/commit/ab601c6924c6f6fa754434e4225e93461fcef1f5), [`ec53015`](https://github.com/JSPrismarine/JSPrismarine/commit/ec53015a6a6466cc10c65f7ce3df31238b49ac7b), [`8612a62`](https://github.com/JSPrismarine/JSPrismarine/commit/8612a624714205d633c17fb9dc8cd12cfca922f3), [`6b879ba`](https://github.com/JSPrismarine/JSPrismarine/commit/6b879ba04da81bbc81e3d9652c70c8699d91130f)]:
  - @jsprismarine/predicates@0.26.0
  - @jsprismarine/errors@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [[`dda9dbe`](https://github.com/JSPrismarine/JSPrismarine/commit/dda9dbe5ebfdcdc338e37bf24ae8fe561c9308bb), [`2132959`](https://github.com/JSPrismarine/JSPrismarine/commit/2132959244601c90055b091a4273a008eadf0f3d), [`d4adb53`](https://github.com/JSPrismarine/JSPrismarine/commit/d4adb5381a368d2076a0648ce2522c12cf72ab48), [`27c272f`](https://github.com/JSPrismarine/JSPrismarine/commit/27c272f90af03738b7fd9778e2bddea955fe9cb6), [`d1e9714`](https://github.com/JSPrismarine/JSPrismarine/commit/d1e97142dcfdab12f895719eca9bcbee78346c9a), [`47aad59`](https://github.com/JSPrismarine/JSPrismarine/commit/47aad598440fd81e5177c60ffeb49972ce697960), [`fc513cf`](https://github.com/JSPrismarine/JSPrismarine/commit/fc513cf74a16caf6f9da30f3323b094c519d1043), [`253f214`](https://github.com/JSPrismarine/JSPrismarine/commit/253f214c096cad79e6f53cd8a88a828b262af315), [`c053dfc`](https://github.com/JSPrismarine/JSPrismarine/commit/c053dfcdd32006386469c31b8448cdfa33b9333f), [`239659a`](https://github.com/JSPrismarine/JSPrismarine/commit/239659a6927aa7f2b713ad994fe92fab0f2cece9), [`fea2fcd`](https://github.com/JSPrismarine/JSPrismarine/commit/fea2fcd1d4424bf4c766ba996e9eb0ceb742310a), [`055b1ca`](https://github.com/JSPrismarine/JSPrismarine/commit/055b1ca984f47515b42af6109ea88a7ec7b4d451), [`f76f4f2`](https://github.com/JSPrismarine/JSPrismarine/commit/f76f4f25eb0449327fcc06b46797588a0b6879ff), [`c6fc056`](https://github.com/JSPrismarine/JSPrismarine/commit/c6fc056233588d453bcb33febae92189ecfc8b4b)]:
  - @jsprismarine/errors@0.25.0
  - @jsprismarine/predicates@0.25.0

## 0.24.0

### Patch Changes

- [#3534](https://github.com/JSPrismarine/JSPrismarine/pull/3534) [`404527b`](https://github.com/JSPrismarine/JSPrismarine/commit/404527b2a1b053b91e6cf8ed45447e49089f3ee9) Thanks [@filiphsps](https://github.com/filiphsps)! - Villagers and wandering traders draw their offers from Java's `trade_set` and `villager_trade` registries, as Java's `Villager.updateTrades` and `VillagerTrade.getOffer` do, so the offers, prices, uses, experience and price multipliers are Java's. `@jsprismarine/trading` adds `@jsprismarine/trading/javaTrades` and lets a `Merchant` take any `OfferSource` in place of a Bedrock table. `LootRegistry` gains `itemModifier`, `predicate` and `context`, which compile and run Java grammar that lives outside a loot table.
- Updated dependencies [[`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a), [`1f3b347`](https://github.com/JSPrismarine/JSPrismarine/commit/1f3b347d94e934767993eb3506a412b01d334a0b), [`3c19f11`](https://github.com/JSPrismarine/JSPrismarine/commit/3c19f11b712b228563d7af7fc5f6df6995726fe3), [`70ee4ea`](https://github.com/JSPrismarine/JSPrismarine/commit/70ee4eae4e88857c368ca2ca9c298cb8491c7b72), [`f4eb592`](https://github.com/JSPrismarine/JSPrismarine/commit/f4eb5921862accbb5e07749c38bd1c63495587a0), [`a19ba96`](https://github.com/JSPrismarine/JSPrismarine/commit/a19ba968ae53bd5c34c9515227a9d08ff7c69e33), [`a64ab41`](https://github.com/JSPrismarine/JSPrismarine/commit/a64ab41bf639ffb0144117810600a4abf306a850), [`05f03f7`](https://github.com/JSPrismarine/JSPrismarine/commit/05f03f78e186000a5e76cc34894a61a384ca5333), [`02d9cb6`](https://github.com/JSPrismarine/JSPrismarine/commit/02d9cb69d53cf22a406dd86e95f08b2bbc48eb5c), [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5), [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a), [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa), [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca), [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4)]:
  - @jsprismarine/errors@0.24.0
  - @jsprismarine/predicates@0.24.0

## 0.23.2

### Patch Changes

- Updated dependencies [[`5f48cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/5f48cd10e4ca5b53ef19ebd214b70b1de18acca9)]:
  - @jsprismarine/errors@0.23.2
  - @jsprismarine/predicates@0.23.2

## 0.23.1

### Patch Changes

- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/errors@0.23.1
  - @jsprismarine/predicates@0.23.1

## 0.23.0

### Minor Changes

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Errors carry a stable code and a link to their entry in the error reference at https://jsprismarine.dev/errors/, from their catalog in `@jsprismarine/errors`. Messages are unchanged.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`5a27097`](https://github.com/JSPrismarine/JSPrismarine/commit/5a270975f29ae102a87372460138fad60e7c8a1a) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the `unhandledJavaTypes` module, the reviewed list of Java loot pool entry types the package has no handler for. A test checks it against the pinned Java registry report.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`d1ad4e7`](https://github.com/JSPrismarine/JSPrismarine/commit/d1ad4e793e464ea4dc828c2c5467f6a4f4450802), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0
  - @jsprismarine/predicates@0.23.0

## 0.22.0

### Patch Changes

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`dd0e6fc`](https://github.com/JSPrismarine/JSPrismarine/commit/dd0e6fc0b4db5e573f74eb7924e0202710153e67) Thanks [@filiphsps](https://github.com/filiphsps)! - Evaluate Bedrock's `has_variant` and `has_mark_variant` loot conditions against the entity a table is rolled for, and apply `set_data`. A bowl used on a mooshroom now gives mushroom stew, or suspicious stew carrying the effect of the flower a brown mooshroom ate.
- Updated dependencies []:
  - @jsprismarine/predicates@0.22.0

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6
- Updated dependencies [[`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c)]:
  - @jsprismarine/predicates@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/predicates@0.20.0

## 0.19.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/predicates@0.19.2

## 0.19.1

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/predicates@0.19.1

## 0.19.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/predicates@0.19.0

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5)]:
  - @jsprismarine/predicates@0.18.0

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`d049765`](https://github.com/JSPrismarine/JSPrismarine/commit/d04976541aee27f8e3fc198e703173e56740b515) Thanks [@filiphsps](https://github.com/filiphsps)! - Add serializable random states and a versioned replay initial-state manifest.
- Updated dependencies [[`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d), [`d049765`](https://github.com/JSPrismarine/JSPrismarine/commit/d04976541aee27f8e3fc198e703173e56740b515)]:
  - @jsprismarine/predicates@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`13dfa33`](https://github.com/JSPrismarine/JSPrismarine/commit/13dfa33ec7dc3602ce8c35d8f87067b172da3f26) Thanks [@filiphsps](https://github.com/filiphsps)! - Make a loot table map carry the dialect it is written in, so the two editions cannot be swapped.
  
  A datapack's tables and a behavior pack's tables are both `ReadonlyMap<string, unknown>`, and the
  dialect was a separate option stated beside the map. Nothing checked the two agreed, and one caller
  had them wrong: the Bedrock map went into a field named `lootTablesJava`, with a `dialect:
  'bedrock'` written six lines away as the only thing keeping it right. `LootTableSource` pairs the
  map with its dialect, built by `javaLootTables` or `bedrockLootTables` and by nothing else;
  `LootPackDefinitions.lootTablesJava` becomes `lootTables`, which takes a source, and
  `LootRegistryOptions.dialect` is gone. The old line is now a compile error rather than a silent
  behavior change. `LootRegistry` gains `dialect` and `findings`, the diagnostics with each
  attributed to the table it came from.
  
  The Bedrock dialect reads four more things it was reporting as errors: the untyped `{ "min": 2,
  "max": 4 }` range, which is Java's uniform provider with the type left off; an item entry's `count`,
  where Bedrock states what Java states with `set_count`, producing nothing when the count rolls zero;
  a `loot_table` entry naming its target without the `.json`, which vanilla writes both ways; and a
  pool written `{}`, which `armor_stand.json` and `boat.json` use to mean a table that produces
  nothing on purpose.
  
  What is left is reviewed rather than counted. `BEDROCK_REVIEWED_CONDITIONS` names the twelve
  condition types that read an entity or a biome a roll here has no handle on, and
  `BEDROCK_REVIEWED_FUNCTIONS` the nineteen item functions, each saying what a result comes out as
  without it. A listed one warns, a listed condition still closes its gate, and anything unlisted is
  an error, which is the rule the unread-key report already applied. Over all 309 vanilla Bedrock
  tables that is 1484 warnings and no errors, so a strict build can refuse a pack carrying something
  new without refusing a stock server.
  
  `content-strict` reaches both registries, which the server now builds at the composition root:
  `ServerContent.equipmentLoot` holds the Bedrock one, replacing the `equipmentRegistry` lookup in
  `entity/equipment.ts`. Both are compiled whole during the content build rather than at the first
  chest, their findings reach the content report under `loot.invalid` and `loot.unapplied` with the
  pack and file named, and the startup line states what compiled and what went unapplied.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1c5b1f5`](https://github.com/JSPrismarine/JSPrismarine/commit/1c5b1f565fc01402dfafa1028455d402e12fd985) Thanks [@filiphsps](https://github.com/filiphsps)! - Report a loot key nothing reads, and read Bedrock's spelling of the grammar.
  
  A loot table is gated data, and this evaluator skipped a key it had no case for without a word. A
  gate nobody reads is a gate that passes, which is the wrong direction for loot to fail in. Handed
  `zombie_equipment.json` whole it armed 2000 zombies of 2000, because every gate in that file sits
  in a plural `conditions` array that only Bedrock writes and only Java's singular `condition` was
  read. A condition type the grammar could not compile failed the same way: it dropped out of 26.3's
  and-fold, so a field holding one unimplemented condition folded to an empty and and passed.
  
  Both now report. An unknown key is an error, because its effect is unknown; a key this package
  names and leaves alone is a warning, because its effect is not. An error raised while compiling a
  condition field closes that gate for good, at the pool and at the entry alike. The table still
  rolls what it could read, so one stray key does not empty a chest, and `strict` turns the errors
  into a `LootGrammarError` for a host that would rather refuse. Vanilla's 1447 Java tables report
  nothing at all, which is what keeps the rule honest.
  
  `dialect: 'bedrock'` then reads the spelling the behavior packs use: the plural `conditions` array
  whose members name their type in a `condition` key, the `tiers` ladder ten pools draw from, the
  `pools` an entry nests under itself, and a `loot_table` entry naming a pack-relative path. Three
  conditions are implemented, the three those tables gate on, and the other twelve report and close
  their gate. `tiers` reproduces Java's `Mob.populateArmor`. The two difficulty-scaled conditions
  read an injectable `LootDifficultyView`, defaulting to normal difficulty in a fully ramped region
  so a table's stated `max_chance` is its real chance. Java's path is untouched and stays the
  default.
  
  `prunedEquipmentTables` is gone from `@jsprismarine/prismarine`. It dropped every pool the
  evaluator could not gate, which left 13 of the 18 vanilla equipment tables with their signature
  weapon and nothing else, and zombies wearing nothing at all. The equipment registry now reads the
  tables whole in the Bedrock dialect. Measured against a built vanilla stack: a zombie arms 98 times
  in 2000 against the table's stated 0.05, wears a helmet 299 times against its stated 0.15, and all
  18 tables a `minecraft:equipment` component names roll something and compile with no error. Of the
  15 vanilla types that carry the component, the four whose only pools were gated ones go from never
  holding anything to their stated rates: the fox to 18.9 percent, the drowned to 12.6, the husk to
  19.0 and the zombie to 20.8.
  
  The one member of the Bedrock grammar still not applied is `functions`, so rolled gear arrives
  unenchanted. It reports a warning per occurrence rather than going quiet, which is the whole point
  of the first half of this change.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`57d71c3`](https://github.com/JSPrismarine/JSPrismarine/commit/57d71c36dd6b3c5dc78c712fdad70eedc99536f4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/loot`, the Java Edition loot table evaluator. It parses a table's pools, entries,
  conditions and modifiers once into closures, then rolls them in Java 26.3's order: every pool in
  turn, `rolls` plus `floor(bonus_rolls * luck)` draws each, one candidate drawn in proportion to
  `floor(weight + quality * luck)`, and each stack through the entry modifier, then the pool modifier,
  then the table modifier. All nine `loot_pool_entry_type` members are implemented, including the
  `slots` entry 26.3 added alongside the `slot_source` registry.
  
  Draws are reproducible. `random_sequence` seeding follows Java bit for bit, from the world seed
  upgraded to 128 bits and exclusive-ored with the MD5 hash of the sequence id, and `LootRegistry`
  keeps one advancing stream per id the way Java's `RandomSequences` does. Conditions and item
  modifiers come from `@jsprismarine/predicates`, and this package implements the five `ContentView`
  members that package left open: smelting results from the pack stack's recipes, nested entry rolls,
  the 16 Java dye colors, player profiles and exploration maps.
  
  `LootRegistry` loads tables from a pack stack, resolves references between them, and reports a
  reference cycle as a diagnostic rather than recursing. `mapLootToBedrock` translates a result
  through an injected lookup that `javaItemToBedrock` satisfies, reporting every reviewed loss and
  every unknown identifier instead of dropping either silently.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3a0903e`](https://github.com/JSPrismarine/JSPrismarine/commit/3a0903ec44fb7dde2149ba1b52bbbcb64656c7ed) Thanks [@filiphsps](https://github.com/filiphsps)! - Index the host's recipes once per content options object instead of once per roll.
  
  A loot context carries a content view, and the view has to close over the context it is attached to, so `LootRegistry.roll` builds a fresh one every call. Building one re-indexed every recipe the host had registered, which `furnace_smelt` is the only thing that reads. Over Java's vanilla datapack that walk costs far more than the roll it serves: 421545 draws over the 175 predictable tables took 543 s, against 1.9 s for the same draws with one context per table. Block drops, mob drops and `/loot` all roll through this path.
  
  The index is derived from the recipes and the tag expander alone, so it is now built on first use and cached against the options object that carries them, the way Java's recipe manager indexes once per reload. A host that reloads its recipes hands over the new ones in a new options object, which is what loading a pack stack produces. The same workload now takes 2.5 s, and the draws are unchanged: identical stacks in identical order from the same world seed.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1e9ada2`](https://github.com/JSPrismarine/JSPrismarine/commit/1e9ada27d7fd15b209521870328a5257440ee4a7) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the loot tables reach the player.
  
  A generated container's loot is rolled the first time it is opened. A structure writes a chest
  with a `LootTable` tag, a `LootTableSeed` and nothing in it, which is what the game writes too,
  and nothing rolled them: every chest in a village, a shipwreck, a mineshaft, a stronghold, a
  desert pyramid or a buried treasure opened empty. The fill is Java's `LootTable.fill` step for
  step over one `java.util.Random` seeded with the stored seed, so the table is rolled, the free
  slots are shuffled, the stacks of more than one are split over them, and each one is dealt off
  the back of the shuffled list. Two players in two copies of one world see the same chest. The tag
  goes with the write, so the second open shows the first open's chest rather than a second roll.
  
  `LootRegistry` answers three of its content seams out of the pack stack it already holds: the
  smelting recipes `furnace_smelt` smelts through, the item tag expansion a tagged ingredient needs,
  and the reference resolver a `set_contents` entry list parses against. It takes two more from the
  host, because neither is in a pack: the enchantment view the 25 tables carrying `enchant_randomly`
  or `enchant_with_levels` draw from, built per roll over the table's own stream so a world seed
  replays the draw, and the per-item stack limits a rolled count is clamped to. The server passes
  both. `exploration_map` stays unanswered, because it needs a structure search this server has not
  got.
  
  `furnace_smelt` reads `use_input_count` with Java's own default of true. Reading it as false cut
  every smelted drop to one, so a cow that died burning gave one cooked beef where Java gives the
  one to three its `set_count` rolled.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-defined interaction loot tables, resolve legacy Bedrock item variants, and preserve item counts and drop offsets.
- Updated dependencies [[`1e9ada2`](https://github.com/JSPrismarine/JSPrismarine/commit/1e9ada27d7fd15b209521870328a5257440ee4a7), [`d42e7c3`](https://github.com/JSPrismarine/JSPrismarine/commit/d42e7c33d23361c5b159078ae6635a230ff70701), [`33c3920`](https://github.com/JSPrismarine/JSPrismarine/commit/33c39204cf625a581b63f3f133bfc68f7adb6510), [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247)]:
  - @jsprismarine/predicates@0.16.0
