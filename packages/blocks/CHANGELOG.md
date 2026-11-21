# @jsprismarine/blocks

## 0.23.0

### Minor Changes

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Every error the packages throw is now defined in `@jsprismarine/errors`, with a stable code, a `docs` link to its entry in the new error reference at https://jsprismarine.dev/errors/, and the values its message was built from. Each error still extends the class it did, such as `TypeError` or `CorruptionError`, and keeps its message, with three exceptions: `getGametypeName` now names the game mode it refused, the NetherNet signaling server answers a bad join path with `Expected /v1/join/<networkId>`, since braces mark a value in a catalog message, and `SnbtSyntaxError` no longer carries an `offset`.
  
  The error classes a package used to export now come from its catalog in `@jsprismarine/errors`. Import `CorruptionError`, `DatabaseLockedError` and `UnsupportedVersionError` from `@jsprismarine/errors/leveldb`, `LoginRefused` from `@jsprismarine/errors/auth`, `ZipError`, `FilterParseError`, `JsonParseError` and `BrarchiveError` from `@jsprismarine/errors/packs`, and so on for `KernelError`, `ContentError`, `BlockError`, `StructureFormatError`, `SelectorSyntaxError`, `MolangSyntaxError`, `NumberProviderError`, `NativeLibraryError`, `NetherNetUnavailableError`, `UdpPortsError`, `JoinRefusedError`, `UsageError` and `ChunkReadOutOfWindowError`. `LoginRefused` keeps its `detail`, now read from its cause. `@jsprismarine/errors` drops its `Error` class, the `ErrorKind` enum and its six error classes; `getGametypeName` and `getGametypeId` throw `MinecraftErrors.GametypeInvalid`, and `PermissionManager.setOp` throws `PrismarineServerErrors.PlayerNotFound`. `NBTStreamReader.readLength` and `expectInput` take the error class to throw instead of a message, and `fail` in `@jsprismarine/features` takes the error to throw.

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [`1d022c3`](https://github.com/JSPrismarine/JSPrismarine/commit/1d022c3a59a1d33b6498f96c0aa755d85b252a19) Thanks [@filiphsps](https://github.com/filiphsps)! - A block hook's `HookBlock` carries the name of the level the block is in, and `BlockWorld.at` takes it, so a block family that runs in a second level (a torch losing its support, a scheduled tick, a random tick, a redstone update) reads and writes that level instead of the default level's world of the same dimension.

- [#3259](https://github.com/JSPrismarine/JSPrismarine/pull/3259) [`9601250`](https://github.com/JSPrismarine/JSPrismarine/commit/9601250aea5e3639b3c1a7b5371eda1d1d3e0daf) Thanks [@filiphsps](https://github.com/filiphsps)! - Declare the three blocks 1.26.60 added, `minecraft:disc_press`, `minecraft:ice_crystal` and `minecraft:icicle`, in the vanilla overlay with their display names and liquid reactions. The shape table has no row for them, so `BLOCKS_WITHOUT_CAPTURED_GEOMETRY` lists them and the overlay declares each a full cube.

- [#3218](https://github.com/JSPrismarine/JSPrismarine/pull/3218) [`e8b329d`](https://github.com/JSPrismarine/JSPrismarine/commit/e8b329d3470a38fe4af4a6bbcebba991e599178d) Thanks [@filiphsps](https://github.com/filiphsps)! - `BlockHooks` has `beforeOnPlayerPlace`, which runs before a player places a block and refuses the placement when a handler returns true, and `HookActor` carries the entity's runtime id as `entityId` when the host knows it.

- [#3466](https://github.com/JSPrismarine/JSPrismarine/pull/3466) [`14e71bb`](https://github.com/JSPrismarine/JSPrismarine/commit/14e71bb4606e91ca6a57c6f274678f933252d0af) Thanks [@filiphsps](https://github.com/filiphsps)! - Let a fluid pass between two blocks only where their collision shapes leave the face between them open, as Java's `FlowingFluid.canPassThroughWall` does, so a waterlogged bottom slab no longer lets its water out of its floor. `@jsprismarine/blocks/geometry` adds `mergedFaceOccludes` and `faceOccludesIn`, and `WorldActions` an optional `faceOccludes` hook.

- [#3364](https://github.com/JSPrismarine/JSPrismarine/pull/3364) [`2e2b61b`](https://github.com/JSPrismarine/JSPrismarine/commit/2e2b61b272cac241dc765cc46c841828e1a89beb) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep twisting and weeping vines in the climbing family, which grows them on a random tick, so a fall into them costs nothing again, as Java's `minecraft:climbable` tag has it. Moving them to the crop family to grow them had taken them out of the climbing family, and a fall into one hurt.

- [#3344](https://github.com/JSPrismarine/JSPrismarine/pull/3344) [`a7591d2`](https://github.com/JSPrismarine/JSPrismarine/commit/a7591d22bc0489db3499fc7dbe3a0c6d3537b354) Thanks [@filiphsps](https://github.com/filiphsps)! - Grow twisting vines up and weeping vines down on a random tick, as Java's `TwistingVinesBlock` and `WeepingVinesBlock` do: a head younger than 25 grows one block into air at 0.1 a tick, one year older. They used to stay the length they generated at. Both now belong to the `jsprismarine:crop` family with the cave vines, rather than `jsprismarine:climbing`, which keeps ladders, chains and scaffolding off the random ticks. A twisting vine pops without a block below it and a weeping vine without one above.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`af89e9c`](https://github.com/JSPrismarine/JSPrismarine/commit/af89e9cadd3cfd2f6652e79ada341e12ac5f66c8), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`2dd8ff2`](https://github.com/JSPrismarine/JSPrismarine/commit/2dd8ff2fda5afab035cae34e1542c73443cfeb3b), [`2d461cb`](https://github.com/JSPrismarine/JSPrismarine/commit/2d461cbe0f493a6482b19ba298df277fb95cf4bb), [`4d92994`](https://github.com/JSPrismarine/JSPrismarine/commit/4d929943617a9cd77d55fb8b2cdd6343665152b4), [`c1f1339`](https://github.com/JSPrismarine/JSPrismarine/commit/c1f1339aea746b7a86016ba68739517049d8967e), [`b29c5de`](https://github.com/JSPrismarine/JSPrismarine/commit/b29c5deca0848f515161b10344af46b7a2d8b430), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`104bb4d`](https://github.com/JSPrismarine/JSPrismarine/commit/104bb4d4a3dbf7654c19294b4a1d66724d591ad3), [`6787fdd`](https://github.com/JSPrismarine/JSPrismarine/commit/6787fdd6ff50c80110f4951a0cea51214611eea0), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0
  - @jsprismarine/packs@0.23.0
  - @jsprismarine/content@0.23.0
  - @jsprismarine/minecraft@0.23.0
  - @jsprismarine/molang@0.23.0
  - @jsprismarine/mapping@0.23.0

## 0.22.0

### Patch Changes

- [#3110](https://github.com/JSPrismarine/JSPrismarine/pull/3110) [`51cd835`](https://github.com/JSPrismarine/JSPrismarine/commit/51cd8359d07faf342bb191fefd3d58303ddac488) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `collisionShapeOf`, which reads a resolved block state's `minecraft:collision_box` as boxes normalized to the block's cell, and `isFullCubeShape`, which tells whether such a shape fills the cell.

- [`b1b1871`](https://github.com/JSPrismarine/JSPrismarine/commit/b1b18714efe02837d35771b5198bd529a54b6403) Thanks [@filiphsps](https://github.com/filiphsps)! - Generate each block's liquid reaction from the pinned Bedrock Dedicated Server's Script API instead of reading it from the checked-in geometry table. `bedrockLiquidReactionOf` and `isWashedAway` now read `src/tables/blockLiquidReactions.json`, which `pnpm --filter @jsprismarine/blocks run generate:liquid-reactions` writes from the `dump:bedrock` capture, so a block added by a newer capture gets its reaction. The answers are the same for every block type of 1.26.51. `blockGeometry.json` no longer has a `liquid` field.
- Updated dependencies [[`546c624`](https://github.com/JSPrismarine/JSPrismarine/commit/546c624aaeeefec693909b9e3413819d3bb45f9f), [`6c08cc8`](https://github.com/JSPrismarine/JSPrismarine/commit/6c08cc82964458a0913751e0761cdd274eaf7349), [`bf5aca9`](https://github.com/JSPrismarine/JSPrismarine/commit/bf5aca98eed1198b84057e8369d45f0651be2b51)]:
  - @jsprismarine/mapping@0.22.0
  - @jsprismarine/packs@0.22.0
  - @jsprismarine/minecraft@0.22.0
  - @jsprismarine/content@0.22.0
  - @jsprismarine/molang@0.22.0

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6

- [#3015](https://github.com/JSPrismarine/JSPrismarine/pull/3015) [`aed0570`](https://github.com/JSPrismarine/JSPrismarine/commit/aed057021fc0c9169a6e3ec78c2b37b0b54d798a) Thanks [@coderabbitai](https://github.com/apps/coderabbitai)! - <!-- coderabbit-ai-generated:v1 -->
  
  
  Prevent pistons from pushing or pulling bedrock by marking its generated movement components immovable.
- Updated dependencies [[`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`7977682`](https://github.com/JSPrismarine/JSPrismarine/commit/797768230c41b0fb03c06b30230f4ba8dd9d2d9b), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c), [`1c6e390`](https://github.com/JSPrismarine/JSPrismarine/commit/1c6e39015c4dcc454d188dc4423d6fd8930ec21b)]:
  - @jsprismarine/content@0.21.0
  - @jsprismarine/mapping@0.21.0
  - @jsprismarine/minecraft@0.21.0
  - @jsprismarine/molang@0.21.0
  - @jsprismarine/packs@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`4871ae6`](https://github.com/JSPrismarine/JSPrismarine/commit/4871ae64bf290095e3af06a7d7e13206d2989d16)]:
  - @jsprismarine/minecraft@0.20.0
  - @jsprismarine/mapping@0.20.0
  - @jsprismarine/content@0.20.0
  - @jsprismarine/molang@0.20.0
  - @jsprismarine/packs@0.20.0

## 0.19.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/content@0.19.2
  - @jsprismarine/mapping@0.19.2
  - @jsprismarine/minecraft@0.19.2
  - @jsprismarine/molang@0.19.2
  - @jsprismarine/packs@0.19.2

## 0.19.1

### Patch Changes

- Updated dependencies [[`5129bc5`](https://github.com/JSPrismarine/JSPrismarine/commit/5129bc5166f8a781bd3f928e24b687744cdbd8c9)]:
  - @jsprismarine/mapping@0.19.1
  - @jsprismarine/content@0.19.1
  - @jsprismarine/minecraft@0.19.1
  - @jsprismarine/molang@0.19.1
  - @jsprismarine/packs@0.19.1

## 0.19.0

### Patch Changes

- [`9a914c5`](https://github.com/JSPrismarine/JSPrismarine/commit/9a914c5e493a7aac47bdf7d1e21fa9f53f3d0622) Thanks [@filiphsps](https://github.com/filiphsps)! - Cactus and sugar cane now grow, and torch flowers and lily of the valley behave as plants. The family table sent `minecraft:cactus` and `minecraft:reeds` to families with no growth rule, matched `torchflower` and `torchflower_crop` to the torch family because their names contain "torch", and left `minecraft:lily_of_the_valley` in the plain-block family with no ground support check.

- [`47d5d19`](https://github.com/JSPrismarine/JSPrismarine/commit/47d5d19bdc211dda8ca06b979dc5645791b63801) Thanks [@filiphsps](https://github.com/filiphsps)! - Concrete powder now sets into concrete of its color when water touches it, as in Java. It never did: the powder fell like sand through the engine's gravity rule but ran the plain-block family, so a powder placed next to water, or falling into it, stayed powder. The new `jsprismarine:concrete_powder` family hardens it when water touches any side but below and when it falls into water.
- Updated dependencies [[`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e)]:
  - @jsprismarine/molang@0.19.0
  - @jsprismarine/minecraft@0.19.0
  - @jsprismarine/mapping@0.19.0
  - @jsprismarine/content@0.19.0
  - @jsprismarine/packs@0.19.0

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5), [`7418be1`](https://github.com/JSPrismarine/JSPrismarine/commit/7418be10dd694d6bb5f284896ea80cab1efdb551)]:
  - @jsprismarine/content@0.18.0
  - @jsprismarine/mapping@0.18.0
  - @jsprismarine/minecraft@0.18.0
  - @jsprismarine/molang@0.18.0
  - @jsprismarine/packs@0.18.0

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`09d523c`](https://github.com/JSPrismarine/JSPrismarine/commit/09d523c5fbd04af60800bee5ad2b12f2a7619e02) Thanks [@filiphsps](https://github.com/filiphsps)! - Load large startup tables from JSON assets.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`3934d28`](https://github.com/JSPrismarine/JSPrismarine/commit/3934d281e96f022a0d57c95d8de99794ed6dd244) Thanks [@filiphsps](https://github.com/filiphsps)! - Reduce allocations while resolving blocks and content types.
- Updated dependencies [[`183e92c`](https://github.com/JSPrismarine/JSPrismarine/commit/183e92c7f577bc34608555a13aaa88fd64f61530), [`5d424a0`](https://github.com/JSPrismarine/JSPrismarine/commit/5d424a05c2c9721f9d6a9863949f95d290cc13a5), [`8cc701d`](https://github.com/JSPrismarine/JSPrismarine/commit/8cc701d6dc05532abf27c10d87d0a3b6dbd25b73), [`09d523c`](https://github.com/JSPrismarine/JSPrismarine/commit/09d523c5fbd04af60800bee5ad2b12f2a7619e02), [`678e192`](https://github.com/JSPrismarine/JSPrismarine/commit/678e192e09582001760956a2f215619776fffa8e), [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d), [`7aabb3a`](https://github.com/JSPrismarine/JSPrismarine/commit/7aabb3a82903eae555ca83bddcb409bb0a4f693c), [`3934d28`](https://github.com/JSPrismarine/JSPrismarine/commit/3934d281e96f022a0d57c95d8de99794ed6dd244)]:
  - @jsprismarine/minecraft@0.17.0
  - @jsprismarine/molang@0.17.0
  - @jsprismarine/packs@0.17.0
  - @jsprismarine/content@0.17.0
  - @jsprismarine/mapping@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f3fa1c6`](https://github.com/JSPrismarine/JSPrismarine/commit/f3fa1c6bf9096223ac9d2b0396bcc71cd04e244e) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry the held item and the clicked face on the block hooks, and use them.
  
  `BlockPlaceEvent`, `BlockBreakEvent` and `BlockPlayerInteractEvent` gain `itemStack`, under Mojang's
  own field name, typed as a `HookItem`: an identifier plus a `get(name)` component reader.
  `@jsprismarine/items`'s `ItemStack` satisfies it structurally, so neither package imports the other.
  `BlockPlaceEvent` also gains `face` and `faceLocation`, the pair Mojang's `PlayerPlaceBlockBeforeEvent`
  carries, and `faceLocation` is now a `FaceLocation` rather than a `BlockPosition` because its
  components are fractions of a block.
  
  With those, `@jsprismarine/block-behaviors` replaces the workarounds it had listed as partial:
  honeycomb waxing and axe scraping across the six copper families, honeycomb sealing a sign, silk
  touch on glass and ice, shears on leaves, vines and lichens, buckets and bottles against liquids and
  the cauldron, flint and steel on candles, campfires and TNT, a pillar's axis from the clicked face,
  and a slab's half and a stair's flip from the click position. The test harness gains `heldItem`,
  `silkTouchTool`, and `face`, `faceLocation` and `itemStack` options on `place`, `breakBlock` and
  `interact`.
  
  Both bumps are `minor`. Adding required fields to the three event types is a breaking change, and
  per the versioning policy a breaking change below `1.0.0` is a `minor`. Anything that builds one of
  these events by hand, including a test double, has to add the new fields; `FamilyHarness.breakBlock`
  now takes an options object in place of its second positional argument.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`440e164`](https://github.com/JSPrismarine/JSPrismarine/commit/440e164b88f43548c9c4fe8ae896387157f21701) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose merged Java datapack tag memberships on resolved block and item types.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ea083fb`](https://github.com/JSPrismarine/JSPrismarine/commit/ea083fb8d67d0c285724b73bf94b41947afc4013) Thanks [@filiphsps](https://github.com/filiphsps)! - Write captured fixed partial collision shapes into the vanilla block overlay.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f33a57c`](https://github.com/JSPrismarine/JSPrismarine/commit/f33a57c3750488f1ed77a441ab26b7c1086eff68) Thanks [@filiphsps](https://github.com/filiphsps)! - Include captured Bedrock display names in generated block definitions.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`57f252b`](https://github.com/JSPrismarine/JSPrismarine/commit/57f252b2781508290fac2e842cf37fb652467d66) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop the overlay generator from shaping the package's source.
  
  `src/overlay.ts` imported `./families.ts` with the extension so that
  `utils/generate-overlay.ts` could load it under plain `node`. The cost landed on consumers: every
  package that resolves `@jsprismarine/blocks` to its source had to set `allowImportingTsExtensions`
  and `rewriteRelativeImportExtensions` to typecheck, which `@jsprismarine/block-behaviors` and
  `@jsprismarine/engine-systems` both did.
  
  The generator is now `utils/generate-overlay.mjs`, plain JavaScript over the built `dist/`, and
  `generate:overlay` builds the package first. `src/overlay.ts` writes an ordinary extensionless
  import, and both flags are gone from this package's tsconfig. The generated overlay is unchanged
  byte for byte; no public API moved, so this is a `patch`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d4afedd`](https://github.com/JSPrismarine/JSPrismarine/commit/d4afeddfc1a6016173261b800813e9f248208db8) Thanks [@filiphsps](https://github.com/filiphsps)! - Emit captured state-varying collision boxes as vanilla overlay permutations.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`89a02c8`](https://github.com/JSPrismarine/JSPrismarine/commit/89a02c81dd66293ab2b303851aad61c891535081) Thanks [@filiphsps](https://github.com/filiphsps)! - Publish the per-state block geometry column no property table had. `bedrockCollisionTopOf` answers
  how high a body standing in a block's cell is held up, and `bedrockLiquidReactionOf` what a liquid
  reaching the block does to it, for all 1477 palette blocks over 22091 states.
  
  The source is a Bedrock Dedicated Server's own block table, captured in the resources submodule and
  flattened by `utils/generate-geometry.mjs` into a committed table keyed by block identifier, with
  3014 per-state overrides keyed by runtime id. Java's shapes would have been the wrong ones: a cactus
  is 0.9375 tall in Java and a full block in Bedrock, and the client decides where a player may stand.
  
  This is the column the overlay generator says it does not have, and the one physics and pathfinding
  outside the content runtime were filling with hand-written name lists.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bfb9a31`](https://github.com/JSPrismarine/JSPrismarine/commit/bfb9a31a40c8173f1b811ee63b2308f357c47fd0) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/blocks`, the Bedrock block definition grammar and component runtime over
  `@jsprismarine/content`. `parseBlockDefinition` reads `format_version`, `minecraft:block.description`
  with its identifier, menu category, states, traits and the undocumented `internal_vanilla_data`, the
  component list and the permutations, dispatching on `format_version` to the newest of three known
  schemas at or below the file's version. `createBlockComponentRegistry` holds 56 `ComponentFactory`
  entries: the 49 names in Mojang's 1.26.20 `Components.json` with the parameter defaults those
  schemas declare, the four property components renamed at 1.19.40, `minecraft:custom_components`, and
  two this project adds for the facts Bedrock's grammar cannot hold. `BlockHooks` declares the ten
  hook names Mojang's `BlockCustomComponent` uses, so the behavior families attach through
  `BehaviorRegistry` and a future script host fits the same shape. `resolveBlocks` evaluates each
  permutation's Molang condition per state and applies its components over the base list with the
  later entry winning, groups states that match the same permutations onto one resolved type, and
  hands back a `BlockType` per identifier and a `BlockState` per palette state over a dense runtime
  id. `flattenBlockStates` precomputes solidity, light emission, light filter, blast resistance,
  hardness, friction and random ticking into typed arrays indexed by that id. The package ships the
  generated `jsprismarine_vanilla` overlay pack, a real Bedrock behavior pack declaring all 1477
  palette blocks from the Java-sourced property table, with the 182 Bedrock-only blocks on a reviewed
  exception list rather than a silent default.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b6eccf4`](https://github.com/JSPrismarine/JSPrismarine/commit/b6eccf49493ed702c5c13eb831ad9fa54258a47d) Thanks [@filiphsps](https://github.com/filiphsps)! - Route block power changes through data-driven redstone hooks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e17199e`](https://github.com/JSPrismarine/JSPrismarine/commit/e17199e28be25659495b398dc05d6a48baa2b593) Thanks [@filiphsps](https://github.com/filiphsps)! - Use the interaction rotation from PlayerAuthInput when orienting placed blocks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`18f0d0c`](https://github.com/JSPrismarine/JSPrismarine/commit/18f0d0ca7bfb691c75d2d2453eb21b0126e4a4e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Derive non-colliding vanilla block components from the captured Bedrock geometry table.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9f58b70`](https://github.com/JSPrismarine/JSPrismarine/commit/9f58b7012e39f08ef869149252312f3617c5d057) Thanks [@filiphsps](https://github.com/filiphsps)! - Dispatch entity home-block events through block behavior hooks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e678a6a`](https://github.com/JSPrismarine/JSPrismarine/commit/e678a6a48dd00568f1186f37f2d460b1c898f059) Thanks [@filiphsps](https://github.com/filiphsps)! - Preserve vanilla block tags in generated overlay

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a540a4c`](https://github.com/JSPrismarine/JSPrismarine/commit/a540a4cc5879f62d5d3b39d59100200af8e3d313) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose Bedrock block tags on resolved states

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a4abb61`](https://github.com/JSPrismarine/JSPrismarine/commit/a4abb61b7a03101b4f22ebab35da281066530430) Thanks [@filiphsps](https://github.com/filiphsps)! - Add reusable access to state-specific `minecraft:light_dampening` data. Grass and mycelium now turn to dirt only beneath a dark cover that blocks more than two light levels.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5e47439`](https://github.com/JSPrismarine/JSPrismarine/commit/5e474396321b54f696760962ceb9d24b85917640) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve redstone conductor overrides from `minecraft:redstone_conductivity` block components.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`fc10888`](https://github.com/JSPrismarine/JSPrismarine/commit/fc10888391866037519afbf8e057d4ecece48757) Thanks [@filiphsps](https://github.com/filiphsps)! - Export `PORTAL_BLOCK_NAMES`, the portal blocks, frames and fires the `jsprismarine:portal` family rule matches on, grouped by role, so `@jsprismarine/block-behaviors` reads the same list instead of naming the blocks again.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`6bac6b1`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac6b173e5e283b4e6e3d106268319caa51ed40) Thanks [@filiphsps](https://github.com/filiphsps)! - Send `minecraft:end_gateway` to the `jsprismarine:portal` family instead of `jsprismarine:inert`, which used to claim it first, and drop `nether_portal` from `PORTAL_BLOCK_NAMES` because the Bedrock palette only has `minecraft:portal`. The family tallies in both READMEs now match `vanilla_overlay/report.json`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4ab02e5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ab02e5cf76b88f09ba19106e971337c1da2d1b9) Thanks [@filiphsps](https://github.com/filiphsps)! - Pass sneak state to block interactions so copper doors and trapdoors can wax or scrape correctly.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a3db50e`](https://github.com/JSPrismarine/JSPrismarine/commit/a3db50eef709e1d2e3848d71383d6801d5f69773) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply correct-tool rules to block loot and family drops.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cc8b110`](https://github.com/JSPrismarine/JSPrismarine/commit/cc8b1109b9c174940cdd4549615a05affb459b9a) Thanks [@filiphsps](https://github.com/filiphsps)! - Play container open sounds once per open using block data

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`35e7df5`](https://github.com/JSPrismarine/JSPrismarine/commit/35e7df54b5bba03f65c9e3a972bac32b01ba4fe4) Thanks [@filiphsps](https://github.com/filiphsps)! - Mark vanilla water and lava as non-solid collision volumes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`13792da`](https://github.com/JSPrismarine/JSPrismarine/commit/13792daea4f024f559c9392e93328694db22e164) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve the built-in `corner_and_cardinal_direction`, `sixteen_way_rotation`, and `multi_block_part` trait states.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`a645006`](https://github.com/JSPrismarine/JSPrismarine/commit/a645006caa290b45c728b7ad87435249091cbd56) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry an `onUseOn` behavior's stack result back to the player's hand, so bone meal and other consumables used on a block are spent. An `onPlayerInteract` block hook can now answer with `{ consumed: true, consumesHeldItem: true }`, which the interaction dispatch charges to the hand outside creative; the portal family uses it to spend the eye of ender that fills an end portal frame.
- Updated dependencies [[`f5ea701`](https://github.com/JSPrismarine/JSPrismarine/commit/f5ea701bd7297d63eb524be1d4b76c07cf204569), [`428fd29`](https://github.com/JSPrismarine/JSPrismarine/commit/428fd2953c93ea8472696575798735a4a36ec51b), [`91a7a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/91a7a0bfac2eac8c81961d5263e54b53dc0c3fc5), [`232a1ce`](https://github.com/JSPrismarine/JSPrismarine/commit/232a1ce20b5ade2e33b703300fb671f0c3f62076), [`cde1039`](https://github.com/JSPrismarine/JSPrismarine/commit/cde1039d276df8d3787b361e072fafdb32a6da9a), [`f8a43ce`](https://github.com/JSPrismarine/JSPrismarine/commit/f8a43ce910da3d8e1c88091c8886a7c1d09ab0c0), [`e96d1b7`](https://github.com/JSPrismarine/JSPrismarine/commit/e96d1b76f18207192a9e815e6a2a558a8c4005ff), [`9dffb9a`](https://github.com/JSPrismarine/JSPrismarine/commit/9dffb9aa993febd34d79d0bd40afb4334bcd09fa), [`d4a2a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/d4a2a0b2787e171583e6db0aec1b750e8aeb1e95), [`d66cf52`](https://github.com/JSPrismarine/JSPrismarine/commit/d66cf527b79391e194f85137e1e5b573993c7947), [`d220519`](https://github.com/JSPrismarine/JSPrismarine/commit/d220519e2e460148a90cbde9d643033e27bf8f5e), [`28b5c00`](https://github.com/JSPrismarine/JSPrismarine/commit/28b5c00af0d5377e7030e82d409b6def544619ba), [`f370405`](https://github.com/JSPrismarine/JSPrismarine/commit/f37040563ed0cac590fe971ef3a448cb2e01a581), [`c1591b1`](https://github.com/JSPrismarine/JSPrismarine/commit/c1591b1e567a51dc80ecbbdfdbdc8e7c7f4f6c42), [`c9cafc8`](https://github.com/JSPrismarine/JSPrismarine/commit/c9cafc8529e05fe90ea2812920feb76cbcaf4a1b), [`8518afc`](https://github.com/JSPrismarine/JSPrismarine/commit/8518afc7b9ee684ebe4255ce26e7b56d612a145a), [`4355293`](https://github.com/JSPrismarine/JSPrismarine/commit/4355293f75d669659511516448b9c600900c351b), [`db4b039`](https://github.com/JSPrismarine/JSPrismarine/commit/db4b039894d90ab3a7ee6fc700728adadfc678f5), [`08de1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/08de1bac21f3c5785a02649e4faa11d9a11f82b0), [`0626058`](https://github.com/JSPrismarine/JSPrismarine/commit/06260585d51d8ce0668b7cf854663bb1aea9aee9), [`2fcd89f`](https://github.com/JSPrismarine/JSPrismarine/commit/2fcd89f8ff551915692aedca68cd556735432590), [`91fcf8b`](https://github.com/JSPrismarine/JSPrismarine/commit/91fcf8b9a7c4334c8fab86bc4fae2b94356351d5), [`015a810`](https://github.com/JSPrismarine/JSPrismarine/commit/015a8102014c24f224797dec0b1919d3a045e1c3), [`29aa940`](https://github.com/JSPrismarine/JSPrismarine/commit/29aa940e8ddc1db5bf37b213179adad8e3eb21a5), [`78694d1`](https://github.com/JSPrismarine/JSPrismarine/commit/78694d1577b8bc994963b5eb53d712858ee363df), [`908645b`](https://github.com/JSPrismarine/JSPrismarine/commit/908645b1f8ea87a6e511dbe25675f39760b41627), [`9d93172`](https://github.com/JSPrismarine/JSPrismarine/commit/9d931725e8d48fab773c2fe9f659b2f3e1d26325), [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a), [`f0584a3`](https://github.com/JSPrismarine/JSPrismarine/commit/f0584a381c6bab5c61e5aa2cd3782218bc8d74e7), [`32ce6f2`](https://github.com/JSPrismarine/JSPrismarine/commit/32ce6f2f752e7e89c4445d1936e13a6e243a3a30), [`9e53c61`](https://github.com/JSPrismarine/JSPrismarine/commit/9e53c61399266bf9e26dd87160c45ccd251a21f8), [`8b1bf1b`](https://github.com/JSPrismarine/JSPrismarine/commit/8b1bf1b337e7cb9e1d8f61d8df8b42e2b2badcb6), [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c), [`23450ee`](https://github.com/JSPrismarine/JSPrismarine/commit/23450ee6e61092c05e2cebeca492c95b28e8da0d), [`bed113d`](https://github.com/JSPrismarine/JSPrismarine/commit/bed113d91a2de02b80d5688c3f43eadf802271c4)]:
  - @jsprismarine/minecraft@0.16.0
  - @jsprismarine/mapping@0.16.0
  - @jsprismarine/packs@0.16.0
  - @jsprismarine/content@0.16.0
  - @jsprismarine/molang@0.16.0
