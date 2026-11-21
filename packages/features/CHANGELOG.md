# @jsprismarine/features

## 0.23.1

### Patch Changes

- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e), [`6afe243`](https://github.com/JSPrismarine/JSPrismarine/commit/6afe2434c34f74ce16494876b4722365b416388f)]:
  - @jsprismarine/errors@0.23.1
  - @jsprismarine/worldgen@0.23.1

## 0.23.0

### Minor Changes

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Every error the packages throw is now defined in `@jsprismarine/errors`, with a stable code, a `docs` link to its entry in the new error reference at https://jsprismarine.dev/errors/, and the values its message was built from. Each error still extends the class it did, such as `TypeError` or `CorruptionError`, and keeps its message, with three exceptions: `getGametypeName` now names the game mode it refused, the NetherNet signaling server answers a bad join path with `Expected /v1/join/<networkId>`, since braces mark a value in a catalog message, and `SnbtSyntaxError` no longer carries an `offset`.
  
  The error classes a package used to export now come from its catalog in `@jsprismarine/errors`. Import `CorruptionError`, `DatabaseLockedError` and `UnsupportedVersionError` from `@jsprismarine/errors/leveldb`, `LoginRefused` from `@jsprismarine/errors/auth`, `ZipError`, `FilterParseError`, `JsonParseError` and `BrarchiveError` from `@jsprismarine/errors/packs`, and so on for `KernelError`, `ContentError`, `BlockError`, `StructureFormatError`, `SelectorSyntaxError`, `MolangSyntaxError`, `NumberProviderError`, `NativeLibraryError`, `NetherNetUnavailableError`, `UdpPortsError`, `JoinRefusedError`, `UsageError` and `ChunkReadOutOfWindowError`. `LoginRefused` keeps its `detail`, now read from its cause. `@jsprismarine/errors` drops its `Error` class, the `ErrorKind` enum and its six error classes; `getGametypeName` and `getGametypeId` throw `MinecraftErrors.GametypeInvalid`, and `PermissionManager.setOp` throws `PrismarineServerErrors.PlayerNotFound`. `NBTStreamReader.readLength` and `expectInput` take the error class to throw instead of a message, and `fail` in `@jsprismarine/features` takes the error to throw.

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`1a1f7f2`](https://github.com/JSPrismarine/JSPrismarine/commit/1a1f7f2d9272a3b73dc61fe0d3d79feade306650) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/features` reads two Java 26.4 types: the `large_speleothem` feature, which builds `large_dripstone`'s cones out of the `base_block` it names, and the `below_heightmap` block predicate. 26.4's `crevasse` feature type is not read yet.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`9b75d40`](https://github.com/JSPrismarine/JSPrismarine/commit/9b75d4022d8e73fa450dd179e5ef686279e846b1) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the `unhandledJavaTypes` module, the reviewed lists of Java registry types the package has no reader for. A test checks them against the pinned Java registry report.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`bd06d38`](https://github.com/JSPrismarine/JSPrismarine/commit/bd06d385bf9cfa9de40703ef4a7ca218253a3f23), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`f8843ce`](https://github.com/JSPrismarine/JSPrismarine/commit/f8843ce726b96032631a15efbc2dea76e743b68a), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`9878bb1`](https://github.com/JSPrismarine/JSPrismarine/commit/9878bb1b6fa05000787138b077db166e2f17f47e), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1), [`823a321`](https://github.com/JSPrismarine/JSPrismarine/commit/823a32166248e10f8be45f45e9cf9f8ef17861de), [`8e72453`](https://github.com/JSPrismarine/JSPrismarine/commit/8e7245335a09057151d7e1af70398fa32d1a93c5), [`2682079`](https://github.com/JSPrismarine/JSPrismarine/commit/26820792b905fd8b0da34e3058c9e64ae4c14be4)]:
  - @jsprismarine/errors@0.23.0
  - @jsprismarine/worldgen@0.23.0

## 0.22.0

### Patch Changes

- [#3084](https://github.com/JSPrismarine/JSPrismarine/pull/3084) [`c705cbd`](https://github.com/JSPrismarine/JSPrismarine/commit/c705cbd1671f7298795c5b7543f89631cbe67003) Thanks [@filiphsps](https://github.com/filiphsps)! - Add an optional `FeatureWorld.scheduleFluidTick`, Java's `WorldGenLevel.scheduleTick` for a fluid. A spring asks for a tick at the fluid it opens, and a geode asks for one at each fluid beside its crack, as their Java features do, so a world that schedules the tick starts the stream instead of leaving the fluid standing.

- [#3084](https://github.com/JSPrismarine/JSPrismarine/pull/3084) [`4e53fa1`](https://github.com/JSPrismarine/JSPrismarine/commit/4e53fa191a5c5977ebbc340ada37af1c821ef6bf) Thanks [@filiphsps](https://github.com/filiphsps)! - Mark the positions Java 26.3 marks for post-processing when world generation places soul sand, a magma block or a small mushroom, and every face a multiface growth places. Soul sand and a magma block mark the block above them, so the water standing there gets its tick when the chunk loads. `FeatureWorld.setBlock` takes an optional `{ postProcess: false }`, which the ore feature passes because Java writes ore past the region, and `FeatureWorld.markForPostProcessing` is a new optional hook.
- Updated dependencies [[`729cc48`](https://github.com/JSPrismarine/JSPrismarine/commit/729cc4858e11042f4c80a99615996a5b02417c04), [`246333d`](https://github.com/JSPrismarine/JSPrismarine/commit/246333d2e667c3ba8c2b0e7e414d7963b8a32508), [`0076fcd`](https://github.com/JSPrismarine/JSPrismarine/commit/0076fcd84bfc65a9ff2d75f993528fa9236f1779), [`7282f36`](https://github.com/JSPrismarine/JSPrismarine/commit/7282f36c8b1342316f54e6985655e570ba991e9a)]:
  - @jsprismarine/worldgen@0.22.0

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6
- Updated dependencies [[`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c)]:
  - @jsprismarine/worldgen@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/worldgen@0.20.0

## 0.19.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/worldgen@0.19.2

## 0.19.1

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/worldgen@0.19.1

## 0.19.0

### Patch Changes

- [`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Point the Discord link in each package README at the project's current invite.
- Updated dependencies [[`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e)]:
  - @jsprismarine/worldgen@0.19.0

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5), [`13dd1a1`](https://github.com/JSPrismarine/JSPrismarine/commit/13dd1a15e5e2c7db2ee5072db28a0b327a8a5e26), [`8d90227`](https://github.com/JSPrismarine/JSPrismarine/commit/8d90227f749c3b016bf066b770adc6ce15814c6d)]:
  - @jsprismarine/worldgen@0.18.0

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`d049765`](https://github.com/JSPrismarine/JSPrismarine/commit/d04976541aee27f8e3fc198e703173e56740b515) Thanks [@filiphsps](https://github.com/filiphsps)! - Add serializable random states and a versioned replay initial-state manifest.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`e5c9812`](https://github.com/JSPrismarine/JSPrismarine/commit/e5c98121aac113c02f7684752b26e228a86c57b8) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace hot random BigInt math with exact number-lane operations.
- Updated dependencies [[`9bbe11b`](https://github.com/JSPrismarine/JSPrismarine/commit/9bbe11b9563745852c71506dc22c911fde0114fa), [`f1a2771`](https://github.com/JSPrismarine/JSPrismarine/commit/f1a2771104f57bbe927d330b4b162bc3673edc9d), [`ab7daa1`](https://github.com/JSPrismarine/JSPrismarine/commit/ab7daa106d8c35b07cf64e5c8166f361644b8360), [`52e899b`](https://github.com/JSPrismarine/JSPrismarine/commit/52e899b729f1b77452d638107628764771303093), [`318a038`](https://github.com/JSPrismarine/JSPrismarine/commit/318a0386c1322b77799192cd90d1c1c44a13b5b4), [`8bdc3d4`](https://github.com/JSPrismarine/JSPrismarine/commit/8bdc3d447250cfa6589155c5a7ebfdd6a9d3ab6e), [`4196b67`](https://github.com/JSPrismarine/JSPrismarine/commit/4196b676e0d0b35e1c81e85e48fa74176dbba17b), [`0a8ae9a`](https://github.com/JSPrismarine/JSPrismarine/commit/0a8ae9a0c378e3b5e59366d52cb52a898d647d9a), [`9406146`](https://github.com/JSPrismarine/JSPrismarine/commit/94061468716fef624e21ca3b76fb18938a979f7c), [`b1ebfe6`](https://github.com/JSPrismarine/JSPrismarine/commit/b1ebfe6071afaeaf5b6795ec215a75b92753b1fb), [`98dea94`](https://github.com/JSPrismarine/JSPrismarine/commit/98dea94c94ce084f2cbce6170d826a808a63384a), [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d), [`99a59f0`](https://github.com/JSPrismarine/JSPrismarine/commit/99a59f0604675678339b39b764a56267413b9687), [`05d61f9`](https://github.com/JSPrismarine/JSPrismarine/commit/05d61f9c6cb7000d1b81908ca94dc1af7bd8fec8), [`3000120`](https://github.com/JSPrismarine/JSPrismarine/commit/3000120a653848f2fc8596d7cdccb55d8f21f064), [`d049765`](https://github.com/JSPrismarine/JSPrismarine/commit/d04976541aee27f8e3fc198e703173e56740b515), [`e5c9812`](https://github.com/JSPrismarine/JSPrismarine/commit/e5c98121aac113c02f7684752b26e228a86c57b8), [`ffa08fb`](https://github.com/JSPrismarine/JSPrismarine/commit/ffa08fb0ebcaff9b5edbc68fcbc4cb2632fc8f18), [`c6b0b49`](https://github.com/JSPrismarine/JSPrismarine/commit/c6b0b49e4b59e03b9b7dd0366f280ff7832c77b2)]:
  - @jsprismarine/worldgen@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2bc83d4`](https://github.com/JSPrismarine/JSPrismarine/commit/2bc83d4e6b2cca1e29a091753300862fa84006ab) Thanks [@filiphsps](https://github.com/filiphsps)! - Give a template a feature placed its block entities, and keep the processors a feature writes
  inline, so a desert well's suspicious sand holds the loot a brush turns up. Two misses on the
  same path. `placeJavaTemplate` wrote the template's blocks and never asked for the block entities
  saved on them, so every compound a feature-placed template carried was dropped. The feature
  parser kept a `processors` field only when it was a string, so a feature writing its rules where
  it stands had them thrown away. Java's processor list codec takes an identifier, a bare list or
  an object holding one, and `TemplateRequest.processors` now carries whichever arrived.
  
  The desert well is where both land. In a generated world at seed 1234, its four nearest wells, in
  chunks -691,-239, -687,-18, -649,-130 and -647,-38, each placed two suspicious sand and no block
  entity at all. Each now places the same two sand, carrying
  `loot_tables/archaeology/desert_well.json`.
  
  Java 26.3 places a template nine times across its 240 feature documents: two `minecraft:fossil`
  features that name their processor lists by identifier, and seven `minecraft:template` features
  nested inside the desert well and the sulfur spring, which is why neither shows up as a feature
  document of that type. Two of the seven carry processors, both written inline, and both are the
  desert well's archaeology rule. That rule and the three trail ruins processor lists are the only
  four `append_loot` in the game data.
  
  `append_loot` adds the loot table to the compound it is handed, and the template source keeps
  each decoded template for the life of the world, so a chain run over a template's own compounds
  would bake one placement's table into every later placement of it. The placement copies the
  compounds it hands to the chain, and indexes each copy under the Java block the original sat in,
  which is where a banner keeps its color.
  
  The desert pyramid still leaves its corridor suspicious sand out, for a different reason than the
  one recorded beside it. The seam carries a brushable block entity and `archaeology/desert_pyramid`
  is in the loot data. The positions are what is missing: they live in Java's `DesertPyramidPiece`
  rather than in data, and the pyramid's interior here is a reconstruction.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`a8b30b9`](https://github.com/JSPrismarine/JSPrismarine/commit/a8b30b91030d5b8f9b4ab1c5f3f89acf9978424f) Thanks [@filiphsps](https://github.com/filiphsps)! - Derive the End's ten spike pillars from the world seed when the `end_spike` configuration lists none, as vanilla's `"spikes": []` asks. `FeatureWorld.spawnEntity` now takes an options object carrying the yaw and the crystal's beam target, base plate and invulnerability instead of a bare yaw, which is a breaking signature change for worlds that implement it; the generator's region adapter records the yaw as before.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9f5dcbe`](https://github.com/JSPrismarine/JSPrismarine/commit/9f5dcbeff3a03f2061efb3d6179def3ef176c62b) Thanks [@filiphsps](https://github.com/filiphsps)! - Decorate a chunk with the features that belong in it.
  
  `DataDrivenGenerator` ran every placed feature of every overworld biome in every chunk and let
  nothing filter them, which is why trees grew on ice spikes and a single chunk could hold seven
  species of log. Four fixes, each measured against Java Edition's 26.3 server jar:
  
  - The `minecraft:biome` placement modifier now gets the `featureBelongsToBiome` callback it has
    always asked for, so a position is rejected unless the biome there lists the feature being
    placed. This is Java's `BiomeFilter`.
  - A step's candidate features are the union of what the biomes of the surrounding 3 by 3 chunks
    list, not of every biome in the dimension. Java reads the same nine chunks' biome palettes in
    `ChunkGenerator.applyBiomeDecoration`.
  - Feature indices no longer start at the step's structure count. In the jar the structure counter
    and `globalIndexOfFeature` both restart at zero within a step and are allowed to overlap, so the
    offset was shifting every feature seed away from vanilla.
  - `sortFeaturesPerStep`, new in `@jsprismarine/features`, replaces the first-seen feature order
    with Java's `FeatureSorter`: a depth-first topological sort over every biome's ordering, giving
    one list per step that every biome agrees with. That index is the other half of the feature seed.
  
  Measured over four chunks each deep inside plains, desert, taiga and ice spikes at seed 1234:
  feature invocations per chunk fell from 171 everywhere to between 48 and 59, and decoration block
  writes from 8256 to 9610 per chunk down to 3461 to 5120. The ice spikes chunk went from 38 logs
  and 268 leaves to none, and the desert chunk from 274 logs and 1538 leaves to none. The taiga
  chunk keeps its spruce.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`485ac0b`](https://github.com/JSPrismarine/JSPrismarine/commit/485ac0b0b901a9495c733dc668ff53b4061e03c0) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/features`, Java Edition's decoration pass. It implements all 58 feature types
  Java 26.3 registers, the ten block state providers, the eight int, four float and six height
  providers, the sixteen block predicates, the ten rule tests, the ten trunk placers, twelve foliage
  placers, eleven tree decorators, one root placer and two feature sizes, and all eighteen placement
  modifiers. The placement pipeline reproduces Java's depth-first traversal, which decides the order
  of the random draws, and `decorateChunk` derives the per-chunk population seed and reseeds before
  each feature from its index and decoration step, so the same seed and chunk place the same blocks
  and a feature that draws extra numbers does not move the next one. Features write Java block
  states through one `FeatureWorld` interface, with a separate `BlockOracle` for the facts that do
  not depend on position and a `translatingWorld` adapter where a server attaches
  `@jsprismarine/mapping`; `TestFeatureWorld` is a typed in-memory double with computed heightmaps.
  The seeding, every provider and the shared biome-info noise are compared exactly against values
  dumped from the pinned 26.3 server jar, and a gated corpus test reads all 240 configured and 273
  placed features with zero errors, reporting 47 feature types used at the top level and 15
  placement modifiers. 26.3 removed `random_patch` in favor of `projected_random_patchy_square` and
  renamed the dripstone features to `speleothem` and `speleothem_cluster`, so a loader written
  against 1.21 data does not read this corpus.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e648da4`](https://github.com/JSPrismarine/JSPrismarine/commit/e648da4bbd2bfa55fe80d603e7c8e9f0fea39dfc) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry a structure template's saved block entity into the generated chunk, so the contents
  translation reaches a world. The translation covers 149 of the 1124 block entities Java 26.3's
  templates declare and nothing called it: the generation path read the type, the loot table and the
  spawner's mob off the saved compound and dropped the rest, so a generated decorated pot had no
  sherds and a generated vault had no key.
  
  `BlockEntityRequest` gains `saved` and `javaBlock`. `saved` is typed `unknown` because
  `@jsprismarine/features` models no NBT and depends on no library that does, and the server narrows
  it before reading it. `javaBlock` is the Java block the block entity sat in, which is the one thing
  the saved compound does not carry: Java keeps a banner's color in the block, Bedrock keeps it in
  the block entity and has a single banner block where Java has sixteen, so the color is
  unrecoverable once the translation drops the Java palette.
  
  The template store indexes the Java block of each saved compound as it reads a template, keyed on
  the compound itself. That works because the compounds travel by reference: `translateJavaTemplate`,
  `transformTemplate` and `applyProcessors` each carry `nbt` through untouched, and the one processor
  that writes to a block entity, a rule's `append_loot` modifier, adds to the compound it was handed
  rather than replacing it.
  
  In a generated world at seed 1234, across the 25 chunks around the trial chamber at chunk 3,-14,
  all 16 decorated pots carry their four sherds, all 13 vaults carry their reward table and their
  key, and the one dispenser carries its water bucket. The 13 trial spawners there still carry
  nothing. That is the listed loss: every trial spawner in the templates writes its configuration as
  a reference into Java's own registry, and nothing is wired to resolve one.
  
  A vault no longer gets a top-level `LootTable`. Reading one level down into `config` for it was how
  its reward reached a chunk before the contents translation existed. Bedrock's vault reads
  `config.loot_table`, which the translation now writes, and a vault is not a container, so
  `fillContainerLoot` never rolled the top-level copy either.
  
  One worldgen corpus digest moves, the block entities of `1234/3,-14/full`, which holds the single
  vault the 22 corpus chunks record. Blocks, biomes, heightmaps, counts, structures and entity spawns
  are unchanged, and so is the ocean ruin chest in `1234/-12,0/full`, which a data marker places with
  no saved compound behind it.
- Updated dependencies [[`b79c330`](https://github.com/JSPrismarine/JSPrismarine/commit/b79c33066896e4639b4c5a06b6739add55a3d361), [`3561178`](https://github.com/JSPrismarine/JSPrismarine/commit/3561178664c8a57459f841687f80e6c4be9c2661), [`5794f0b`](https://github.com/JSPrismarine/JSPrismarine/commit/5794f0bccdc0cc2123b46b71af342ece984e774a), [`ef7ed80`](https://github.com/JSPrismarine/JSPrismarine/commit/ef7ed800b96bf9fa0807cf745af1289b627c5770), [`62e14d2`](https://github.com/JSPrismarine/JSPrismarine/commit/62e14d2bf3c19d77897733a422885cdffdf13334), [`86444b4`](https://github.com/JSPrismarine/JSPrismarine/commit/86444b41bb7281acbd0e556ad9421fe913321af0), [`f060520`](https://github.com/JSPrismarine/JSPrismarine/commit/f060520321901b222197f2c65e75d5771c47cdfe), [`0f9d3c1`](https://github.com/JSPrismarine/JSPrismarine/commit/0f9d3c18e72967d0f4d1ba40221a1076bf24ac42), [`258e9d9`](https://github.com/JSPrismarine/JSPrismarine/commit/258e9d915c9d067a86f576ae64f07b992b7c4485), [`4cf5c25`](https://github.com/JSPrismarine/JSPrismarine/commit/4cf5c25c105f4d7dbea3d1d877d67cce48006234), [`7efae53`](https://github.com/JSPrismarine/JSPrismarine/commit/7efae5385415852da187f6b3ec1c010592b00d98), [`bd6780f`](https://github.com/JSPrismarine/JSPrismarine/commit/bd6780f89c73c69635adb9785a997f3103145fb1), [`2515674`](https://github.com/JSPrismarine/JSPrismarine/commit/2515674ce840cad4dd80739d4042228c5e6172c4), [`bd65536`](https://github.com/JSPrismarine/JSPrismarine/commit/bd65536e966bab81bbf9af147a0bf5440890cdae), [`c29803c`](https://github.com/JSPrismarine/JSPrismarine/commit/c29803c5f9f502263fa51fe8c29d41a846048019)]:
  - @jsprismarine/worldgen@0.16.0
