# @jsprismarine/worldgen

## 0.23.2

### Patch Changes

- Updated dependencies [[`5f48cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/5f48cd10e4ca5b53ef19ebd214b70b1de18acca9)]:
  - @jsprismarine/errors@0.23.2

## 0.23.1

### Patch Changes

- [#3481](https://github.com/JSPrismarine/JSPrismarine/pull/3481) [`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f) Thanks [@filiphsps](https://github.com/filiphsps)! - Export the types the public API already uses, so a consumer can name what a function takes or returns. Each package's entry point now exports the interfaces, type aliases and classes its exported signatures reference, and `@jsprismarine/prismarine` and `@jsprismarine/script-host` publish the modules that define them.
  
  `@jsprismarine/protocol` exports five wire types under new names, because the packet API already uses the plain names for other types: `ActorLinkFields`, `AbilityLayerFields`, `SerializedAbilitiesDataFields`, `GameRuleFields` and `UUIDValue`.

- [#3477](https://github.com/JSPrismarine/JSPrismarine/pull/3477) [`6afe243`](https://github.com/JSPrismarine/JSPrismarine/commit/6afe2434c34f74ce16494876b4722365b416388f) Thanks [@filiphsps](https://github.com/filiphsps)! - Evaluate `final_density` a whole interpolation cell at a time in the terrain walk. `ChunkSampler.forEachCellBlock` now fills each cell's densities through a `CellProgram`, which runs the density tree one node at a time over the cell's blocks instead of one chain of closures per block, the way Java 26.3's `sampleVolume` evaluates it. The values are the closures' bit for bit; a node the program has no loop for runs its closure per position. Under every vanilla noise settings `final_density` runs no closure per block, where it ran about thirteen before. `RandomState.cellProgram` and `DensityFunctionCompiler.cellProgram` build one.
- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/errors@0.23.1

## 0.23.0

### Minor Changes

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

- [#3470](https://github.com/JSPrismarine/JSPrismarine/pull/3470) [`823a321`](https://github.com/JSPrismarine/JSPrismarine/commit/823a32166248e10f8be45f45e9cf9f8ef17861de) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the opt-in volume density evaluator: `ChunkSampler`'s `useVolumeDensity` option, `RandomState.volumeSampler`, `DensityFunctionCompiler.compileVolume`, and the `DensityVolume` and `DensityVolumeEvaluator` types. It was off by default and slower than the scalar evaluator on the measured overworld graph. Sample density with `RandomState.sampler` and walk chunks with `ChunkSampler` as before.

### Patch Changes

- [`bd06d38`](https://github.com/JSPrismarine/JSPrismarine/commit/bd06d385bf9cfa9de40703ef4a7ca218253a3f23) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix Nether and End chunks failing to load with the persistent terrain cache on. `parseNoiseGeneratorSettings` now leaves `aquifers` out of the settings when the document names none, instead of setting it to `undefined`, which the cache key's hash refused.

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Errors carry a stable code and a link to their entry in the error reference at https://jsprismarine.dev/errors/, from their catalog in `@jsprismarine/errors`. Messages are unchanged.

- [#3452](https://github.com/JSPrismarine/JSPrismarine/pull/3452) [`f8843ce`](https://github.com/JSPrismarine/JSPrismarine/commit/f8843ce726b96032631a15efbc2dea76e743b68a) Thanks [@filiphsps](https://github.com/filiphsps)! - Rule out ore veins a whole interpolation cell at a time. `RandomState.boundSampler` bounds a density function's samples over a box of blocks, and `compileOreVeinRule` takes that bound to skip the cells where the vein density cannot be positive, instead of sampling it at every stone block. The surface pass passes it, so a chunk samples the vein density at about a tenth of its blocks and places the same ore.

- [#3404](https://github.com/JSPrismarine/JSPrismarine/pull/3404) [`9878bb1`](https://github.com/JSPrismarine/JSPrismarine/commit/9878bb1b6fa05000787138b077db166e2f17f47e) Thanks [@filiphsps](https://github.com/filiphsps)! - Answer the surface pass's biome conditions from a chunk's own biome cells for the blocks whose jittered biome lookup reads no other cell. `BuildSurfaceOptions` gains an optional `localBiomes` box. An Overworld chunk now makes about 11,000 per-block biome lookups in its surface pass instead of about 25,000, with no extra climate searches.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/worldgen` reads Java 26.4's world generation grammar when given its data pack format. `WorldgenDataSource`, `parseDensityFunction` and `parseNoiseGeneratorSettings` take an optional `format`, the target's data pack format major. From format 128 on, the `upscale` density function replaces `interpolated`, and `noise_settings` has no `default_block`, because the vanilla material rules place every solid block. A custom material rule that leaves a solid position unplaced gets stone there, where Java leaves air. Without a format they read 26.3's grammar as before. `@jsprismarine/errors` adds `UnsupportedUpscaleMode` and `UnevenUpscaleCells` for the `upscale` shapes that are not implemented, and `NonPositiveUpscaleCell` for an `upscale` axis whose `cell_size` is zero or less.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`8e72453`](https://github.com/JSPrismarine/JSPrismarine/commit/8e7245335a09057151d7e1af70398fa32d1a93c5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the `unhandledJavaTypes` module, the reviewed lists of Java registry types the package has no reader for. A test checks them against the pinned Java registry report.

- [#3474](https://github.com/JSPrismarine/JSPrismarine/pull/3474) [`2682079`](https://github.com/JSPrismarine/JSPrismarine/commit/26820792b905fd8b0da34e3058c9e64ae4c14be4) Thanks [@filiphsps](https://github.com/filiphsps)! - Fill interpolation cells in the order Java builds terrain in. Java 26.3's `doFill` samples `final_density` through `sampleVolume`, whose `interpolated` nodes lerp the four z edges, then x, then step y as a running sum, and its per-block `sampleValue` interpolates x, then y, then z. The two differ in the last bits of a float, and the terrain fill followed the per-block order. The cell walk now uses the volume order and matches Java's `sampleVolume` bit for bit in every section of the 14 captured chunks, while a sample taken one block at a time keeps the per-block order. One block of the committed generation corpus changes from air to stone, at -2392, 38, -4815 for seed 1234, where Java's density is 9.3e-10 and the per-block path's was -3.7e-9.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0

## 0.22.0

### Patch Changes

- [`729cc48`](https://github.com/JSPrismarine/JSPrismarine/commit/729cc4858e11042f4c80a99615996a5b02417c04) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `forEachBorderTick` to `blending/Blender`, the positions Java's `Blender.generateBorderTicks` checks in an old chunk for leaves and fluids to mark for post-processing.

- [#3084](https://github.com/JSPrismarine/JSPrismarine/pull/3084) [`246333d`](https://github.com/JSPrismarine/JSPrismarine/commit/246333d2e667c3ba8c2b0e7e414d7963b8a32508) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry each terrain tile's sampled biome cells with the tile, so a feature worker, the server thread and a terrain cache hit read them instead of searching the climate tree again. With two workers, a 25-chunk block now runs about 40% fewer climate searches, and the generated chunks are byte-identical. `@jsprismarine/worldgen` adds `createBiomeCellMemo`, a biome memo that can be told answers computed on another thread.

- [#3083](https://github.com/JSPrismarine/JSPrismarine/pull/3083) [`0076fcd`](https://github.com/JSPrismarine/JSPrismarine/commit/0076fcd84bfc65a9ff2d75f993528fa9236f1779) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `blending/belowZeroRetrogen.ts`, Java's rules for giving a pre-1.18 overworld chunk its floor under y = 0: which chunks are upgraded, which columns stay open, and which biomes the new floor keeps.

- [#3083](https://github.com/JSPrismarine/JSPrismarine/pull/3083) [`7282f36`](https://github.com/JSPrismarine/JSPrismarine/commit/7282f36c8b1342316f54e6985655e570ba991e9a) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Java's world blender: `blending/Blender.ts` and `blending/BlendingData.ts` bend a new chunk's heights, densities and biomes toward the old chunks next to it, and filter its carvers, matching Java 26.3 exactly against the new `vectors/blending.json`. `blending/generationVersion.ts` exports the data versions that decide which chunks are old, and `NormalNoise.parity` ports Java's `NormalNoise.createParity`.

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6

## 0.20.0

No changes in this release.

## 0.19.2

No changes in this release.

## 0.19.1

No changes in this release.

## 0.19.0

### Patch Changes

- [`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Point the Discord link in each package README at the project's current invite.

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.

- [`13dd1a1`](https://github.com/JSPrismarine/JSPrismarine/commit/13dd1a15e5e2c7db2ee5072db28a0b327a8a5e26) Thanks [@filiphsps](https://github.com/filiphsps)! - Speed up the 64-bit multiply behind biome jitter and positional seeds by replacing its floating point remainder with integer arithmetic. Its output is unchanged.

- [`8d90227`](https://github.com/JSPrismarine/JSPrismarine/commit/8d90227f749c3b016bf066b770adc6ce15814c6d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remember more biome cells per resolver, so a worker that finishes several decorated chunks resolves about 15% fewer cells twice. Generated terrain is unchanged.

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`9bbe11b`](https://github.com/JSPrismarine/JSPrismarine/commit/9bbe11b9563745852c71506dc22c911fde0114fa) Thanks [@filiphsps](https://github.com/filiphsps)! - Share immutable climate search tables across generation workers, retain local parsing as a fallback, and add worker heap snapshot diagnostics.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`f1a2771`](https://github.com/JSPrismarine/JSPrismarine/commit/f1a2771104f57bbe927d330b4b162bc3673edc9d) Thanks [@filiphsps](https://github.com/filiphsps)! - Add an opt-in typed-array evaluator for final-density interpolation cells.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`ab7daa1`](https://github.com/JSPrismarine/JSPrismarine/commit/ab7daa106d8c35b07cf64e5c8166f361644b8360) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix generated density evaluators to preserve exact slice coordinates.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`52e899b`](https://github.com/JSPrismarine/JSPrismarine/commit/52e899b729f1b77452d638107628764771303093) Thanks [@filiphsps](https://github.com/filiphsps)! - Select a source chunk's carvers from the noise biome at Java's quart coordinates instead of the jittered block biome. A data pack whose neighboring biomes list different carvers now digs the carvers Java digs, and each carved chunk skips 289 fuzzy biome lookups.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`318a038`](https://github.com/JSPrismarine/JSPrismarine/commit/318a0386c1322b77799192cd90d1c1c44a13b5b4) Thanks [@filiphsps](https://github.com/filiphsps)! - Break exact climate ties by search tree order instead of by the previous lookup. A biome at a fixed seed and position no longer changes with the lookups that ran before it. The answer is the one Java gives a thread with no earlier lookup.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`8bdc3d4`](https://github.com/JSPrismarine/JSPrismarine/commit/8bdc3d447250cfa6589155c5a7ebfdd6a9d3ab6e) Thanks [@filiphsps](https://github.com/filiphsps)! - Cache y-independent climate columns and remove target allocation from biome searches.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`4196b67`](https://github.com/JSPrismarine/JSPrismarine/commit/4196b676e0d0b35e1c81e85e48fa74176dbba17b) Thanks [@filiphsps](https://github.com/filiphsps)! - Reuse biome-cell corner jitter values across block queries.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`0a8ae9a`](https://github.com/JSPrismarine/JSPrismarine/commit/0a8ae9a0c378e3b5e59366d52cb52a898d647d9a) Thanks [@filiphsps](https://github.com/filiphsps)! - Pool and reset terrain sample contexts between generation tasks.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`9406146`](https://github.com/JSPrismarine/JSPrismarine/commit/94061468716fef624e21ca3b76fb18938a979f7c) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip proven global-fluid interpolation cells during terrain fill.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`b1ebfe6`](https://github.com/JSPrismarine/JSPrismarine/commit/b1ebfe6071afaeaf5b6795ec215a75b92753b1fb) Thanks [@filiphsps](https://github.com/filiphsps)! - Precompute interpolated density cell values in reusable buffers during chunk generation.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`98dea94`](https://github.com/JSPrismarine/JSPrismarine/commit/98dea94c94ce084f2cbce6170d826a808a63384a) Thanks [@filiphsps](https://github.com/filiphsps)! - Precompute climate centers once per tree node during search-tree construction.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`99a59f0`](https://github.com/JSPrismarine/JSPrismarine/commit/99a59f0604675678339b39b764a56267413b9687) Thanks [@filiphsps](https://github.com/filiphsps)! - Share climate search indexes across generation workers

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`05d61f9`](https://github.com/JSPrismarine/JSPrismarine/commit/05d61f9c6cb7000d1b81908ca94dc1af7bd8fec8) Thanks [@filiphsps](https://github.com/filiphsps)! - Add an opt-in density function code generation prototype to `RandomState`.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`3000120`](https://github.com/JSPrismarine/JSPrismarine/commit/3000120a653848f2fc8596d7cdccb55d8f21f064) Thanks [@filiphsps](https://github.com/filiphsps)! - Size a chunk's interpolation cells from the `interpolated` nodes reachable from final density. Once the surface pass compiled `chunk_surface_level` on the same random state, later chunks walked 6144 cells instead of 768. `RandomState.interpolationCellSizeOf` returns the cell of one tree, and `RandomState.interpolationCellSize` is deprecated.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`d049765`](https://github.com/JSPrismarine/JSPrismarine/commit/d04976541aee27f8e3fc198e703173e56740b515) Thanks [@filiphsps](https://github.com/filiphsps)! - Add serializable random states and a versioned replay initial-state manifest.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`e5c9812`](https://github.com/JSPrismarine/JSPrismarine/commit/e5c98121aac113c02f7684752b26e228a86c57b8) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace hot random BigInt math with exact number-lane operations.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`ffa08fb`](https://github.com/JSPrismarine/JSPrismarine/commit/ffa08fb0ebcaff9b5edbc68fcbc4cb2632fc8f18) Thanks [@filiphsps](https://github.com/filiphsps)! - Store climate search nodes in flat typed arrays

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`c6b0b49`](https://github.com/JSPrismarine/JSPrismarine/commit/c6b0b49e4b59e03b9b7dd0366f280ff7832c77b2) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Java's climate spawn-target search and resolve the spawn position inside its selected chunk.

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7efae53`](https://github.com/JSPrismarine/JSPrismarine/commit/7efae5385415852da187f6b3ec1c010592b00d98) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the terrain fill cheaper without moving a block. `ChunkSampler` gains `cellCount` and
  `forEachCellBlock`, which walk a chunk one interpolation cell at a time instead of column by
  column, and `DataDrivenGenerator` fills through them: a column walk left an interpolation cell
  every eight blocks and made the density stack refetch its eight corners 57177 times per chunk
  where the lattice holds 768 cells. An `interpolated` node now keeps its cell state in flat typed
  arrays, takes its lattice index from a shift and its interpolation weight from a table, and its
  corner cache is sized to the 8 by 8 by 64 window a chunk's lattice actually occupies rather than
  four times that.
  
  `SampleContext.interpolationCorners` is now the flat buffer rather than a lookup method, and
  `beginInterpolationCell` is replaced by `interpolationCell`. Both are seams for the compiled
  density closures; nothing outside the density stack called them.
  
  Separately, the structure beardifier indexes its pieces by the columns they reach. It is the
  right operand of the top-level add in the overworld's `final_density`, so it runs on all 98304
  samples of a chunk and used to scan every nearby piece on each one.
  
  Every step is bit-identical, which the six golden chunks, the Java terrain vectors and a new
  block-for-block comparison between the two walks assert.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bd6780f`](https://github.com/JSPrismarine/JSPrismarine/commit/bd6780f89c73c69635adb9785a997f3103145fb1) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/worldgen`: Java Edition 26.3's terrain stack. It implements
  `XoroshiroRandomSource`, `LegacyRandomSource` and both positional factories; Perlin, smeared
  Perlin, simplex, normal and old blended noise over the 26.3 noise parameter schema; all 44 density
  function operator types, compiled once per tree into closures rather than interpreted per sample;
  the eight-slot noise router and the six aquifer functions parsed from `worldgen/noise_settings`;
  the noise-based aquifer with its fluid picker; the `minecraft:ore_vein` material rule; and a
  chunk-shaped sampler that produces Java block state identifiers for a column or a whole chunk.
  
  Expected values in the test suite come from Mojang's own classes through
  `utils/oracle/DumpWorldgenVectors.java` rather than from a second implementation of the same
  formulas. All 55 vanilla density functions, 64 noises and 7 noise settings parse with no errors,
  and every noise router slot, every aquifer function and nine whole overworld columns match Java
  exactly.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bd65536`](https://github.com/JSPrismarine/JSPrismarine/commit/bd65536e966bab81bbf9af147a0bf5440890cdae) Thanks [@filiphsps](https://github.com/filiphsps)! - Generate overworld chunks at a usable rate.
  
  Preloading 25 chunks of the data-driven overworld took the better part of three minutes, which
  put the default `preload-radius: 10` at roughly fifty. A profile put the time in four places,
  none of them the density function graph the plan expected.
  
  The surface pass asks for the biome of every block it walks, and every ask ran a full
  multi-noise lookup: six density functions, every noise octave under them, then a nearest-box
  search over 7594 climate boxes. A chunk holds 1536 biome cells and 98304 blocks.
  `memoizeBiomeResolver` wraps a `BiomeResolver` so a cell is resolved once, which is what Java
  gets for free by reading the chunk's biome array, and the generator now shares one memoized
  resolver across the surface pass, the structure level and the biome column.
  
  An interpolated density function reads the eight corners of its cell, and a chunk's 16 by 384
  by 16 blocks sit on 1225 of them. `CornerCache` hashed the corner position into 4096 slots, and
  at that load factor collisions evicted corners the walk was still using, so a chunk evaluated
  its 1225 corners 6139 times. Corners lie on a lattice, so the slot is now the cell index masked
  per axis and the count is exactly 1225. `CornerCache.getOrCompute` takes the cell indices
  alongside the position, which is the breaking part of this release.
  
  `BiomeManager` derived the eight jitter offsets around a block from a string-keyed map, nine
  `long` multiplications per lattice point; they now live in a direct-mapped cache on the same
  lattice. And the block oracle handed its cached Bedrock facts back as a fresh record on every
  one of the millions of calls a decoration pass makes, where two flags in a number will do.
  
  Generating 25 chunks at seed 1234 fell from 22.2 to about 8 seconds of CPU, and the terrain is
  unchanged: every generated chunk hashes identically, over the 5 by 5 region at seed 1234 and a
  3 by 3 region at seed 5678.
  
  The terrain fill also handed the event loop back every four columns, 64 times a chunk. A round
  trip through the event loop is a trip through the host's scheduler, so on a busy host a preload
  spent most of its wall clock waiting rather than generating. It now yields on a 4 millisecond
  budget, which is the property the yield was there for.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b79c330`](https://github.com/JSPrismarine/JSPrismarine/commit/b79c33066896e4639b4c5a06b6739add55a3d361) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the material rule again under a cave mouth that took a grass block, so a carved opening is
  left with grass rather than bare dirt.
  
  Two reports, one cause. Dirt sat exposed to the sky where a cave had broken the surface, and
  short grass grew on that dirt. The grass is legal: Java's `#minecraft:dirt` is inside
  `#minecraft:substrate_overworld`, which is inside `#minecraft:supports_vegetation`, and
  `patch_grass_plain` adds no ground predicate. The dirt is what should not have been there.
  
  Java remembers, per carved column, whether the carve has taken a grass block or mycelium out of
  it. Once it has, every plain `minecraft:dirt` the carve then uncovers goes back through the
  material rule, through `MaterialSystem.topMaterial`. This server had no such entry point, so the
  carve wrote its opening and stopped.
  
  `SurfaceSystem.buildSurface` now returns the context and the compiled rule it built as a
  `SurfacePass`, whose `topMaterial` evaluates that rule at one position with both stone depth
  counters pinned to one and the water line one block up. One context serves the whole chunk where
  Java builds a fresh one per call, which computes the same answers: every cached value in the
  context is keyed by the update counters that `updateXZ` and `updateY` bump.
  
  Two neighboring carver deviations go with it. The mask the generator allocated spanned the whole
  dimension, so a carver could open the bottom block and the top seven that Java's `CarvingMask`
  protects; `CarvingMask.forChunk` already had those bounds and nothing called it. The apply loop
  also skipped a cell that already held a fluid, where Java skips only `#minecraft:uncarvable` and
  lets the aquifer decide what replaces the water it removed.
  
  This moves generated worlds. One chunk of the parity corpus changed, `987654321/333,-17`: three
  dirt blocks under a cave mouth became grass blocks, and twenty-eight blocks at y -63 that the old
  mask let a carver flood with lava stayed deepslate.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`3561178`](https://github.com/JSPrismarine/JSPrismarine/commit/3561178664c8a57459f841687f80e6c4be9c2661) Thanks [@filiphsps](https://github.com/filiphsps)! - `parseClimateParameterPoint` accepts a climate axis written as a `[min, max]` list, the shape Mojang's data generator writes into `reports/biome_parameters`, beside the number and `{ min, max }` forms it already read.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5794f0b`](https://github.com/JSPrismarine/JSPrismarine/commit/5794f0bccdc0cc2123b46b71af342ece984e774a) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip repeated float narrowing for Perlin lattice offsets.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`ef7ed80`](https://github.com/JSPrismarine/JSPrismarine/commit/ef7ed800b96bf9fa0807cf745af1289b627c5770) Thanks [@filiphsps](https://github.com/filiphsps)! - A `minecraft:flat` level stem may name a `worldgen/flat_level_generator_preset` id in place of
  its settings object, as Java's `world_gen_settings` allows. `parseGeneratorDefinition` keeps the
  id as a `FlatPresetGeneratorDefinition`, the `minecraft:flat` factory resolves it through the pack
  stack's preset registry and reads the document's `settings`, and the save writes the stem back
  as the id. `isFlatGenerator` narrows to a stem that carries its layers, so the `level.dat` flat
  layers and the announced biome are written only when the layers are in the stem.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`62e14d2`](https://github.com/JSPrismarine/JSPrismarine/commit/62e14d2bf3c19d77897733a422885cdffdf13334) Thanks [@filiphsps](https://github.com/filiphsps)! - Inline Perlin gradient dot products

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`86444b4`](https://github.com/JSPrismarine/JSPrismarine/commit/86444b41bb7281acbd0e556ad9421fe913321af0) Thanks [@filiphsps](https://github.com/filiphsps)! - Inline climate range distance arithmetic in the biome search hot path.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f060520`](https://github.com/JSPrismarine/JSPrismarine/commit/f060520321901b222197f2c65e75d5771c47cdfe) Thanks [@filiphsps](https://github.com/filiphsps)! - Speed up climate biome lookup

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0f9d3c1`](https://github.com/JSPrismarine/JSPrismarine/commit/0f9d3c18e72967d0f4d1ba40221a1076bf24ac42) Thanks [@filiphsps](https://github.com/filiphsps)! - Cache horizontal density interpolation stages

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`258e9d9`](https://github.com/JSPrismarine/JSPrismarine/commit/258e9d915c9d067a86f576ae64f07b992b7c4485) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop a structure's height query at the block it found, with aquifers still on.
  
  `StructureLevel.baseHeight` sampled a whole 384-block column and then scanned it downward for the
  topmost block the heightmap accepts, which paid for every block under the one it returned. Java's
  `NoiseBasedChunkGenerator.iterateNoiseColumn` walks down from the dimension ceiling and returns at
  the first match, so `ChunkSampler.columnTop` does that and `baseHeight` uses it. Heights are
  remembered per column and heightmap, and a column already sampled for `baseBlock` answers without
  sampling anything again.
  
  No generated world moves. The aquifer part is the reason to say so: it is widely assumed that Java
  samples this column with aquifers off, because it used to. 26.3's `iterateNoiseColumn` builds its
  `NoiseChunk` from the dimension's own fluid picker and the settings' `aquifers` block, so an
  underground lake is part of the surface a structure settles onto. Over 11,520 columns and 253
  structure starts across three seeds, turning aquifers off would have moved 28 columns by up to 20
  blocks and dropped a cold ocean ruin 28 blocks through the sea floor.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4cf5c25`](https://github.com/JSPrismarine/JSPrismarine/commit/4cf5c25c105f4d7dbea3d1d877d67cce48006234) Thanks [@filiphsps](https://github.com/filiphsps)! - Reuse y-interpolation results within a density cell

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`2515674`](https://github.com/JSPrismarine/JSPrismarine/commit/2515674ce840cad4dd80739d4042228c5e6172c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `parseDimensionType`, `parseLevelStem`, `parseWorldPreset`, `parseFlatGeneratorSettings` and `parseBiomeSource`, which read Java's `dimension_type`, level stem, `world_preset` and flat generator documents and build a `BiomeSource` from a stem's `biome_source`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c29803c`](https://github.com/JSPrismarine/JSPrismarine/commit/c29803c5f9f502263fa51fe8c29d41a846048019) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the three stages that sit on top of the terrain core: the surface pass, the biome sources and
  the carvers.
  
  `SurfaceSystem` walks a chunk column by column, keeps the stone depth counters above and below
  each solid block, derives the randomized surface depth from a positional random, and applies a
  material rule tree. All five `material_rule` types and all eleven `material_condition` types 26.3
  registers are implemented, including the four no other TypeScript implementation has: `bandlands`,
  `hole`, `steep` and `ore_vein`. The ore vein rule reuses `compileOreVeinRule`, which 1.21 drove
  from three noise router slots and 26.3 moved into the rule tree. Eroded badlands pillars and
  frozen ocean icebergs run here too, as they do in Java.
  
  `MultiNoiseBiomeSource` carries the seven-axis climate parameter model and Java's search tree over
  it, with `ClimateParameterList.findBruteForce` as the independent check. `FixedBiomeSource`,
  `CheckerboardBiomeSource` and `TheEndBiomeSource` cover the other three layouts. `BiomeManager` is
  the per-block getter the surface pass needs: it picks between the eight surrounding biome cells
  with Java's seeded jitter, so a biome-conditioned rule resolves per column rather than per chunk.
  
  `carveChunk` runs the `cave` and `canyon` carvers over the 289 source chunks that can reach one
  chunk, seeded per source chunk from the world seed, and records the result in a `CarvingMask`.
  
  Every expected value comes from Mojang's own classes through
  `utils/oracle/DumpSurfaceVectors.java`. Whole columns of the overworld, the nether and the end
  match Java block for block after the surface pass; one synthetic rule per condition type matches
  over the same chunk; the biome lookup matches over the full 7594-point overworld parameter list and
  the 5-point nether one; and both carvers open exactly the blocks Java opens in five chunks. Carver
  paths cannot match Bedrock Edition for the same seed, because Bedrock's generator is undocumented,
  so the Bedrock-facing tests check determinism and distribution instead and say so in their names.
