# @jsprismarine/structures

## 0.24.0

### Patch Changes

- Updated dependencies [[`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a), [`1f3b347`](https://github.com/JSPrismarine/JSPrismarine/commit/1f3b347d94e934767993eb3506a412b01d334a0b), [`3c19f11`](https://github.com/JSPrismarine/JSPrismarine/commit/3c19f11b712b228563d7af7fc5f6df6995726fe3), [`f4eb592`](https://github.com/JSPrismarine/JSPrismarine/commit/f4eb5921862accbb5e07749c38bd1c63495587a0), [`a19ba96`](https://github.com/JSPrismarine/JSPrismarine/commit/a19ba968ae53bd5c34c9515227a9d08ff7c69e33), [`a64ab41`](https://github.com/JSPrismarine/JSPrismarine/commit/a64ab41bf639ffb0144117810600a4abf306a850), [`05f03f7`](https://github.com/JSPrismarine/JSPrismarine/commit/05f03f78e186000a5e76cc34894a61a384ca5333), [`02d9cb6`](https://github.com/JSPrismarine/JSPrismarine/commit/02d9cb69d53cf22a406dd86e95f08b2bbc48eb5c), [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5), [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a), [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa), [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca), [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4), [`e515b52`](https://github.com/JSPrismarine/JSPrismarine/commit/e515b52206a0e9ce6223c860ab6bcb0da6483643)]:
  - @jsprismarine/errors@0.24.0
  - @jsprismarine/mapping@0.24.0
  - @jsprismarine/binaryutils@0.24.0
  - @jsprismarine/nbt@0.24.0

## 0.23.2

### Patch Changes

- Updated dependencies [[`5f48cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/5f48cd10e4ca5b53ef19ebd214b70b1de18acca9)]:
  - @jsprismarine/errors@0.23.2
  - @jsprismarine/binaryutils@0.23.2
  - @jsprismarine/mapping@0.23.2
  - @jsprismarine/nbt@0.23.2

## 0.23.1

### Patch Changes

- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/errors@0.23.1
  - @jsprismarine/mapping@0.23.1
  - @jsprismarine/binaryutils@0.23.1
  - @jsprismarine/nbt@0.23.1

## 0.23.0

### Minor Changes

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Every error the packages throw is now defined in `@jsprismarine/errors`, with a stable code, a `docs` link to its entry in the new error reference at https://jsprismarine.dev/errors/, and the values its message was built from. Each error still extends the class it did, such as `TypeError` or `CorruptionError`, and keeps its message, with three exceptions: `getGametypeName` now names the game mode it refused, the NetherNet signaling server answers a bad join path with `Expected /v1/join/<networkId>`, since braces mark a value in a catalog message, and `SnbtSyntaxError` no longer carries an `offset`.
  
  The error classes a package used to export now come from its catalog in `@jsprismarine/errors`. Import `CorruptionError`, `DatabaseLockedError` and `UnsupportedVersionError` from `@jsprismarine/errors/leveldb`, `LoginRefused` from `@jsprismarine/errors/auth`, `ZipError`, `FilterParseError`, `JsonParseError` and `BrarchiveError` from `@jsprismarine/errors/packs`, and so on for `KernelError`, `ContentError`, `BlockError`, `StructureFormatError`, `SelectorSyntaxError`, `MolangSyntaxError`, `NumberProviderError`, `NativeLibraryError`, `NetherNetUnavailableError`, `UdpPortsError`, `JoinRefusedError`, `UsageError` and `ChunkReadOutOfWindowError`. `LoginRefused` keeps its `detail`, now read from its cause. `@jsprismarine/errors` drops its `Error` class, the `ErrorKind` enum and its six error classes; `getGametypeName` and `getGametypeId` throw `MinecraftErrors.GametypeInvalid`, and `PermissionManager.setOp` throws `PrismarineServerErrors.PlayerNotFound`. `NBTStreamReader.readLength` and `expectInput` take the error class to throw instead of a message, and `fail` in `@jsprismarine/features` takes the error to throw.

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [#3259](https://github.com/JSPrismarine/JSPrismarine/pull/3259) [`357c93f`](https://github.com/JSPrismarine/JSPrismarine/commit/357c93f46d12599b79670adc65a401d7c4397a45) Thanks [@filiphsps](https://github.com/filiphsps)! - Regenerate the tables that read the default Bedrock data against Bedrock Dedicated Server 1.26.60.6 and `bedrock-samples` v1.26.60.5: the item type table, the goal inventory, the Bedrock command table and the structure state transforms.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`20432bf`](https://github.com/JSPrismarine/JSPrismarine/commit/20432bf597e33a857d55edbd293344136346956b) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the `unhandledJavaTypes` module, the reviewed lists of Java registry types the package has no handler for. A test checks them against the pinned Java registry report.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`0afbafd`](https://github.com/JSPrismarine/JSPrismarine/commit/0afbafda42c8517746dcf4ee50ac3de13fe950f9), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`2dd8ff2`](https://github.com/JSPrismarine/JSPrismarine/commit/2dd8ff2fda5afab035cae34e1542c73443cfeb3b), [`2d461cb`](https://github.com/JSPrismarine/JSPrismarine/commit/2d461cbe0f493a6482b19ba298df277fb95cf4bb), [`4d92994`](https://github.com/JSPrismarine/JSPrismarine/commit/4d929943617a9cd77d55fb8b2cdd6343665152b4), [`c1f1339`](https://github.com/JSPrismarine/JSPrismarine/commit/c1f1339aea746b7a86016ba68739517049d8967e), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0
  - @jsprismarine/binaryutils@0.23.0
  - @jsprismarine/nbt@0.23.0
  - @jsprismarine/mapping@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [[`546c624`](https://github.com/JSPrismarine/JSPrismarine/commit/546c624aaeeefec693909b9e3413819d3bb45f9f)]:
  - @jsprismarine/mapping@0.22.0
  - @jsprismarine/binaryutils@0.22.0
  - @jsprismarine/nbt@0.22.0

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6
- Updated dependencies [[`3d07749`](https://github.com/JSPrismarine/JSPrismarine/commit/3d07749f87f00a669397d4720ca6fb28fbe92545), [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c), [`778fb37`](https://github.com/JSPrismarine/JSPrismarine/commit/778fb37670bb087a056e33802ebeef39b1eccc2f)]:
  - @jsprismarine/binaryutils@0.21.0
  - @jsprismarine/mapping@0.21.0
  - @jsprismarine/nbt@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`f030c63`](https://github.com/JSPrismarine/JSPrismarine/commit/f030c63e5c6269288d8dc576bddde160eda3cc74)]:
  - @jsprismarine/binaryutils@0.20.0
  - @jsprismarine/nbt@0.20.0
  - @jsprismarine/mapping@0.20.0

## 0.19.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/binaryutils@0.19.2
  - @jsprismarine/mapping@0.19.2
  - @jsprismarine/nbt@0.19.2

## 0.19.1

### Patch Changes

- Updated dependencies [[`5129bc5`](https://github.com/JSPrismarine/JSPrismarine/commit/5129bc5166f8a781bd3f928e24b687744cdbd8c9)]:
  - @jsprismarine/mapping@0.19.1
  - @jsprismarine/binaryutils@0.19.1
  - @jsprismarine/nbt@0.19.1

## 0.19.0

### Patch Changes

- Updated dependencies [[`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e)]:
  - @jsprismarine/nbt@0.19.0
  - @jsprismarine/mapping@0.19.0
  - @jsprismarine/binaryutils@0.19.0

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5)]:
  - @jsprismarine/binaryutils@0.18.0
  - @jsprismarine/mapping@0.18.0
  - @jsprismarine/nbt@0.18.0

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`be9d70e`](https://github.com/JSPrismarine/JSPrismarine/commit/be9d70ecdf777806b80868294cf09c53538b9811) Thanks [@filiphsps](https://github.com/filiphsps)! - Cache rotated jigsaw transforms and weighted pools

- [#2664](https://github.com/JSPrismarine/JSPrismarine/pull/2664) [`d731b85`](https://github.com/JSPrismarine/JSPrismarine/commit/d731b85039c2c6ebcc1a5c187813ea06def716ff) Thanks [@filiphsps](https://github.com/filiphsps)! - Turn the block states structure processors introduce with the template they land in. Java turns a template's states after its processors run, so a jigsaw block's `final_state` and a rule's `output_state` face the way the building faces; this server turns the template first, so those states were placed as written and every village house got an east-facing doorstep stair and a pen gate set into the wrong wall. `ProcessorContext` now carries the placement, the jigsaw replacement and rule processors turn the states they name by it, and both template placement paths pass it.
- Updated dependencies [[`d499106`](https://github.com/JSPrismarine/JSPrismarine/commit/d49910658d7aa57fedfe32512977f79aa0023832), [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d)]:
  - @jsprismarine/binaryutils@0.17.0
  - @jsprismarine/nbt@0.17.0
  - @jsprismarine/mapping@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0bc486e`](https://github.com/JSPrismarine/JSPrismarine/commit/0bc486e90372d7ae43425da17c71275a097e9722) Thanks [@filiphsps](https://github.com/filiphsps)! - Generate Java Edition's structures. Nothing generated before: the world generator read none of
  the three registries a structure is built from, and `@jsprismarine/structures` was imported
  nowhere in the server. It now loads `worldgen/structure`, `worldgen/structure_set` and
  `worldgen/template_pool` alongside the eleven registries it already read, decides which chunks a
  structure starts in from the 21 structure sets, lays the structure out against the bare noise
  terrain, and writes its pieces into every chunk it covers. 50 of Java's 52 structures generate;
  the end city and the nether fortress are the two left, and neither has a dimension to generate
  in. [docs/data-driven/structures.md](../docs/data-driven/structures.md) is the inventory.
  
  29 structures ask for terrain adaptation through `terrain_adaptation`, and the field was not
  read at all, so a village landed on whatever the noise happened to make. Java's beardifier
  density function now runs from the structure starts before a chunk's terrain is sampled.
  
  The decoration pass runs Java's own loop: each step's structures, then that step's features,
  sharing one index counter. A step's features are therefore seeded from the structure count
  onward, which is what Java does and what this did not.
  
  `@jsprismarine/structures`' jigsaw assembler changed to match Java's placer. It draws the
  rotation before the start element rather than after, sits a `terrain_matching` element on the
  terrain through the new `JigsawSources.terrainHeight`, settles a projected start onto the
  surface through `JigsawConfig.projectStartToHeightmap`, reserves vertical room under
  `JigsawConfig.useExpansionHack`, and reports the generation point as `JigsawAssembly.origin`. A
  pool element's `processors` may now be an inline list as well as an identifier, which is how
  1439 of the 2287 vanilla pool elements write it. The same seed and pools no longer produce the
  same layout as before, because the draw order and the ground level delta both changed.
  
  `@jsprismarine/bedrock-data` gained `extract:structures`, which lifts the 1511 `.nbt` templates
  out of the pinned server jar into `node_modules/.cache/jsprismarine/java-structures/<version>/`;
  `datagen:java` now runs it too. Reading them from the jar instead meant inflating all 17655 of
  its entries inside the first chunk that placed one.
  
  The generator's hand-written Bedrock biome id table is gone. The ids come from
  `@jsprismarine/mapping`'s generated registry table instead, so they regenerate with the pinned
  version rather than drifting. `BEDROCK_BIOME_IDS` is no longer exported.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`146cd6e`](https://github.com/JSPrismarine/JSPrismarine/commit/146cd6e7d8918f1330b954ff0e00044144655ddb) Thanks [@filiphsps](https://github.com/filiphsps)! - Give a generated structure the block entities and the mobs Java's data declares. Across the
  generation corpus's seven decorated chunks the generator produced one block entity and no entity
  spawns at all, including in the trial chambers chunk. Three faults stacked up.
  
  The jigsaw assembler rejected every connection that pointed back into its own piece. Java gives
  such a connection a free space built from the parent piece's own box, with the parent not cut out
  of it, so a child may overlap the piece it hangs inside; the assembler checked each candidate
  against every placed piece instead. A trial chamber hangs its spawners, its vaults, its dispensers
  and its pots off exactly those connections, so it grew none of them. At seed 1234 the chunk at
  3,-14 goes from 30 pieces to 251.
  
  A template's entity list was never read. That list is how a village gets its villagers, its cats
  and its iron golem, an igloo its two villagers and a bastion its piglins; across the 1511 templates
  Mojang ships it names 288 mobs, and none of them existed. `TemplatePiece` now records them at the
  fractional position they were saved at, with the yaw turned and reflected the way Java turns it.
  `StructureWriter.spawnEntity` takes the entity's own position rather than the block's, so a mob
  saved between blocks stays there.
  
  The Java to Bedrock block entity id table had six rows: chest, trapped chest, barrel, bee nest,
  spawner and end gateway. Everything else was dropped on the floor, which is 422 of the 1124 block
  entities the templates declare. It now covers the whole of Java 26.3's `block_entity_type`
  registry, and a vault's loot table is read out of the `config` compound Java keeps it in rather
  than only from the top level. Over the structure starts within 24 chunks of three seeds' origins,
  108 block entity placements of which 85 survived became 1199 of which all 1199 survive.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c27bc3c`](https://github.com/JSPrismarine/JSPrismarine/commit/c27bc3cdecae4ffd63dcf68af7e1c6d1d17c2b91) Thanks [@filiphsps](https://github.com/filiphsps)! - Check a structure's biome before assembling it, the way Java does.
  
  Over a 102 by 102 chunk area at seed 1234, 319 of 356 candidate starts were fully assembled and
  then discarded by the biome check at their generation point. That check ran after the builder, so
  a village rejected for being in the wrong biome still cost a whole jigsaw expansion.
  
  Java rejects first. `Structure.generate` calls `findValidGenerationPoint`, which filters
  `findGenerationPoint`'s `GenerationStub` on the biome at the stub's position, and the stub carries
  an unrun `Consumer<StructurePiecesBuilder>`; the pieces are built on the line after the filter.
  
  A `StructureLayout` is now that stub: a generation point, and a call that assembles. The structures
  package gains `startJigsaw`, which places a jigsaw structure's start piece and hands back the
  generation point with the breadth-first expansion deferred; `assembleJigsaw` is it with the
  expansion run straight away, so every existing caller is unchanged. `jigsawBlocksOf` is memoized
  per template, because the expansion rescans the same few templates once per parent jigsaw, per
  candidate element and per rotation.
  
  No structure moves. Over that area the 37 kept starts are identical in structure, set, chunk, step,
  terrain adaptation, generation point, bounding box and piece count, and the generation golden corpus
  is unchanged. Candidate layout fell from 20.8 ms to 4.3 ms per chunk, with 47 assemblies where there
  were 356.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`6a91053`](https://github.com/JSPrismarine/JSPrismarine/commit/6a910532df85e7109d7a90c85f4e7cdc161e20bf) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/structures`, the structure template layer. It reads both template formats Mojang
  ships (Java's gzip big-endian `.nbt`, under either palette key spelling, and Bedrock's little-endian
  `.mcstructure` with its two block layers), translates a Java palette into Bedrock states through
  `@jsprismarine/mapping` with every loss reported rather than dropped, and places a template under a
  rotation and a mirror. The direction-valued state rules are not written by hand: a dumper compiled
  against the pinned Java 26.3 server jar records what `BlockState.rotate` and `BlockState.mirror`
  return for all 35723 Java states, and the generated table is keyed by Bedrock state, which catches
  asymmetries such as `StairBlock.mirror` swapping a corner shape under one mirror axis and not the
  other. It also implements the eleven structure processor types with their ten rule tests, three
  position tests and four block entity modifiers; jigsaw assembly over template pools with weights,
  joint types, depth limits and bounding-box rejection; and the three structure set placement types
  with the four frequency reduction methods, over a `java.util.Random` reproduction tested against the
  JDK. A gated corpus test reads all 1511 Java templates (100% of 1170664 blocks translate cleanly)
  and all 1311 Bedrock Dedicated Server templates (97.70% of 1137782, the rest naming 47
  pre-flattening identifiers).
- Updated dependencies [[`428fd29`](https://github.com/JSPrismarine/JSPrismarine/commit/428fd2953c93ea8472696575798735a4a36ec51b), [`232a1ce`](https://github.com/JSPrismarine/JSPrismarine/commit/232a1ce20b5ade2e33b703300fb671f0c3f62076), [`cde1039`](https://github.com/JSPrismarine/JSPrismarine/commit/cde1039d276df8d3787b361e072fafdb32a6da9a), [`f8a43ce`](https://github.com/JSPrismarine/JSPrismarine/commit/f8a43ce910da3d8e1c88091c8886a7c1d09ab0c0), [`f370405`](https://github.com/JSPrismarine/JSPrismarine/commit/f37040563ed0cac590fe971ef3a448cb2e01a581), [`c1591b1`](https://github.com/JSPrismarine/JSPrismarine/commit/c1591b1e567a51dc80ecbbdfdbdc8e7c7f4f6c42), [`c9cafc8`](https://github.com/JSPrismarine/JSPrismarine/commit/c9cafc8529e05fe90ea2812920feb76cbcaf4a1b), [`8518afc`](https://github.com/JSPrismarine/JSPrismarine/commit/8518afc7b9ee684ebe4255ce26e7b56d612a145a), [`08de1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/08de1bac21f3c5785a02649e4faa11d9a11f82b0), [`ef12ef8`](https://github.com/JSPrismarine/JSPrismarine/commit/ef12ef8dee0fb445a80811306d20c44aabeb237d), [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a), [`32ce6f2`](https://github.com/JSPrismarine/JSPrismarine/commit/32ce6f2f752e7e89c4445d1936e13a6e243a3a30), [`9e53c61`](https://github.com/JSPrismarine/JSPrismarine/commit/9e53c61399266bf9e26dd87160c45ccd251a21f8)]:
  - @jsprismarine/mapping@0.16.0
  - @jsprismarine/nbt@0.16.0
  - @jsprismarine/binaryutils@0.16.0
