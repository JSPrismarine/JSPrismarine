# @jsprismarine/items

## 0.24.0

### Patch Changes

- [`6365a56`](https://github.com/JSPrismarine/JSPrismarine/commit/6365a5628a161352be1466954f0fba67ebb555b9) Thanks [@filiphsps](https://github.com/filiphsps)! - Cook in a smoker or blast furnace twice as fast as in a furnace, as Java 26.3 does: Java gives those recipes a furnace's cooking time and divides it by the burning fuel's speed multiplier, which the new `speedMultiplierOf` reads. A burn time now truncates its integer division as Java's does, so a dried kelp block burns 2000 ticks in a smoker rather than 2001.

- [#3500](https://github.com/JSPrismarine/JSPrismarine/pull/3500) [`905abae`](https://github.com/JSPrismarine/JSPrismarine/commit/905abaebe028a49444dbfd35dbf794fad9b2dc22) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve a raised shield before the hurt grace period, as Java's `LivingEntity.hurtServer` does, so an axe blow inside the grace window still disables the shield. Let an arrow with Piercing past the shield, and send the shield's cooldown to the player's client when an axe disables it. `@jsprismarine/items` exports `cooldownCategoryOf`, the Bedrock cooldown category of an item.
- Updated dependencies [[`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a), [`1f3b347`](https://github.com/JSPrismarine/JSPrismarine/commit/1f3b347d94e934767993eb3506a412b01d334a0b), [`3c19f11`](https://github.com/JSPrismarine/JSPrismarine/commit/3c19f11b712b228563d7af7fc5f6df6995726fe3), [`f4eb592`](https://github.com/JSPrismarine/JSPrismarine/commit/f4eb5921862accbb5e07749c38bd1c63495587a0), [`a19ba96`](https://github.com/JSPrismarine/JSPrismarine/commit/a19ba968ae53bd5c34c9515227a9d08ff7c69e33), [`a64ab41`](https://github.com/JSPrismarine/JSPrismarine/commit/a64ab41bf639ffb0144117810600a4abf306a850), [`05f03f7`](https://github.com/JSPrismarine/JSPrismarine/commit/05f03f78e186000a5e76cc34894a61a384ca5333), [`02d9cb6`](https://github.com/JSPrismarine/JSPrismarine/commit/02d9cb69d53cf22a406dd86e95f08b2bbc48eb5c), [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5), [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a), [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa), [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca), [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4)]:
  - @jsprismarine/errors@0.24.0
  - @jsprismarine/content@0.24.0

## 0.23.2

### Patch Changes

- Updated dependencies [[`5f48cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/5f48cd10e4ca5b53ef19ebd214b70b1de18acca9)]:
  - @jsprismarine/errors@0.23.2
  - @jsprismarine/content@0.23.2

## 0.23.1

### Patch Changes

- [#3481](https://github.com/JSPrismarine/JSPrismarine/pull/3481) [`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f) Thanks [@filiphsps](https://github.com/filiphsps)! - Export the types the public API already uses, so a consumer can name what a function takes or returns. Each package's entry point now exports the interfaces, type aliases and classes its exported signatures reference, and `@jsprismarine/prismarine` and `@jsprismarine/script-host` publish the modules that define them.
  
  `@jsprismarine/protocol` exports five wire types under new names, because the packet API already uses the plain names for other types: `ActorLinkFields`, `AbilityLayerFields`, `SerializedAbilitiesDataFields`, `GameRuleFields` and `UUIDValue`.
- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/errors@0.23.1
  - @jsprismarine/content@0.23.1

## 0.23.0

### Minor Changes

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Every error the packages throw is now defined in `@jsprismarine/errors`, with a stable code, a `docs` link to its entry in the new error reference at https://jsprismarine.dev/errors/, and the values its message was built from. Each error still extends the class it did, such as `TypeError` or `CorruptionError`, and keeps its message, with three exceptions: `getGametypeName` now names the game mode it refused, the NetherNet signaling server answers a bad join path with `Expected /v1/join/<networkId>`, since braces mark a value in a catalog message, and `SnbtSyntaxError` no longer carries an `offset`.
  
  The error classes a package used to export now come from its catalog in `@jsprismarine/errors`. Import `CorruptionError`, `DatabaseLockedError` and `UnsupportedVersionError` from `@jsprismarine/errors/leveldb`, `LoginRefused` from `@jsprismarine/errors/auth`, `ZipError`, `FilterParseError`, `JsonParseError` and `BrarchiveError` from `@jsprismarine/errors/packs`, and so on for `KernelError`, `ContentError`, `BlockError`, `StructureFormatError`, `SelectorSyntaxError`, `MolangSyntaxError`, `NumberProviderError`, `NativeLibraryError`, `NetherNetUnavailableError`, `UdpPortsError`, `JoinRefusedError`, `UsageError` and `ChunkReadOutOfWindowError`. `LoginRefused` keeps its `detail`, now read from its cause. `@jsprismarine/errors` drops its `Error` class, the `ErrorKind` enum and its six error classes; `getGametypeName` and `getGametypeId` throw `MinecraftErrors.GametypeInvalid`, and `PermissionManager.setOp` throws `PrismarineServerErrors.PlayerNotFound`. `NBTStreamReader.readLength` and `expectInput` take the error class to throw instead of a message, and `fail` in `@jsprismarine/features` takes the error to throw.

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [#3259](https://github.com/JSPrismarine/JSPrismarine/pull/3259) [`357c93f`](https://github.com/JSPrismarine/JSPrismarine/commit/357c93f46d12599b79670adc65a401d7c4397a45) Thanks [@filiphsps](https://github.com/filiphsps)! - Regenerate the tables that read the default Bedrock data against Bedrock Dedicated Server 1.26.60.6 and `bedrock-samples` v1.26.60.5: the item type table, the goal inventory, the Bedrock command table and the structure state transforms.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`9b2a5ef`](https://github.com/JSPrismarine/JSPrismarine/commit/9b2a5ef7f5a5167e1913a71799272042b01cf449) Thanks [@filiphsps](https://github.com/filiphsps)! - The generated item type table moved under the release directory, `src/tables/<release>/itemTypes.json`. `generate:item-types` takes `--java <release>` and reads the item table of the Bedrock protocol `sources.json` pairs with it. The package's exports are unchanged and read the default release's table.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`aa1f193`](https://github.com/JSPrismarine/JSPrismarine/commit/aa1f1937e483ac4faa17bec8065e05c0a05806eb) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the `components/unhandledJavaTypes` module, the reviewed list of Java data component types the item component catalog has no component for. A test checks it against the pinned Java registry report.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0
  - @jsprismarine/content@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/content@0.22.0

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6
- Updated dependencies [[`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c)]:
  - @jsprismarine/content@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/content@0.20.0

## 0.19.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/content@0.19.2

## 0.19.1

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/content@0.19.1

## 0.19.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/content@0.19.0

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5)]:
  - @jsprismarine/content@0.18.0

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`09d523c`](https://github.com/JSPrismarine/JSPrismarine/commit/09d523c5fbd04af60800bee5ad2b12f2a7619e02) Thanks [@filiphsps](https://github.com/filiphsps)! - Load large startup tables from JSON assets.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`3934d28`](https://github.com/JSPrismarine/JSPrismarine/commit/3934d281e96f022a0d57c95d8de99794ed6dd244) Thanks [@filiphsps](https://github.com/filiphsps)! - Reduce allocations while resolving blocks and content types.
- Updated dependencies [[`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d), [`3934d28`](https://github.com/JSPrismarine/JSPrismarine/commit/3934d281e96f022a0d57c95d8de99794ed6dd244)]:
  - @jsprismarine/content@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`440e164`](https://github.com/JSPrismarine/JSPrismarine/commit/440e164b88f43548c9c4fe8ae896387157f21701) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose merged Java datapack tag memberships on resolved block and item types.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d5dc760`](https://github.com/JSPrismarine/JSPrismarine/commit/d5dc760107a1dbc9c5ba9eb5fc9fb544d725c02d) Thanks [@filiphsps](https://github.com/filiphsps)! - Project explicit Bedrock item display names into item registry component data.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c140ef6`](https://github.com/JSPrismarine/JSPrismarine/commit/c140ef6e3072eb97c7a8b123876ea08726ed9910) Thanks [@filiphsps](https://github.com/filiphsps)! - Use scalar Bedrock item components when projecting item registry properties.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b3a2a6f`](https://github.com/JSPrismarine/JSPrismarine/commit/b3a2a6f2d8baca370c541439257bfb4dc4786902) Thanks [@filiphsps](https://github.com/filiphsps)! - Preserve Bedrock item components and tags

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2c459cd`](https://github.com/JSPrismarine/JSPrismarine/commit/2c459cd2ab8822f0364c1ce8e473cf0487b294a8) Thanks [@filiphsps](https://github.com/filiphsps)! - Project Java tool rules to Bedrock digger data

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2d20fee`](https://github.com/JSPrismarine/JSPrismarine/commit/2d20fee23b5fd58cf78dfa12b266f074dab110b8) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose Bedrock tag queries on item stacks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bbda9ea`](https://github.com/JSPrismarine/JSPrismarine/commit/bbda9ea5c0ed57fe60e93c25d6131234a7e8e049) Thanks [@filiphsps](https://github.com/filiphsps)! - New package: the item definition and component runtime. It implements all 122 of Java 26.3's item
  data component types as parsed components for `@jsprismarine/content`, with the value shapes checked
  against Mojang's own per-item reports, and evaluates the `context_int_provider` trees 26.3 moved
  fuel, compost and brewing numbers behind. `ItemStack` is Java's model, a type reference plus a
  component patch over the type's defaults, with the `!component` removal marker representable and
  stacking decided by the patch rather than by NBT comparison. A committed table maps the 1658 Java
  items onto 1605 of Bedrock's 1606 item identifiers, each carrying its Java-sourced components, with
  the 53 items that lose a row listed in a reviewed exception list the generator checks.
  `projectItemToBedrock` turns a type into the component compound `ItemRegistryPacket` carries, shaped
  against a Bedrock Dedicated Server capture, and `flattenItemFacts` precomputes stack size, damage,
  food, tool and burn time into typed arrays. The seven `ItemCustomComponent` hook names are declared
  for the behavior families that come next.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f198a15`](https://github.com/JSPrismarine/JSPrismarine/commit/f198a156a8c307c941efd01a4bd4604eba0f5626) Thanks [@filiphsps](https://github.com/filiphsps)! - Send Bedrock item tag memberships and declared icon textures in the item registry component data.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b96ce93`](https://github.com/JSPrismarine/JSPrismarine/commit/b96ce93238f3efd66c709f213cd8d5d42fc8f425) Thanks [@filiphsps](https://github.com/filiphsps)! - Spawn eggs now work on targeted entities, and matching eggs create babies for entity data that enables `minecraft:spawn_egg_interaction`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ef39583`](https://github.com/JSPrismarine/JSPrismarine/commit/ef395830d28b1b242b20a7246c8bb6ec781f5f4c) Thanks [@filiphsps](https://github.com/filiphsps)! - Project Bedrock block placer components

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cd01052`](https://github.com/JSPrismarine/JSPrismarine/commit/cd01052548178421cd323b316d77d87374cee9dc) Thanks [@filiphsps](https://github.com/filiphsps)! - Project Java repair materials into Bedrock item components
- Updated dependencies [[`d4a2a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/d4a2a0b2787e171583e6db0aec1b750e8aeb1e95), [`d220519`](https://github.com/JSPrismarine/JSPrismarine/commit/d220519e2e460148a90cbde9d643033e27bf8f5e), [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c)]:
  - @jsprismarine/content@0.16.0
