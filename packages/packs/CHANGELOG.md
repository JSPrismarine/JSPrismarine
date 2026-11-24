# @jsprismarine/packs

## 0.25.0

### Patch Changes

- [#3645](https://github.com/JSPrismarine/JSPrismarine/pull/3645) [`56f9c4c`](https://github.com/JSPrismarine/JSPrismarine/commit/56f9c4c28271d8a4ed3a1e223132a91f3625829a) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies

- [#3677](https://github.com/JSPrismarine/JSPrismarine/pull/3677) [`dcc1390`](https://github.com/JSPrismarine/JSPrismarine/commit/dcc1390bbec407e17107daffdf3280af232df2d9) Thanks [@filiphsps](https://github.com/filiphsps)! - The datapack loader routes Java 26.4's `dispense_behavior` and `block_sound_set` directories into the `dispenseBehaviors` and `blockSoundSets` registries, so a datapack's overrides of either load. The composed vanilla prefix cache moves to v12.
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

- [#3481](https://github.com/JSPrismarine/JSPrismarine/pull/3481) [`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f) Thanks [@filiphsps](https://github.com/filiphsps)! - Export the types the public API already uses, so a consumer can name what a function takes or returns. Each package's entry point now exports the interfaces, type aliases and classes its exported signatures reference, and `@jsprismarine/prismarine` and `@jsprismarine/script-host` publish the modules that define them.
  
  `@jsprismarine/protocol` exports five wire types under new names, because the packet API already uses the plain names for other types: `ActorLinkFields`, `AbilityLayerFields`, `SerializedAbilitiesDataFields`, `GameRuleFields` and `UUIDValue`.
- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/errors@0.23.1

## 0.23.0

### Minor Changes

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Every error the packages throw is now defined in `@jsprismarine/errors`, with a stable code, a `docs` link to its entry in the new error reference at https://jsprismarine.dev/errors/, and the values its message was built from. Each error still extends the class it did, such as `TypeError` or `CorruptionError`, and keeps its message, with three exceptions: `getGametypeName` now names the game mode it refused, the NetherNet signaling server answers a bad join path with `Expected /v1/join/<networkId>`, since braces mark a value in a catalog message, and `SnbtSyntaxError` no longer carries an `offset`.
  
  The error classes a package used to export now come from its catalog in `@jsprismarine/errors`. Import `CorruptionError`, `DatabaseLockedError` and `UnsupportedVersionError` from `@jsprismarine/errors/leveldb`, `LoginRefused` from `@jsprismarine/errors/auth`, `ZipError`, `FilterParseError`, `JsonParseError` and `BrarchiveError` from `@jsprismarine/errors/packs`, and so on for `KernelError`, `ContentError`, `BlockError`, `StructureFormatError`, `SelectorSyntaxError`, `MolangSyntaxError`, `NumberProviderError`, `NativeLibraryError`, `NetherNetUnavailableError`, `UdpPortsError`, `JoinRefusedError`, `UsageError` and `ChunkReadOutOfWindowError`. `LoginRefused` keeps its `detail`, now read from its cause. `@jsprismarine/errors` drops its `Error` class, the `ErrorKind` enum and its six error classes; `getGametypeName` and `getGametypeId` throw `MinecraftErrors.GametypeInvalid`, and `PermissionManager.setOp` throws `PrismarineServerErrors.PlayerNotFound`. `NBTStreamReader.readLength` and `expectInput` take the error class to throw instead of a message, and `fail` in `@jsprismarine/features` takes the error to throw.

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [#3336](https://github.com/JSPrismarine/JSPrismarine/pull/3336) [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/addon-tools`, which builds JSPrismarine addons. Its `jsp-addon build` command checks each addon's behavior pack and `addon.json`, packs it into `<name>-<version>.mcpack` and writes the `index.json` a server installs from, keeping every published version. `@jsprismarine/addon-tools/addonIndex` parses and validates that index. `@jsprismarine/packs/zip` gains `writeZip`, which writes the same bytes for the same files, and `@jsprismarine/packs/manifest` exports the manifest parser. `@jsprismarine/errors/addon-tools` holds the new errors.

- [#3321](https://github.com/JSPrismarine/JSPrismarine/pull/3321) [`af89e9c`](https://github.com/JSPrismarine/JSPrismarine/commit/af89e9cadd3cfd2f6652e79ada341e12ac5f66c8) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency @spyglassmc/java-edition to v0.3.71

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac) Thanks [@filiphsps](https://github.com/filiphsps)! - Export the `./javaDataTarget` subpath, so plain Node can import `@jsprismarine/packs/javaDataTarget`.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `JavaDataTarget` and `DEFAULT_JAVA_DATA_TARGET` in `@jsprismarine/packs/javaDataTarget`. `load` takes a `java` target and gates `pack.mcmeta` ranges and overlays on its data pack format, the composed prefix cache key includes it, and `createMcdocValidator` takes a `target` whose release it gates on. Without a target, a load behaves as before, at data pack format 121.0 for Java 26.3. `DATA_PACK_FORMAT` and `DATA_PACK_RELEASE` are deprecated in favor of the target and will be removed.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac) Thanks [@filiphsps](https://github.com/filiphsps)! - The mcdoc validator now gates `#[since]` and `#[until]` for a snapshot, pre-release or release candidate target as the release it builds toward, so a `26.4-snapshot-10` target validates against the 26.4 schema instead of dropping every gated field. A target release in none of those forms, such as `24w14a`, throws `UncomparableJavaRelease`.

- [`104bb4d`](https://github.com/JSPrismarine/JSPrismarine/commit/104bb4d4a3dbf7654c19294b4a1d66724d591ad3) Thanks [@filiphsps](https://github.com/filiphsps)! - The pack loader routes the rest of Java 26.3's gameplay datapack registries into `Definitions`: villager trades and trade sets, trial spawners, jukebox songs, banner, decorated pot and trim patterns, trim materials, instruments, the cat, chicken, cow, frog, pig, wolf and zombie nautilus variants and their sound variants, sulfur cube archetypes, timelines and world clocks. The identifier report reads an `id` under `entity` as an entity type, so a trial spawner's mob is no longer reported as a missing item. The composed vanilla prefix cache moves to v11, since a v10 cache holds none of these registries.

- [`6787fdd`](https://github.com/JSPrismarine/JSPrismarine/commit/6787fdd6ff50c80110f4951a0cea51214611eea0) Thanks [@filiphsps](https://github.com/filiphsps)! - The optional Spyglass peers move to `@spyglassmc/core` 0.4.58, `@spyglassmc/json` 0.3.62 and `@spyglassmc/mcdoc` 0.3.62, the versions `@spyglassmc/java-edition` 0.3.71 depends on. With the older pins two copies of `@spyglassmc/core` were installed, and the mcdoc validator passed a registry from one to an API typed with the other.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0

## 0.22.0

### Patch Changes

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`6c08cc8`](https://github.com/JSPrismarine/JSPrismarine/commit/6c08cc82964458a0913751e0761cdd274eaf7349) Thanks [@filiphsps](https://github.com/filiphsps)! - The pack loader routes `data/<ns>/enchantment_provider/` into `Definitions.enchantmentProviders`, the registry Java's `EnchantmentHelper.enchantItemFromProvider` reads to enchant a mob's spawn gear. The composed vanilla prefix cache moves to v10, since a v9 cache holds no such registry.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`bf5aca9`](https://github.com/JSPrismarine/JSPrismarine/commit/bf5aca98eed1198b84057e8369d45f0651be2b51) Thanks [@filiphsps](https://github.com/filiphsps)! - Load Java's `painting_variant` registry from a datapack into `Definitions.paintingVariants`, keyed by namespaced id, so the server can choose the picture a placed painting shows.

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [`7977682`](https://github.com/JSPrismarine/JSPrismarine/commit/797768230c41b0fb03c06b30230f4ba8dd9d2d9b) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve `decompress` to the maintained `@xhmikosr/decompress` fork in the workspace. The original 4.2.1, pulled in by the optional `@spyglassmc/core` peer, lets a crafted archive read or write outside the extraction directory through link entries and sibling-prefix paths, and keeps setuid and setgid bits. The override protects this repository's builds and tests. Projects that install `@spyglassmc/core` next to `@jsprismarine/packs` should add the same override themselves.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6

- [#3017](https://github.com/JSPrismarine/JSPrismarine/pull/3017) [`1c6e390`](https://github.com/JSPrismarine/JSPrismarine/commit/1c6e39015c4dcc454d188dc4423d6fd8930ec21b) Thanks [@filiphsps](https://github.com/filiphsps)! - `readZip` bounds what an archive may expand to. Each entry must inflate to exactly the size its central directory declares, at most `MAX_ZIP_ENTRY_BYTES`, and a load may expand to at most `MAX_ZIP_TOTAL_BYTES` in all; both are defined in `packages/packs/src/zip.ts`. Both are checked before anything is allocated. Entries whose records overlap or run past the archive are refused, so a small archive can no longer name one compressed stream many times over. `readZip` takes an optional `{ maxEntryBytes, budget }`, and `createZipBudget` makes a budget that an `.mcaddon` shares with the `.mcpack` archives nested in it. `expandSource` takes that budget as an optional fourth argument.

## 0.20.0

No changes in this release.

## 0.19.2

No changes in this release.

## 0.19.1

No changes in this release.

## 0.19.0

No changes in this release.

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.

- [`7418be1`](https://github.com/JSPrismarine/JSPrismarine/commit/7418be10dd694d6bb5f284896ea80cab1efdb551) Thanks [@filiphsps](https://github.com/filiphsps)! - Villagers of every profession trade, wear their biome's clothes and show their profession on the trade screen. The Bedrock Dedicated Server ships some definitions as binary files the loader cannot read and leaves out others, and an unreadable file shadowed the readable copy of the same path in an earlier pack, so butchers, clerics and stone masons had no trade table at all. The pack stack now puts `bedrock-samples` beneath the server's pack, an unreadable file no longer hides a readable one, and `pnpm dev` downloads both. The client is also sent a villager's `mark_variant` and `skin_id`, which choose its clothes, and the trade screen is titled with the table's `display_name` instead of the entity's type name.

## 0.17.0

### Minor Changes

- [#2865](https://github.com/JSPrismarine/JSPrismarine/pull/2865) [`8cc701d`](https://github.com/JSPrismarine/JSPrismarine/commit/8cc701d6dc05532abf27c10d87d0a3b6dbd25b73) Thanks [@filiphsps](https://github.com/filiphsps)! - Load Java's `block_transformer` registry and resolve tool transforms from it, which is what makes a hoe till, a shovel path, and an axe strip. The behaviors and the item components were already in place, but the table behind `WorldActions.transform` was an injection point nothing injected, so every tool declined every block. `@jsprismarine/packs` routes `data/<namespace>/block_transformer/` files, the server parses them into `ServerContent.blockTransformers`, and the resolver answers the rule-based providers over the real tag stack and block mapping, including `copy_properties` (a stripped log keeps its axis), the offset predicates (tilling needs air above), and `disallowed_faces` - which is why `transform` now takes the clicked face.

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`678e192`](https://github.com/JSPrismarine/JSPrismarine/commit/678e192e09582001760956a2f215619776fffa8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Cache composed vanilla pack prefixes to speed warm content builds.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`7aabb3a`](https://github.com/JSPrismarine/JSPrismarine/commit/7aabb3a82903eae555ca83bddcb409bb0a4f693c) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip superseded path-addressed definitions during pack composition

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4355293`](https://github.com/JSPrismarine/JSPrismarine/commit/4355293f75d669659511516448b9c600900c351b) Thanks [@filiphsps](https://github.com/filiphsps)! - Run real mcfunctions, and wire eight more of the vanilla commands.
  
  `@jsprismarine/mcfunction` was complete, tested and connected to nothing. `/function` existed in
  the command tree, its host verb refused, and no package depended on the runtime. The two halves
  are joined now. `@jsprismarine/packs` routes a datapack's `.mcfunction` files into a new
  `functions` registry, the one registry whose `data` is text rather than parsed JSON, and the
  server compiles them, resolves function tags through the merged tag table, and runs every line
  through the Brigadier dispatcher with the source made silent, as Java does.
  
  That makes eight things work. `/function`, `/function #tag`, a macro call with an SNBT argument
  compound, `/schedule function ... [append|replace]`, `/schedule clear`, `#minecraft:load` once
  after the packs load, `#minecraft:tick` once a tick, and `/execute as @e[...] run function`, which
  forks the way the rest of an `/execute` chain does. Vanilla ships no functions in either edition,
  so this buys no parity. It is what a third-party Java datapack needs.
  
  Seven more commands this server used to hold back now run. `/scoreboard` keeps objectives, scores
  and the three display slots, which `execute if score`, `execute store result score` and a
  selector's `scores=` all read. `/random` draws from the Xoroshiro128++ stream
  `@jsprismarine/loot` already reproduces for a table's `random_sequence`, so a sequence shared with
  a loot table is one stream. `/xp` reads and writes the two bar attributes through Java's curve and
  gains the `set` form. `/enchant` puts the level on the held stack. `/loot` rolls Java's tables, and
  its `kill` and `mine` sources roll the table of the entity or block they point at rather than one
  the player typed. `/recipe` unlocks out of the compiled recipe book over a new
  `UnlockedRecipesPacket`. `/loot` and `/recipe` are offered only when `content-packs` is on, because
  without the pack stack there is nothing for either to work from.
  
  Breaking in `@jsprismarine/commands`: `runLoot` replaces `DataCommandHost.runLootTable` and takes
  a `LootSource` model rather than a table id, because only one of `/loot`'s four sources names a
  table at all. `ScoreboardCommandHost` gains `holders`.
  `EntityCommandHost.changeExperience` takes the `add` or `set` mode. `/scoreboard players`,
  `execute if score` and `execute store ... score` read Java's `ScoreHolderArgument`, which is a
  selector, a bare name, or `*`, instead of an entity selector, so a fake player parses.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e96d1b7`](https://github.com/JSPrismarine/JSPrismarine/commit/e96d1b76f18207192a9e815e6a2a558a8c4005ff) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/packs`, the Bedrock pack stack loader. `load(stack)` composes directory packs,
  `.mcpack`/`.mcaddon` archives and brarchive layer sets into per-registry definition maps where a
  later pack wins by identifier, and reports diagnostics instead of failing unless `strict` is set.
  It parses lenient JSON (comments, trailing commas), validates manifests against the documented
  schema, dispatches on `format_version`, and parses the Bedrock filter grammar in both the string
  form and the integer `subject`/`operator` encoding.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9dffb9a`](https://github.com/JSPrismarine/JSPrismarine/commit/9dffb9aa993febd34d79d0bd40afb4334bcd09fa) Thanks [@filiphsps](https://github.com/filiphsps)! - Load the shipped vanilla pack stack in strict mode, and report the files behind a collapsed
  diagnostic.
  
  A Bedrock definition file that fails structural parsing is still an error, unless a later pack in
  the stack provides the same pack-relative path. That copy replaces the broken one whole, so the
  broken file cannot reach the composed result and a warning is enough. The BDS vanilla layers need
  this rule: two of them carry an `entities/npc.json` that patches a saved pack rather than defining
  an entity, and the 1.20.80 layer carries the real one. Strict mode now fails on errors alone, which
  is what `DiagnosticSeverity` already documented, so `load(bdsVanillaLayers, { strict: true })`
  succeeds.
  
  `DiagnosticCollector` still collapses repeats of one pack, code and message into a single
  diagnostic, because a pack-wide pattern should cost one line of the report. A collapsed diagnostic
  now carries `occurrences`, the number of files it covers, and `paths`, the first five of them, so a
  per-file finding that happens 28 times no longer reads as one.
  
  `@jsprismarine/entities` drops `normalizeFilterSource`, which rewrote two vanilla filter shapes the
  packs grammar once rejected and now accepts. All 982 filter values in the BDS layers and
  bedrock-samples parse to the same result without it. `parseEntityFilter` is the packs parser under
  the entities name.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d66cf52`](https://github.com/JSPrismarine/JSPrismarine/commit/d66cf527b79391e194f85137e1e5b573993c7947) Thanks [@filiphsps](https://github.com/filiphsps)! - `loadDatapack` opens only the files it can route. A vanilla 26.3 datapack is 8373 files of which
  6335 reach a registry; the rest are the worldgen, villager trade and nested built-in pack
  directories this loader does not consume, and each of them cost a syscall pair for bytes that went
  straight back out. Overlay directories are matched by shape - a path that routes once its leading
  directory is dropped - because their names live in the `pack.mcmeta` this also reads.
  
  A declared overlay's file count is still taken over every path in the pack rather than over the
  files that were read, so `mcmeta.empty-overlay` still means what it says for an overlay that holds
  nothing but registries the loader skips.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0626058`](https://github.com/JSPrismarine/JSPrismarine/commit/06260585d51d8ce0668b7cf854663bb1aea9aee9) Thanks [@filiphsps](https://github.com/filiphsps)! - Load the vanilla pack stack in about a third of the time. Two changes, both measured against the
  BDS vanilla layers plus the `jsprismarine_vanilla` overlay plus the Java 26.3 datapack, which is
  what a server boots on: 2573 ms to 951 ms, with a byte-identical set of definitions and
  diagnostics.
  
  - `parseLenientJson` tries strict JSON before the lenient cleanup. The cleanup rewrites the whole
    text character by character twice over to blank out comments and trailing commas, and valid JSON
    has neither outside a string, so it hands a strict file back unchanged. 8486 of the stack's 8556
    Bedrock files are strict, and parsing them strictly costs 74 ms where the cleanup cost 563 ms.
  - `load` opens only the files a registry owns. A pack folder holds much more than definitions - the
    composed vanilla pack ships 1311 `.nbt` structures, a 3 MB `level.dat` and its textures beside
    2588 readable files - and a path no registry routes was read, buffered and then dropped.
    `expandSource` takes a new optional `PackFileFilter` for this; with none it still returns a pack
    whole, and `manifest.json` and the `__brarchive/` containers are read whatever the filter says.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2fcd89f`](https://github.com/JSPrismarine/JSPrismarine/commit/2fcd89f8ff551915692aedca68cd556735432590) Thanks [@filiphsps](https://github.com/filiphsps)! - Validate Bedrock definitions against Mojang's published JSON schemas. `readBedrockSchemas` reads
  `metadata/json_schemas` out of a bedrock-samples checkout, `bedrockSchemaValidator` checks each
  definition against the document for its registry and `format_version`, and `composeValidators`
  joins it to the structural checks rather than replacing them. A file picks its schema by the
  engine's own rule, the same version or the closest one that is not greater, so a file older than
  every published schema checks against none. Six registries have a published root document; the
  other five keep the structural checks alone.
  
  The schemas load with one repair: every `oneOf` reads as `anyOf`. Mojang's generator writes variant
  unions as `oneOf` and the variants overlap, so `Filter Group` and `Block Descriptor` admit no value
  at all when read literally, and the vanilla behavior pack reports 347 violations that are all
  wrong. With the repair both vanilla corpora, the bedrock-samples publication and the composed BDS
  layers, validate with zero schema diagnostics, strict mode included.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`91fcf8b`](https://github.com/JSPrismarine/JSPrismarine/commit/91fcf8b9a7c4334c8fab86bc4fae2b94356351d5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the Java half of the pack loader: a `datapack` stack source reads a Java datapack from a folder
  or zip into eight new registries (`lootTablesJava`, `recipesJava`, `advancements`, `tags`,
  `enchantments`, `damageTypes`, `predicates`, `itemModifiers`), keyed by namespaced id from the 26.3
  directory names. `pack.mcmeta` parses in both the `min_format`/`max_format` and legacy `pack_format`
  forms with overlays, gated on data pack format 121.0; a mismatched pack is reported and still loads
  outside strict mode. Later packs win per file, tags merge with `replace` honored, and
  `reportIdentifiers` walks loaded definitions to report every referenced Java identifier through an
  injectable `IdentifierResolver`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`015a810`](https://github.com/JSPrismarine/JSPrismarine/commit/015a8102014c24f224797dec0b1919d3a045e1c3) Thanks [@filiphsps](https://github.com/filiphsps)! - Give each Java registry its merge mode and tighten overlay resolution. `MERGE_MODES` records
  Java's three modes per registry and `mergeJavaDefinition` applies them, which replaces the
  hardcoded tags branch in the datapack loader: `override` takes the last pack that has the file,
  `tags` concatenates `values` and clears what came before on `replace`, and `assign` merges key by
  key. Every 26.3 data registry but tags overrides.
  
  A declared overlay directory now leaves the base view whether or not its range covers 121.0, so a
  pack with only out-of-range overlays no longer carries their directories as content, and an
  overlay directory the pack does not hold is reported as a warning rather than silently doing
  nothing.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`29aa940`](https://github.com/JSPrismarine/JSPrismarine/commit/29aa940e8ddc1db5bf37b213179adad8e3eb21a5) Thanks [@filiphsps](https://github.com/filiphsps)! - Validate Java datapack definitions against `SpyglassMC/vanilla-mcdoc`.
  `@jsprismarine/packs/mcdocValidator` exports `createMcdocValidator`, which reads a vanilla-mcdoc
  checkout and returns a synchronous `DefinitionValidator`; construction is asynchronous because
  binding the schema modules is, so `load` stays synchronous. Findings name the JSON pointer and the
  reason, and the release gates `#[since=]` and `#[until=]` fields, which matters: the 26.3 vanilla
  datapack reports one finding at 26.3 and thousands at 26.1.
  
  A vanilla-mcdoc finding is a warning by default, because the schema set trails Mojang's releases
  and an error would drop the definition. At 26.3 the one disagreement is
  `recipe/map_extending.json`, which vanilla ships with `"result": {}` where the schema wants an
  `id`. `severity: 'error'` opts into the stricter reading.
  
  The four `@spyglassmc` packages are optional peer dependencies and the module is not re-exported
  from the package index, so the eleven workspace packages importing the loader do not pay for 91
  transitive packages they never load.
  
  `bedrock-data` pins `SpyglassMC/vanilla-mcdoc` in `sources.json`, so `fetch:sources` puts a
  checkout in the cache beside the other pinned upstreams.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`78694d1`](https://github.com/JSPrismarine/JSPrismarine/commit/78694d1577b8bc994963b5eb53d712858ee363df) Thanks [@filiphsps](https://github.com/filiphsps)! - Route `data/*/dimension_type/`, `data/*/dimension/` and the `data/*/worldgen/<kind>/` directories into the `dimensionTypes`, `dimensions` and `worldgen` registries, so a datapack can add a dimension and the worldgen data reaches `Definitions`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`908645b`](https://github.com/JSPrismarine/JSPrismarine/commit/908645b1f8ea87a6e511dbe25675f39760b41627) Thanks [@filiphsps](https://github.com/filiphsps)! - Load the real vanilla Bedrock behavior pack without errors. Four fixes, each against a shape Mojang's
  own files write:
  
  - A brarchive is keyed by its folder path under `__brarchive/` instead of its name. The vanilla
    layers ship `__brarchive/loot_tables/entities.brarchive` beside `__brarchive/entities.brarchive`,
    so the name alone collided and the loot tables overwrote the entity definitions. The composed
    vanilla entity count goes back from 125 to 129, creeper, witch, ghast and copper_golem among the
    recovered ones, and the 302 loot tables and 20 trade tables that landed under the wrong paths are
    back where they belong.
  - An entity section written as `null` reads as absent. 23 vanilla entity files, `area_effect_cloud`
    among them, write `"events": null`.
  - The filter parser accepts a group map that carries more than one combinator, reading it as an
    `all_of` over its clauses; a combinator that holds one test instead of an array; a `domain`
    written as a number or boolean, which `FilterTest.domain` now types the way `value` is typed; and
    the legacy shorthand that names the test in the key, as the skeleton's
    `{"other_with_families": "lightning"}` does. Mojang's `Filter Group Map.json` and
    `Filter Test.json` declare the first three; tnt_minecart, mooshroom, villager, villager_v2, witch,
    piglin and skeleton write them.
  - The vanilla datapack test finds the Java server jar under `java-server/<version>/`, where
    `fetch:sources` writes it, or `java/<version>/`, where the Java dump and oracle scripts download
    their own copy.
  
  A new test behind `JSP_VANILLA_BEHAVIOR_PACK` loads every registry of both the `bedrock-samples`
  publication and the composed BDS vanilla layers and checks the counts.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c) Thanks [@filiphsps](https://github.com/filiphsps)! - Serve the vanilla behavior pack alone, and let Mojang's content load without 55 warnings about
  itself.
  
  The default stack handed the whole BDS `behavior_packs` folder to the loader, so a default build
  served the editor pack's five `editor:` entities, chemistry's balloon and ice bomb, and eight
  chemistry reducer recipes that won over the vanilla recipes of the same name. It now composes the
  packs it was asked for, by the header UUID a world references a pack by, and the default asks for
  the vanilla behavior pack: 129 entity types rather than 136. `PackStackRequest.bedrockPacks` names
  more packs by UUID, or `'all'` composes the folder whole, for a server that does want chemistry or
  the editor.
  
  A clean build reported 102 warnings and no error. 26 of them were the `"events": null` an entity
  with no events is written with, and 26 the empty `"remove": {}` of a randomize branch that changes
  nothing; the parser already read both correctly, so the warnings only taught an operator to skip
  the report. Both are silent now, and an events key that is neither an object nor null, and a
  `component_groups` that is there and is not a list, still report. What is left is 47 warnings that
  each name something the server does not do, and an unknown component now names the first file that
  declared it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bed113d`](https://github.com/JSPrismarine/JSPrismarine/commit/bed113d91a2de02b80d5688c3f43eadf802271c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve optional tag members against loaded content and normalize default namespaces.
