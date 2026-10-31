# @jsprismarine/minecraft

## 0.16.0

### Patch Changes

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`f5ea701`](https://github.com/JSPrismarine/JSPrismarine/commit/f5ea701bd7297d63eb524be1d4b76c07cf204569) Thanks [@filiphsps](https://github.com/filiphsps)! - Publish the Bedrock 1.26.60 (protocol 2225) data this repository can now capture.
  
  The `packets` pass was run twice against the pinned BDS 1.26.60.6. `required_item_list.json`,
  `block_definitions.json` and `biome_definitions_network.nbt` reproduced byte for byte and are
  committed under `src/jsp/v2225/`. `jigsaw_structure_data.nbt` is deliberately not: the engine
  iterates its template pools out of an unordered container, so two runs agreeing is not the order
  being fixed, and the same goes for the block palette — `datagen/manifest.json`'s 2225 entry still
  declares no `blocks` for that reason, and 2193 stays `defaultProtocolVersion`.
  
  What the capture says is that the item registry is the only one of the three that moved. Against
  2193 it adds four names, removes none, and **moves 82 runtime ids**; the block definitions and
  the biome definitions came back identical. `utils/build.js` now builds an item table and the
  binary payload conversions for every captured version, not only the default one, joining each
  with its own version's CloudburstMC dump for the `Item Version` column the capture does not
  record. The default version's generated files are byte-identical to what the previous generator
  produced, which was checked by running both.
  
  The result is a new entry point, `@jsprismarine/bedrock-data/v2225`, exporting `item_table`,
  `block_definitions` and `biome_definitions_network` for that protocol. It is published beside
  the unversioned exports rather than in place of them: picking a table per session is a later
  slice, and nothing that imports the unversioned names changes. A `registry.items-2225` parity
  family compares the published table against the capture it was built from, which is the way this
  goes wrong quietly — a 2225 table rebuilt from the 2193 capture looks right and is 82 items out.
  
  `packages/minecraft`'s 2225 entry also declares `recipes` now. The output is 2193's recipe set
  exactly apart from its `minecraftVersion` header, because `vanilla_1.26.60` ships structures and
  a manifest and no recipe layer at all: 1.26.60 revised no recipe.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`91a7a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/91a7a0bfac2eac8c81961d5263e54b53dc0c3fc5) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve the unpacked Bedrock Dedicated Server from one place. `fetch:sources` writes the
  cache path, and the Bedrock capture and the datagen generators now read it back from the
  fetch instead of each building it themselves, so the writer and its readers cannot drift
  apart over how the directory is keyed.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`28b5c00`](https://github.com/JSPrismarine/JSPrismarine/commit/28b5c00af0d5377e7030e82d409b6def544619ba) Thanks [@filiphsps](https://github.com/filiphsps)! - Generate `EnchantType`, `ArmorSlot` and `PlayerRespawnState` into `@jsprismarine/minecraft` from
  the pinned bedrock-protocol-docs schemas, the way `ActorEvent` already is. All three are defined
  in the v1.26.51 release schemas - `Enchant::Type`, `SharedTypes::Legacy::ArmorSlot` and
  `PlayerRespawnState` - and the generated values match the hand-written ones exactly. `EnchantType`
  also gains the upstream sentinels `NUM_ENCHANTMENTS` (42) and `INVALID_ENCHANTMENT` (43).
  
  The prismarine packet files (`PlayerEnchantOptionsPacket`, `PlayerArmorDamagePacket`,
  `RespawnPacket`) now import the generated enums and keep deprecated re-exports, so existing import
  paths still resolve. Member names follow the generated convention, which renames them from
  PascalCase to SCREAMING_SNAKE (`EnchantType.Protection` is now `EnchantType.PROTECTION`,
  `ArmorSlot.Head` is `ArmorSlot.HEAD`, `PlayerRespawnState.ReadyToSpawn` is
  `PlayerRespawnState.READY_TO_SPAWN`); the wire values are unchanged.

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

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`9d93172`](https://github.com/JSPrismarine/JSPrismarine/commit/9d931725e8d48fab773c2fe9f659b2f3e1d26325) Thanks [@filiphsps](https://github.com/filiphsps)! - Generate the protocol 2225 enums. The datagen manifest declares Minecraft 1.26.60 alongside
  1.26.51, pinned to the v1.26.60 `metadata.zip` release asset, and the 31 public enums for that
  release are exported from `generated/v2225/`. That asset carries `x-enum-binary-value` itself, so
  it is its own values release rather than needing a later one.
  
  Five enums differ from the 2193 copies. `ItemStackRequestActionType` gains
  `CRAFT_RESERVED_ACTION = 18` and renumbers `CRAFTING_NON_IMPLEMENTED_DEPRECATED` and
  `CRAFTING_RESULTS_DEPRECATED` to 19 and 20; `ContainerUiId` gains `RESERVED_CONTAINER_A` through
  `D` at 67-70; `WindowTypes` gains `RESERVED_CONTAINER_TYPE = 38`; `DisconnectReason` gains
  `SUB_CLIENT_LOGIN_NOT_BOUND = 150`; and `LevelSoundEvent` gains `ICE_BALL_BREAK`, moving
  `UNDEFINED` to 615.
  
  Nothing existing moved. 2193 stays the default version, the unversioned exports are unchanged, and
  no code reads the 2225 enums yet.
  
  The 2225 entry carries enums only: its block palette and recipes are captured from a Bedrock
  Dedicated Server of that version, and no such capture exists yet. The block and recipe generators
  now skip a non-default version in that state, naming the commands that populate it, rather than
  failing the whole run.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`f0584a3`](https://github.com/JSPrismarine/JSPrismarine/commit/f0584a381c6bab5c61e5aa2cd3782218bc8d74e7) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply the datagen recipe ID aliases again. They were matched against the recipe's source
  ID while their keys carry the crafting station, so every one of them missed and
  `recipes.json` could not be regenerated from the server it was built from. The published
  recipe book is unchanged; regenerating now reproduces it.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`8b1bf1b`](https://github.com/JSPrismarine/JSPrismarine/commit/8b1bf1b337e7cb9e1d8f61d8df8b42e2b2badcb6) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop presenting six frozen enums as per-version data. `LevelEvent`, `ActorDataID`, `ActorFlags`,
  `ServerAuthMovementMode`, `AbilityLayerFlag` and `RecipeEntryType` have no schema in any
  `bedrock-protocol-docs` release — a schema exists only for a type a packet field is declared with,
  and these travel as plain integers — so every protocol fell back to the same frozen 1.26.40
  `enums.html`. Each version directory then held a copy that differed from the others only in its
  `Source:` line, which reads as a value checked against that release.
  
  They are now generated once, to `generated/unversioned/`, headed `NOT VERSIONED` with the
  protocols that read them, the 1.26.40 commit they come from, and whatever `datagen/manifest.json`
  records under `legacy.knownGaps` about how they have drifted since. `generated/v2193/`,
  `generated/v2225/` and the default exports re-export that one copy, so every existing import keeps
  working and no value changed. An enum is treated this way only while *every* declared version
  reports it absent; the first release that describes one makes it versioned again with no manifest
  change, and two versions that disagreed about a shared enum would fail the run rather than let one
  copy win.
  
  The gap recorded for `LevelEvent`: it is missing `ParticleCreakingHeartTrail = 9816`, added after
  1.26.40, and its last three members carry the list positions 3617-3619 that the dump printed
  rather than values. Nothing in this repository sends any of them.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`23450ee`](https://github.com/JSPrismarine/JSPrismarine/commit/23450ee6e61092c05e2cebeca492c95b28e8da0d) Thanks [@filiphsps](https://github.com/filiphsps)! - Generated protocol data is now namespaced per protocol version. `datagen/manifest.json`
  declares releases under `versions`, each generator writes to `src/generated/v<protocol>/`
  (`@jsprismarine/minecraft/generated/v2193/*` today), and the version named by
  `defaultProtocolVersion` is re-exported at the unversioned `generated/*` paths, so existing
  imports keep working.
- Updated dependencies [[`ef12ef8`](https://github.com/JSPrismarine/JSPrismarine/commit/ef12ef8dee0fb445a80811306d20c44aabeb237d)]:
  - @jsprismarine/nbt@0.16.0
  - @jsprismarine/errors@0.16.0

## 0.15.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/errors@0.15.2
  - @jsprismarine/nbt@0.15.2

## 0.15.1

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/errors@0.15.1
  - @jsprismarine/nbt@0.15.1

## 0.15.0

### Minor Changes

- [`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c) Thanks [@filiphsps](https://github.com/filiphsps)! - `Event.isCanceled`, `BlockEntityRegistry.isModeled`, and `EntitySerializer.isModeled` replace their British spellings. Update imports and calls to the American names. `vanillaRecipes` also uses American spellings in its two generated recipe IDs; callers that store those IDs must update them.

- [`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c) Thanks [@filiphsps](https://github.com/filiphsps)! - The client package now exports `Behavior`, `BehaviorContext`, `BreakBehavior`, `ChatBehavior`, `LookBehavior`, `WalkBehavior`, `BEHAVIORS`, `BEHAVIOR_NAMES`, and `createBehaviors`. `BotOptions` and `FleetOptions` now use `behaviors`, and the CLI accepts `--behavior`. Update imports, options, and CLI invocations to these names.
  
  The Minecraft package renames `BlockSchemaCatalog` and its source module. Update direct subpath imports to the new module and type name.

- [#2585](https://github.com/JSPrismarine/JSPrismarine/pull/2585) [`6bac604`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac604599b909ba32f93fc855de11e88455d184) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace `as` type assertions with inferred types, type guards and narrower parameter types across the packages.
  
  Most of the change is internal, but a few public signatures moved so the compiler can carry the type instead of a cast:
  
  - **brigadier.** `ArgumentType.parse` receives an `ArgumentParseContext<S>` (the dispatcher's context builder, which is what it always got at runtime) instead of a `CommandContext`. `ParseResults.getExceptions()` holds `Error` values, since argument parsers throw plain errors. `CommandContext.getLastChild()` no longer claims it can return `null`. `ArgumentType` and `ArgumentParseContext` are exported from the package root.
  - **protocol.** `DataItem` is built from one `DataItemEntry` whose `type` tag decides the type of `value`, and exposes `getId`, `getType` and `getValue`. `NetworkStructure.deserialize` now returns a real instance: it used to copy the prototype with `Object.assign`, which copies nothing, so a decoded `BlockPos` or `Vec3` had no `serialize` method and failed `instanceof`.
  - **raknet.** `ServerName` takes a `ServerNameSource` naming the two methods it reads instead of `any`.
  - **client.** `ClientPacketRegistry` exports an `isPacket(packet, id)` guard that narrows `DecodedPacket.data` by id. The handshake rejects a JWT claim that is present but not a string with the existing clear error instead of a later `TypeError`.
  - **minecraft.** `BlockSchemaProperty.type` is the union of the three NBT tags the palette uses, so a palette with a new tag fails type-checking instead of slipping through as a string.
  - **prismarine.** The command dispatcher is typed over `CommandExecutor`, with typed `literal`/`argument` builders and runtime-checked argument accessors; selectors and relative coordinates from the console fail with a clear error instead of a `TypeError`, and relative `~` coordinates, which threw on every use, now work. `Metadata` stores typed entries so a value that does not match its `FlagType` is a compile error. Several managers take the narrow slice of `Server` they use (`BanManager`, `BlockManager`, `PacketRegistry`, `RecipeManager`, `CreativeInventory`), so tests build plain doubles. A shorthand ambient module had typed every import from `@jsprismarine/bedrock-data` as `any` inside the package; it is gone, so the generated types reach the compiler.
  - **logger, nbt, leveldb.** No signature changes. `Logger.getNamespace` returns an empty string instead of throwing when `Error.stack` is undefined, and `NBTTagCompound` getters return the default for a tag of the wrong kind instead of throwing.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a) Thanks [@filiphsps](https://github.com/filiphsps)! - Build declaration files with TypeScript 7 through `tsc-ts`. JSON data exports are now typed structurally (`string`, `number`) instead of as literal values.

### Patch Changes

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove constructs that ahead-of-time compilation with scriptc cannot lower, keeping runtime behavior the same.
  
  - `@jsprismarine/bedrock-data` exports `creativeitems` from a generated, explicitly typed module (`CreativeItemEntry[]`) instead of the raw JSON.
  - `@jsprismarine/brigadier` keeps each argument builder in the module of the node it builds (the old paths re-export), declares `literal` and `argument` as functions, and its exception types call message factories positionally.
  - `@jsprismarine/errors` declares its `Error` base without a type parameter.
  - `@jsprismarine/math` exposes `Vector2.ZERO` and `Vector3.ZERO` as shared immutable instances, and `Vector3` subclasses keep their class through `withX` and friends by overriding `create`.
  - `@jsprismarine/minecraft` exports `blockSchemas` from a generated, typed module (`BlockSchemaCatalog`).
  - `@jsprismarine/prismarine` replaces the `evt`-based event bus with its own `EventEmitter` (same `on`, `once`, `removeListener`, `removeAllListeners`, `emit` and `post`), carries inventory transaction data as a discriminated union (`kind`), exposes `allBlocks()`, `allItems()` and `allEntities()` registries, and drops the `heap`, `evt`, `fast-jwt` and `confbox` dependencies.
  - `@jsprismarine/raknet` declares `sendPacket` without a type parameter.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`aeaf717`](https://github.com/JSPrismarine/JSPrismarine/commit/aeaf7171f271b7c6b03df42a6152d1f63b82826b) Thanks [@filiphsps](https://github.com/filiphsps)! - Protocol 2193: Minecraft 1.26.50 and 1.26.51.
  
  Everything that was captured for 1.26.40 was captured again from a Bedrock Dedicated Server 1.26.51.1 - the item table (2076 items), the block palette (1477 blocks, 22079 states: 98 new wool and concrete stairs and slabs, a `minecraft:corner` on every stair, four connection states on every fence, pane and bar) and the recipes (1967) - and three things a 2193 client will not get into the world without were captured for the first time: the jigsaw structure rules, sent as `JigsawStructureDataPacket` before `StartGame` because the client disconnects with `MissingStructureData` otherwise; the definitions of the ninety-eight vanilla blocks that 1.26.50 defines in data, which `StartGamePacket` now declares the way a real server does; and the biome definitions, whose packet stopped being two loose lists and became a map of biome data plus a shared string table - a client reaches the world-generation screen with an empty one and gives up, so the real payload is now replayed. `packages/client/tools/capture-server-data.mjs` records all of them in one login.
  
  This was found the only way it could be: a retail 1.26.51 client reaching the world-generation screen and stalling. The same client also confirmed that, faced with a server that answers NetherNet's `GET /v1/join` signaling probe with a 404, it falls back to a direct RakNet connection - which is the transport this server speaks.
  
  The `LevelChunkPacket` payload wrote its biome sections with the wrong palette header. Each biome sub chunk is a paletted store like the block ones, and its header is `(bitsPerBlock << 1) | networkFlag`; the server wrote `bitsPerBlock 0` but left the network flag clear (`0` instead of `1`), which tells the client the palette is the *persistent* on-disk kind whose entries are NBT compounds. The client then reads the biome value varint as the start of a tag, the whole column decodes to nonsense, and it drops the join at world generation - the last thing standing between a real client and spawning. The section is now `01` (single value, network flag set) plus the biome value per sub chunk, one sub chunk for every one of the client's twenty-four, then the border byte, checked by decoding the packet the server sends and confirming it is consumed to the last byte. This too was invisible to the server's own client, which never deserialized terrain.
  
  **The packets the client actually sends were wrong at 2168, and are right now.** The 2168 work was checked with this repository's own client, which reads `StartGame` partially, moves with `MovePlayerPacket` and never touches an inventory - so nothing exercised the paths a real client takes, and several of those had drifted years earlier:
  
  - `StartGamePacket` still wrote a movement mode in front of the movement settings. That field left the protocol at 1.21.90, when client authoritative movement was retired, and every field after it went out one byte late. The full layout is now modeled in `@jsprismarine/protocol` and checked by decoding the packet BDS 1.26.51 sends and writing it back byte for byte.
  - A real client moves with `PlayerAuthInputPacket`, every tick, and has since 1.21.80; the server had no decoder for it, so a real player could not move, and neither could they break a block, because a survival break rides in that packet's block actions. Both are read now and go through the same code as `MovePlayer` and `PlayerAction` do.
  - `InventoryTransactionPacket` was read in its 748 layout: no presence byte before the legacy slot list, window ids and flags inferred rather than read, and no `Hand`, which 2193 added. `ItemStackRequestPacket` likewise: an action's selector, the four fixed bytes of a stack net id, the client's own descriptor form for auto-craft ingredients. `ItemStackResponsePacket` wrote none of its three optionals. All three follow gophertunnel's 2193 encoding now, with tests that write the bytes by hand.
  - Block positions in `PlayerActionPacket` were read with an unsigned y, the layout up to 1.26.0; a block below sea level came out in the billions.
  
  `PlaySoundPacket` gained the loop count, the range bypass and the two optionals 1.26.50 added, and can be encoded at all. `BuildPlatform` lost its retired members, `UWP` among them: BDS validates a login against the list now and refuses the value the client used to report, so it reports `WIN32`.
  
  **The datagen reads Mojang's new publications.** `enums.html` is gone; a release is a `metadata.zip` of JSON schemas attached to a GitHub release, and the schemas list an enum's members without their values. `import-schemas.js` pins two releases - the target for the members, the first later preview whose schemas carry `x-enum-binary-value` for the numbers - into `snapshot/enums.json`, which `generate-enums.js` prefers over the old HTML dump wherever the schemas describe an enum. `DisconnectReason` and `PlayerAuthInputData` are generated from them. The recipe generator reads the `.brarchive` files a 1.26.50 server packs its behavior packs into, and the palette capture places every block in four settings so that none pops before the save.
  
  One thing this release cannot fix: BDS 1.26.51 defaults to `transport=nethernet` and prints that RakNet is no longer a supported transport for players. This server speaks RakNet only. Whether a 1.26.51 client still connects to a RakNet server by address is not something this repository can test.
- Updated dependencies [[`6b60a88`](https://github.com/JSPrismarine/JSPrismarine/commit/6b60a88e40ad9751ea177f4273779869486de7e0), [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36), [`6bac604`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac604599b909ba32f93fc855de11e88455d184), [`60e9e6f`](https://github.com/JSPrismarine/JSPrismarine/commit/60e9e6f981cce46edf2bb2ee0b7b1eea3b7360ee), [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a)]:
  - @jsprismarine/nbt@0.15.0
  - @jsprismarine/errors@0.15.0

## 0.14.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/errors@0.14.2
  - @jsprismarine/nbt@0.14.2

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

- Updated dependencies [[`53eb2f6`](https://github.com/JSPrismarine/JSPrismarine/commit/53eb2f605a8a90bee72788ac785fd4046ecce2b2)]:
    - @jsprismarine/errors@0.14.1
    - @jsprismarine/nbt@0.14.1

## 0.14.0

### Minor Changes

- [`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a) Thanks [@filiphsps](https://github.com/filiphsps)! - Republish every package with its compiled `dist/` output. The previous stable release shipped without any built code — every tarball on npm contained only `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` — because `pnpm run build` had been commented out of the release workflow at the time of the cut. The build step has since been restored; this minor bump forces a fresh stable publish so consumers actually receive the compiled code.

### Patch Changes

- Updated dependencies [[`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a)]:
    - @jsprismarine/errors@0.14.0
    - @jsprismarine/nbt@0.14.0

## 0.13.5

### Patch Changes

- [`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51) Thanks [@filiphsps](https://github.com/filiphsps)! - Force-republish all packages at 0.13.4 to recover from a broken release pipeline.

    Previous attempts to publish 0.13.3 left the npm registry in an inconsistent state: a handful of packages (`brigadier`, `client`, `color-parser`, `errors`, `prismarine`, `raknet`) were pushed under the `unstable` dist-tag at the non-snapshot version `0.13.3`, while the rest failed mid-publish. Rather than try to repair 0.13.3 in place, we're skipping it entirely and resyncing every package on `latest` at 0.13.4.

- Updated dependencies [[`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51)]:
    - @jsprismarine/errors@0.13.5
    - @jsprismarine/nbt@0.13.5

## 0.13.2

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/errors@0.13.2
    - @jsprismarine/nbt@0.13.2

## 0.13.1

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/errors@0.13.1
    - @jsprismarine/nbt@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/errors@0.13.0
    - @jsprismarine/nbt@0.13.0

## 0.12.1

### Patch Changes

- [`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix types order in package.json.

- Updated dependencies [[`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72)]:
    - @jsprismarine/errors@0.12.1
    - @jsprismarine/nbt@0.12.1

## 0.12.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/errors@0.12.0
    - @jsprismarine/nbt@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/errors@0.11.1
    - @jsprismarine/nbt@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/errors@0.11.0
    - @jsprismarine/nbt@0.11.0

## 0.10.0

### Patch Changes

- [`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Bring tooling closer to supporting `composite: true`.

- Updated dependencies [[`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a)]:
    - @jsprismarine/errors@0.10.0
    - @jsprismarine/nbt@0.10.0

## 0.9.0

### Minor Changes

- [`9963470`](https://github.com/JSPrismarine/JSPrismarine/commit/996347038b55d4d08b08b1efdc451e89d7265b30) Thanks [@filiphsps](https://github.com/filiphsps)! - - Use correct file extension for commonjs modules (`cjs`).

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/errors@0.9.0
    - @jsprismarine/nbt@0.9.0

## 0.8.0

### Minor Changes

- [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a) Thanks [@filiphsps](https://github.com/filiphsps)! - - Update to latest bedrock edition.

### Patch Changes

- [`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7) Thanks [@filiphsps](https://github.com/filiphsps)! - - Replace `assert` with `with`.

- Updated dependencies [[`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7), [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a)]:
    - @jsprismarine/errors@0.8.0
    - @jsprismarine/nbt@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/errors@0.7.0
    - @jsprismarine/nbt@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/errors@0.6.0
    - @jsprismarine/nbt@0.6.0

## 0.5.0

### Patch Changes

- [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade `typescript` to `v5.5.2`.

- [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`c8d976f`](https://github.com/JSPrismarine/JSPrismarine/commit/c8d976f627ef96deb9b2213561848f84214c07a1) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve `Gametype` parsing.

- Updated dependencies [[`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53)]:
    - @jsprismarine/errors@0.5.0
    - @jsprismarine/nbt@0.5.0

## 0.4.5

### Patch Changes

- [#1460](https://github.com/JSPrismarine/JSPrismarine/pull/1460) [`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly revamp build system to allow for way better dev UX.

    Fix error getting thrown on first run due to missing the `level.json`
    file. We no longer try to read it if it doesn't exist.

    Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
    `pid` validation.

- [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade turbo to v2.

- Updated dependencies [[`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe), [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3)]:
    - @jsprismarine/nbt@0.4.5

## 0.4.4

### Patch Changes

- [`adffd12`](https://github.com/JSPrismarine/JSPrismarine/commit/adffd12b09d07dc878a2e01cd795c3056317946a) Thanks [@filiphsps](https://github.com/filiphsps)! - Migrate to @jsprismarine/Minecraft's `gametype`.

- Updated dependencies []:
    - @jsprismarine/nbt@0.4.4
