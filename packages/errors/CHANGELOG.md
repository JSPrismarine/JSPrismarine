# @jsprismarine/color-parser

## 0.25.0

### Minor Changes

- [#3662](https://github.com/JSPrismarine/JSPrismarine/pull/3662) [`27c272f`](https://github.com/JSPrismarine/JSPrismarine/commit/27c272f90af03738b7fd9778e2bddea955fe9cb6) Thanks [@filiphsps](https://github.com/filiphsps)! - Generate the error classes ahead of time instead of building them at run time. The catalogs moved to `packages/errors/catalog/`, and `pnpm --filter @jsprismarine/errors run generate` writes each one's module under `src/` as plain class declarations, so an ahead-of-time compiler such as scriptc can compile the package. Throw sites, `code`, `docs`, `params`, the statics and `instanceof` a catalog class or category work as before.
  
  Breaking changes:
  
  - `instanceof JSPrismarineError` now holds only for the errors built on `Error`. An error built on `TypeError`, `RangeError` or `ReferenceError` extends the new `JSPrismarineTypeError`, `JSPrismarineRangeError` or `JSPrismarineReferenceError` root, and stays an instance of the built-in error. Test for any catalog error with `isJSPrismarineError(value)`.
  - `defineErrors`, `formatMessage` and the catalog types (`ErrorEntry`, `ErrorBase`, `ErrorClass`, `ErrorCatalog`, `ErrorArgs`, `ErrorParams`, `Placeholders`, `MessageOf`, `BaseOf`) are no longer exported. `CatalogedError` is now the interface every catalog error implements, with `params` typed as a record.
  - The static `module` exists only on the classes of a domain split across modules, such as `prismarine/world`.
  - The roots are abstract classes that declare `code`, `docs` and `params`, so a TypeScript class that extends a group class, such as `LoggedFieldError`, `RegistryBundleFormatError` or `ConfigSyntaxError`, must now set all three. `isJSPrismarineError` returns false for a JavaScript subclass that leaves them out. A class that extends a catalog entry inherits them, as before.
  - Each class keeps its params in a private field behind a `params` getter, so `params` stays out of `util.inspect`. `params` is no longer an own property of the error, reading it through a `Proxy` of the error throws a `TypeError`, and a plain object no longer satisfies `InstanceType<typeof SomeErrors.Entry>`. Type a test double as `CatalogedError`, or construct the real class.

- [#3662](https://github.com/JSPrismarine/JSPrismarine/pull/3662) [`d1e9714`](https://github.com/JSPrismarine/JSPrismarine/commit/d1e97142dcfdab12f895719eca9bcbee78346c9a) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `isJSPrismarineError(value)` to `@jsprismarine/errors/JSPrismarineError`. It returns true for every catalog error, including one that another installed copy of the package built, and narrows the value to an error with `code`, `docs` and `params`.

- [#3590](https://github.com/JSPrismarine/JSPrismarine/pull/3590) [`c053dfc`](https://github.com/JSPrismarine/JSPrismarine/commit/c053dfcdd32006386469c31b8448cdfa33b9333f) Thanks [@filiphsps](https://github.com/filiphsps)! - A function macro's arguments are read with `@jsprismarine/nbt`'s SNBT reader, and each entry substitutes as Java's `MacroFunction` prints it: a float or a double through Java's `DecimalFormat` with at most 15 fraction digits (`1.0d` as `1`, `0.5d` as `.5`), and a typed array or an escaped string as it reads. The server's own macro argument parser is gone, and with it `SnbtSyntaxError` and the five `PrismarineCommandErrors.Snbt*` entries.

### Patch Changes

- [`dda9dbe`](https://github.com/JSPrismarine/JSPrismarine/commit/dda9dbe5ebfdcdc338e37bf24ae8fe561c9308bb) Thanks [@filiphsps](https://github.com/filiphsps)! - The server has an allow list: `allowlist.json` beside `config.json`, in Bedrock Dedicated Server's format, and the `allow-list` setting, which turns away a player who is not on it with "You are not invited to this server." `@minecraft/server-admin`'s `dedicatedServer.allowList` reads and changes it, with BDS's errors. `Server.getAllowList`, the `prismarine:allow-list` module, `ScriptAdminServer.allowList` and the `AllowListNotList` error are new. Closes [#3633](https://github.com/JSPrismarine/JSPrismarine/issues/3633).

- [#3590](https://github.com/JSPrismarine/JSPrismarine/pull/3590) [`2132959`](https://github.com/JSPrismarine/JSPrismarine/commit/2132959244601c90055b091a4273a008eadf0f3d) Thanks [@filiphsps](https://github.com/filiphsps)! - A level keeps Java Edition's command storage, `Level.getCommandStorage`: an NBT compound under each resource location, which reads as the empty compound until something writes it. The save writes it under the LevelDB key `jsprismarine:command_storage`, one entry of SNBT per storage, split into a list of strings when it is too long for one, and drops the key once every storage is empty. A provider's `LevelRecords` carry it as `commandStorage`. `PrismarineWorldErrors.InvalidStorageId` refuses an id that is not a resource location.

- [`d4adb53`](https://github.com/JSPrismarine/JSPrismarine/commit/d4adb5381a368d2076a0648ce2522c12cf72ab48) Thanks [@filiphsps](https://github.com/filiphsps)! - A console command typed while the server starts runs once the worlds load, where it failed with `Cannot read properties of undefined (reading 'getLevel')`. Asking for the entry world before it loads now throws `EntryWorldNotLoaded`, which names the cause.

- [#3590](https://github.com/JSPrismarine/JSPrismarine/pull/3590) [`47aad59`](https://github.com/JSPrismarine/JSPrismarine/commit/47aad598440fd81e5177c60ffeb49972ce697960) Thanks [@filiphsps](https://github.com/filiphsps)! - A player's inventory is the player layout of `EntityInventory` (`@jsprismarine/prismarine/inventory/EntityInventory`), a set of named `ItemContainer`s (`@jsprismarine/prismarine/inventory/ItemContainer`). A slot holds an `Item` or `null`, and the count is the item's own, so `Inventory` and `ContainerEntry` and their entry points are gone. Reach a container with `inventory.container('inventory' | 'armor' | 'offhand' | 'ender_chest' | 'cursor')`, and the held and worn stacks with `equipment(slot)`, `setEquipment(slot, item)` and `setEquipmentCount(slot, count)`. `getItemInHand`, `setItemInHand`, `setHandCount`, `getArmor`, `getOffhand`, `getEnderChest`, `getCursor` and `setCursor` are replaced by those, `getHandSlotIndex` is `getHandSlot`, and `observeCarried` is `observe`. In `inventory/slotLog`, `PLAYER_CONTAINERS`, `PlayerContainer` and `playerContainerNamed` are `ENTITY_CONTAINERS`, `EntityContainer` and `entityContainerNamed`, and `slotValueOf` takes an item, replacing `slotValueOfItem`. In `inventory/persistence`, `storedStack` and `restoredStack` are gone and `storedItem` reads the count off the item. `ItemActor.getItem` returns the item. Saved player records do not change. `PrismarineServerErrors` gains `UnknownInventoryContainer`.

- [`fc513cf`](https://github.com/JSPrismarine/JSPrismarine/commit/fc513cf74a16caf6f9da30f3323b094c519d1043) Thanks [@filiphsps](https://github.com/filiphsps)! - Levels have a lifecycle. `WorldManager` loads and detaches levels one at a time, tracks each one as attaching, attached or detaching (`getLevelState`), and announces `levelAttached`, `levelDetaching` and `levelDetached` on the kernel's event bus. `detachLevel` stops the level's scripts, moves its players to the entry level's spawn, then saves and closes it, keeping its files; it refuses the entry level with `EntryLevelCannotDetach` and a level that is not attached with `LevelNotAttached`. A level attached after startup now runs its behavior pack scripts, and a level's scripts are filed under its UUID.

- [`253f214`](https://github.com/JSPrismarine/JSPrismarine/commit/253f214c096cad79e6f53cd8a88a828b262af315) Thanks [@filiphsps](https://github.com/filiphsps)! - Levels created while the server runs live in `levels.json` beside `config.json`, never in the config. `WorldManager.createLevel` creates one and records it as attached, `attachLevel` attaches a detached one by name or UUID, and `detachLevel` records it as detached and keeps its files. At startup the server loads the config's levels, then the attached ones from `levels.json`. A level the config declares cannot detach while the server runs (`ConfigLevelCannotDetach`), two attached levels cannot share a name (`LevelNameTaken`), and detached levels that share a name are attached by UUID (`AmbiguousLevelName`).

- [#3617](https://github.com/JSPrismarine/JSPrismarine/pull/3617) [`239659a`](https://github.com/JSPrismarine/JSPrismarine/commit/239659a6927aa7f2b713ad994fe92fab0f2cece9) Thanks [@filiphsps](https://github.com/filiphsps)! - The terrain cell walk decides each filled cell's fluids in the native library: `NativeWorldgen.createAquifer` runs the noise aquifer's cell search, pressure and fluid picking over its density programs with the same answers as `NoiseBasedAquifer`. `RandomState` gains `nativeProgram` and `native`, `XoroshiroPositionalRandomFactory` gains `seedLanes`, `NativeDensityProgram` gains `nativeHandle`, `NoiseBasedAquifer.skipSamplingAboveY` is public, and `NativeWorldgenErrors` gains `AquiferNotCreated`. A cell whose context sets a structure or blending hook keeps the TypeScript aquifer.

- [#3613](https://github.com/JSPrismarine/JSPrismarine/pull/3613) [`fea2fcd`](https://github.com/JSPrismarine/JSPrismarine/commit/fea2fcd1d4424bf4c766ba996e9eb0ceb742310a) Thanks [@filiphsps](https://github.com/filiphsps)! - The terrain cell walk fills each interpolation cell's density in the native library: `NativeWorldgen.createCellProgram` runs a `CellProgram`'s records over the `interpolated` cells' corners with the same bits, in one call per cell. `CompileEnvironment` gains an optional `cellProgram`, `InterpolatedCell` gains `corners`, and a cell whose context sets a structure or blending hook stays on the TypeScript interpreter. `NativeWorldgenErrors` gains `CellProgramNotCreated` and `CellBufferTooSmall`.

- [#3623](https://github.com/JSPrismarine/JSPrismarine/pull/3623) [`055b1ca`](https://github.com/JSPrismarine/JSPrismarine/commit/055b1ca984f47515b42af6109ea88a7ec7b4d451) Thanks [@filiphsps](https://github.com/filiphsps)! - The surface pass runs in the native library: `NativeWorldgen.createSurface` runs a material rule program over a chunk's columns with the same blocks as `MaterialRuleInterpreter`, including the jittered biome lookup and the ore veins, and hands back the blocks that reach a condition only the TypeScript answers. `BuildSurfaceOptions` gains `biomeZoomSeed` and `native`, `SurfacePass` gains `handedBack`, `LegacyPositionalRandomFactory` gains `seedLanes`, oreVein exports `isBarrenVeinCell`, and `NativeWorldgenErrors` gains `SurfaceNotCreated`.

- [#3590](https://github.com/JSPrismarine/JSPrismarine/pull/3590) [`f76f4f2`](https://github.com/JSPrismarine/JSPrismarine/commit/f76f4f25eb0449327fcc06b46797588a0b6879ff) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/nbt` gains typed tags (`@jsprismarine/nbt/tag`), an SNBT reader and printer in Java Edition's grammar (`@jsprismarine/nbt/snbt`), and NBT paths with the edits `/data modify` makes (`@jsprismarine/nbt/path`). `NbtErrors` gains the SNBT and NBT path errors they throw.

- [#3628](https://github.com/JSPrismarine/JSPrismarine/pull/3628) [`c6fc056`](https://github.com/JSPrismarine/JSPrismarine/commit/c6fc056233588d453bcb33febae92189ecfc8b4b) Thanks [@filiphsps](https://github.com/filiphsps)! - `jsp-addon build` compiles TypeScript addons. An addon with a `tsconfig.json` is compiled with `tsc-ts` before the build reads it, a compiler error fails the build with `AddonCompileFailed`, and the pack leaves out `package.json`, `tsconfig.json`, `src/`, `node_modules/` and the source maps. `compileAddon` from `@jsprismarine/addon-tools/compile` and `compileAddons` from `@jsprismarine/addon-tools/build` run the step on their own.

## 0.24.0

### Minor Changes

- [#3522](https://github.com/JSPrismarine/JSPrismarine/pull/3522) [`3c19f11`](https://github.com/JSPrismarine/JSPrismarine/commit/3c19f11b712b228563d7af7fc5f6df6995726fe3) Thanks [@filiphsps](https://github.com/filiphsps)! - The server upgrades `config.json` and `permissions.json` in place when a release changes their shape or defaults. Each file names its layout in `schemaVersion`, and loading runs every step from the file's version to the current one in order, keeps the original beside it as `<file>.v<version>.bak` and logs both versions. A file at the current version is not rewritten, and a file newer than the server is refused. `permissions.json` moves to version 3, which adds `jsprismarine.command.link` and `jsprismarine.command.unlink` to the `default` group of an existing file; its backup is now `permissions.json.v1.bak` rather than `permissions.json.bak`. `config.json` gains `schemaVersion` 1, and the rename of `port` to `server-port` becomes its first step. `Config.enable` takes an optional logger for the migration line. The errors catalog replaces `PermissionsNotObject` and `PermissionsSchemaUnsupported` with `VersionedFileNotObject`, `FileVersionInvalid`, `FileVersionTooNew` and `FileMigrationsMisdeclared`.

- [#3558](https://github.com/JSPrismarine/JSPrismarine/pull/3558) [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/native-network` now binds its library through `@jsprismarine/native-library/ffi`'s `bindNative`, and `@jsprismarine/script-host` loads `node:ffi` through its new `nodeFfi()`. Each package had kept its own copy of that code.
  
  Breaking: `NativeNetworkErrors.FfiUnavailable` and `ScriptHostErrors.FfiUnavailable` are removed. A runtime without `node:ffi` now throws `NativeLibraryErrors.FfiUnavailable`, which is still a `NativeLibraryError`, so an `instanceof NativeLibraryError` check still catches it.

- [#3513](https://github.com/JSPrismarine/JSPrismarine/pull/3513) [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/native-library`, which finds, checks and installs a package's prebuilt native library. `@jsprismarine/native-network` and `@jsprismarine/script-host` now load their libraries through it, so both behave the same way.
  
  Breaking changes:
  
  - The errors for a missing, unverified or undownloadable library, and for a malformed native manifest (`InvalidNativeManifest`, `InvalidNativeManifestEntry`), moved from `NativeNetworkErrors` and `ScriptHostErrors` to `NativeLibraryErrors` in `@jsprismarine/errors/native-library`, and their codes now start with `NATIVE_LIBRARY_`.
  - `NativeLibraryError` is now exported only from `@jsprismarine/errors/native-library`, so one `instanceof` check catches loading errors from either package.
  - `@jsprismarine/script-host/library` no longer exports `localBuildDigest`, `recordLocalBuild` or the `LocateOptions` type. `LocateOptions` comes from `@jsprismarine/native-library`, and `NativeLibrary` covers what the other two did.
  - `@jsprismarine/script-host/manifest` is removed. Import the manifest parser from `@jsprismarine/native-library/manifest`.
  - In a checkout, `@jsprismarine/native-network` on a platform without a published build now says how to build the library instead of saying no build is published.
  
  A packager's `libraryForPlatform` now replaces an installed file that fails its digest check with the published build instead of throwing. In a checkout whose native sources differ from the published builds, nothing is downloaded, so it still throws there.

### Patch Changes

- [#3464](https://github.com/JSPrismarine/JSPrismarine/pull/3464) [`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a) Thanks [@filiphsps](https://github.com/filiphsps)! - `addon.json` takes optional listing keys for the addon marketplace: `title`, `tags` from a fixed list (`ADDON_TAGS`), `authors`, `screenshots` under `media/` with alt text, `deprecated` and `replacedBy`. `jsp-addon build` leaves `media/` out of the pack, checks that `pack_icon.png` is a square PNG, and writes the README, icon and screenshots beside each pack as `<name>-<version>.md`, `.png` and `-<n>.<type>`. Each new index entry gains a `listing` that links those files with their SHA-256; the schema stays version 1, since readers drop keys they do not know. A published version whose listing files changed fails the build with `PublishedListingChanged`, as a changed pack does. `--github-output` adds a `listing` output naming the new listing files, and `isAddonInstallId` and `isAddonRepository` check install ids and repositories.

- [#3486](https://github.com/JSPrismarine/JSPrismarine/pull/3486) [`1f3b347`](https://github.com/JSPrismarine/JSPrismarine/commit/1f3b347d94e934767993eb3506a412b01d334a0b) Thanks [@filiphsps](https://github.com/filiphsps)! - Read a feature pass's blocks without a hash lookup per block. A feature view kept its own writes in a map keyed by block index, so once anything was written, each of a pass's hundred thousand or more reads looked the block up there before reading the terrain tile below. The writes now go to one 16-bit array per tile, made on the tile's first write, and a read goes straight to the tile's slots with an index computed once. The blocks a pass reads and writes are the same.

- [#3498](https://github.com/JSPrismarine/JSPrismarine/pull/3498) [`f4eb592`](https://github.com/JSPrismarine/JSPrismarine/commit/f4eb5921862accbb5e07749c38bd1c63495587a0) Thanks [@filiphsps](https://github.com/filiphsps)! - A Java Edition player sees the players and mobs around them, which come into and leave their view and tab list and move as the server moves them. A session's presenter now names its edition and shows and hides entities, and the replicator hands a non-Bedrock viewer its moves as plain data for its presenter to encode. `@jsprismarine/protocol` gains Java's entity and player info packets and 26.3's entity type and item registries, generated by `dump:java-protocol`.

- [#3573](https://github.com/JSPrismarine/JSPrismarine/pull/3573) [`a19ba96`](https://github.com/JSPrismarine/JSPrismarine/commit/a19ba968ae53bd5c34c9515227a9d08ff7c69e33) Thanks [@filiphsps](https://github.com/filiphsps)! - A Java Edition player sees the mobs and players around them crouch, sprint, swim, glide, sleep and burn, when they come into view and as it changes. An entity's shown facts carry its state, the session presenter gains `showEntityState`, and `Metadata.getGenericFlag` reads a flag `setGenericFlag` wrote. `@jsprismarine/protocol` gains Java's `Set Entity Metadata` packet for the shared flags and the pose.

- [#3544](https://github.com/JSPrismarine/JSPrismarine/pull/3544) [`a64ab41`](https://github.com/JSPrismarine/JSPrismarine/commit/a64ab41bf639ffb0144117810600a4abf306a850) Thanks [@filiphsps](https://github.com/filiphsps)! - A Java Edition player sees their inventory, armor and off hand, and the hotbar slot they hold. A Java client's hotbar choice decodes into `selectHotbarSlot`, and a creative player's slot changes into the new `setCreativeSlot` intent. The session presenter gains `showInventory` and `showOwnSlot`, and `javaItemTranslation` maps items both ways. `@jsprismarine/protocol` gains Java's container content, container slot, held item and creative slot packets, the `Short` wire type, and item stacks without data components.

- [#3579](https://github.com/JSPrismarine/JSPrismarine/pull/3579) [`05f03f7`](https://github.com/JSPrismarine/JSPrismarine/commit/05f03f78e186000a5e76cc34894a61a384ca5333) Thanks [@filiphsps](https://github.com/filiphsps)! - The biome climate search runs in `@jsprismarine/native-worldgen`'s C library when it loads, with the same answers as the TypeScript search, exact ties and Java's prior-result seed included. `NativeWorldgen.createClimate` registers a flattened climate tree, and `ClimateParameterList` and `SharedClimateParameterList` take `{ native: false }` to keep the TypeScript search.

- [#3568](https://github.com/JSPrismarine/JSPrismarine/pull/3568) [`02d9cb6`](https://github.com/JSPrismarine/JSPrismarine/commit/02d9cb69d53cf22a406dd86e95f08b2bbc48eb5c) Thanks [@filiphsps](https://github.com/filiphsps)! - The trees under `final_density`'s `interpolated` nodes run in `@jsprismarine/native-worldgen`'s C library when it loads, with the same bits as their closures. `NativeWorldgen.createProgram` registers a density program and `eval` runs it one position at a time. `DensityFunctionCompiler.nativeSampler` and `RandomState.nativeSampler` give a tree's native evaluator. `NativeNoiseStack.nativeHandle` and `NativeStackNoise.native` expose a stack to a program, and `blendedNoiseMultipliers` gives `old_blended_noise`'s coordinate factors. An overworld chunk's terrain fill makes 1,079 noise calls from TypeScript, all of them the aquifer's, where it made 15,683.

- [#3535](https://github.com/JSPrismarine/JSPrismarine/pull/3535) [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5) Thanks [@filiphsps](https://github.com/filiphsps)! - `operatingSystemOf` now returns the operating system any platform key names, such as `freebsd` for `freebsd-x64`, where it used to answer `linux` for everything but Windows, macOS and Android. `InvalidNativeManifest` and `InvalidNativeManifestEntry` now extend `NativeLibraryError`, so the one `instanceof` check catches a malformed manifest too.

- [#3532](https://github.com/JSPrismarine/JSPrismarine/pull/3532) [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/native-worldgen`, which runs worldgen's octave noise stacks in C with the same bits as the TypeScript `NoiseStack.get3`. It loads through `node:ffi` under Node.js and `bun:ffi` under Bun, one position or one buffer of positions per call. Builds are published per platform like the other native packages.
  
  `@jsprismarine/native-library/ffi` opens a native library through either runtime's FFI from one table of C signatures. `@jsprismarine/errors` gains the `native-worldgen` catalog and `NativeLibraryErrors.FfiUnavailable`.

- [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa) Thanks [@filiphsps](https://github.com/filiphsps)! - The Node single executable from `pnpm run package` embeds RakNet's socket worker and loads it from its asset, so the executable can listen for players.

## 0.23.2

### Patch Changes

- [#3483](https://github.com/JSPrismarine/JSPrismarine/pull/3483) [`5f48cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/5f48cd10e4ca5b53ef19ebd214b70b1de18acca9) Thanks [@filiphsps](https://github.com/filiphsps)! - Pack a generated chunk's biome sections from the cells its terrain pass already sampled. When generation runs on the server thread (one core, or `chunk-workers: 0`), the terrain tile carries its biome cells but no packed sections, and translation resolved every cell from the biome source again, searching the climate tree wherever the memo had evicted it. Over a 3 by 3 block of decorated chunks, climate searches for the chunks' own cells fall from 21,211 to 15,476, against 13,824 cells. The packed biomes are the same.

## 0.23.1

### Patch Changes

- [#3481](https://github.com/JSPrismarine/JSPrismarine/pull/3481) [`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f) Thanks [@filiphsps](https://github.com/filiphsps)! - Export the types the public API already uses, so a consumer can name what a function takes or returns. Each package's entry point now exports the interfaces, type aliases and classes its exported signatures reference, and `@jsprismarine/prismarine` and `@jsprismarine/script-host` publish the modules that define them.
  
  `@jsprismarine/protocol` exports five wire types under new names, because the packet API already uses the plain names for other types: `ActorLinkFields`, `AbilityLayerFields`, `SerializedAbilitiesDataFields`, `GameRuleFields` and `UUIDValue`.

- [#3480](https://github.com/JSPrismarine/JSPrismarine/pull/3480) [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e) Thanks [@filiphsps](https://github.com/filiphsps)! - A Java Edition player who joins is shown the default world around spawn, lit from the server's light engine, and kept connected with keep-alives. Blocks and biomes go through a new two-way edition translation that joins the Java and Bedrock mappings to each side's ids. `@jsprismarine/protocol` gains the Java chunk encoding (paletted containers, heightmaps, light), the play packets the join uses, and `JavaBlockStates.stateOf`, the inverse of `idOf`.

## 0.23.0

### Minor Changes

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Every error the packages throw is now defined in `@jsprismarine/errors`, with a stable code, a `docs` link to its entry in the new error reference at https://jsprismarine.dev/errors/, and the values its message was built from. Each error still extends the class it did, such as `TypeError` or `CorruptionError`, and keeps its message, with three exceptions: `getGametypeName` now names the game mode it refused, the NetherNet signaling server answers a bad join path with `Expected /v1/join/<networkId>`, since braces mark a value in a catalog message, and `SnbtSyntaxError` no longer carries an `offset`.
  
  The error classes a package used to export now come from its catalog in `@jsprismarine/errors`. Import `CorruptionError`, `DatabaseLockedError` and `UnsupportedVersionError` from `@jsprismarine/errors/leveldb`, `LoginRefused` from `@jsprismarine/errors/auth`, `ZipError`, `FilterParseError`, `JsonParseError` and `BrarchiveError` from `@jsprismarine/errors/packs`, and so on for `KernelError`, `ContentError`, `BlockError`, `StructureFormatError`, `SelectorSyntaxError`, `MolangSyntaxError`, `NumberProviderError`, `NativeLibraryError`, `NetherNetUnavailableError`, `UdpPortsError`, `JoinRefusedError`, `UsageError` and `ChunkReadOutOfWindowError`. `LoginRefused` keeps its `detail`, now read from its cause. `@jsprismarine/errors` drops its `Error` class, the `ErrorKind` enum and its six error classes; `getGametypeName` and `getGametypeId` throw `MinecraftErrors.GametypeInvalid`, and `PermissionManager.setOp` throws `PrismarineServerErrors.PlayerNotFound`. `NBTStreamReader.readLength` and `expectInput` take the error class to throw instead of a message, and `fail` in `@jsprismarine/features` takes the error to throw.

- [#3470](https://github.com/JSPrismarine/JSPrismarine/pull/3470) [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the worldgen errors only the volume density evaluator threw: `DensityVolumeTooFar`, `InvalidDensityVolume`, `DensityVolumeOutputTooSmall`, `DensityVolumeTooLarge`, `MissingDensityVolumeInput`, `MissingDensityVolumeInputs`, `MissingDensityVolumeInstruction`, `MissingDensityVolumeOutput` and `MissingVolumeWorkspace`.

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

- [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33) Thanks [@filiphsps](https://github.com/filiphsps)! - A world without player storage in its provider no longer reads or moves a player record still filed under the name it had before player data file names were escaped. Such a record only exists for a player whose name holds `%`, `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` or a control character. To keep one, rename its file under `playerdata/` to the escaped name, such as `100%.json` to `100%25.json`, before starting the server. Loading a player no longer races a save of another player for that file. `PrismarineWorldErrors.DuplicatePlayerRecord` is gone with the move it guarded.

- [#3218](https://github.com/JSPrismarine/JSPrismarine/pull/3218) [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/script-host` and `@jsprismarine/script-types` are published to npm. The script host's install script downloads the QuickJS library built for the machine, on macOS on Apple silicon, Windows on x64, and Linux on x64 and arm64 with glibc or musl, and checks its SHA-256, so scripts run on an installed server without a compiler. `JSP_SCRIPT_HOST_LIBRARY` names a library file to load instead.
  
  `ScriptHostErrors.LibraryNotBuilt` is replaced by `LibraryNotInstalled`, whose message says how to approve the install script for npm, pnpm or Bun. New entries cover a failed or corrupt download, a malformed manifest, and a library that is not the published build.
  
  `@jsprismarine/native-network` exports `PUBLISHED_PLATFORMS`, the platforms it publishes builds for.

### Patch Changes

- [#3336](https://github.com/JSPrismarine/JSPrismarine/pull/3336) [`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the console's `addon` command, which installs, updates, lists and removes addons: `addon install tps-bar`, `addon install owner/repo/name@^1.0.0`, an `.mcpack` URL, or a folder or `.mcpack` on disk, with `as <name>` to install a second addon of the same name. `addons.json` beside `config.json` records what was asked for and `addons.lock.json` the version, URL and SHA-256 each addon installed. At startup and on `addon sync` the server installs locked addons missing from `addons/`, refusing a download whose hash changed, and removes the ones `addons.json` no longer names. Installed addons join the world's behavior packs after `content-world-packs`, and an install or removal reloads the scripts with the new list, so scripts load without a restart. Only the console runs the command: players never see it, and an operator is told it needs a higher level. `@jsprismarine/errors/prismarine/addon` holds the installer's errors.

- [#3336](https://github.com/JSPrismarine/JSPrismarine/pull/3336) [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/addon-tools`, which builds JSPrismarine addons. Its `jsp-addon build` command checks each addon's behavior pack and `addon.json`, packs it into `<name>-<version>.mcpack` and writes the `index.json` a server installs from, keeping every published version. `@jsprismarine/addon-tools/addonIndex` parses and validates that index. `@jsprismarine/packs/zip` gains `writeZip`, which writes the same bytes for the same files, and `@jsprismarine/packs/manifest` exports the manifest parser. `@jsprismarine/errors/addon-tools` holds the new errors.

- [#3386](https://github.com/JSPrismarine/JSPrismarine/pull/3386) [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry a feature patch's block writes across the generation worker boundary as positions within the patch's chunk and 16-bit palette slots: 6 bytes a write instead of 16. Feature results and `full` merge tasks post less to the generation host.

- [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61) Thanks [@filiphsps](https://github.com/filiphsps)! - Link the errors of `@jsprismarine/prismarine` and `@jsprismarine/protocol` to a page per catalog module in the error reference, such as `errors/prismarine/world`. A catalog names its module after a slash, as in `defineErrors('prismarine/world', { ... })`, and each class gives it as `module`. Codes are unchanged, and the site forwards old `errors/prismarine#<code>` links to the new pages.

- [#3336](https://github.com/JSPrismarine/JSPrismarine/pull/3336) [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35) Thanks [@filiphsps](https://github.com/filiphsps)! - Adds `ScriptHostErrors.JspModuleArgument`, the `TypeError` a pack sees when it calls a member of `@jsprismarine/server` with an argument of the wrong type, such as a boss bar color the module does not name.

- [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop advertising a root `@jsprismarine/errors` import, which named a module the package no longer has. Import a catalog from its own entry, such as `@jsprismarine/errors/leveldb`.

- [#3418](https://github.com/JSPrismarine/JSPrismarine/pull/3418) [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49) Thanks [@filiphsps](https://github.com/filiphsps)! - Decode a player's packets into intents and handle each intent once, whichever edition sent it (ADR 0027). `PacketHandlerRegistry.getIntentHandlers()` is where a plugin registers or appends behavior by intent kind; raw packet handlers register as before. The interact, animate and boss event packets are the first to go through a decoder.

- [#3471](https://github.com/JSPrismarine/JSPrismarine/pull/3471) [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4) Thanks [@filiphsps](https://github.com/filiphsps)! - A logged-in Java Edition client is configured as vanilla 26.3 configures it: the brand, the feature flags, the `minecraft:core` known pack, every registry by id and every tag. The join then ends as the client reaches play, until Java Edition players can play. `@jsprismarine/protocol` gains the configuration packets, `Disconnect (play)`, the 26.3 configuration capture and `capture:java-configuration`, which records it from the pinned server jar, and the Java frame and compression helpers move into it from the server.

- [#3467](https://github.com/JSPrismarine/JSPrismarine/pull/3467) [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19) Thanks [@filiphsps](https://github.com/filiphsps)! - A Java Edition client can log in. With `online-mode` on, the server verifies the player with Mojang's session server, as a vanilla server does, and encrypts the connection; off, the player gets the UUID their name gives. Every login is compressed, and the server then ends the join in the configuration phase until Java Edition players can play. `@jsprismarine/protocol` gains the login packets, `Disconnect (configuration)`, and Java's UUID and plain text component types.

- [#3456](https://github.com/JSPrismarine/JSPrismarine/pull/3456) [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb) Thanks [@filiphsps](https://github.com/filiphsps)! - With `java-enabled` on, the server listens for Java Edition clients on `java-port`, 25565 by default. A Java client's server list shows the server's MOTD, the Java release it speaks and the player count of both editions; a join is refused with a message saying Java Edition players cannot join yet. `@jsprismarine/protocol` gains `src/java/` with Java's wire types, its handshake, status and login disconnect packets, and the Java releases the server speaks.

- [#3341](https://github.com/JSPrismarine/JSPrismarine/pull/3341) [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b) Thanks [@filiphsps](https://github.com/filiphsps)! - Refuse to load the native networking library on a Node.js without `node:ffi`, such as one started with `--no-experimental-ffi`, with a `NativeLibraryError` that names the requirement. It used to fail at `dlopen` with `TypeError: Cannot read properties of undefined`. `NativeNetworkErrors.FfiUnavailable` is the new catalog entry.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac) Thanks [@filiphsps](https://github.com/filiphsps)! - The mcdoc validator now gates `#[since]` and `#[until]` for a snapshot, pre-release or release candidate target as the release it builds toward, so a `26.4-snapshot-10` target validates against the 26.4 schema instead of dropping every gated field. A target release in none of those forms, such as `24w14a`, throws `UncomparableJavaRelease`.

- [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e) Thanks [@filiphsps](https://github.com/filiphsps)! - Give `permissions.json` groups and users. A group has a weight, parent groups, nodes and meta; a user has memberships, nodes and meta of their own, and nodes and memberships may expire. Every player holds `default` and every operator holds `operator`. A check resolves the player's own nodes, then their groups heaviest first and each group's parents, where a specific node beats a wildcard and a negation wins a tie. The `level` meta sets a player's command level, which the command list and the abilities a client receives now follow; an operator still runs at 4. The file gains `schemaVersion` 2 with `users` filed under `xbox`, `java` and `offline`; a file without it migrates at startup, with the old file kept as `permissions.json.bak` and each `players` entry waiting under `pending` until a login with its UUID claims it. The server reads the file again on `/reload` and when it changes on disk. Every JSON file the server owns, `ops.json`, `banned-players.json` and player data included, is now written through a temporary file that replaces it only once complete and keeps its mode, so a failed write leaves the file as it was. `PermissionManager` gains `has`, `metaOf`, `groupsOf`, `primaryGroupOf`, `commandLevelOf`, the group and user writes and `onChange`; `getPermissions`, `setPermissions` and `getDefaultPermissions` are gone, and the check interface takes `hasPermission(node)` instead of `getPermissions()`. A fresh file no longer grants `*` to a hard-coded owner UUID; an owner who relied on it runs `/op` from the console once, and an entry migrated from an old file waits under `pending` until that player logs in.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the `content-java-version` setting, which picks the pinned Java release whose vanilla datapack the server loads. The pack stack reads that release's data pack format and data version from the generated `version.json` and loads the datapacks for it; a release that is not pinned or not generated stops startup with an error naming the pinned releases and the `datagen:java --java <release>` command. `JSP_VANILLA_DATAPACK` takes precedence: when it is set, the server loads that datapack whatever release `content-java-version` names, checks only that the named release is pinned, and skips the check that its data is generated. Each level records the release's data version in `level.dat` as `JSPrismarineJavaDataVersion` and refuses to open a world saved under a newer one. `@jsprismarine/bedrock-data/sources` exports `pinnedJavaReleases`.

- [#3218](https://github.com/JSPrismarine/JSPrismarine/pull/3218) [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0) Thanks [@filiphsps](https://github.com/filiphsps)! - Behavior packs that declare `@minecraft/debug-utilities` can draw debug shapes. `DebugArrow`, `DebugBox`, `DebugCircle`, `DebugCone`, `DebugCylinder`, `DebugEllipsoid`, `DebugLine`, `DebugPyramid`, `DebugSphere` and `DebugText` keep what a script sets with Bedrock Dedicated Server's defaults, and `debugDrawer.addShape`, `removeShape` and `removeAll` and a shape's `remove` send them to the level's players as `PrimitiveShapesPacket`s, again only when a script changes one, and all of them to a player who joins. A drawn shape's `timeLeft` loses 0.05 seconds each tick, where BDS takes off each frame's time, so a replay counts it the same. `disableWatchdogTimingWarnings` does nothing, since the watchdog never warns about time.
  
  A setter's conversion error now names the `Function return value` and an object the host did not make has `no native handle`, a float property's bounds error gives the float range, and a variant's types are listed primitives first, then classes and interfaces, then arrays, all as BDS words them. `ScriptWorld` gains an optional `drawDebugShapes`, and `ScriptApiContext` a `setState`. The error catalog's `InterfacePropertyMissing` takes the `target` it names, and gains `InterfacePropertyNotFinite`.

- [#3218](https://github.com/JSPrismarine/JSPrismarine/pull/3218) [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/script-host` throws errors from a new `script-host` catalog in `@jsprismarine/errors`, each with a code and a page in the error reference. Messages are unchanged. Import `ScriptError`, `ScriptTerminatedError`, `ScriptOutOfMemoryError`, `NativeLibraryError`, `DebuggerConnectionError`, `DebuggerFramingError` and `DebuggerTransportError` from `@jsprismarine/errors/script-host`; `ScriptError` keeps `scriptName`, `scriptMessage` and `scriptStack`. `NotImplementedError` and `ScriptApiError` stay in `@jsprismarine/script-host/errors`, and `DebuggerMessages` is gone, since the catalog now holds those messages. Errors that code inside the engine throws to a script remain the engine's own `TypeError`, `RangeError` and `ReferenceError`, as on Bedrock Dedicated Server.

- [#3218](https://github.com/JSPrismarine/JSPrismarine/pull/3218) [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `InterfacePropertyMissing` to the script host's catalog: the `TypeError` Bedrock Dedicated Server throws when a script passes an object that lacks a property the Script API's interface needs, such as an `RGB` color without `blue`.

- [#3218](https://github.com/JSPrismarine/JSPrismarine/pull/3218) [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3) Thanks [@filiphsps](https://github.com/filiphsps)! - Behavior packs that declare `@minecraft/server-net` can send HTTP requests with `http.get` and `http.request`, build them with `HttpRequest` and `HttpHeader`, read the `HttpResponse`, and cancel them with `http.cancelAll`, as Bedrock Dedicated Server does: the same default headers, no redirects followed, `MalformedUriError` for a scheme other than `http` or `https`, and `InternalHttpRequestError` with the system's error code for a request that fails. A request runs off the tick, and its result enters the world in a later tick's input step. `Server.getScriptHttp()` records each admitted result and replays them, so a replay settles the same requests in the same ticks without the network. Packs that declare `@minecraft/server-admin` read `variables` and `secrets` from their `config/<script module uuid>/variables.json` and `secrets.json`, with each secret as an opaque `SecretString` that only a request header sends, and can move a player to another server with `transferPlayer`. As on Bedrock Dedicated Server, a pack needs the Beta APIs experiment and a `permissions.json` that allows `@minecraft/server-net`, which the default one does not.

- [#3218](https://github.com/JSPrismarine/JSPrismarine/pull/3218) [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9) Thanks [@filiphsps](https://github.com/filiphsps)! - Behavior pack scripts hear most of the remaining `world.afterEvents` and `world.beforeEvents` of `@minecraft/server`: a player's block placement, game mode change, change of dimension, emote, button input, input mode, hotbar slot, inventory changes, cursor, crafting, mining, arm swing, item use stages, dropped and picked-up stacks, containers opened and closed, name tags and script messages; an entity's load and removal, melee hits, projectile hits, status effects, heals, health changes, taming and data-driven events; explosions and the blocks they clear, game rule changes, and pistons, levers, buttons and pressure plates. The before-events run as guards of their actions and can cancel them or change what they allow, such as an effect's duration, a blow's damage, a heal's amount, a game mode or the blocks a blast clears. Each subscriber's options pick the events it gets. Block custom components get `onStepOn`, `onEntityFallOn`, `onEntity`, `onRedstoneUpdate` and `onBlockStateChange`.
  
  The server raises a kernel event for each of these, which plugins can listen to as well: `playerPlaceBlock` and `playerBlockPlaced`, `playerGamemodeChanged`, `playerDimensionChanged`, `entityRemove` and `entityRemoved`, `entityEffectAdd` and `entityEffectAdded`, `entityHeal`, `entityHealed` and `entityHealthChanged`, `explosion` and `exploded`, and the rest that `docs/guide/extending.md` lists. `playerSetGamemode`'s mode is writable.
  
  For code that embeds these packages: `ScriptWorld` has an optional `guardGameEvents`, `ScriptWorldEvent` has a `game` variant, engine-systems' `ExplosionOptions` takes a `guard`, entities' `EntityEnvironment` takes `eventApplied`, block-behaviors' `WorldActions` takes `redstoneActivated`, and protocol exports `ScriptMessagePacket`.

- [#3341](https://github.com/JSPrismarine/JSPrismarine/pull/3341) [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a) Thanks [@filiphsps](https://github.com/filiphsps)! - Refuse a world whose `experiments` list names an experiment the server does not implement, such as a typo of `gametest`, with an error that lists the ones it does. A `config.json` read without its schema used to start the world with the experiment off and say nothing.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/worldgen` reads Java 26.4's world generation grammar when given its data pack format. `WorldgenDataSource`, `parseDensityFunction` and `parseNoiseGeneratorSettings` take an optional `format`, the target's data pack format major. From format 128 on, the `upscale` density function replaces `interpolated`, and `noise_settings` has no `default_block`, because the vanilla material rules place every solid block. A custom material rule that leaves a solid position unplaced gets stone there, where Java leaves air. Without a format they read 26.3's grammar as before. `@jsprismarine/errors` adds `UnsupportedUpscaleMode` and `UnevenUpscaleCells` for the `upscale` shapes that are not implemented, and `NonPositiveUpscaleCell` for an `upscale` axis whose `cell_size` is zero or less.

## 0.22.0

No changes in this release.

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

- [`a8a11d2`](https://github.com/JSPrismarine/JSPrismarine/commit/a8a11d297758b9fa392ca655e53c9c237c30030c) Thanks [@filiphsps](https://github.com/filiphsps)! - The error classes no longer call `Object.setPrototypeOf` in their constructors. That fixed `instanceof` for code compiled to ES5, and the package targets ESNext, where a subclass of `Error` already gets its own prototype.

- [`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Point the Discord link in each package README at the project's current invite.

- [`7b50ec7`](https://github.com/JSPrismarine/JSPrismarine/commit/7b50ec758c8c621e34c8b823584a79fe02be1ede) Thanks [@filiphsps](https://github.com/filiphsps)! - `GametypeInvalidError` now reports `ErrorKind.GAMETYPE_INVALID`. It reported `PLAYER_NOT_FOUND`, so code that switched on `code` read an invalid game type as a missing player.

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

## 0.16.0

No changes in this release.

## 0.15.2

No changes in this release.

## 0.15.1

No changes in this release.

## 0.15.0

### Minor Changes

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove constructs that ahead-of-time compilation with scriptc cannot lower, keeping runtime behavior the same.
  
  - `@jsprismarine/bedrock-data` exports `creativeitems` from a generated, explicitly typed module (`CreativeItemEntry[]`) instead of the raw JSON.
  - `@jsprismarine/brigadier` keeps each argument builder in the module of the node it builds (the old paths re-export), declares `literal` and `argument` as functions, and its exception types call message factories positionally.
  - `@jsprismarine/errors` declares its `Error` base without a type parameter.
  - `@jsprismarine/math` exposes `Vector2.ZERO` and `Vector3.ZERO` as shared immutable instances, and `Vector3` subclasses keep their class through `withX` and friends by overriding `create`.
  - `@jsprismarine/minecraft` exports `blockSchemas` from a generated, typed module (`BlockSchemaCatalog`).
  - `@jsprismarine/prismarine` replaces the `evt`-based event bus with its own `EventEmitter` (same `on`, `once`, `removeListener`, `removeAllListeners`, `emit` and `post`), carries inventory transaction data as a discriminated union (`kind`), exposes `allBlocks()`, `allItems()` and `allEntities()` registries, and drops the `heap`, `evt`, `fast-jwt` and `confbox` dependencies.
  - `@jsprismarine/raknet` declares `sendPacket` without a type parameter.

### Patch Changes

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a) Thanks [@filiphsps](https://github.com/filiphsps)! - Build declaration files with TypeScript 7 through `tsc-ts`. JSON data exports are now typed structurally (`string`, `number`) instead of as literal values.

## 0.14.2

No changes in this release.

## 0.14.1

### Patch Changes

- [`53eb2f6`](https://github.com/JSPrismarine/JSPrismarine/commit/53eb2f605a8a90bee72788ac785fd4046ecce2b2) Thanks [@filiphsps](https://github.com/filiphsps)! - Bump Vite to 8.0.12 across the root, every workspace package, and the turbo generator template, and roll in the follow-up fixes needed to keep the codebase happy under Vite 8 (Rolldown):
    - Drop the `vite-tsconfig-paths` plugin in favor of Vite 8's native `resolve.tsconfigPaths: true` option, rename `build.rollupOptions` to `build.rolldownOptions` in the shared root config, drop the no-longer-supported output options (`hoistTransitiveImports: true`, `indent: false`, `interop: 'auto'`, `validate: true`), and remove the dropped `rollupTypes` option on `vite-plugin-dts`.
    - Untangle the `BuiltInExceptions -> SimpleCommandExceptionType -> CommandSyntaxException -> BuiltInExceptions` module load cycle that Rolldown refused to swallow the way the previous esbuild-based bundler did:
        - Defer `CommandSyntaxException.BUILT_IN_EXCEPTIONS` construction to a lazy getter and wrap every `BuiltInExceptions` static field in a memoized factory so no `new SimpleCommandExceptionType(...)` / `new DynamicCommandExceptionType(...)` runs during the class's static-initialization phase.
        - Add named exports for `SimpleCommandExceptionType` and `DynamicCommandExceptionType` alongside their existing default exports and switch the in-package call sites (`BuiltInExceptions`, `BuiltInExceptionProvider`, the brigadier barrel, and `SimpleCommandSyntaxExceptionType.test.ts`) to the named imports so they side-step Rolldown's stricter default-binding resolution while external default-import call sites keep working unchanged.
    - Hoist `vi.mock('@jsprismarine/raknet', ...)` out of the `describe` block in `Server.test.ts` so vitest stops warning about runtime hoisting (it will become an error in a future vitest release).
    - Replace the `fs.readdirSync` block enumeration in `Block.test.ts` with an eager `import.meta.glob` so vite's `dynamic-import-vars` plugin stops complaining about the missing static file extension.
    - Teach typedoc about the `@todo` block tag (plus the rest of TSDoc's standard tags) via a `blockTags` allow-list in `typedoc.json` so internal todo comments stop emitting "unknown block tag" warnings, and re-point Logger's `@document` to `../../../docs/log-levels.md` so the path resolves from the source file (`packages/logger/src/logger.ts`) up to the repo root's `docs/log-levels.md`.
    - Add `packages/bedrock-data/src/generated/*` to `.prettierignore` so the auto-generated JSON blobs don't trip prettier formatting checks.

## 0.14.0

### Minor Changes

- [`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a) Thanks [@filiphsps](https://github.com/filiphsps)! - Republish every package with its compiled `dist/` output. The previous stable release shipped without any built code — every tarball on npm contained only `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` — because `pnpm run build` had been commented out of the release workflow at the time of the cut. The build step has since been restored; this minor bump forces a fresh stable publish so consumers actually receive the compiled code.

## 0.13.5

### Patch Changes

- [`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51) Thanks [@filiphsps](https://github.com/filiphsps)! - Force-republish all packages at 0.13.4 to recover from a broken release pipeline.

    Previous attempts to publish 0.13.3 left the npm registry in an inconsistent state: a handful of packages (`brigadier`, `client`, `color-parser`, `errors`, `prismarine`, `raknet`) were pushed under the `unstable` dist-tag at the non-snapshot version `0.13.3`, while the rest failed mid-publish. Rather than try to repair 0.13.3 in place, we're skipping it entirely and resyncing every package on `latest` at 0.13.4.

## 0.13.2

## 0.13.1

## 0.13.0

## 0.12.1

### Patch Changes

- [`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix types order in package.json.

## 0.12.0

## 0.11.1

## 0.11.0

## 0.10.0

### Patch Changes

- [`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Bring tooling closer to supporting `composite: true`.

## 0.9.0

## 0.8.0

### Minor Changes

- [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a) Thanks [@filiphsps](https://github.com/filiphsps)! - - Update to latest bedrock edition.

### Patch Changes

- [`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7) Thanks [@filiphsps](https://github.com/filiphsps)! - - Replace `assert` with `with`.

## 0.7.0

## 0.6.0

## 0.5.0

### Patch Changes

- [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade `typescript` to `v5.5.2`.

## 0.4.5

### Patch Changes

- [#1460](https://github.com/JSPrismarine/JSPrismarine/pull/1460) [`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly revamp build system to allow for way better dev UX.

    Fix error getting thrown on first run due to missing the `level.json`
    file. We no longer try to read it if it doesn't exist.

    Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
    `pid` validation.

- [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade turbo to v2.

## 0.4.4

## 0.4.3

## 0.4.2

## 0.4.1

## 0.4.0

### Patch Changes

- [#1279](https://github.com/JSPrismarine/JSPrismarine/pull/1279) [`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Codecov bundler plugin to vite.

## 0.3.0

## 0.2.0

### Patch Changes

- [#1259](https://github.com/JSPrismarine/JSPrismarine/pull/1259) [`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1) Thanks [@renovate](https://github.com/apps/renovate)! - Deps: Update dependency @types/node to v20.12.3.

## 0.1.1

### Patch Changes

- [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5) Thanks [@filiphsps](https://github.com/filiphsps)! - Include CHANGELOG.md with releases.

## 0.1.0

### Patch Changes

- [#1226](https://github.com/JSPrismarine/JSPrismarine/pull/1226) [`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5) Thanks [@filiphsps](https://github.com/filiphsps)! - - Migrated to vite.
    - The build system has been refactored to support both esm and cjs.
    - Releases are now managed by changeset.
