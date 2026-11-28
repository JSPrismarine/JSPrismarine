# @jsprismarine/mapping

## 0.27.0

### Patch Changes

- [#3842](https://github.com/JSPrismarine/JSPrismarine/pull/3842) [`d4faaf4`](https://github.com/JSPrismarine/JSPrismarine/commit/d4faaf4250ea34c1f244a7a5047072c7dcff8b6b) Thanks [@filiphsps](https://github.com/filiphsps)! - Load a behavior pack's Bedrock recipes into the server's recipe book. Shaped, shapeless, furnace, smithing transform, smithing trim, brewing mix and brewing container recipes in a pack's `recipes/` folder are restated as the Java recipes they mean, so a client is sent them in `CraftingData` and the server's recipe book matches them, with or without the Java vanilla datapack. Material reduction recipes go out in `CraftingData` as material reducer entries. A Bedrock pack source takes a new `skipRegistries` option, which the server uses to leave the vanilla Bedrock pack's own recipes unread, and `@jsprismarine/mapping` adds `bedrockIdentifierToJava` and `mappedJavaIdentifiers`.

- [#3782](https://github.com/JSPrismarine/JSPrismarine/pull/3782) [`17718cc`](https://github.com/JSPrismarine/JSPrismarine/commit/17718cc881c0d491e01c5f35dae0e3b9bf21dc5e) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `bedrockBlockSupportOf(name, states?)`, which answers Java's legacy solid flag (`BlockState.isSolid`) for a Bedrock block state and whether each of its faces is sturdy for the full, center and rigid support types (`isFaceSturdy`). The facts come from running Java's own code over every block state of the pinned 26.3 jar, and a Bedrock state answers as the Java state `bedrockBlockStateToJava` maps it back to.

- [#3743](https://github.com/JSPrismarine/JSPrismarine/pull/3743) [`ddbf63c`](https://github.com/JSPrismarine/JSPrismarine/commit/ddbf63cd7d5c971e4ef224f11c72f5227acc5816) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies

- [#3758](https://github.com/JSPrismarine/JSPrismarine/pull/3758) [`f71822e`](https://github.com/JSPrismarine/JSPrismarine/commit/f71822e9a631edf44c55b8fbe70dfc9a728e78cc) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies

- [#3834](https://github.com/JSPrismarine/JSPrismarine/pull/3834) [`78a7882`](https://github.com/JSPrismarine/JSPrismarine/commit/78a788299aea78261d12c200641934a48ee1e30b) Thanks [@filiphsps](https://github.com/filiphsps)! - Map a flattened log, wood, leaves, planks, wool, concrete or other block item with no aux. GeyserMC's item table still carried the aux each one had on the merged item it came from, such as 2 for `minecraft:birch_log`, so recipes named those items with an aux no client stack has: a birch log could not be shift-clicked into a furnace. The item table now keeps an aux only where the pinned Bedrock Dedicated Server's creative menu names the item with it, as for a bed's or a banner's color.
- Updated dependencies [[`44c0251`](https://github.com/JSPrismarine/JSPrismarine/commit/44c02515fa4810e75de3185001a8490aa7766ebd), [`c836dac`](https://github.com/JSPrismarine/JSPrismarine/commit/c836dac76a41e697fb7c8d1594224cdaf5cdbece), [`edb1160`](https://github.com/JSPrismarine/JSPrismarine/commit/edb116075c62fa251747acaf9d6db80bf1b448c4), [`3a7e94b`](https://github.com/JSPrismarine/JSPrismarine/commit/3a7e94b89acda05d76e99409711ea15afd122c0f), [`88fc786`](https://github.com/JSPrismarine/JSPrismarine/commit/88fc78645d05b732a620dbfcc6ee2a106950c093), [`ddbf63c`](https://github.com/JSPrismarine/JSPrismarine/commit/ddbf63cd7d5c971e4ef224f11c72f5227acc5816), [`f71822e`](https://github.com/JSPrismarine/JSPrismarine/commit/f71822e9a631edf44c55b8fbe70dfc9a728e78cc), [`ffb86ad`](https://github.com/JSPrismarine/JSPrismarine/commit/ffb86ad9e67431eeb9f1568ea66758a5cbffd050), [`cf7fe3c`](https://github.com/JSPrismarine/JSPrismarine/commit/cf7fe3c485a52482dcdbda6da2f822749b256f36), [`7756f1c`](https://github.com/JSPrismarine/JSPrismarine/commit/7756f1c349bb40b381252a231d6fd4b6518ae997), [`6580502`](https://github.com/JSPrismarine/JSPrismarine/commit/6580502b8aa1bab3091d98d581fd3501d5049b36), [`832bd7b`](https://github.com/JSPrismarine/JSPrismarine/commit/832bd7b2e1237f1cc98622cdcb1c21a3a6d37503), [`68a0e1b`](https://github.com/JSPrismarine/JSPrismarine/commit/68a0e1b820981bab5d69830066d824ca937e1021), [`14aeb2c`](https://github.com/JSPrismarine/JSPrismarine/commit/14aeb2cf0b75913f02907de47112af392f517d53), [`c35144a`](https://github.com/JSPrismarine/JSPrismarine/commit/c35144acb33d5b1a6237c523595df8674e349a0f), [`0cd4ddb`](https://github.com/JSPrismarine/JSPrismarine/commit/0cd4ddb62d4a05f212368dbca7f217a8bb3a7f08), [`fd07315`](https://github.com/JSPrismarine/JSPrismarine/commit/fd07315101923766c69a1f1fd2981de9afb9cf99), [`37722e2`](https://github.com/JSPrismarine/JSPrismarine/commit/37722e2d12c913328b9dfa9776e70b6300868d5e), [`dfe4b85`](https://github.com/JSPrismarine/JSPrismarine/commit/dfe4b85f7b9c075988d0231f4fb48e572e332ce1)]:
  - @jsprismarine/errors@0.27.0
  - @jsprismarine/minecraft@0.27.0

## 0.26.0

### Minor Changes

- [`ea601a5`](https://github.com/JSPrismarine/JSPrismarine/commit/ea601a5497b38b1357c3c83d23e202921ef5b698) Thanks [@filiphsps](https://github.com/filiphsps)! - `bedrockBlockPropertiesOf` answers `mapColor`, the block state's Java `MapColor` by its constant's name in lower case, such as `grass`, `water` or `none`, and `waterloggedMapColor` for the barrier and the light blocks, whose waterlogged states Java gives `water`. Both are the block's own color, before a map draws a waterlogged block without a sturdy top as its water. `BedrockBlockProperties` requires `mapColor`, so code that builds one needs it: a `BlockPropertySource` passed to `generateVanillaOverlay` in `@jsprismarine/blocks` has to return it from `propertiesOf`. `BEDROCK_ONLY_FALLBACK` gives `none`.

### Patch Changes

- [#3709](https://github.com/JSPrismarine/JSPrismarine/pull/3709) [`ec53015`](https://github.com/JSPrismarine/JSPrismarine/commit/ec53015a6a6466cc10c65f7ce3df31238b49ac7b) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies

- [#3695](https://github.com/JSPrismarine/JSPrismarine/pull/3695) [`6b879ba`](https://github.com/JSPrismarine/JSPrismarine/commit/6b879ba04da81bbc81e3d9652c70c8699d91130f) Thanks [@filiphsps](https://github.com/filiphsps)! - Explorer maps show their marker on a Bedrock client. `LevelView.newMapId` now receives the map to make (a `NewMap`: a position it covers, its zoom and its decorations), which `exploration_map` passes when it falls back to the level. `ItemDrop` gains `mapId`. The mapping gives each of the 16 Java structure locator maps its Bedrock aux value (`EXPLORER_MAP_DATA`), so a buried treasure map is a Treasure Map. `@jsprismarine/protocol` exports `ClientboundMapItemDataPacket`. The server saves each map a level makes (center, scale, dimension and markers, placed as Java's `MapItemSavedData` places them) under the LevelDB key `jsprismarine:maps`, and the structures explorer maps point at under `jsprismarine:structure_references`, both as NBT lists that a provider's `LevelRecords` carry as `maps` and `referencedStructures`; it carries the id on the stack as `map_uuid` in its NBT and its client user data, keeps two maps with different ids in separate slots, and answers `MapInfoRequest` with the map's markers and Java's biome preview. Cartographer trades offer the Bedrock filled map with its id. With `skip_existing_chunks`, a search also passes over the structure it starts in, as Java 26.3's `claimStructureAt` does.

- [#3692](https://github.com/JSPrismarine/JSPrismarine/pull/3692) [`42d89cb`](https://github.com/JSPrismarine/JSPrismarine/commit/42d89cb12a2d727d59651fb0b3799e39bc9871bd) Thanks [@filiphsps](https://github.com/filiphsps)! - The Java preview is now 26.4 Pre-Release 1 (`26.4-pre-1`), data pack format 128.1, in place of 26.4 Snapshot 10. `sources.json` pins its server jar, `fetch:sources --java 26.4-pre-1` downloads it, and the mapping and item type tables for the preview move to `26.4-pre-1`, still mapped onto Bedrock preview protocol 2259. A server whose `content-java-version` names `26.4-snapshot-10` now stops at startup and needs `26.4-pre-1`.
  
  The preview's Java goal capture lists no goals for the camel and camel husk, as Java's `Camel.registerGoals` registers none.
- Updated dependencies [[`ec53015`](https://github.com/JSPrismarine/JSPrismarine/commit/ec53015a6a6466cc10c65f7ce3df31238b49ac7b)]:
  - @jsprismarine/errors@0.26.0
  - @jsprismarine/minecraft@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [[`dda9dbe`](https://github.com/JSPrismarine/JSPrismarine/commit/dda9dbe5ebfdcdc338e37bf24ae8fe561c9308bb), [`2132959`](https://github.com/JSPrismarine/JSPrismarine/commit/2132959244601c90055b091a4273a008eadf0f3d), [`d4adb53`](https://github.com/JSPrismarine/JSPrismarine/commit/d4adb5381a368d2076a0648ce2522c12cf72ab48), [`27c272f`](https://github.com/JSPrismarine/JSPrismarine/commit/27c272f90af03738b7fd9778e2bddea955fe9cb6), [`d1e9714`](https://github.com/JSPrismarine/JSPrismarine/commit/d1e97142dcfdab12f895719eca9bcbee78346c9a), [`47aad59`](https://github.com/JSPrismarine/JSPrismarine/commit/47aad598440fd81e5177c60ffeb49972ce697960), [`fc513cf`](https://github.com/JSPrismarine/JSPrismarine/commit/fc513cf74a16caf6f9da30f3323b094c519d1043), [`253f214`](https://github.com/JSPrismarine/JSPrismarine/commit/253f214c096cad79e6f53cd8a88a828b262af315), [`c053dfc`](https://github.com/JSPrismarine/JSPrismarine/commit/c053dfcdd32006386469c31b8448cdfa33b9333f), [`239659a`](https://github.com/JSPrismarine/JSPrismarine/commit/239659a6927aa7f2b713ad994fe92fab0f2cece9), [`fea2fcd`](https://github.com/JSPrismarine/JSPrismarine/commit/fea2fcd1d4424bf4c766ba996e9eb0ceb742310a), [`055b1ca`](https://github.com/JSPrismarine/JSPrismarine/commit/055b1ca984f47515b42af6109ea88a7ec7b4d451), [`f76f4f2`](https://github.com/JSPrismarine/JSPrismarine/commit/f76f4f25eb0449327fcc06b46797588a0b6879ff), [`c6fc056`](https://github.com/JSPrismarine/JSPrismarine/commit/c6fc056233588d453bcb33febae92189ecfc8b4b)]:
  - @jsprismarine/errors@0.25.0
  - @jsprismarine/minecraft@0.25.0

## 0.24.0

### Patch Changes

- [`e515b52`](https://github.com/JSPrismarine/JSPrismarine/commit/e515b52206a0e9ce6223c860ab6bcb0da6483643) Thanks [@filiphsps](https://github.com/filiphsps)! - Light each block state at its own Java level. `@jsprismarine/mapping` exports `bedrockBlockStateOverridesOf`, the per-state overrides of a block's Java properties, and the vanilla overlay writes each override that changes light as a permutation, so a lit candle, an unlit campfire, a charged respawn anchor or a lit copper bulb emits what it does in Java rather than its block's one level.
- Updated dependencies [[`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a), [`1f3b347`](https://github.com/JSPrismarine/JSPrismarine/commit/1f3b347d94e934767993eb3506a412b01d334a0b), [`3c19f11`](https://github.com/JSPrismarine/JSPrismarine/commit/3c19f11b712b228563d7af7fc5f6df6995726fe3), [`f4eb592`](https://github.com/JSPrismarine/JSPrismarine/commit/f4eb5921862accbb5e07749c38bd1c63495587a0), [`a19ba96`](https://github.com/JSPrismarine/JSPrismarine/commit/a19ba968ae53bd5c34c9515227a9d08ff7c69e33), [`a64ab41`](https://github.com/JSPrismarine/JSPrismarine/commit/a64ab41bf639ffb0144117810600a4abf306a850), [`05f03f7`](https://github.com/JSPrismarine/JSPrismarine/commit/05f03f78e186000a5e76cc34894a61a384ca5333), [`02d9cb6`](https://github.com/JSPrismarine/JSPrismarine/commit/02d9cb69d53cf22a406dd86e95f08b2bbc48eb5c), [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5), [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a), [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa), [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca), [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4)]:
  - @jsprismarine/errors@0.24.0
  - @jsprismarine/minecraft@0.24.0

## 0.23.2

### Patch Changes

- Updated dependencies [[`5f48cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/5f48cd10e4ca5b53ef19ebd214b70b1de18acca9)]:
  - @jsprismarine/errors@0.23.2
  - @jsprismarine/minecraft@0.23.2

## 0.23.1

### Patch Changes

- [#3481](https://github.com/JSPrismarine/JSPrismarine/pull/3481) [`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f) Thanks [@filiphsps](https://github.com/filiphsps)! - Export the types the public API already uses, so a consumer can name what a function takes or returns. Each package's entry point now exports the interfaces, type aliases and classes its exported signatures reference, and `@jsprismarine/prismarine` and `@jsprismarine/script-host` publish the modules that define them.
  
  `@jsprismarine/protocol` exports five wire types under new names, because the packet API already uses the plain names for other types: `ActorLinkFields`, `AbilityLayerFields`, `SerializedAbilitiesDataFields`, `GameRuleFields` and `UUIDValue`.
- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/errors@0.23.1
  - @jsprismarine/minecraft@0.23.1

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
