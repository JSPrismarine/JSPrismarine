# @jsprismarine/prismarine

## 0.16.0

### Minor Changes

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`30c3b75`](https://github.com/JSPrismarine/JSPrismarine/commit/30c3b757659005a41f24948cb22c1aad2d7c0a8d) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the painting spawn packet and its typed payload into the protocol package.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`87df04b`](https://github.com/JSPrismarine/JSPrismarine/commit/87df04b579dc29b38faf94c26d6275136c19edee) Thanks [@filiphsps](https://github.com/filiphsps)! - Put the advancement engine and the enchantment system into play. Both packages were built at
  startup and then referenced nowhere: no gameplay code raised a single trigger, and nothing read an
  enchantment's effect components, so no player could earn an advancement and no enchantment did
  anything.
  
  An item stack carries its `minecraft:enchantments` and surfaces it through `getEnchantments`,
  `getEnchantmentLevel` and a copying `withEnchantments`; `asPredicateStack` hands that component to
  the loot, predicate and enchantment grammars along with the enchantability and durability pair the
  enchanting table and the anvil read. `Item.hasEnchantment` takes a Java enchantment id rather than
  `ItemEnchantmentType`, whose numbering covers 37 of the 43 enchantments and gives Thorns and
  Efficiency the same number.
  
  Damage reduction reads the real `minecraft:damage_protection` components of what is worn, one
  running total per equipment slot as Java accumulates it, instead of a factor that was a literal
  zero on every entity. Each enchantment decides for itself which blows it answers through the
  `damage_source_properties` condition in its own file, so `Damage.BYPASSES_ENCHANTMENTS` is empty:
  Java's `#minecraft:bypasses_enchantments` holds only a warden's sonic boom. A melee swing reads the
  attacker's main hand for `minecraft:damage` and `minecraft:knockback`, and `Block.getBreakTime`
  divides by the tool's mining speed, which carries `minecraft:mining_efficiency`.
  
  Fifteen of the 58 advancement triggers fire from the place that knows the event, led by
  `inventory_changed`, which 1914 of the 4045 vanilla criteria use and which is how a block break is
  reported, since Java has no block-break trigger. Progress rides in the player data record. The
  engine is built with the item and enchantment views its conditions need, and both Java grammars now
  parse against a reference resolver, without which a `#tag` inside a criterion expands to nothing.
  
  The enchanting table and the anvil are reachable: Java's draw behind a per-player enchantment seed
  that persists, Java's bookshelf walk rather than a radius count, and real options sent as a
  `PlayerEnchantOptionsPacket` instead of letting the client's own preview guess.
  
  The content build also passed the item tags where `EnchantmentRegistry` expects the enchantment
  tags, and nothing where it expects the item tags, which left `in_enchanting_table` empty and
  `supports` false for all 43 enchantments.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`94378af`](https://github.com/JSPrismarine/JSPrismarine/commit/94378afa7703ea12239c4837f8b18fbc4b5974cc) Thanks [@filiphsps](https://github.com/filiphsps)! - Move diagnostics and telemetry packet codecs into Protocol.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`d4d0080`](https://github.com/JSPrismarine/JSPrismarine/commit/d4d00808c51e69517519dd35cc4071952387c88b) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the animate entity packet codec into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`5733593`](https://github.com/JSPrismarine/JSPrismarine/commit/5733593f9d9cbef5fa8386ae2e1b5530afc85d10) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove Prismarine's chunk radius packet wrappers and use Protocol's typed request and response packets.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`76a3b06`](https://github.com/JSPrismarine/JSPrismarine/commit/76a3b06c30673d89da14678592d3f4f5487ff51b) Thanks [@filiphsps](https://github.com/filiphsps)! - Route `/summon` through declared data-driven types only.

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

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`e0b6601`](https://github.com/JSPrismarine/JSPrismarine/commit/e0b6601c7d15192bf5067a4b6c0dd7aa6741e2f9) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the block actor data packet codec into the protocol package.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4530865`](https://github.com/JSPrismarine/JSPrismarine/commit/45308653f208bcb4efddfe13aaf8dd5e2c892740) Thanks [@filiphsps](https://github.com/filiphsps)! - Send block entity changes to the clients that already have the chunk. A chunk carries its block
  entities in its own payload, so a sign placed before the chunk was sent arrived with its text, but
  everything written afterwards went no further than the chunk. `BlockActorDataPacket` was registered
  for decoding and no code path ever built one, so a sign's text, a chest's contents, a lectern's
  page and a flower pot's plant were server-only facts until the player walked far enough away to
  unload the chunk and came back. This matters more since 25 block types started opening real screens
  backed by the chunk's own block entities.
  
  `WorldChangeSink` gains `blockEntityChanged` and the `flushBlockEntities` tick phase, and
  `NetworkWorldReplicator` encodes a `BlockActorDataPacket` per changed position and sends it to the
  players whose streamed chunks cover it. The flush runs after `flushBlockChanges`, which is a
  correctness rule rather than an economy: a client drops a block entity update for a position it has
  no block entity at, and an `UpdateBlockPacket` landing afterwards makes it rebuild the block entity
  from its own empty data, so a chest placed and filled in one tick has to be announced as a block
  first.
  
  The three places that wrote a block entity into a chunk - the content adapter behind `setBlockData`,
  the piston carry in `blockMove`, and the loot roll a generated chest gets on first open - go through
  one new `writeBlockEntity`, which also drops a write whose compound encodes to the bytes already
  there. Several families rewrite a block entity on a schedule whether or not anything moved: a
  comparator restates its signal on every tick it runs, and a beacon recounts the same pyramid on
  every neighbor change. Each of those used to drop the chunk's serialization cache, and would
  otherwise now have cost a packet to everyone nearby every tick.
  
  `WorldChangeSink`, and so `World.attachChangeSink`, has two more required members.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`46e269e`](https://github.com/JSPrismarine/JSPrismarine/commit/46e269eb2e16fe32f18eabd3e84da668e74e99a3) Thanks [@filiphsps](https://github.com/filiphsps)! - Let a block open its container. No block opened a container anywhere in this server before:
  `openMainInventory` was the only `ContainerOpen` ever sent, and it answers the client asking for
  its own inventory, so a chest, a furnace and a crafting table all did nothing when clicked.
  
  `PlayerSession.openBlockContainer` sends the `ContainerOpen` for a block position with a
  `Target Actor ID` of -1, remembers the window, and follows it with the block's stored `Items` for
  a container that stores anything. `blockContainerOf` resolves a block identifier to its
  `ContainerType` and its slot count, taking the slot count from `slotsOf` in
  `@jsprismarine/block-behaviors` rather than keeping a second list of it.
  
  `useItemOnBlock` calls it after the block's `onPlayerInteract` and before the held item's
  `onUseOn`, so a barrel still sets `open_bit` and a chest still plays its open sound while both now
  also draw their screen. The enchanting table additionally clears its three rows through
  `showEnchantingTable` on open.
  
  Twenty-five block families open a screen: chests and trapped chests, the ender chest, barrels,
  every shulker box, decorated pots, the crafting table, the three furnaces, the enchanting table,
  the three anvils, the brewing stand, the dispenser, the dropper, the hopper, the beacon, the loom,
  the grindstone, the stonecutter, the cartography table, the smithing table, the lectern and the
  crafter.
  
  The enchanting table and the anvil also take their craft. `ItemStackRequestHandler` resolves
  `ENCHANTING_INPUT_CONTAINER`, `ENCHANTING_MATERIAL_CONTAINER`, `ANVIL_INPUT_CONTAINER` and
  `ANVIL_MATERIAL_CONTAINER` into two slots held on the open window, so a stack can sit in the table
  between the `PLACE` that puts it there and the craft that takes it out, and the request rollback
  covers them. A `CRAFTING_RECIPE` while an enchanting table is open is the row the player clicked
  rather than a recipe, and runs `takeEnchantingRow`; a `CRAFTING_RECIPE_OPTIONAL` while an anvil is
  open runs `takeFromAnvil` with the name out of `Strings To Filter`. Moving a stack into or out of a
  *storage* container is still refused.
  
  A craft result that the server built per use is no longer rebuilt from its name on the way to a
  slot, which used to be right for the shared creative menu and would have thrown away the
  enchantments an enchanting table had just applied. The anvil result also carries its
  `minecraft:custom_name` onto the stack, which it had nowhere to put before `Item` grew one.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`90c5b9a`](https://github.com/JSPrismarine/JSPrismarine/commit/90c5b9a43207dcd30980eebef5dc42d995520d84) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove Prismarine's disconnect and play status packets, and use Protocol's typed payloads for connection status messages.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`09979cd`](https://github.com/JSPrismarine/JSPrismarine/commit/09979cd9e3d6e3971f7d3e3d370f9a32473b8bf4) Thanks [@filiphsps](https://github.com/filiphsps)! - Move UpdatePlayerGameTypePacket into protocol.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`ff19749`](https://github.com/JSPrismarine/JSPrismarine/commit/ff19749df1f7e776064bd80a13547dcc9c421ac1) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the book edit packet and its typed operation data into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`15a2660`](https://github.com/JSPrismarine/JSPrismarine/commit/15a266017558f1c35739bf05199dc7681dcb35a9) Thanks [@filiphsps](https://github.com/filiphsps)! - Use the Protocol StartGame packet in the server and remove the Prismarine implementation.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1583bc0`](https://github.com/JSPrismarine/JSPrismarine/commit/1583bc08667502a555ca4bb43056bf98c5f66f20) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix four defects in the Brigadier port and the command packet, all found against Mojang's
  published command data and upstream Brigadier.
  
  `CommandDispatcher.execute` passed the caught exception to `ResultConsumer.onCommandComplete`
  where upstream passes 0, and the consumer's `result` parameter was widened to `any` to allow it.
  It passes 0 now and the parameter is a `number`, so an `execute store result` sink always reads
  the count rather than an `Error`.
  
  `Command<S>` declared `(context) => Promise<any>` where upstream returns an `int` and the
  dispatcher reads the value synchronously. It returns `number` now. Both are breaking: a command
  body that returns a promise no longer typechecks, which is the point, because the dispatcher
  never awaited one.
  
  `AvailableCommandsPacket` writes the four chained-subcommand fields it used to send as
  placeholders, which are what carries `/execute`'s subcommand chain to a Bedrock client. A
  parameter can hold a `CommandChainedSubcommand` the way it holds an enum, a command declares the
  tables it uses, the packet sets `CommandParameterOption.EnumAsChainedCommand` on the tail
  parameter, and an overload is marked `isChaining` exactly when it ends in one, which is how
  Mojang's own data has it.
  
  Every command under `packages/prismarine/src/command/` was an `async` body, which the narrowed
  `Command<S>` no longer accepts and which the dispatcher never awaited anyway. A body that has
  work to await is now wrapped in `asyncCommand`, which starts it, parks its promise and returns
  Brigadier's result code; `CommandManager.dispatchCommand` collects the queue with
  `collectAsyncCommands` and awaits it where it used to await the dispatcher's return value.
  Rejections and feedback lines behave as before, and a command registered with a plain
  `.executes(async ...)` has to be wrapped.
  
  `CommandArgumentType` gains the 8 parameter type ids Mojang's command set uses and the table
  omitted: `WildcardSelection` 10, `PathCommand` 17, `FullIntegerRange` 23, `EquipmentSlot` 47,
  `BlockStateArray` 84, `ClockTimeMarker` 86, `PoiType` 88 and `CodeBuilderArgs` 92.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`2abed4c`](https://github.com/JSPrismarine/JSPrismarine/commit/2abed4c67bde73a6da6c7444b5f93a03748f2d8d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove Prismarine's `BatchPacket` wrapper and frame packet arrays through Protocol's `BatchCodec`. Session codecs still prepare each packet for the negotiated protocol version before framing.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d2cb7ec`](https://github.com/JSPrismarine/JSPrismarine/commit/d2cb7ec2c353093835471eb52f898c0d075c55e8) Thanks [@filiphsps](https://github.com/filiphsps)! - Route generated entities only through declared data-driven types.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`91eaefa`](https://github.com/JSPrismarine/JSPrismarine/commit/91eaefae197242e2476901190792924edcabb0fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven proximity and one-shot status effects.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b6eccf4`](https://github.com/JSPrismarine/JSPrismarine/commit/b6eccf49493ed702c5c13eb831ad9fa54258a47d) Thanks [@filiphsps](https://github.com/filiphsps)! - Route block power changes through data-driven redstone hooks.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`c9d1849`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d1849bc559d8222140b20852f7af89074660d6) Thanks [@filiphsps](https://github.com/filiphsps)! - Move Education, photo, warning, settings, and store-offer packets into Protocol.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`14ff23a`](https://github.com/JSPrismarine/JSPrismarine/commit/14ff23ad9b2df838457f98d58fcef567d7242d68) Thanks [@filiphsps](https://github.com/filiphsps)! - Move `SetSpawnPositionPacket` into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`153ef65`](https://github.com/JSPrismarine/JSPrismarine/commit/153ef650f6a99338115fac97ce4face3a59ededf) Thanks [@filiphsps](https://github.com/filiphsps)! - Move SetPlayerGameTypePacket into protocol.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c59762e`](https://github.com/JSPrismarine/JSPrismarine/commit/c59762eb7d8d7e58bd477e48de087667c565045b) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven entity sensors

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ab8fe82`](https://github.com/JSPrismarine/JSPrismarine/commit/ab8fe82a8bf5097c90c45dbf7d30b39b21bff6bb) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename `Item.getNetworkId()` to `Item.getRuntimeId()` to match the Bedrock item registry.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`efe67c0`](https://github.com/JSPrismarine/JSPrismarine/commit/efe67c07af9bf5f951666e0fdaea628aecb3d728) Thanks [@filiphsps](https://github.com/filiphsps)! - Generate whole chunks in worker threads, and serve the chunks somebody is waiting on first.
  
  Measured over a contiguous 24 by 24 block of overworld chunks on an Apple M1 Pro, eight cores:
  one thread builds a chunk in 427.8 ms, six workers running only `terrain` in 237.4, and six
  workers running the whole ladder in 124.7. The middle row is where this server was. `terrain` is
  71 of the 239 ms a chunk costs and it was the only status that left the server thread, so the
  decoration pass, the structure layout and the merge stayed serial and no worker count could take
  the pool past 1.33 times.
  
  A worker now climbs the whole ladder and hands back the merged region; only the Bedrock
  translation stays on the server thread, because it reads this server's mapping tables. That is
  safe because this server's decoration pass is already pure - Java writes a feature through into
  its neighbors, which is why Java keeps `features` on one executor, while here it runs over a
  private view and returns patches. A chunk is therefore a function of the seed and its position,
  and `test/chunkParity.ts` builds chunks both ways and compares the serialized result exactly.
  
  `ShardedGenerationPool` gives each worker a region of the world to own, so the neighbors a chunk
  reads are ones its worker has already built rather than ones it has to build again. A region
  whose owner falls far behind has its overflow taken by an idle worker.
  
  Chunk requests now carry how badly the chunk is wanted. A chunk a player is standing next to is
  `immediate`, one inside half their view distance is `soon`, and the rim beyond it is `idle`; the
  start region preload is `idle` throughout. The pool drains its backlog in that order instead of
  in arrival order, so a player walking into fresh terrain no longer waits behind a preload rim
  that was asked for first. A request that becomes more urgent while it waits is moved up.
  
  A chunk several callers want at once is generated once. `World.loadChunk` read the provider on
  every call, so overlapping requests for one position each built the chunk and each caller got a
  different `Chunk` object; the last to finish won the map, and a block written through one was
  invisible through another.
  
  `/locate structure` answers. A structure's position is a function of the seed and the placement
  grid, so `Generator.locate` finds the nearest one by laying candidates out against the bare noise
  terrain, nearest first, without generating anything.
  
  `World.loadChunk`'s third parameter was an unused `_ignoreWarn` flag and is now the request
  options. A caller passing `true` should pass `{ urgency: 'idle' }` or nothing.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`05f5702`](https://github.com/JSPrismarine/JSPrismarine/commit/05f570207f30a3b5b08d51e70c73278233f87de4) Thanks [@filiphsps](https://github.com/filiphsps)! - Key loaded chunks by a number instead of a `bigint`. `Chunk.packXZ` returned a 64 bit `bigint`,
  so every lookup of the chunk a block is in allocated a BigInt and hashed it. Anything that walks
  blocks does that per block: the light engine's column scan during a start region preload, and mob
  pathfinding during a tick.
  
  It now packs 22 bits an axis into an exact integer, which covers chunks from -2097152 to 2097151
  against a world border at 1875000 chunks, so every coordinate the game can reach still has its own
  key. `Chunk.packXZ` returns `number` and `Chunk.unpackXZ` takes one; `World.chunks` and
  `PlayerSession`'s loaded and loading sets are keyed by number.
  
  Measured: packing a key and looking the chunk up is 69 nanoseconds as a `bigint` and 36 as a
  number. The pair was 37% of the self time of a 441 chunk preload, and an independent profile of
  the entity tick put `World.getLoadedChunk` at 15% and `Chunk.packXZ` at 9%.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`aedb0cd`](https://github.com/JSPrismarine/JSPrismarine/commit/aedb0cd38af0d839133c507af8ed7dcfc0d55245) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the deprecated `Blocks.allBlocks()` export and its generated block classes.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`548c8a3`](https://github.com/JSPrismarine/JSPrismarine/commit/548c8a34f6b22ac669784fd855f18047863383da) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the content adapter's class-based entity spawn fallback.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`9ec832e`](https://github.com/JSPrismarine/JSPrismarine/commit/9ec832e9cb80462b10f2f9584af2e73bc327a498) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the command block update packet codec into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`8e17732`](https://github.com/JSPrismarine/JSPrismarine/commit/8e177325841ae74738d88792a150b3fe4a1ec596) Thanks [@filiphsps](https://github.com/filiphsps)! - The server config is one `config.json`, written in definition order, and YAML configs are gone.
  
  Three config bugs had the same root: the content settings (`content-strict`,
  `content-world-packs`, `content-datapacks`) lived in a `config.yaml` of their own, which the
  server then mistook for a legacy config and converted, so `config.json` began with the content
  keys, `$schema` landed last, and a `config.yaml` always sat beside the file. The content keys now
  live in `config.json` with everything else, and a new key is inserted where the definition says
  it goes - `$schema` first - no matter which part of the server writes it first. Existing files
  are never reordered.
  
  Reading `config.yml` and `config.yaml` is removed, along with the `yaml` dependency. A server
  that finds one refuses to start and says to move the settings into `config.json` and delete the
  file, rather than silently running on defaults or ignoring the file. `ConfigBuilder` now accepts
  only `.json` paths and its `getType()` is gone; `parseConfigDocument` takes the text alone, and
  `ConfigSyntaxError` no longer names a format.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`85eb8dc`](https://github.com/JSPrismarine/JSPrismarine/commit/85eb8dce77a083952edc2130c78f7a49d542b391) Thanks [@filiphsps](https://github.com/filiphsps)! - Send a player's block break through the content hooks.
  
  `World.breakBlock` raised no hook, so with the content on a chest broken by a player kept its
  contents, a double chest left its other half paired to a position holding air, and the drops were
  rolled without the position or the dimension the break happened in.
  
  `world/blockBreak.ts` is the content path for the same break. The block's behavior family gets
  `onBreak` before the block goes, which is what spills a container and unpairs a double chest, and
  Java's loot table for the block decides what falls, with the breaking player's tool in the roll so
  silk touch and fortune apply.
  
  Both halves drop items, so the two are told apart by what the block entity was holding: the table
  owns what the block itself yields, and a family drop the block entity did not hold is the family
  standing in for the table on a host with no Java half, which the roll replaces. Whether a
  container's contents spill at all stays the family's decision, which is how a shulker box keeps
  what it holds. A block the stack has no table for keeps the family's own drops.
  
  The path declines whenever `content-packs` is off and for a block the content has no type for, so
  a server without content breaks blocks exactly as before. A behavior that throws is logged and the
  break falls back to the same drop rather than costing the player the block.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c79527d`](https://github.com/JSPrismarine/JSPrismarine/commit/c79527d927ce9d047b1a3835caeb59ad1eca7287) Thanks [@filiphsps](https://github.com/filiphsps)! - Wire the last three throwing members of the content world adapter, and send a player's right click
  through the content hooks.
  
  `entities.spawn` puts a body into the live world. Which identifiers it accepts comes from the
  content entity registry, so a pack's own mob is spawnable rather than only the types with a written
  class; a written class is built where one adds behavior the identifier needs, a falling block is
  built from the block its record names, and everything else is a `GenericEntity` carrying the
  identifier, which is what a Bedrock client draws from anyway. An identifier no registry carries is
  reported and nothing is spawned, so a lit TNT block no longer loses its entity.
  
  `items.stateOf`, `items.targetOf` and `items.perform` are backed by `item/actorPort.ts`, over the
  live player and the live entity index. Both queries are answered off the player. Eight of the
  twenty-two entity-facing `ItemWorldAction` variants are performed against the system that owns
  them: eating, a blow, a stack into the inventory, durability, armor, a name tag, a random teleport
  and an item cooldown. The other fourteen are reported once per kind naming the system this server
  has not written, and do nothing.
  
  `item/interaction.ts` runs a player's right click through the content hooks before
  `World.useItemOn` sees it: the clicked block's `onPlayerInteract` first, unless the player is
  sneaking with something in hand, then the item's `onUseOn`, and a placement through the content
  block adapter when both decline, so `onPlace` runs and a container gets its record. A right click
  on an entity records the target and runs the item's `onUse`, which is how a behavior reaches
  `targetOf`. The path declines whenever `content-packs` is off, so a server without content behaves
  exactly as before.
  
  Content block entity records are now the chunks' own block entities, so a container filled by a
  behavior is saved with its chunk and sent to every client that loads it.
  `blockentity/contentRecord.ts` states the mapping: `items` becomes Bedrock's `Items` list, the rest
  of the record is JSON under one `jsprismarine:data` tag, and tags the record does not describe stay
  where they were found.
  
  The bump is `minor` because `worldEntityAccess` now takes an options object in place of its single
  world argument, and per the versioning policy a breaking change below `1.0.0` is a `minor`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d6c235d`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c235da420d30ee681ea6c74fc229e2307bedb5) Thanks [@filiphsps](https://github.com/filiphsps)! - Build the content from the pack stack on every server. `config.yaml`'s `content-packs` key and the
  `JSP_CONTENT` environment override are gone, and with them every branch that asked whether a build
  exists. `Server.getContent()` and `Server.getContentWorld()` return a value instead of
  `undefined`, `Server.getEntityRuntime(dimension)` returns that dimension's runtime, and
  `Server.setContent` takes a build rather than a build or nothing. A stack that will not load now
  stops the server at startup, because there is no table left behind it to fall back to.
  `content-strict`, `content-world-packs` and `content-datapacks` are unchanged.
  
  `/loot` and `/recipe` are offered unconditionally. `CONTENT_ONLY_COMMANDS` and `unwiredCommands()`
  are gone; `UNWIRED_COMMANDS` is the whole list of what this server leaves out, and the command set
  is 53 whatever the stack holds. Rolling a table nobody registered still refuses by name.
  
  `AdvancementEngine.listensFor(trigger)` is new, and is what the trigger call sites now check before
  building an event. It answers whether any loaded criterion names that trigger, which replaces a
  check on whether a content build existed at all with one on what the stack actually declared, so a
  stack with no advancements in it costs a damage event nothing.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8732c1b`](https://github.com/JSPrismarine/JSPrismarine/commit/8732c1b7293201c98cf6a1522c8ab0155bd59af6) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the content behaviors against the live world. `buildServerContent` was called with no `world`,
  so every adapter member fell back to `unwiredWorldSource` and threw: the 49 block behavior
  families, the item families and the component runtimes ran only in their own unit tests. A server
  now passes `serverWorldSource`, which spreads the four subsystems' groups into one adapter per
  dimension over the loaded `World`.
  
  Wired to the live world: the block reads and writes, the block entity records, neighbor
  notification and redstone power; the dimension bounds, clock, day time, difficulty and spawn point;
  the light level, chunk loading and surface column; both scheduled tick lists; the named sounds and
  particles, which travel as `PlaySoundPacket` and `SpawnParticleEffectPacket` through two new
  `WorldChangeSink` members; the entity queries, removal and drops; and the item behaviors' world
  half.
  
  Still refused, each naming the subsystem that owes it: `blocks.biome` and `blocks.biomeTags`, which
  have no table mapping a chunk's numeric biome id back to an identifier; `entities.spawn`, which
  needs a factory covering every identifier a pack can name; `effects.emitGameEvent`, which nothing
  listens for; the item behaviors' entity, inventory and screen actions, which need a player session;
  and the `spawning`, `ai`, `generation` and `commands` groups, which stay absent.
  
  A write that leaves the same block standing now raises `onBlockStateChange` rather than `onPlace`,
  once per state value that moved. That is what the two hooks are documented to mean, and it is what
  makes a door terminate: a door opens by rewriting its own `open_bit` from inside `onPlace`.
  
  `World` gained `setLoadedBlockRuntimeId`, `getKnownSpawnPosition`, `playNamedSound` and
  `spawnNamedParticle`, which is what the behaviors need to act from inside a tick without awaiting a
  chunk.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`5a0b34b`](https://github.com/JSPrismarine/JSPrismarine/commit/5a0b34b3da74e8c0d4d1e83ddab701563c9505ce) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the movement prediction correction packet codec into the protocol package.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1f019bc`](https://github.com/JSPrismarine/JSPrismarine/commit/1f019bc80f6552d6906cc6a2ec03dab1094de7de) Thanks [@filiphsps](https://github.com/filiphsps)! - Make Ctrl+C work, including while a world is generating.
  
  Three defects stacked up, and a terminal needed all three fixed before a keypress could stop the
  server. `Console` puts stdin in raw mode, and Node's tty documentation says of `setRawMode` that
  "Ctrl+C will no longer cause a SIGINT when in this mode" - the keypress arrives as stdin byte 3 and
  raises nothing. readline parses that byte and answers an unhandled one by closing itself, so the
  single Ctrl+C that was meant to start a shutdown instead left the server running with a console
  that would never read another keystroke. The console now reads the byte off stdin directly and
  counts every press in a read, since an operator at a frozen console presses more than once and the
  terminal hands all of them over in one go.
  
  `Server.shutdown` opened with `if (this.stopping) return`, so no amount of pressing could escape a
  shutdown that was itself waiting on a world save behind minutes of chunk generation. A second
  request now forces the exit instead, and says so. `stayAlive` callers such as `/stop` are
  unaffected. `Server.releaseOnShutdown` is new, and registers work to do the moment a shutdown
  begins, before it awaits anything.
  
  The last defect was the signal handlers themselves. Node removes a signal's default disposition
  once a listener is installed, and that default is the only thing that can end a process while the
  event loop is blocked - which, on a server generating terrain, is most of the time. The entry point
  now gives the termination signals back to the kernel as soon as a shutdown starts, so the next
  Ctrl+C or `kill -INT` lands whether or not the loop is free. Measured against a server preloading a
  start region: one Ctrl+C never exited at all before this, and now shuts down cleanly; a second
  press exits in 0.07 s where three presses had done nothing.
  
  A crash also now shuts down as a crash. The single handler compared its argument against the string
  `'uncaughtException'`, which no listener is ever passed, so an uncaught exception exited zero.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`67ebeba`](https://github.com/JSPrismarine/JSPrismarine/commit/67ebebaafeac374d367e2cc52e8da9e242c43718) Thanks [@filiphsps](https://github.com/filiphsps)! - Three fixes to the data-driven entity path.
  
  **The villager brain attaches.** `@jsprismarine/entity-brains` registers all twenty of its
  definitions under Java Edition's identifiers, and five Bedrock entities kept a legacy name when
  Mojang rewrote their file. One of the five is a brain mob: Java's `minecraft:villager` spawns here
  as `minecraft:villager_v2`, so the registry read missed it and a villager ran its 27 Bedrock goals
  while its schedule, professions, memories and sensors sat unused. `EntityRuntime.spawn` now looks
  the definition up through `@jsprismarine/mapping`'s Java to Bedrock entity table, the same source
  `javaEntityStats` reads for the same renames. All twenty brain mobs attach; the villager is the only
  one of the twenty the two editions spell differently.
  
  **Data entities survive a save.** Nothing restored one: a mob that was running its components, goals
  and brain came back from disk as a body with none of them behind it, and the spawn loop counted
  nothing against the population cap it had been spawned under, so a reloaded world over-spawned.
  `World.saveChunks` now writes each entity's component groups, property values, attributes and body
  state into its actor compound under one JSON tag, which is the choice
  `blockentity/contentRecord.ts` already makes for fields Bedrock publishes no schema for.
  `EntityRuntime.restore` builds the entity back from that record without running a spawn event, so a
  wounded mob stays wounded and a sheared sheep stays sheared. The actor's `UniqueID` and every other
  tag the file carried move onto the restored body, so the next save addresses the same actor. An
  actor the data path never wrote still loads through the written classes.
  
  **`/summon` reaches the data path.** The command resolved an identifier against the 108 written
  entity classes, so with `content-packs` on it could neither build a mob from its behavior-pack
  definition nor summon anything a pack declares. The verb asks the dimension's `EntityRuntime` first
  and falls back to the written classes, which still cover falling blocks, projectiles and everything
  the content declares no type for. `SpawnOptions` gains the rotation, applied before the spawn event
  runs, so the body a client is first sent faces where the command said.
  
  `entities.spawn` on the live world adapter is also wired: it was left throwing while
  `serverSource.ts` already called the widened `worldEntityAccess` signature. It builds a written
  class where one adds behavior and a `GenericEntity` carrying the identifier otherwise, and its drop
  member keeps the meta, damage, custom name, lore, enchantments and contents the widened `ItemDrop`
  carries.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`3d31eca`](https://github.com/JSPrismarine/JSPrismarine/commit/3d31ecaa4cb2b13394deacdfc3b95ae4eb0de51e) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the clientbound debug renderer packet codec into the protocol package.

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

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`eee1692`](https://github.com/JSPrismarine/JSPrismarine/commit/eee1692f9692eb172a6ba6abbb64e46daa060a9c) Thanks [@filiphsps](https://github.com/filiphsps)! - Move ability, permission, and inventory option packets into protocol.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`2244da2`](https://github.com/JSPrismarine/JSPrismarine/commit/2244da2ab1a8f6b1f46d42a68de40af4e8023e2d) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the server player position packet codec into Protocol.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`2f86764`](https://github.com/JSPrismarine/JSPrismarine/commit/2f86764d56a7e9ae5038854c27dd8fc9b3dfd0de) Thanks [@filiphsps](https://github.com/filiphsps)! - Move LevelChunkPacket into Protocol with versioned fields

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c2326c1`](https://github.com/JSPrismarine/JSPrismarine/commit/c2326c154f912ba1f33b6eeb5db1665fe1d61fe4) Thanks [@filiphsps](https://github.com/filiphsps)! - Delete the entity class hierarchy the data-driven runtime replaced.
  
  Every mob is a component set in `EntityRuntime` now, with a `GenericEntity` for a body, so the 111
  written classes beside it were running nothing. 152 files and 6,740 lines go: the 74 mob classes
  under `hostile/`, `neutral/` and `passive/`, 34 of the 43 under `other/`, `Mob`, `MobStats`,
  `MobEnvironment`, `EntitySize`, `ai/Brains`, `ai/Targeting`, `ai/Speed`, `ai/GoalSelector`,
  `ai/Goal`, `ai/Navigator` and the 11 legacy goals.
  
  Seven classes stay, the ones whose behavior no behavior pack describes: a dropped stack, a lit TNT,
  a falling block, the three thrown things and `Human`. `Entities.spawnableEntities()` and
  `allEntities()` become `Entities.writtenEntities()`, a map of those by identifier, and
  `EntitySerializer.isModeled` and `EntitySerializer.reset` go with the index they read.
  
  Three things that used to come from a table in this repository now come from the pack stack. Every
  hitbox is the type's own `minecraft:collision_box`, with Java's numbers kept for `minecraft:item`
  and `minecraft:falling_block`, which Mojang ships no entity file for. `/summon`'s `EntityType` enum
  is every type the stack declares summonable rather than a list of classes, so a pack that adds a mob
  gets it completed. An entity world generation left in a chunk goes to the runtime first, so a
  village's villager arrives with its components, its brain and its trades instead of as an inert
  body.
  
  Two fixes fall out of it. A blow now shoves a mob again: the body hands the impulse to the entity
  behind it, which the runtime already integrates, where before a sword took a cow's health away and
  left it standing exactly where it was. `Entity.getHeldItem` and `Entity.setHeldItem` move up from
  `Mob`, so what an entity is holding is a question anything can answer rather than a type test.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c11c3d6`](https://github.com/JSPrismarine/JSPrismarine/commit/c11c3d6fa4acff209632b68ae171a086d1b6d2f3) Thanks [@filiphsps](https://github.com/filiphsps)! - Mark `BlockManager.registerBlock` and `ItemManager.registerItem` as `@deprecated`. Blocks and
  items come from the pack stack, so an instance registered through either has no component list,
  no hooks and no row in the flattened property tables; all it can still do is answer for its own
  identifier ahead of the stack's. A plugin that defines content ships a Bedrock behavior pack and
  registers the behavior families its components name.
  
  Both methods keep working in this release. [The migration plan](../docs/plans/data-driven-vanilla.md)
  section 10 has them going through one deprecation release before they are removed, and no
  published release has carried the marker until now.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`73ed482`](https://github.com/JSPrismarine/JSPrismarine/commit/73ed48232bad48173313f422b516bf56b4a329ff) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace `DimensionDefinition` with `DimensionType`, which joins a parsed Java `dimension_type`
  with the Bedrock overlay from `@jsprismarine/mapping`. `id` is now the Java id
  (`minecraft:the_nether`); the integer the client and the LevelDB keys use is `bedrockId`, the
  client's spelling is `bedrockName` (aliased as `name`), `minY` and `height` are the bounds the
  client accepts, `java` is the parsed definition, and `custom` marks a type the client has no
  built-in dimension for. `dimensionTypeOf` builds one, `Dimensions` is built from the vanilla 26.3
  documents with the bounds it had before, and `dimensionByName` accepts both spellings.
  `DimensionDefinition` stays as a deprecated alias for one release. The dimension module is now
  exported from the package.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a825e54`](https://github.com/JSPrismarine/JSPrismarine/commit/a825e5478baccfc586fc3acd3fd5d8d9fc17a02d) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement piglin admire and barter interactions

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`175ccc2`](https://github.com/JSPrismarine/JSPrismarine/commit/175ccc2b4c03e97630bacb09ca9ba864ccc5a5e0) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove Prismarine's local player initialization packet and use Protocol's typed packet class.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2915797`](https://github.com/JSPrismarine/JSPrismarine/commit/291579758b8e81ea62906adf84b45b2e981ed363) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove handwritten projectile entity classes

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`c776757`](https://github.com/JSPrismarine/JSPrismarine/commit/c77675747b1bb4ef14e48c28dda0865bdd232ad2) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the packet stream base into the protocol package.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c867a96`](https://github.com/JSPrismarine/JSPrismarine/commit/c867a968d69cab708ba0ac2061bc22968b4fa4e1) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the item manager; item lookup now reads the loaded content registry.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`38422a0`](https://github.com/JSPrismarine/JSPrismarine/commit/38422a034cfdd5efd8956bbd4552830a103a8a18) Thanks [@filiphsps](https://github.com/filiphsps)! - Move resource pack chunk transfer packets into protocol.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`de3128c`](https://github.com/JSPrismarine/JSPrismarine/commit/de3128cc89765361b2afd2a3533756d50f8754b0) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `/return` and make `execute if function` read it.
  
  `execute if function` tested `runFunction(...) !== 0` against a count of command lines, so any
  function that ran at least one line matched. It now follows Java's 1.20.3 rule: a function matches
  when it returned a non-zero value through `/return`, and one that reaches its last line returns
  nothing and does not match. A function tag matches when any of its members did.
  
  `/return <value>`, `/return fail` and `/return run <command>` are what produce a value for it to
  read, which brings the registered set to 60 commands.
  
  Durations now parse the way Java's `minecraft:time` argument does. `/schedule function foo 5s` is
  100 ticks and `2d` is 48000, where both were parse failures before; the same argument reads
  `/weather`, `/title times`, `/time set` and `/time add`.
  
  A registry argument validates against the content the host loaded rather than against Mojang's
  frozen enum alone. `/summon mypack:dragon` failed at parse for an entity the server can spawn;
  `CommandRegistryOptions.content` now carries the server's own entity, block, item and enchantment
  ids, which are accepted alongside Mojang's list and offered to the client with it.
  
  `/summon villager` reached the pre-1.11 `minecraft:villager` rather than Bedrock's current
  `minecraft:villager_v2`, because Mojang's command enum still lists the old spelling. The
  identifier resolves through `javaEntityTypeToBedrock`, the same seam the brain registry reads.
  
  Breaking: `buildVanillaCommands` takes the loaded registry ids rather than a boolean.
  `DataCommandHost.runFunction` answers a `FunctionOutcome` rather than a number, and the
  interface gains `returnFromFunction`. `ExecutionReport` gains `returnValues`, `CommandOutcome`
  gains an optional `returned`, and `FunctionRuntime.run` answers an outcome rather than a line
  count.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`156c72a`](https://github.com/JSPrismarine/JSPrismarine/commit/156c72a6f308d17524b658ee21f9b0846f9bbd82) Thanks [@filiphsps](https://github.com/filiphsps)! - Drive `@jsprismarine/engine-systems` from the world tick, so redstone, fluid flow and fire spread
  actually run. `WorldSystems` builds the engine over a `WorldAccess` the world supplies and drains
  both scheduled tick lists into it, where every tick used to be routed into the legacy
  `BlockPhysics`; `World.setLoadedBlockState` is the synchronous write the engine goes through, and
  every block change runs Java's `setBlockAndUpdate` updates, which is what starts a circuit when a
  lever goes down and what gives a placed bucket of water its first fluid tick. Random tick positions
  reach the engine's driver instead of being drawn and dropped, with the per-block handlers arriving
  through the new `WorldData.randomTickHandlers`.
  
  Breaking: `WorldSystems` takes one options object, `{ view, world, randomTickHandlers }`, rather
  than a view and a handler pair, and `WorldSystemsHandlers` is gone.
  
  The liquid half of `BlockPhysics` is gone with it, along with the `liquid_depth` bit helpers and
  the spread rate and reach fields in `BlockRules` that only it read. The engine carries Java's own
  `FlowingFluid`, and two spread models writing the same state on two clocks would have fought. The
  support and gravity rules are untouched.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d29e1d4`](https://github.com/JSPrismarine/JSPrismarine/commit/d29e1d4ef750af20698531f32a3e36040312d3a9) Thanks [@filiphsps](https://github.com/filiphsps)! - Emit named particles declared by `minecraft:interact.particle_on_start`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c1f0bc3`](https://github.com/JSPrismarine/JSPrismarine/commit/c1f0bc3fe5abfffa6c43d9cc44a407e4e25fd10a) Thanks [@filiphsps](https://github.com/filiphsps)! - Honor `minecraft:interact.swing` and relay successful interaction animations to clients tracking the player.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`5a0d8e1`](https://github.com/JSPrismarine/JSPrismarine/commit/5a0d8e1cc55a81414223aa2089fce8301776f8f7) Thanks [@filiphsps](https://github.com/filiphsps)! - Move UpdateAdventureSettingsPacket into protocol.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`56487c6`](https://github.com/JSPrismarine/JSPrismarine/commit/56487c6347873aedbc3c828b2e532ea13a10fb00) Thanks [@filiphsps](https://github.com/filiphsps)! - Move command packet codecs into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`7af8680`](https://github.com/JSPrismarine/JSPrismarine/commit/7af86809e55ed550b22a4d04118e1532d729262d) Thanks [@filiphsps](https://github.com/filiphsps)! - Move cache and session state packet codecs into protocol.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`809b151`](https://github.com/JSPrismarine/JSPrismarine/commit/809b15120f5dac495a25bb6974bc5e1c9f4912d3) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep a tree whole where it crosses a chunk border.
  
  The generator decorated a three by three window and kept only the middle chunk, so whatever a
  neighbor's feature pass wrote across the border was thrown away. A chunk generated on its own never
  received it. Measured at seed 987654321, chunk -96,48: an oak whose trunk stands in the last column
  of -97,48 had air where its crown should be, from y 126 to y 130.
  
  The decoration pass is the `features` status of the ladder now, and the promotion to a Bedrock chunk
  is `full`. A chunk's blocks are its terrain tile, then its own feature writes, then the eight
  inbound patches in `FEATURE_PATCH_ORDER`, which is `(dx, dz)` ascending with `dx` fastest. The
  terrain tile is written once and read by up to nine feature passes; nothing writes into it again,
  and nothing is replayed into a chunk already handed out.
  
  That is what makes a chunk a function of the seed and its position. The caches it replaces made it a
  function of what else the generator had produced: cross-border output was replayed into terrain
  built later and into chunks already returned, so the same chunk differed depending on what was asked
  for around it and changed under a player who already had it.
  
  The border moves once, for every world. Measured over the generation corpus, between 1.4% and 1.9%
  of a decorated chunk's positions gain a block, concentrated at the chunk edge and thinning inward:
  ore and stone blobs, gravel and dirt patches, amethyst geodes and tree crowns that start in the
  chunk next door. Terrain, biomes, structure placement and the structure beards are untouched.
  
  Two consequences for anyone running the server. Asking for one chunk on its own costs more, because
  it cannot be finished until its eight neighbors have decorated: twenty-five terrain tiles and nine
  feature passes where the old shape drove nine and one. Filling a region pays once per tile instead.
  And `@jsprismarine/chunkgen`'s holder, holder map and scheduler now take the chunk type as a
  parameter, defaulting to `ProtoChunk`, so a server can climb the ladder with a chunk buffer of its
  own.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`0627e9b`](https://github.com/JSPrismarine/JSPrismarine/commit/0627e9be0fbf1813ed28999742165c4ed9ca3a4d) Thanks [@filiphsps](https://github.com/filiphsps)! - Move NetworkChunkPublisherUpdatePacket into protocol.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`d1a241c`](https://github.com/JSPrismarine/JSPrismarine/commit/d1a241c40329c0cb5a1c7ad49c2896d89bdae2a1) Thanks [@filiphsps](https://github.com/filiphsps)! - Move actor and world state packet codecs into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`b6b916f`](https://github.com/JSPrismarine/JSPrismarine/commit/b6b916fa7328a12b7467f9112791d3281cd43cfb) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Protocol's TextPacket for chat messages

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`24bf788`](https://github.com/JSPrismarine/JSPrismarine/commit/24bf78812da37451cb83df12d058b76141657596) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the crafting and creative content packet implementations to Protocol, with server-model conversions kept in Prismarine adapters.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`96f6a35`](https://github.com/JSPrismarine/JSPrismarine/commit/96f6a357713f5566949f8f9e597fac6dda9119e1) Thanks [@filiphsps](https://github.com/filiphsps)! - Prime TNT only through its data-driven entity runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`141c69d`](https://github.com/JSPrismarine/JSPrismarine/commit/141c69d5d1cb775468955b60aa1a72b5580fc257) Thanks [@filiphsps](https://github.com/filiphsps)! - Connect data-driven entity tags to filters and persist them on saved actors.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c132c90`](https://github.com/JSPrismarine/JSPrismarine/commit/c132c9073992d5a0e8a7f9203298ec8711b0d585) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven area attacks

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`8687de7`](https://github.com/JSPrismarine/JSPrismarine/commit/8687de7e31ac990b5b0b79c0b9059db2c127d106) Thanks [@filiphsps](https://github.com/filiphsps)! - Move container open, close, and property packets into protocol.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0be2f2b`](https://github.com/JSPrismarine/JSPrismarine/commit/0be2f2bb0188cd37c0dfed8ed131adc9200e1949) Thanks [@filiphsps](https://github.com/filiphsps)! - Put the game rules on the content world seam. `ContentLevelFacts` carried the clock, the bounds
  and the weather and no rules at all, so nothing reached over that seam could read one. A creeper
  on the data-driven entity path griefed with `mobGriefing` off, because `EntityRuntime.explode`
  had no rule to pass to `detonate`'s `breaksBlocks`.
  
  `ContentLevelFacts.gameRule` answers one rule by any spelling the `@jsprismarine/commands`
  registry knows: the 1.21.11 id `minecraft:mob_griefing`, the pre-1.21.11 `mobGriefing`, or
  Bedrock's `mobgriefing`. The live world resolves the asked-for name against that registry and
  looks the result up in its own `GameRuleManager`, so the content path and the Bedrock client do
  not have to agree on a spelling. A rule the world never registered reads as absent rather than
  as off.
  
  `src/content/world/gameRules.ts` names the rules the content path reads and resolves each
  through the registry, so a rule renamed again fails at startup instead of reading nothing. The
  data-driven entity runtime now reads four of them: `mobGriefing` decides whether a blast carves
  a hole and whether a mob may break a block at all, `doTileDrops` whether either leaves items
  behind, `doMobLoot` whether a dead mob rolls its table, and `doMobSpawning` whether the natural
  spawn cycle runs. Damage and knockback are unaffected by `mobGriefing`, and the despawn pass
  still runs with `doMobSpawning` off, both as in Java.
  
  `GameRuleManager.findGameRule` is the same lookup as `getGameRule` without the log line a miss
  writes, for a caller trying several spellings of one rule.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`490f897`](https://github.com/JSPrismarine/JSPrismarine/commit/490f897e62782fff59442e10ee40d0200c3ec07e) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement the three `FeatureWorld` hooks the data-driven generator was missing, so the features
  that need them produce something. `GenerationRegion` answered only `isColdEnoughToSnow`, which
  left a generated chest empty, a dungeon spawner inert, an end gateway leading nowhere, the end
  spike without its crystal, and a fossil unburied.
  
  `setBlockEntity` records what a feature attached and writes it as the Bedrock block entity NBT
  the LevelDB provider already persists, with a chest carrying its loot table path and a seed mixed
  from the world seed and the position. `spawnEntity` records the end crystal as a chunk entity
  spawn, which the world creates when the chunk is first loaded. `placeTemplate` goes through
  `@jsprismarine/structures`: the template is read, rotated, mirrored and run through the
  `worldgen/processor_list` the feature named, and lands as the Bedrock states that package
  resolves. The templates are read from the pinned Java server jar on first use, or from a
  directory named by `JSP_JAVA_STRUCTURES`.
  
  Breaking: `GenerationRegion.forEachCenterBlock` now hands its visitor a `RegionBlock`, which
  carries the Java state as `java` and, for a block out of a template, the resolved Bedrock state as
  `bedrock`. `JavaWorldgenRegistries` gained `processorLists`.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`4e4b170`](https://github.com/JSPrismarine/JSPrismarine/commit/4e4b1709bfd56e9397ba1041f18ac43233c30890) Thanks [@filiphsps](https://github.com/filiphsps)! - Build a world's generator from its level stem through `GeneratorFactories`, which replaces
  `GeneratorManager`. A factory is `{ kind, build(context) }` keyed by the stem's generator kind
  id, and the context carries the stem, the `DimensionType`, the seed, the content, a lazy loader
  for Java's worldgen registries and a logger. The built-in kinds are `minecraft:noise` over
  `DataDrivenGenerator`, `minecraft:flat`, `jsprismarine:void` and `minecraft:debug`, which is
  registered so a preset naming it parses and refuses to build.
  
  `DataDrivenGenerator` takes a `biomeSource` definition in place of the `biomeParameters` preset
  id, so the End's `the_end` source and a `fixed` or `checkerboard` source can be generated.
  `FlatGenerator` reads `FlatGeneratorSettings`, honors the biome and stacks its layers from the
  dimension's floor. `WorldManager.getGeneratorManager` is deprecated in favor of
  `getGeneratorFactories`, and the `Flat` and `Overworld` classes stay for one release as
  deprecated aliases that build through the factories.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c70e7c9`](https://github.com/JSPrismarine/JSPrismarine/commit/c70e7c9bade31dae084689139a3dd1faced0c2dc) Thanks [@filiphsps](https://github.com/filiphsps)! - Answer all 43 members of `GoalWorld`, which takes the vanilla goal inventory from 118 of 170 goals
  able to run to all 170.
  
  `goalWorldOf` implemented 22 of the seam's 43 members. A goal that reaches for a member the server
  leaves out gets undefined and stops, so 52 of the 170 goals could never run against this host,
  including `hurt_by_target` (42 of the 129 vanilla entities carry it), `panic` (37), `breed` (26),
  `mount_pathing` (26) and `ranged_attack` (14). Riding, taming, breeding, item carrying and trade
  interaction were all asleep for the same reason.
  
  The 21 members added are `damagers`, `lastPusher`, `owner`, `vehicle`, `riders`, `poi`, `shoot`,
  `push`, `mount`, `dismount`, `pickUp`, `giveItem`, `inventory`, `breakBlock`, `openTrade`,
  `tradingPlayer`, `setSitting`, `setSleeping`, `explode`, `canBreedWith` and `breedWith`.
  `goalWorldOf` returns `Required<GoalWorld>`, so a member added to the seam stops the build until
  the runtime can answer it rather than quietly putting goals back to sleep.
  
  **Points of interest.** `src/entity/data/poi.ts` is a new index with two sources. Java's `PoiTypes`
  is a block-to-kind table, so a bed is a home, a bell is a village's meeting point and each of the
  thirteen job-site blocks is a work site; `indoors` and `outdoors` are answered by looking for a
  roof. The warden's `suspicious_location` and the dolphin's `buried_treasure` have no marker in the
  world at all, so they come from `EntityRuntime.recordPointOfInterest` and are empty until the
  vibration listener and the generator fill them. Every search widens a ring at a time and stops at
  the first hit.
  
  **Relationships.** `src/entity/data/riding.ts` keeps both directions of who rides whom in one
  index, so the rider's `vehicle` and the vehicle's `riders` cannot disagree, and
  `minecraft:rideable.seat_count` decides whether there is room. `src/entity/data/breeding.ts` reads
  `minecraft:breedable` for the mate types, the baby type, the taming requirement and the cooldown;
  being in love is a timer on the body, which `EntityRuntime.setInLove` sets and a type with
  `love_filters` answers with a filter instead.
  
  **Combat and physics.** `src/entity/data/damageLog.ts` totals the damage per source in the order
  the sources arrived, which answers `hurt_by_target`'s most recent hit and the wither's largest
  total from the same list. `MobBody` carries a velocity that `push` adds to, and the runtime spends
  it with Java's gravity and drag until the entity lands.
  
  **Filters.** The runtime now supplies the half of `FilterEntityView` that only it knows:
  `is_sitting`, `is_sleeping`, `is_riding`, `on_ground`, `has_target`, the vehicle, owner and target
  views, and the distance measures, plus the world's clock, weather and difficulty. A sit goal that
  sets the flag and a goal that refuses to run while the entity is sitting now agree.
  
  Breaking: `EntityScene` gained 14 members, `goalWorldOf` returns `Required<GoalWorld>`,
  `EntityRuntime.items` takes a center and a radius, and `EntityHostFacts` gained the optional
  `items` and `takeItem` an item subsystem supplies.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`ccfb982`](https://github.com/JSPrismarine/JSPrismarine/commit/ccfb982275c8bcfa98de89f61048daeff811819c) Thanks [@filiphsps](https://github.com/filiphsps)! - Move matchmaking and audio content packets into protocol.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`1150058`](https://github.com/JSPrismarine/JSPrismarine/commit/1150058a0dad77ee54871f7c4ba234ef3d8c79b8) Thanks [@filiphsps](https://github.com/filiphsps)! - Move MovePlayerPacket and PositionMode into Protocol

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b049f98`](https://github.com/JSPrismarine/JSPrismarine/commit/b049f987c93b6547d5647d3a37c22afe62f1fa85) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove deprecated numeric block accessors.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`fb2eeaa`](https://github.com/JSPrismarine/JSPrismarine/commit/fb2eeaa6c76b546d45742c3cca1800c512a04e63) Thanks [@filiphsps](https://github.com/filiphsps)! - Move scoreboard packet codecs into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`01d95b3`](https://github.com/JSPrismarine/JSPrismarine/commit/01d95b3a07c6924cf90386536e6d4a69deaa407c) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement the eight packets protocol 2225 added.
  
  Their ids have been in the 2225 table since the delta codec landed, as protocol surface a codec
  knew about but could not build, so a 1.26.60 session decoded each to `null`. All eight now have
  a declarative layout and a packet class: the two matchmaking packets, the two stonecutter ones,
  `SetPassengerOfBlock`, `ServerboundCursorItemDrag`, and the two audio content packets.
  
  Every layout is read off Mojang's v1.26.60 release schemas, the `metadata.zip` this repository
  already pins, using the ordinals and serialization options those schemas declare. That decides
  two things a careless reading gets wrong: an integer marked `Compression` is a ZigZag varint
  rather than a fixed-width little-endian value, which is what `Recipe Index` is, and a property
  the schema leaves out of `required` travels behind a presence byte. No capture exercises these
  packets, because a vanilla login sends none of them, so each definition carries its ordinals and
  a round-trip test instead; `docs/research/protocol-2225-added-packets.md` records the provenance.
  
  Registering a packet now resolves its id against the newest registered codec rather than 2193,
  since a packet a later protocol added has no id at the older one.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`91bdbee`](https://github.com/JSPrismarine/JSPrismarine/commit/91bdbee54178fda1cfa835e4eda6a51f8ffa0c59) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Inventory Transaction to Protocol and resolve server item stacks at the Prismarine boundary.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`86526cc`](https://github.com/JSPrismarine/JSPrismarine/commit/86526cc6d8e3422b6154963f75715fc3f7fba376) Thanks [@filiphsps](https://github.com/filiphsps)! - Move map, world-event, sound, position-tracking, and sub-chunk request packets into protocol.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9725c8b`](https://github.com/JSPrismarine/JSPrismarine/commit/9725c8bccf4efa5833d1a58d15b1c71687eaef4a) Thanks [@filiphsps](https://github.com/filiphsps)! - Answer inventory requests the way a Bedrock Dedicated Server 1.26.52 does. Each stack now keeps its
  own stack network id: a stack moved whole keeps it, a part split off gets a new one, and a stack
  merged onto another keeps the destination's. `InventoryContent` and `InventorySlot` carry the ids,
  and each player's ids come from their own counter, `HumanInventory.assignStackNetworkId`. A stack
  put on the ground loses its id, so it cannot name another player's stack once picked up. Answers
  name each slot in the container and slot number the client used, in the order the request touched
  them, and leave out the craft's output slot.
  
  A craft spends the grid through the client's `CRAFTING_CONSUME_INPUT` steps, and a request whose
  steps spend less than the recipe costs is refused. The result waits in the created output, the only
  source a step can take it from, and a step takes no more than the craft made: one craft used to
  place as many as the step asked for. `CRAFTING_RECIPE_AUTO` crafts as many times as it repeats. A
  stack can move into and out of the offhand, a refused request puts back armor and the offhand, a
  drop takes only as many as the step names, and a creative pick or craft dropped onto a different
  item is refused instead of replacing it.
  
  Breaking: `PlayerSession.sendCraftingSlot` is gone. BDS sends no crafting-slot packets after a
  craft, and the answer to the request now covers the grid.
  
  A recorded BDS session of 69 requests is replayed as a test, and every answer matches, stack ids
  included.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`abd3869`](https://github.com/JSPrismarine/JSPrismarine/commit/abd38698ac421ed89eda5afc3e6aac1ab03981ae) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove Engine-owned redstone and piston handlers, and route block behavior through resolved content families.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`3204465`](https://github.com/JSPrismarine/JSPrismarine/commit/320446537230cbe4830ff9ca0bffa05133cf0592) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the lab table packet codec and its wire enums into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`88db8cd`](https://github.com/JSPrismarine/JSPrismarine/commit/88db8cdc94238bbdec632ca8451d8f36bf4b2416) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the lectern update packet codec into the protocol package.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`6fdfaa8`](https://github.com/JSPrismarine/JSPrismarine/commit/6fdfaa8f2eb508b9c5841d103722af620fdb2ae6) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the legacy falling-block actor class; restore saved falling blocks through the data-driven runtime.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`9611f5d`](https://github.com/JSPrismarine/JSPrismarine/commit/9611f5d1588935528a0fa5dbd95b8ab08498739a) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the level event packet codec into the protocol package.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`61186d5`](https://github.com/JSPrismarine/JSPrismarine/commit/61186d515896f3d07bf0e58c99e549986a1449ea) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix six problems in the level lifecycle around dimensions:
  
  - A player whose record names a lazy dimension comes back there: `lastPlayerRecord` takes the player's `Level` in place of the world list, a breaking change for a caller that passed the list, and builds the dimension's world when its stem is lazy, and warns when the level has no stem for the record's dimension instead of silently keeping the player in the default world at the other dimension's coordinates.
  - `resolveStems` and `Level` refuse two stems that bind one dimension type, naming both, since both worlds would take one Bedrock id and write over each other's chunks.
  - `Level.update` ticks its worlds one after another in stem order, and a world claims each entity's update per tick through `Entity.claimUpdate`, so an entity a portal moves mid-tick is updated once.
  - A lazy dimension built on its first visit no longer searches for a spawn or generates the preload radius inside the server tick; `WorldData.startRegion` says whether enabling prepares the start region, and the level defers it for a lazy stem.
  - `Level.world` drops a world whose enabling failed instead of caching the rejection, and `Level.worlds()` lists only worlds whose enabling has finished, which is what `WorldManager.getWorldByDimension` promises. `Level.loadedWorld` still answers a world mid-enable.
  - The clock is read back from `level.dat`'s `Time` through the new `Provider.readLevelData`, so a restart continues the day instead of starting at tick zero.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`458bad7`](https://github.com/JSPrismarine/JSPrismarine/commit/458bad73dd30c3ff78598e7688a77fabeb440540) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `Level`, the owner of one `worlds.<name>` entry: its provider, seed, clock, game rules, weather,
  spawn, player records and one `World` per level stem, built when first asked for or at `enable` for
  a stem marked `eager`. `World` stays the per-dimension runtime and forwards `getTicks`,
  `getGameRuleManager`, `getSeed`, `getProvider` and the weather to its level; `getLevel()` and
  `getStem()` reach the new objects. The `World` constructor options gain `level` and `stem` and lose
  `provider` and `seed`, which is a breaking change for code that built a `World` by hand.
  `WorldManager` constructs one `Level` per loaded world and exposes `getLevels()` and
  `getLevel(name)`; the server ticks levels, each of which advances its clock once and updates every
  loaded world. The level writes the resolved stems as `worldGenSettings` and passes them with the
  Nether scale into `level.dat` on save. A generator may report `seaLevel`, which the noise generator
  reads from its stem's `noise_settings` and the flat generator fixes at Java's -63; `World.getSeaLevel`
  and the content adapter read it from there, replacing the `SEA_LEVELS` table.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a1c295a`](https://github.com/JSPrismarine/JSPrismarine/commit/a1c295a3fc29e44a4c89a9f5eea9ab1bda99500c) Thanks [@filiphsps](https://github.com/filiphsps)! - Run live entities through the data-driven runtime. `EntityRuntime` was built only by its own
  tests, so the whole `src/entity/data/` layer, and with it `@jsprismarine/entities`,
  `entity-goals`, `entity-brains`, `spawning` and `trading`, never ran on a server. A server with
  `content-packs` on now opens one runtime per dimension as that dimension's content adapter is
  assembled, supplies its host from the live world, and ticks it from `World.update`.
  
  What this turns on, with the flag on: the 60 Bedrock spawn rules and the six-step spawn cycle in
  `@jsprismarine/spawning`, over Bedrock's caps and cadences rather than Java's; the population
  despawn pass; the 170 goals and the 20 brain mobs over the real world; `minecraft:breedable`;
  villager trade tables through `Merchant`; and Java's loot tables on death. `MobSpawner` and the
  written entity classes still run with the flag off, which is the default.
  
  Each data entity carries a `GenericEntity` body so clients see it, and the two stay in step:
  position and health go out to the body, and damage the legacy pipeline dealt to the body comes
  back carrying whoever dealt it. `GenericEntity` rather than one of the written classes, so
  nothing runs the legacy goals against the same body.
  
  `ServerWorldSourceOptions` gained `entityRuntimes`, which is what fills the adapter's `spawning`
  and `ai` groups; without it both stay absent and every projected member still names the subsystem
  that owes it. `Server.getEntityRuntime` and `World.dataEntities` read one back.
  
  `GoalWorld.mobs` now includes players, carrying the `player` and `mob` families a filter can ask
  about. 49 vanilla entities carry `nearest_attackable_target` with an `is_family: player` entry and
  that goal searches `mobs`, so without this no monster ever found anybody.
  
  Two measured costs on the way: `Navigator.randomTarget` asked the path finder about ten candidate
  destinations and a candidate inside a block fails only after the search spends its whole 512-node
  budget, and the path finder's view of the blocks was rebuilt per query and resolved every read
  through the palette. Together these were 623 microseconds per entity per tick; they are now 20.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`8c5e1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/8c5e1ba96ca39d69cab3a221a23bd4d5fe613981) Thanks [@filiphsps](https://github.com/filiphsps)! - Make `/locate` find what the generator places. A structure search now counts its radius in rings of placement regions, as Java's `findNearestMapStructure` does, so a village set spaced 34 chunks apart is reached 3400 chunks out and the strongholds' concentric rings are searched whole; it reports Java's locate position, the start chunk's corner plus the set's `locate_offset`, beside the generation point. `#minecraft:village` and the other `tags/worldgen/structure` tags resolve to their members. `/locate biome` walks the climate sampler the way Java's `findClosestBiome3d` does, through the new `World.locateBiome` and `Generator.locateBiome`. `/locate poi` stays refused, since this server keeps no point of interest index.
  
  `StructureSearchRequest.radiusInChunks` is now `radius`, in placement regions, and `StructureSearchResult`'s `x`, `y` and `z` are the locate position, with the generation point under `origin`. `Generator` gains the optional `locateBiome`, `membersOfTag` and `locatableNames`.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`20c3fb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20c3fb154c258e4cb030a40cc76b47ea1e4ddcb5) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the legacy TNT entity class in favor of the data runtime.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`e3a0042`](https://github.com/JSPrismarine/JSPrismarine/commit/e3a0042b06e7493219bd869523775a0f10423440) Thanks [@filiphsps](https://github.com/filiphsps)! - Move inventory content and slot encoding into Protocol

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`934b5d2`](https://github.com/JSPrismarine/JSPrismarine/commit/934b5d22e8c158cde43c80ea9df8d7589e8bcafa) Thanks [@filiphsps](https://github.com/filiphsps)! - Move purchase receipt packet serialization into Protocol and adapt the server handler to its typed payload.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`88c985e`](https://github.com/JSPrismarine/JSPrismarine/commit/88c985edcb1666f9e15c79eb4c3ee2ee1f134e62) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the map item data packet codec and marker types into the protocol package.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`da1793e`](https://github.com/JSPrismarine/JSPrismarine/commit/da1793e286c051351c49dfb1e35b002a6e787bce) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix two gaps the written entity classes were covering, found by connecting real clients to a
  server running the data path alone.
  
  A data-driven mob dropped nothing when it died. `EntityRuntime.kill` read the loot table off the
  resolved type, which only ever sees an entity's base components, and 29 of the 128 vanilla entity
  files declare `minecraft:loot` only inside a component group. The cow carries it in
  `minecraft:cow_adult`, so every cow, pig, sheep and chicken in the world died empty-handed. The
  table is now read off the live instance through `EntityInstance.lootTable()`, which sees the
  groups the entity's spawn event turned on, and falls back to the type.
  
  `minecraft:behavior.mount_pathing` started on nothing more than the entity having a target. The
  adult zombie carries it at priority 2 and `minecraft:behavior.melee_box_attack` at priority 4, and
  both claim the `move` and `look` control flags, so the moment a zombie picked a player it took
  those flags off every goal below it and stood still. Mojang's wording for the goal is "while
  mounted", and it now refuses unless the entity is riding something.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`106f96b`](https://github.com/JSPrismarine/JSPrismarine/commit/106f96b214f7e890d98f6bcd6b6be6a6f709366d) Thanks [@filiphsps](https://github.com/filiphsps)! - Roll mob drops out of Java's loot tables and delete `DropTable`.
  
  Mobs were the last thing on a hand-written table. Fifty entries in `src/entity/LootTables.ts` stated
  what twenty-five species leave behind, and they could state nothing else: no looting bonus, no drop
  a player has to be credited for, no cooked meat off a burning cow, no wool of the sheep's own
  color, and odds remembered rather than read. Several were simply wrong - a piglin dropped a gold
  nugget, which Java has never given one.
  
  `src/entity/mobLoot.ts` replaces them, built the way `src/block/blockLoot.ts` already was: an index
  from every `minecraft:entities/...` table the pack stack registered, through
  `@jsprismarine/mapping`, to the Bedrock identifier it belongs to, so a `minecraft:zombie_pigman`
  finds `minecraft:entities/zombified_piglin`. A death supplies the context those tables read - where
  the mob stood, what it was, how it died and who swung, with the killer's main hand carrying the
  looting level and the damage type's tags read off the stack's own `tags/damage_type/` files.
  
  Both loot callers now pass a `LevelView`, built by the new `lootLevelOf` in
  `src/world/lootLevel.ts`, so the conditions that ask about the world rather than about the thing
  that died can be reached at all. It answers the clock and the dimension and deliberately leaves out
  the members the server cannot answer truthfully yet.
  
  Breaking: `src/block/DropTable.ts` and `src/entity/LootTables.ts` are gone, with `DropTable`,
  `DropChance`, `MOB_LOOT` and `lootOf`. `Random` and `randomOf` moved to `src/utils/Random.ts` and
  are still exported from the package root. `Mob` gains a protected `lootState` hook for the species
  whose table branches on something only that species has.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a0c479e`](https://github.com/JSPrismarine/JSPrismarine/commit/a0c479e0ab28de8ba46bac842ddc90a50d9e679f) Thanks [@filiphsps](https://github.com/filiphsps)! - Give a mob the equipment its table rolls, and show it to the clients watching.
  
  `minecraft:equipment` was parsed and thrown away. Its factory returned `{}`, so no mob ever rolled
  its table: a census of 90 live bodies found none holding an item, and `Entity.setHeldItem` had no
  callers anywhere. A skeleton fired from an empty fist, and the villager's trade offer and the
  enderman's carried block were written to `MobBody.carried` by the goals and read back only by other
  goals, because nothing mirrored them onto the body a client is sent.
  
  Bedrock drives mob gear from a loot table where Java hardcodes it in
  `Mob.populateDefaultEquipmentSlots`, so the component's `table` is the reference for what a mob
  spawns holding. Those tables are the behavior pack's own and Java has no counterpart: its registry
  carries `entities/skeleton` but no `entities/skeleton_gear`, and its only three `equipment/` tables
  are trial chamber ones. The roll therefore reads `definitions.lootTables` through the evaluator in
  `@jsprismarine/loot` rather than through a second evaluator written for it. Which slot a rolled item
  lands in comes from the item's own `minecraft:equippable`, so a table naming `minecraft:iron_helmet`
  dresses the head without a table of identifiers here going stale.
  
  Pools this evaluator cannot gate are left out. `@jsprismarine/loot` implements modern Java, where a
  pool carries one `condition`; Bedrock still writes the older plural `conditions` array and adds a
  pool-level `tiers`. A condition that is not read is a condition that does not gate, and handed
  `zombie_equipment.json` whole the evaluator armed 2000 of 2000 zombies where vanilla arms about one
  in twenty. What survives the pruning is each mob's signature weapon, the part that fires
  unconditionally in vanilla too: measured against a running server, 13 of the 18 vanilla types that
  carry the component get theirs, among them the skeleton's bow, the pillager's crossbow, the
  vindicator's axe, the wither skeleton's stone sword and the piglin's golden one. What is dropped is
  the chance-gated extras and the tiered armor sets, for which absent is both the safe direction and
  the common vanilla outcome. Reading the rest needs a Bedrock loot dialect in `@jsprismarine/loot`.
  
  Equipment reaches a client through one write funnel, the shape `blockentity/blockEntityWrite.ts`
  set. A revision counter answers whether anything was written at all, which on an ordinary tick is
  false for every entity in the world, and a write whose encoded bytes match what the body already
  carries is dropped before `WorldChangeSink.entityEquipmentChanged` hears about it. Over 300 ticks
  with 22 armed mobs in view, a real client received four equipment packets, every one of them for a
  mob that had just spawned and none for a mob it had already been told about; an unguarded per-tick
  write would have sent 13,200, and the same window carried 20,440 movement packets.
  
  `PlayerSession.sendEquipmentFor` is new and serves any entity, where `sendArmorFor` reads a
  `Human`'s armor container and so could not serve a mob. `WorldChangeSink` gains
  `entityEquipmentChanged`, which every implementer must now answer.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d490871`](https://github.com/JSPrismarine/JSPrismarine/commit/d49087199730fb9eac7d8ee1976ad36df8475394) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven inside block notifications.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`ab2abdd`](https://github.com/JSPrismarine/JSPrismarine/commit/ab2abddd4567a51630e851566dc55a226d0cbccd) Thanks [@filiphsps](https://github.com/filiphsps)! - Move gameplay status packet codecs into protocol.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`b786016`](https://github.com/JSPrismarine/JSPrismarine/commit/b78601670a934710ae604a88a33e47aaaff408ab) Thanks [@filiphsps](https://github.com/filiphsps)! - Move dropped-item and player-spawn packet codecs into Protocol and pass their typed payload data from the server.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`7a20ad8`](https://github.com/JSPrismarine/JSPrismarine/commit/7a20ad80c99ab96a461e1a37c363cf1d64904d8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Move AvailableCommands packet encoding and its command wire structures into Protocol.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7b66056`](https://github.com/JSPrismarine/JSPrismarine/commit/7b6605637a65f2bb2a48fb0b31085ac56c7cfe37) Thanks [@filiphsps](https://github.com/filiphsps)! - Move dropped items the way a Bedrock Dedicated Server 1.26.52 does. A block's drop appears at a
  random spot in the middle of the block and leaves with a push of up to 0.1 a tick sideways and 0.2
  upward, and the client is told that speed when the item appears. Each tick an item gains BDS's
  gravity, moves, then slows by BDS's air and ground drag, so it slides and stops against a wall. Its
  position is 0.125 above where it lies, as BDS reports it. Stacks merge within half a block, as on
  BDS, instead of a block and a half. Drops from explosions, from falling blocks with nowhere to land
  and from block and entity behaviors pop out of their block the same way.
  
  `World.dropFromBlock` is new and puts a block's drops on the ground that way. The item entity takes
  a `motion` option and has `getMotion`. Breaking: `DestroyWorld` asks for `dropFromBlock` instead of
  `dropContents`.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`fec76ec`](https://github.com/JSPrismarine/JSPrismarine/commit/fec76ec7039ebf9543a62cc4167732f16754927c) Thanks [@filiphsps](https://github.com/filiphsps)! - Move entity equipment packet codecs into the protocol package and resolve item descriptors with the receiving connection's protocol context.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`6b0d00b`](https://github.com/JSPrismarine/JSPrismarine/commit/6b0d00bd2876ba30c45e45aa8e1d31b535050f27) Thanks [@filiphsps](https://github.com/filiphsps)! - Move sound packets into protocol.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`57e3422`](https://github.com/JSPrismarine/JSPrismarine/commit/57e34226bd0f570548282994e088db7213f7fdc8) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the network settings handshake packets and compression threshold values into Protocol, and send typed payloads from the server handler.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`1427d68`](https://github.com/JSPrismarine/JSPrismarine/commit/1427d68b60d21a54c1a077792f71be0eccdac36e) Thanks [@filiphsps](https://github.com/filiphsps)! - Move actor, player, and emote packet codecs into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`b46c7f5`](https://github.com/JSPrismarine/JSPrismarine/commit/b46c7f5886ad6ce3aa0468630995743af6dc4cfd) Thanks [@filiphsps](https://github.com/filiphsps)! - Move 2225 stonecutter and cursor drag packets into protocol.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`f3f9fc3`](https://github.com/JSPrismarine/JSPrismarine/commit/f3f9fc3e9918a58054715f1923ad7e88b1804d91) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the serverbound pack setting change packet into the protocol package.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f4ee17f`](https://github.com/JSPrismarine/JSPrismarine/commit/f4ee17f5238ab7e6b48571c4274bbfd3e8738ccc) Thanks [@filiphsps](https://github.com/filiphsps)! - Give each player a spawn point of their own. This server modeled none: `getRespawnPoint` answered
  with the world spawn for everybody, a bed set nothing, and `/spawnpoint` was one of the nine
  commands the registry left out because there was nothing behind it.
  
  `world/RespawnPoint.ts` holds the rules, which are Java's. A point `/spawnpoint` set is used
  whatever is standing there, which is what Java calls a forced spawn. A point a bed or a respawn
  anchor set is only used while that block is still there, and the player stands in the first of the
  eight neighboring columns with two free blocks; a bed that is gone or walled in sends them to the
  world spawn with `tile.bed.notValid`, and the stored point is cleared so they are told once.
  
  `/spawnpoint` is out of `UNWIRED_COMMANDS` and wired to `WorldCommandHost.setSpawnPoint`, which
  moves the named players' points and sends each of them a `SetSpawnPosition` of type
  `PlayerRespawn`. That leaves eight commands unwired. `/setworldspawn` already worked and is
  unchanged. Clicking a bed or a respawn anchor also moves the point, through `useItemOnBlock`,
  because a block behavior has no player to move the spawn of and no client to tell.
  
  The point rides on `WorldPlayerData.spawn` and is written under Bedrock's own `SpawnX`, `SpawnY`
  and `SpawnZ`, with the dimension and the forced flag beside them under this project's own tag
  because Bedrock has no schema for either.
  
  A login also lands in the world the player logged out of. Each world keeps its own player records
  and the login built the player in the default world, so a player who left from the nether came
  back in the overworld holding whatever that world's stale record carried.
  `WorldPlayerData.savedAt` is the instant a record was written, and `Player.enable` reads every
  loaded world and takes the newest.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`fde1a75`](https://github.com/JSPrismarine/JSPrismarine/commit/fde1a7569e18c5dba4a434008a5266c5f30a3f15) Thanks [@filiphsps](https://github.com/filiphsps)! - Route each connection's packets through a per-connection pipeline with phase-keyed handlers.
  Every `ClientConnection` carries a `SessionPhase` (`handshake`, `login`, `resourcePacks`, `play`)
  advanced by the handlers that complete each step, and every packet handler declares the phases it
  accepts; the dispatcher drops a packet that arrives outside them. Inbound frames run through a
  typed stage chain (batch split, decode, log filter, phase gate, dispatch). New connections start
  on a layout-stable `HandshakeCodec` that speaks only the pre-negotiation packets until
  `RequestNetworkSettings` assigns the negotiated codec.
  
  Breaking for handler authors: `PreLoginPacketHandler` and its `preLogin` marker are gone -
  implement `ConnectionPacketHandler` for handshake- or login-phase packets - and both handler
  interfaces now require a `phases` declaration.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`69e9e52`](https://github.com/JSPrismarine/JSPrismarine/commit/69e9e52e9a03abd76222503930662f6991975e8f) Thanks [@filiphsps](https://github.com/filiphsps)! - A chunk generation task carries its dimension as a `PipelineDimension`, the id, Bedrock id, floor
  and height, instead of the whole `DimensionType` with its Java definition and attributes map.
  `PipelineKey.dimension` is that record, `pipelineDimensionOf` builds one, and
  `DataDrivenGenerator.forStem` takes a `StemKey` whose dimension is still the full type, so the
  chunks it hands back keep the type their stem was built with. Code that typed a key passed to
  `forStem` as `PipelineKey` has to type it as `StemKey`. The generated chunks do not change.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ed66b3a`](https://github.com/JSPrismarine/JSPrismarine/commit/ed66b3ad6a1df696b2664b566d9b7ce00c8e591b) Thanks [@filiphsps](https://github.com/filiphsps)! - Place blocks the way a Bedrock Dedicated Server 1.26.52 does. A placed block now replaces what
  Java's `#minecraft:replaceable` tag lists, such as leaf litter, short grass and a snow layer. It used
  to go on top of that block while the client drew it in that block's place. A survival or adventure
  player's stack loses the placed block and keeps its stack network id, and the client is sent its
  inventory after each placement. A refused placement, onto a taken face or above the world, sends
  back the blocks and the inventory as they are, so no predicted block stays on screen. `placed_block`
  advancements now fire for every placement.
  
  Breaking: `World.useItemOn` is gone. It ran after the content path declined a click, and it wrote
  the block without checking what stood there, so a placement the content path refused overwrote the
  block anyway. Every click on a block now goes through `useItemOnBlock`. `World.resendBlock` is new:
  it sends the players who can see a block what is there, without changing it.

- [#2622](https://github.com/JSPrismarine/JSPrismarine/pull/2622) [`707964d`](https://github.com/JSPrismarine/JSPrismarine/commit/707964d1a85072dbd157d74a63dd2471aafa8b8f) Thanks [@filiphsps](https://github.com/filiphsps)! - Turn `Console` into a plain line console: it reads one command per stdin line, writes log records as stdout lines, and no longer puts the terminal in raw mode or redraws a prompt. `writeAbovePrompt` and the `PromptWriter` type are removed from `@jsprismarine/prismarine/Console`; the interactive terminal UI now lives in `@jsprismarine/console`. Adds a server-owned console sender and `RemoteConsole`, which runs commands and streams logs and status to a host process over IPC.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`a7192d2`](https://github.com/JSPrismarine/JSPrismarine/commit/a7192d24a34fc313bb255d8ff083a81515e567fb) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the player enchant options packet codec into the protocol package.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`345ee9e`](https://github.com/JSPrismarine/JSPrismarine/commit/345ee9ea618d7d7520c762f0fc7d6301f976ad7c) Thanks [@filiphsps](https://github.com/filiphsps)! - Persist what a player is carrying. `WorldPlayerData` had no inventory at all, so a logout threw
  away every stack a player held, along with its durability, its name and the enchantments that
  had just been made to work. It now carries the 36 main slots, the hand slot, the four armor
  slots, the off hand and a new 27-slot ender chest, plus health, food, saturation and experience.
  
  The LevelDB provider writes the containers as Bedrock's own `Inventory`, `Armor`, `Offhand` and
  `EnderChestInventory` lists of item compounds, with `SelectedInventorySlot` and an `Attributes`
  list beside them, so the game and any vanilla tool read the record. Each stack carries its count,
  its aux value, its durability as `tag.Damage`, its name and lore under `tag.display`, and its
  enchantments twice: Bedrock's `ench` numbers for the 37 a client knows, and the Java ids under
  `tag.jsprismarine:enchantments` so Sweeping Edge and a datapack's own survive the trip. The
  advancement progress and the enchantment seed moved into that record too; the LevelDB codec used
  to drop both and only the JSON fallback kept them.
  
  `Item` gained `minecraft:custom_name` and `minecraft:lore` to carry across the trip, read through
  `getCustomName` and `getLore` and written through a copying `withDisplay`. `bedrockIds` gained
  `javaEnchantmentId`, the inverse of `bedrockEnchantType`, which is what reading a stored `ench`
  list needs.
  
  `Player.disable` saved nothing for a player with no XUID, which is every player on a server with
  online mode off. It now saves them under their name, which is the key `World.getPlayerData`
  already read them back by.
  
  Two things a player keeps in vanilla and still does not keep here: a per-player spawn point, which
  this server does not model at all (`/spawnpoint` reports it unsupported and `getRespawnPoint`
  always answers with the world spawn), and which world they logged out in, since a login always
  places them in the default world.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`3f5537f`](https://github.com/JSPrismarine/JSPrismarine/commit/3f5537fb7ff52b79b5a5211c96c1e38545e32f98) Thanks [@filiphsps](https://github.com/filiphsps)! - Move player location and motion prediction packet codecs into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`c889ff9`](https://github.com/JSPrismarine/JSPrismarine/commit/c889ff93e1ab889d16fe0b6ddf401693e1ef2837) Thanks [@filiphsps](https://github.com/filiphsps)! - Move registry packet codecs into protocol and read captured actor, biome, and jigsaw data from ProtocolContext.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3a56ac7`](https://github.com/JSPrismarine/JSPrismarine/commit/3a56ac79efe2016bef29ef94a2d1cb876ddec538) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply entity inventory interactions, equipment projection, filters, and persistence in the live runtime

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cced579`](https://github.com/JSPrismarine/JSPrismarine/commit/cced579952cad013a20a2830e13ef83114fe0975) Thanks [@filiphsps](https://github.com/filiphsps)! - Answer block physics and pathfinding from the published tables instead of hand-written name sets.
  `BlockShapes` reads `@jsprismarine/blocks`'s per-state collision column, so all 22079 palette states
  have a real height where eighty names used to and everything else was a full cube: a candle is no
  longer a wall, a cauldron has a floor to stand in, and `double_cut_copper_slab` stopped being half a
  block because its name ends in `_slab`. `BlockRules` reads the same table's liquid reaction, which
  grows the blocks that need support from 30 names to 151 and the blocks a liquid washes away from 18
  to 197, and takes gravity from `@jsprismarine/block-behaviors`, which adds the dragon egg and the
  brushable blocks. `Environment` takes the climbing blocks from the block families, which is eleven
  rather than the three that were listed, and catches a cobweb at last - the set named
  `minecraft:cobweb`, which is not a palette identifier, so every fall into a web used to hurt.
  
  Breaking: `Environment.BREAKS_A_FALL` and `Environment.WATER_BLOCKS` are now the functions
  `breaksAFall` and `isUnderwater`, `BlockShapes.FENCE_HEIGHT` is gone in favor of `BlockView`'s
  `JUMP_REACH`, and `BlockRules` no longer exports `NEEDS_SUPPORT`, `NEEDS_SUPPORT_SUFFIXES`, `FALLS`
  or `WASHED_AWAY`. The predicates over them - `needsSupport`, `falls`, `isWashedAway` - are unchanged.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`ffa5276`](https://github.com/JSPrismarine/JSPrismarine/commit/ffa527670e35929ad26cc85f785c23774be41006) Thanks [@filiphsps](https://github.com/filiphsps)! - Consolidate the single-version protocol machinery into a `ProtocolCodec` layer. `Codec2193` owns
  the packet id table and builds inbound packets; each session carries a codec, assigned from the
  codec registry when `RequestNetworkSettings` announces the client's protocol version.
  
  Breaking for consumers of the old statics: packet classes no longer carry `static NetID` (read
  ids through a codec's `netIdOf`, or an instance's `getId()`), handlers declare
  `static PacketName` instead of `static NetID`, and `PacketRegistry` keys handlers by packet class
  name. `Identifiers` remains exported but deprecated, derived from `Codec2193`, and its
  `MinecraftVersions` is now `readonly`.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`5ada190`](https://github.com/JSPrismarine/JSPrismarine/commit/5ada190f45738827cd2b67328404ce49226aea56) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the pick-block popup packet codec into Protocol.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`82e5616`](https://github.com/JSPrismarine/JSPrismarine/commit/82e56165530b05594cfc8f9465de84d43e938f3b) Thanks [@filiphsps](https://github.com/filiphsps)! - Make a world provider serve one save folder and every dimension in it. `Provider.readChunk`
  and `listChunks` take the `DimensionType` they address, `writeChunk` reads
  `chunk.getDimension()`, and `BaseProvider.setEntitySource` hands the provider the live entities
  of the dimension whose chunk it writes, so the LevelDB provider no longer reads the dimension off
  one `World`. `level.dat` gains `Generator`, `FlatWorldLayers` for a flat Overworld, `NetherScale`
  and `Time` through `saveLevelData(LevelDatInputs)`; player records carry Bedrock's `DimensionId`
  and `SpawnDimension` beside the Java ids; the resolved level stems persist in the
  `jsprismarine:world_data` record as `worldGenSettings`; and `lastPlayerRecord` reads one record
  and picks the world from its `dimension`. An out-of-tree provider has to add the dimension
  parameter to `readChunk` and `listChunks`.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`220290c`](https://github.com/JSPrismarine/JSPrismarine/commit/220290cf27e6ffeea04c6e0fc2e4d2e124ab4341) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the automation behavior-tree packet codec into Protocol.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`34956e1`](https://github.com/JSPrismarine/JSPrismarine/commit/34956e15d98f3e13936a7806a2809ee9b893c1aa) Thanks [@filiphsps](https://github.com/filiphsps)! - Launch bows through the data-driven arrow runtime only.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e78475c`](https://github.com/JSPrismarine/JSPrismarine/commit/e78475c308ec2d1f652768f441013519ec8e9c54) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the deprecated block and item registration methods and events. Content packs are the source
  of block and item definitions.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`82695c9`](https://github.com/JSPrismarine/JSPrismarine/commit/82695c95e8fc304fa2bc874817269c36b3f2605a) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the unused legacy block item network ID from `Block`.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`7bbe9d6`](https://github.com/JSPrismarine/JSPrismarine/commit/7bbe9d66c3bc2f032f0fbc98f4c10c1cfaabfc35) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Protocol's typed party change packet and party id limit.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`6a9824f`](https://github.com/JSPrismarine/JSPrismarine/commit/6a9824fa5a23a91584c5f7e3fe54f4c914d0c163) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove Prismarine's resource packs ready packet and use Protocol's packet class.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`703bf42`](https://github.com/JSPrismarine/JSPrismarine/commit/703bf42237b001abcacbbdfbd67d3a8ed9de555e) Thanks [@filiphsps](https://github.com/filiphsps)! - Move `RespawnPacket` into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`4855bcc`](https://github.com/JSPrismarine/JSPrismarine/commit/4855bcc3a5fffef4b6a2e362415caa6f672126dd) Thanks [@filiphsps](https://github.com/filiphsps)! - Move PlayerFogPacket into protocol.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3976ffe`](https://github.com/JSPrismarine/JSPrismarine/commit/3976ffed8af41c19db8ab807b366d94f85007a4d) Thanks [@filiphsps](https://github.com/filiphsps)! - Finish three of the four remaining items in section 10 of the data-driven vanilla plan.
  
  **`World.getBlock` resolves every palette state.** It caught the registry lookup failure and
  answered `minecraft:air`, and it asked by name alone, so the state the chunk held never
  reached the `Block`. A lit lamp, a half slab and a stair on its side all read their default
  state's facts, and a name no registry knew came back as an empty position a caller was free
  to build in, which lost the block on the next write. It passes the state's properties through
  now and throws, naming the block and the position, when nothing answers to the name. All
  22079 states in the shipped catalog resolve, with `content-packs` on and off.
  
  **The creative menu belongs to a server.** `CreativeInventory` built its menu into a static on
  the first read, so the first server in a process decided what every other server in that
  process served. It is an ordinary class now, constructed with the registries it reads.
  `Server.getCreativeInventory()` hands out that server's own. The statics `getEntries`,
  `getGroups`, `getItems`, `get` and `reset` are gone; the first four are instance methods.
  
  **The block entity index is a constant.** `BlockEntityRegistry` built its id-to-class map
  lazily into a mutable static with a `reset()` beside it. Its only source is a module, so there
  was never anything to invalidate. `BlockEntityRegistry.reset()` is gone.
  
  **The last eight item classes are gone.** `WoodenSword`, `GoldenSword`, `IronSword`,
  `DiamondSword`, `DiamondPickaxe`, `IronChestplate`, `DiamondChestplate` and `DiamondHelmet`
  were constructors that set a name; their armor points and attack damage have come from Java's
  item components through `Item` since the class registry went. `item/Items.ts` goes with them,
  taking the `allItems()` shim. Build `new Item({ name })` and read the list from
  `ItemManager.getItems()`.
  
  **The shipped block catalog is built once at import.** `BlockStateSchemas` loaded its 1477
  schemas lazily behind a `loaded` flag that every `get`, `names` and `getRevision` paid for.
  A million `get()` calls go from 12-81 ms to 1.5-7 ms, and a million `getRevision()` calls -
  one per block runtime id lookup, roughly 18000 per generated chunk - from 14-207 ms to
  1.4-7.7 ms. `reset()` drops only the registrations now, so the shipped schemas survive it.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`bb5b4a6`](https://github.com/JSPrismarine/JSPrismarine/commit/bb5b4a63109becb88233f09ff72e106c057fda25) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the aliases the dimension work kept for one release. `DimensionDefinition` is gone; use
  `DimensionType`. `Dimensions.Legacy`, the 0..255 Overworld, is gone with it. `Generators.Flat`
  and `Generators.Overworld`, `GeneratorFactories.registerClassGenerator` and
  `WorldManager.getGeneratorManager` are gone; register a generator kind as `{ kind, build(context) }`
  through `GeneratorFactories.register`, and build a vanilla Overworld through the `minecraft:noise`
  factory with `OVERWORLD_NOISE_STEM`. `FlatGenerator`, `FlatGeneratorOptions` and `FLAT_SEA_LEVEL`
  are exported from the generator factories. `WorldManager.getWorlds()` and `loadWorld()` are gone;
  walk `getLevels()` and each level's `worlds()`, or call `loadLevel()`.
  
  `WorldData` no longer declares the `generator` and `layers` keys, so `config.schema.json`
  describes a world by `seed`, `provider`, `preset` and `dimensions` alone and an editor flags the
  old keys. A file that still carries them loads as before: `normalizeWorldData` reads a
  `LegacyWorldData`, which carries the two old keys and their `FlatLayer` shape, and the first
  start writes the entry back in the new spelling. `World` no longer re-exports `FlatLayer`.
  
  The DevTools `jsprismarine` handle in `@jsprismarine/server` gains `levels()`, and its `worlds()`
  walks every loaded level.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4cde765`](https://github.com/JSPrismarine/JSPrismarine/commit/4cde765f6a09154037c2b8a06a6be9c05a81ab9e) Thanks [@filiphsps](https://github.com/filiphsps)! - Delete `MobSpawner`. `@jsprismarine/spawning` runs the spawn and despawn cycle inside the
  data-driven entity runtime, with Bedrock's caps and cadences and the sixty vanilla spawn rules,
  and that cycle now runs on every world rather than only on one with the pack stack turned on.
  `MobSpawner`'s 36 hard-coded species, its light and surface checks and its own despawn radius are
  gone with it, and `World.dataEntities()` returns the dimension's runtime rather than a runtime or
  nothing.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`1825a4c`](https://github.com/JSPrismarine/JSPrismarine/commit/1825a4cf5443453bf306e6282c31c80446fd59e5) Thanks [@filiphsps](https://github.com/filiphsps)! - Move PlayerHotbarPacket into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`587b01a`](https://github.com/JSPrismarine/JSPrismarine/commit/587b01a9e42381394bfc195c5a5597315145a1e8) Thanks [@filiphsps](https://github.com/filiphsps)! - Move anvil damage and block pick packet codecs into Protocol and use its typed block positions in the server handlers.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3c4ab00`](https://github.com/JSPrismarine/JSPrismarine/commit/3c4ab0012152cec470fa0d85656e619e407f5745) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `src/content/`, the composition root that builds the server's content registries from a pack
  stack. `buildServerContent()` resolves the stack, loads it through `@jsprismarine/packs`, registers
  the 49 block and 47 item behavior families and all 170 entity goals, resolves each domain, and
  flattens the hot per-state columns into typed arrays indexed by runtime id. Against the pinned BDS
  pack, the `jsprismarine_vanilla` overlay and the Java 26.3 vanilla datapack it produces 1477 blocks
  over 22079 states, 1613 items, 136 entity types, 2042 recipes, 1447 loot tables, 43 enchantments,
  60 spawn rules and 883 tags over 20 tagged registries, in about 3.6 seconds and with no errors.
  
  Nine content packages each declare their own injected world interface, and they overlap heavily.
  `ServerWorldAdapter` is the one interface the server implements instead, and `contentWorldViews`
  projects the nine out of it. Six of its groups are required and five are optional; a projection
  that needs an absent group throws `NotWiredError` naming the member and the subsystem that owes it,
  rather than returning a value a caller could not tell apart from a real one.
  
  `Server` gains `getContent()` and `setContent()`, and builds content at startup when `config.yaml`
  sets `content-packs`. That key defaults to false, so the existing managers keep running the server
  while each subsystem moves across; `JSP_CONTENT` overrides it for a single run. Three more keys
  come with it: `content-strict`, `content-world-packs` and `content-datapacks`.
  
  Every source the build reads is injectable, so a test builds the same content out of a handful of
  definitions and a two-block palette with no disk access. `src/content/testing.ts` ships that
  fixture, and the one test that needs Mojang's fetched data is gated behind `JSP_CONTENT_VANILLA`.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`f3501ba`](https://github.com/JSPrismarine/JSPrismarine/commit/f3501ba313b497cbd28fd465a962867a08738e32) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the serverbound loading screen packet into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`e67dba5`](https://github.com/JSPrismarine/JSPrismarine/commit/e67dba5b485b5e40d0fb0b8c74703fdd861540d9) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Protocol's typed death and feature registry packets.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`23a6c13`](https://github.com/JSPrismarine/JSPrismarine/commit/23a6c13b401ca33a7cd6fa89bed8c4723d67168e) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace legacy item ids with runtimeId

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`5f838b2`](https://github.com/JSPrismarine/JSPrismarine/commit/5f838b2c01ab875611fefd411c05a18f3172f26a) Thanks [@filiphsps](https://github.com/filiphsps)! - Move LoginPacket framing into Protocol and leave identity parsing in the server.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`f5c7d59`](https://github.com/JSPrismarine/JSPrismarine/commit/f5c7d591d3fe46e95c5058c2114c382ecc61784a) Thanks [@filiphsps](https://github.com/filiphsps)! - Move block event packet serialization into Protocol and use its block-position structure.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f85371f`](https://github.com/JSPrismarine/JSPrismarine/commit/f85371fcf9b1a706729359f58adab98905caa051) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the block manager; block lookup now uses resolved content types.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`2bfefa1`](https://github.com/JSPrismarine/JSPrismarine/commit/2bfefa16375b42dab6cb3fb9f408cc387921aa81) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove Prismarine's furnace-options packet and use Protocol's typed packet class.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`8086b8c`](https://github.com/JSPrismarine/JSPrismarine/commit/8086b8c5b689736084844b4ed11587df9d432fbf) Thanks [@filiphsps](https://github.com/filiphsps)! - Move ChangeDimensionPacket into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`1371822`](https://github.com/JSPrismarine/JSPrismarine/commit/1371822963657e28d7d8c1c52cdeab654eeb0b49) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Protocol's typed unlocked recipes packet.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`f0294ef`](https://github.com/JSPrismarine/JSPrismarine/commit/f0294ef0b8e358f4fda308d7c8f1c901bf1bf3e7) Thanks [@filiphsps](https://github.com/filiphsps)! - Move protocol codec construction, packet lookup, version metadata, and handshake filtering into
  `@jsprismarine/protocol`. Prismarine now passes captured item, block, and world data through
  `ProtocolContext`, and no longer re-exports the Protocol namespace, packet barrel, or identifier
  compatibility API. Server packet dispatch is held by `PacketHandlerRegistry`, and Prismarine
  declares the Brigadier dependency its command source and public declarations import.
  
  `ServerName` now receives protocol metadata directly instead of reading `getIdentifiers()` from
  the Prismarine server object.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`e2fcf7a`](https://github.com/JSPrismarine/JSPrismarine/commit/e2fcf7afa78e58a5a768d0f42abc035e50389a33) Thanks [@filiphsps](https://github.com/filiphsps)! - Move settings-command serialization into Protocol and adapt the server handler to its typed payload.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3093e34`](https://github.com/JSPrismarine/JSPrismarine/commit/3093e340fc9a98a5a408f3c175e844b576289940) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove legacy fire handlers from the engine and dispatch fire ticks through block behavior families.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`88f05b1`](https://github.com/JSPrismarine/JSPrismarine/commit/88f05b1e498a83f210e0fc02ca2f039746bad0f9) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop the underground spawn pass putting mobs inside rock. It drew a y uniformly between the world
  floor and the surface and spawned there without asking what was at the position, so in a world
  with few caves almost every hostile spawn landed inside a solid block. Measured on a flat world
  with two players connected: 11 of 11 zombies, 3 of 3 spiders, 3 of 3 creepers and the one witch
  were standing inside dirt or stone. None of them could path anywhere, none of them despawned, and
  between them they held the monster pool at its cap so nothing else could spawn either.
  
  `SpawnWorld` gains `solid(at)`, and a draw whose own block or the block over its head is solid is
  refused, which is what Java's `NaturalSpawner.isSpawnPositionOk` does with one. The server answers
  it from the flattened solidity column indexed by runtime id, so a pack's own block answers for
  itself, and an unloaded position counts as solid.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5aff4d0`](https://github.com/JSPrismarine/JSPrismarine/commit/5aff4d01345b310f838f3151414305192cd3d317) Thanks [@filiphsps](https://github.com/filiphsps)! - Let a player move stacks through a block's own slots. Opening a chest already worked and showed
  what was in it; nothing could put anything in or take anything out, because
  `ItemStackRequestHandler` owned the player's containers and the two slots a workstation keeps on
  the open window, and a chest's 27 were neither.
  
  `inventory/containerSlots.ts` maps the `Container Name` on an `ItemStackRequest` onto a block
  slot. A storage screen names its whole range under one container and numbers the slots inside it;
  a furnace gives each of its three slots a container of its own; a brewing stand's five are three
  bottles, then the ingredient, then the fuel. The block slot numbering is Bedrock's own, so the
  `Items` list a vanilla tool reads is in the order vanilla writes it.
  
  `inventory/containerStore.ts` is where those slots live, which is the chunk's own block entity for
  every block but one. A request reads the container once, moves stacks around in that array and
  writes it back only when the request is accepted, so a refusal leaves the block holding what it
  held and two players at one chest each start from what is in it now. The exception is the ender
  chest, whose 27 slots come off `HumanInventory.getEnderChest` and belong to the player.
  
  `TAKE`, `PLACE`, `SWAP`, `DROP` and `DESTROY` all reach a block's slots. `SWAP` used to read both
  ends as inventory indices and refuse anything else; it now locates both the way a move does, so a
  stack can trade places with one in a chest. A furnace's output slot refuses anything dropped onto
  it and still gives its stack up, which is Java's rule for it.
  
  A double chest is one run of 54 slots across the two block entities the `jsprismarine:container`
  family paired, ordered from the half with the lower `x` and then `z`, so the player who opened the
  left chest and the player who opened the right one address the same slots. Every other player with
  the same block open is sent an `InventorySlot` for each slot that moved, through the new
  `PlayerSession.sendContainerSlot`.
  
  Known gaps. A block entity carries an identifier and a count per slot, so a stack put into a chest
  keeps its name and how many there are and loses its enchantments, its damage and any name an anvil
  gave it. Nothing smelts in a furnace, brews in a brewing stand or moves items on a hopper's timer,
  so those blocks are storage with the right slot layout and no process behind them.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`61c3417`](https://github.com/JSPrismarine/JSPrismarine/commit/61c3417ea32f651a7add6275c6ef81fbbfda3611) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the structure editor packet codecs and settings structure into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`18b2fa6`](https://github.com/JSPrismarine/JSPrismarine/commit/18b2fa6dfe248dc201e6d9a232413831dcaf7060) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the sub-client login packet codec into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`20f0ff3`](https://github.com/JSPrismarine/JSPrismarine/commit/20f0ff3b821971cb5a26345fe5e766e967cc7ae5) Thanks [@filiphsps](https://github.com/filiphsps)! - Move protocol structures and version tables to direct imports, and stop Prismarine from re-exporting those APIs.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`a0d4b3f`](https://github.com/JSPrismarine/JSPrismarine/commit/a0d4b3fc39cc6ad3637e7b81ad535ae5afd869fd) Thanks [@filiphsps](https://github.com/filiphsps)! - Move resource pack exchange packets into Protocol

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`3cb7c4d`](https://github.com/JSPrismarine/JSPrismarine/commit/3cb7c4d773526e3bc45a7cb786a37b199cde00ad) Thanks [@filiphsps](https://github.com/filiphsps)! - Move world-time and health packet codecs into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`2083ca6`](https://github.com/JSPrismarine/JSPrismarine/commit/2083ca697c16ca175983b09287423568b557511c) Thanks [@filiphsps](https://github.com/filiphsps)! - Use the protocol item registry with negotiated item data.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`168bbb6`](https://github.com/JSPrismarine/JSPrismarine/commit/168bbb6c45890879074549cab88cf987a5fef829) Thanks [@filiphsps](https://github.com/filiphsps)! - Move PlayerActionPacket wire codec and action types into Protocol

- [#2617](https://github.com/JSPrismarine/JSPrismarine/pull/2617) [`7d4cb60`](https://github.com/JSPrismarine/JSPrismarine/commit/7d4cb6009835da3406c6ad2594c179d013451953) Thanks [@filiphsps](https://github.com/filiphsps)! - Match permission and operator entries by player UUID. Existing entries without a `uuid` are ignored, so add the player's UUID to retain their permissions or operator status.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`14ea6ed`](https://github.com/JSPrismarine/JSPrismarine/commit/14ea6ed574bd1edc4751fb934d65ee2c99df59f9) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the `terrain` status in a pool of worker threads.
  
  `DataDrivenGeneratorOptions.terrain` names a built pipeline module and a worker count, and the
  `terrain` bodies run there instead of on the event loop. `terrainPipeline.ts` is that module: it
  builds one `DataDrivenGenerator` per worker with decoration and structures off and answers a task
  by calling the same `buildTerrainTile` the main thread calls. One implementation of the noise
  fill, not two, because a second one would be a second world and only a digest would say which.
  
  Only `terrain` goes to a worker. It writes radius 0, its own chunk and nothing else, so two of
  them can never touch the same block. `features` writes radius 1 and stays on the main thread with
  the holders, the patch merge and the translation to Bedrock runtime ids. That split is Java's and
  it is the safety argument for the whole arrangement.
  
  The structure pieces that push a chunk's terrain around are laid out on the main thread and
  travel with the task. Laying them out is the expensive half of the structure problem and it is
  shared between neighbours through one cache, so repeating it in six workers would cost more than
  the fill the worker is there to do. A worker therefore reads no templates and lays out no
  structures; it receives the registries as one `SharedArrayBuffer` and parses them in 21.6 ms.
  
  `GenerationRegion` gained `transfer` and `adopt`, so a terrain tile crosses a thread boundary as
  its palette and three typed arrays rather than as 98304 block states.
  
  Measured on a 49 chunk fill at seed 1234, three repetitions with the arms interleaved, best of
  three, on a loaded host: 2.83 chunks/s inline, 3.26 at one worker, 6.42 at four and 6.33 at six.
  The digests of all 49 chunks were identical at every worker count and in both request orders,
  row major and reversed.
  
  A generator with no `terrain` option behaves exactly as before. The pipeline module has to be
  something a worker thread can `import()` through Node, which means built JavaScript.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`152ff12`](https://github.com/JSPrismarine/JSPrismarine/commit/152ff1277534718f1c46827040b5f9e18fd806d8) Thanks [@filiphsps](https://github.com/filiphsps)! - Move modal form request and response packets into protocol.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`9847149`](https://github.com/JSPrismarine/JSPrismarine/commit/9847149ce4428d5a4c166f9ec4d87c78f7406d83) Thanks [@filiphsps](https://github.com/filiphsps)! - Move `PlayerAuthInputPacket` and its wire structures into Protocol. Prismarine now resolves item descriptors and block positions at the handler boundary, and Protocol can read and write item stack requests carried by player input.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`0e208a5`](https://github.com/JSPrismarine/JSPrismarine/commit/0e208a5c1b79d9d568083e6cc6f473c6df89b33b) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the transfer packet and its wire codec into the protocol package.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bd06aa2`](https://github.com/JSPrismarine/JSPrismarine/commit/bd06aa24cd28d4ec59b5d2f137c4be5151eb7ba8) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop spelling out a sub chunk of one biome. Reading a chunk built 24 arrays of 4096 biome ids per
  column and then scanned each one to discover what the record had already said: five sections in
  six hold a single biome, which the format states outright with a zero bit width and a one entry
  palette.
  
  `BiomeSection` is the exchanged form, a single id or one id per block. `decodeData3D` returns it,
  `encodeData3D` accepts it, and `ChunkBiomes.toSectionIds` and `fromSectionIds` speak it. The bytes
  on disk are unchanged, and a uniform section encodes to exactly what the spelled-out form always
  did.
  
  Two callbacks went with it. `Uint16Array.from(section, fn)` walks a typed array through the
  iterator protocol, allocating a result object per element, and `section.every(fn)` costs a call
  per element; both ran over all 98304 ids of every column. They are plain loops now.
  
  Decoding the biomes of a 256 column world, old against new, interleaved in one process: 4.9 ms
  per column before, 0.64 after.

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

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`1e7a45b`](https://github.com/JSPrismarine/JSPrismarine/commit/1e7a45b8f9209c7844a76693b019ddb040bdd475) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the synchronized block update packet codec into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`eb85543`](https://github.com/JSPrismarine/JSPrismarine/commit/eb85543638be38c53b604d70e11358ba72c9f61f) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the soft enum update packet and its codec into the protocol package.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`25fcdf8`](https://github.com/JSPrismarine/JSPrismarine/commit/25fcdf8b3d3835ecb66c0d4effe0da1a80b95368) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the trade update packet codec into the protocol package.

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

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`912f83e`](https://github.com/JSPrismarine/JSPrismarine/commit/912f83eb3dd233d756506e1d6a309ed780fde00a) Thanks [@filiphsps](https://github.com/filiphsps)! - Move server-authoritative inventory request codecs into Protocol

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2e24f49`](https://github.com/JSPrismarine/JSPrismarine/commit/2e24f499570960f91e53c0388e6ea00a7f662116) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven block sensors and route nearby block breaks.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`d5056d3`](https://github.com/JSPrismarine/JSPrismarine/commit/d5056d3fe5f8d2be49f42d3d03edab591bedf55a) Thanks [@filiphsps](https://github.com/filiphsps)! - Every packet wire layout now lives in `@jsprismarine/protocol`, so a third party can speak the
  Bedrock protocol without the server package. The eight layouts the server still defined -
  AddActor, AddPlayer, GameRulesChanged, InventoryTransaction, PlayerList, PlayerSkin,
  SetActorData and UpdateAttributes - join the protocol package's registry, together with the
  structures they carry: `NetworkUtil`, `Attribute`, `Metadata`, `SyncedProperties`, `GameRule`,
  `PassengerOfBlock`, `UUID`, `Skin`, `PlayerListEntry`, the inventory transaction's bodies and a
  `NetworkItemStackDescriptor` codec. The protocol package gains a dependency on
  `@jsprismarine/math` for the positions those structures carry.
  
  The server re-exports each moved structure from its old path, so existing imports keep working.
  `network/codec/prismarineWireDefinitions` and `network/wire/fieldTypes` are gone - the one
  registry is `wireDefinitions` - and `AddPlayerPacket.carriedItem` is the stack descriptor the
  layout carries rather than an `Item`; the packet's own `item` property is unchanged.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ea7ce22`](https://github.com/JSPrismarine/JSPrismarine/commit/ea7ce225dad2500f1fdc5b5c71665d44daab7143) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the vanilla command set through `@jsprismarine/commands`, and close part of the Bedrock
  coverage gap.
  
  The command package was built, tested and wired to nothing: no package depended on it, the content
  adapter carried a structural stand-in for its `CommandHost` so `@jsprismarine/prismarine` would not
  have to depend on it, and the live server still ran twenty command classes of its own. The server
  now holds a `CommandHost` over its real managers and dispatches the package's tree. Fourteen vanilla
  command classes are gone, along with `jsprismarine:reload`, whose root literal collided with the
  vanilla `/reload` and reached the client as a second `/reload`; `/ban` and `/pardon`, which the
  package does not implement, and the rest of the `jsprismarine:` namespace stay on the old
  dispatcher. `AvailableCommandsPacket` now carries both halves, and the vanilla half goes through the
  package's own flattener, so the chained `/execute` tree reaches a client for the first time.
  
  Forty-two of the package's fifty-nine commands are registered. The other seventeen call into a
  subsystem this server does not have - there is no scoreboard, no status effect system, no loot
  runtime, no experience model - and `UNWIRED_COMMANDS` names each one with what it would need. An
  unwired command is not registered at all, so the client is never offered it and the dispatcher
  reports it unknown, rather than accepting a line and doing nothing.
  
  In `@jsprismarine/commands`:
  
  - `matchSelector` resolves a parsed selector against a candidate list, which is Java's
    `EntitySelector` in the order Java applies it: filter, then sort, then cut to the limit. The facts
    an `EntityRef` does not carry arrive through an optional `SelectorFacts`, and a fact left out
    never matches a test that reads it.
  - `CommandRegistry` takes an `include` predicate. An excluded command is built but never registered,
    so nothing can parse it, no alias is registered for it, and the flattener never puts it in the
    packet. `getExcludedNames` reports the difference between the set the package implements and the
    set a host runs.
  - Nine Bedrock-only commands: `/testfor`, `/testforblock`, `/testforblocks`, `/daylock`,
    `/titleraw`, `/replaceitem`, `/camerashake`, `/fog` and `/playanimation`. The first four run the
    same host verbs as the Java commands they are older spellings of.
  - `ServerCommandHost.sendTitle` now takes a `TitleInstruction` rather than a kind and a string, so
    `clear` and `reset` carry no text and the new `times` form carries three durations. It gains
    `shakeCamera`, `setFog` and `playAnimation`, `DataCommandHost.setSlot` gains the old-item handling
    `/replaceitem` asks for, and `ItemSlot` gains an `index`, because Bedrock names a slot in two
    parts where Java names it in one.
  - A Java registry argument completes from Mojang's own published enum where Bedrock has one, so
    `/summon`, `/give`, `/setblock`, `/fill` and `/clear` autocomplete on the client instead of taking
    an unvalidated string.
  - A block state list requires its brackets, which is what keeps `/setblock 1 2 3 dirt keep` from
    reading `keep` as an empty state list and placing the block in replace mode.
  
  In `@jsprismarine/prismarine`:
  
  - `Entity` carries the `/tag` tag set that `@e[tag=...]` tests.
  - `Config.setDifficulty` lets `/difficulty` change what it reads, and `DIFFICULTIES` and
    `difficultyName` are exported so the name and the number cannot disagree.
  - `World.setLoadedBlockState`, `CameraShakePacket`, `PlayerFogPacket`, `AnimateEntityPacket`,
    `SetTitlePacket`, `TransferPacket` and `StopSoundPacket` are reached for the first time; the last
    five were written and never sent.
  - `dispatchCommand` reads the `sendCommandFeedback` gamerule as its value rather than as the
    `[value, editable]` pair, which is always truthy, so the rule suppresses feedback as documented.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`8a368eb`](https://github.com/JSPrismarine/JSPrismarine/commit/8a368ebb1f02d851ba3f8585a37639b4a418d9c8) Thanks [@filiphsps](https://github.com/filiphsps)! - Move Education automation and NPC request packets into Protocol.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`1b92d98`](https://github.com/JSPrismarine/JSPrismarine/commit/1b92d984399f419962640740bfd8f689a3c5c5d3) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the spawn experience orb packet implementation into the protocol package.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0f497eb`](https://github.com/JSPrismarine/JSPrismarine/commit/0f497eb257a4a9d4184c467285451e6af12d35cd) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry the world seed as a 64-bit value instead of a JavaScript `number`.
  
  A Minecraft seed is a 64-bit integer; a double is exact only below 2^53. Every seed above that
  was rounded on the way in, so a server configured with `8475011743740320021` generated the world
  of `8475011743740319744`. Noise, biome climate, carvers, structure placement and the decoration
  seed are all pure functions of that long, so the world had nothing to do with the one the player
  asked for. About 99.9% of 19-digit Java seeds lose bits that way. The rounded value also went
  into `level.dat`'s `RandomSeed` record and out in `StartGamePacket`, so the saved world and the
  seed the client reported agreed with each other and with nothing else.
  
  `World.getSeed`, the `Generator` interface (`generateChunk`, `surfaceAt`, `locate`), the
  `Provider` and `BaseProvider` `readChunk` signatures and `StartGamePacket.seed` all take and
  return `bigint` now. Existing calls that pass a `number` no longer type-check; write the literal
  as a `bigint` (`1234n`) or convert with `BigInt`.
  
  A world's `seed` in `config.json` may be a string, and should be: neither JSON nor YAML can hold
  a 19-digit integer as a number literal without rounding it. The string is read the way Java reads
  the text in its world creation box, so a value that parses as a 64-bit integer is that integer
  and anything else is its `String.hashCode` widened to a long. A number is still accepted and is
  exact below 2^53. A new server now writes its generated seed as a string, drawn over the whole
  64-bit range rather than the safe-integer one.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9293424`](https://github.com/JSPrismarine/JSPrismarine/commit/929342440724a65358d8916a558e255ed7a891ee) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the implicit entity-runtime import from `World.addEntity`.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`20a16d1`](https://github.com/JSPrismarine/JSPrismarine/commit/20a16d1aec16579eaf25b61f7eeffd261408ef3b) Thanks [@filiphsps](https://github.com/filiphsps)! - Move command permission and difficulty packet codecs into the protocol package.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`35dc8ab`](https://github.com/JSPrismarine/JSPrismarine/commit/35dc8ab56ba8acf18a68357c3c0ca1e4ed1f8801) Thanks [@filiphsps](https://github.com/filiphsps)! - Use each entity's navigation and physics data, and place spawned mobs at their correct feet positions.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7c0cefd`](https://github.com/JSPrismarine/JSPrismarine/commit/7c0cefd6b68c9ae0b816b4dcd681d256a1f4825a) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply Java fluid movement to data-driven entities

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3f0e622`](https://github.com/JSPrismarine/JSPrismarine/commit/3f0e6228843e07f161a665424b7d7fad69273188) Thanks [@filiphsps](https://github.com/filiphsps)! - Use loaded crafting recipes for `minecraft:shareables` rules with `craft_into` when entities share items.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`18d21b4`](https://github.com/JSPrismarine/JSPrismarine/commit/18d21b4ef924c0f61391d401b9f494dd3afd2446) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `Anvil.regionDirectory(dimension)`, which answers `dimensions/<namespace>/<path>/region` for every dimension but the Overworld and falls back to `DIM-1` and `DIM1` for saves written before Java 26.1, and `Anvil.listChunks(dimension)`, which reads the location table of each region file there.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5f6dbf9`](https://github.com/JSPrismarine/JSPrismarine/commit/5f6dbf923cf3be78557176553f0f697e04fa2bfc) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix armor granting no protection. Reading an item's armor points and toughness matched the
  attribute modifier id `minecraft:base_armor`, which no item carries. Java names the armor modifier
  after the slot it fills, so an iron chestplate publishes `minecraft:armor.chestplate` and the
  lookup found nothing for all 41 armor items. A full diamond set absorbed exactly as much as bare
  skin.
  
  Attribute lookups now match on the attribute type alone and sum every `add_value` modifier of it,
  so a future rename of Java's modifier ids cannot silently zero a stat again. Attack damage and
  durability were already correct and are unchanged.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`8d32d62`](https://github.com/JSPrismarine/JSPrismarine/commit/8d32d62995da11777c5e2dbe255e3ce1e5e30c6a) Thanks [@filiphsps](https://github.com/filiphsps)! - Report every protocol version the server speaks, not just the newest
  
  The startup banner and `/version` named one Minecraft version and one protocol while the server
  registers a codec per protocol version and negotiates per session, so a player on the older of two
  supported versions saw a banner that said the server did not speak their protocol. Both now list
  each registered protocol with its Minecraft versions, newest first, and mark the one the MOTD
  advertises. The refusal log names every protocol the server speaks instead of only the newest.
  
  The codec registry grew `registeredCodecs`, newest protocol version first, and
  `describeSupportedProtocols()`, which both diagnostics read, so a new codec appears in them
  without a second list to maintain. The MOTD still advertises only the newest version, matching
  Bedrock Dedicated Server.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`072a967`](https://github.com/JSPrismarine/JSPrismarine/commit/072a967a7f0c2b86edea253e787ed36df9d31bd6) Thanks [@filiphsps](https://github.com/filiphsps)! - File a block entity under the id Bedrock uses. `blockEntityIdFor` pascal-cased the block's name
  and kept the result only when this server had a class for that type, which is a different question
  from what Bedrock calls it. A sign came out `jsprismarine:standing_sign`: Bedrock files all twelve
  sign blocks under `Sign`, and nothing here models a `StandingSign`. A client ignores an id it does
  not recognize, so no sign this server ever wrote drew its text, in the chunk payload or in an
  update. Banners, heads, lit furnaces, suspicious sand, enchanting tables and pistons were wrong the
  same way.
  
  The id now comes from `blockentity/bedrockBlockEntityIds.ts`, a table of Bedrock's own spellings
  read out of the pinned Dedicated Server binary and keyed by the pinned block palette, with the wood
  types, the dye colors and the copper weathering stages handled by suffix. A block Bedrock keeps no
  block entity on still gets a namespaced id, because a record this server invented is better named
  after this server.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`df1ea7c`](https://github.com/JSPrismarine/JSPrismarine/commit/df1ea7c78616f617fa859e6646a71ba3aa7ad3eb) Thanks [@filiphsps](https://github.com/filiphsps)! - Roll an active block `minecraft:loot` component before the Java-mapped block loot table.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`6fb2e96`](https://github.com/JSPrismarine/JSPrismarine/commit/6fb2e96b12ca435350b66c924900945c29931e1a) Thanks [@filiphsps](https://github.com/filiphsps)! - Project saddle, chest, captain, and shaking markers to actor flags.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7338448`](https://github.com/JSPrismarine/JSPrismarine/commit/733844826d02741efbb54fefe2a575379646f88b) Thanks [@filiphsps](https://github.com/filiphsps)! - Project `minecraft:out_of_control` to the Bedrock actor metadata flag.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c399e23`](https://github.com/JSPrismarine/JSPrismarine/commit/c399e23032489fcf0c9aba658cc17350744af159) Thanks [@filiphsps](https://github.com/filiphsps)! - Project `minecraft:body_rotation_blocked` to the Bedrock actor metadata flag.

- [#2612](https://github.com/JSPrismarine/JSPrismarine/pull/2612) [`aa68cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/aa68cb14115bf30f9fb8db7b4593ae6c4cf37e3d) Thanks [@filiphsps](https://github.com/filiphsps)! - Derive the persisted block state version from the catalog

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`3bbeb2c`](https://github.com/JSPrismarine/JSPrismarine/commit/3bbeb2cb3b53be46e3f3bd200f73cf5165add518) Thanks [@filiphsps](https://github.com/filiphsps)! - Add a server-side boss bar over `BossEventPacket`, which nothing sent before. A `BossBar` holds
  one bar's actor, title, fill, color and overlay, replays that state to players as they
  subscribe, fans updates out to subscribed players only, drops a player who disconnects, and can
  move to another actor id when a bar has to follow a re-spawned boss or a stand-in actor. The
  new `BossEventHandler` answers the client's serverbound `Query` by replaying the queried bar's
  Add. Nothing on the server shows a bar yet; the End dragon fight will.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c1edeed`](https://github.com/JSPrismarine/JSPrismarine/commit/c1edeed6ff7bed94d8708fc948355410aaa69fd9) Thanks [@filiphsps](https://github.com/filiphsps)! - Attach leads to data-driven leashable entities

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5b6c410`](https://github.com/JSPrismarine/JSPrismarine/commit/5b6c410cf83828461ec5ffc6d38e762b55f7dffd) Thanks [@filiphsps](https://github.com/filiphsps)! - Broadcast the vanilla love-hearts actor event when a data-driven animal accepts a breeding item.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0d64a00`](https://github.com/JSPrismarine/JSPrismarine/commit/0d64a00ec60a7c2064030bfdcec0b2ca26de5236) Thanks [@filiphsps](https://github.com/filiphsps)! - Fire `minecraft:on_start_landing` when an airborne data-driven entity lands.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`376f8e2`](https://github.com/JSPrismarine/JSPrismarine/commit/376f8e258ba349d5fa5d7c496b3aa6b8045dec46) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the `play_sounds` effects declared by `minecraft:interact` entries.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`72523de`](https://github.com/JSPrismarine/JSPrismarine/commit/72523decbd863db546fa6f16b1c855a8729e4534) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply the item stack result when a spawn egg is used on an entity, so survival players spend an egg after spawning it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ab5bba1`](https://github.com/JSPrismarine/JSPrismarine/commit/ab5bba1f731f1d5b7ac028a4f76178b4c474e743) Thanks [@filiphsps](https://github.com/filiphsps)! - Project `minecraft:fire_immune` to the Bedrock actor metadata flag.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`132126b`](https://github.com/JSPrismarine/JSPrismarine/commit/132126b483610596c0bf3c4b708869c121d06fc5) Thanks [@filiphsps](https://github.com/filiphsps)! - Preserve item stack can-place-on and can-destroy block lists through network decoding and encoding.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`09883cc`](https://github.com/JSPrismarine/JSPrismarine/commit/09883cceba7c537b878891ee0200d8e6d52b8e48) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve dense-world target searches and add opt-in DevTools profiling for server runs.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0933fcf`](https://github.com/JSPrismarine/JSPrismarine/commit/0933fcfec5699808f927505385382eff09a40788) Thanks [@filiphsps](https://github.com/filiphsps)! - Reuse the last block identifier for consecutive navigation queries at one cell.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b194cc3`](https://github.com/JSPrismarine/JSPrismarine/commit/b194cc3b8a647bd944f78b60903cf23edcc04d1b) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement `minecraft:combat_regeneration`, including self and same-family rewards when an attack target dies.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`509a1d7`](https://github.com/JSPrismarine/JSPrismarine/commit/509a1d77ed6b5792c66ccba5cfd5b676340f366a) Thanks [@filiphsps](https://github.com/filiphsps)! - Track `minecraft:spawn_entity.should_leash` relationships so entity filters can read the holder.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e17199e`](https://github.com/JSPrismarine/JSPrismarine/commit/e17199e28be25659495b398dc05d6a48baa2b593) Thanks [@filiphsps](https://github.com/filiphsps)! - Use the interaction rotation from PlayerAuthInput when orienting placed blocks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`41b2edf`](https://github.com/JSPrismarine/JSPrismarine/commit/41b2edfdb14c2144a0bafb46a9c2e93d2507b035) Thanks [@filiphsps](https://github.com/filiphsps)! - Translate random-tick block states back to Bedrock palette values before resolving block hooks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9617d18`](https://github.com/JSPrismarine/JSPrismarine/commit/9617d187fd9dad87384a46b57548d94441123eeb) Thanks [@filiphsps](https://github.com/filiphsps)! - Read mate and offspring rules from minecraft:offspring_data and retain legacy offspring support.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`27823d7`](https://github.com/JSPrismarine/JSPrismarine/commit/27823d72e6cd3b3a143ae5c18d99411c0c632a10) Thanks [@filiphsps](https://github.com/filiphsps)! - Content builds without a world adapter no longer read the optional entity-spawning adapter during construction.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`182066c`](https://github.com/JSPrismarine/JSPrismarine/commit/182066cbdd69eb2fcbe6456efc3c4c31462db59e) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the chunk generation pool inside the Bun-compiled executables.
  
  A compiled binary refused the worker pool outright, so every published executable generated
  terrain on the server thread. Bun does run workers in a compiled binary when their entry
  modules are passed as extra compile entrypoints, so the build now embeds the generation worker
  and both pipeline modules beside the server and tells the pool where they landed through
  `JSP_EMBEDDED_*` defines, the same mechanism as the build metadata. The pool refuses only a
  binary compiled without them, which is what Node's single executable still is. Bun names an
  embedded entrypoint by its path relative to the entrypoints' common directory, which is
  observed behavior rather than documented, so the build verifies the names it compiled in and
  fails loudly if a Bun release changes the scheme.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`2ea0264`](https://github.com/JSPrismarine/JSPrismarine/commit/2ea0264cadb5621e9b4e5f8eff140df570366a76) Thanks [@filiphsps](https://github.com/filiphsps)! - Give the Bun-compiled executables the Bedrock and Java data they run on.
  
  The release and nightly workflows compile the published executables with `bun build --compile`,
  not with Node's single-executable packager, and those binaries did not start at all: `node:sea`
  is imported at the top of `GenerationPool`, Bun implements no such module, and resolving it
  throws `No such built-in module` before anything runs. The runtime checks that ask whether this
  process is a compiled binary now answer for Bun as well, without naming a module Bun cannot
  resolve, and the data a packaged binary unpacks on first run travels inside the Bun executables
  too — through module source, which is what `bun build --compile` carries, since Bun has no asset
  table to read back. Both packagers now collect that payload through one builder, so what the two
  kinds of executable ship cannot drift apart.
  
  Two name lookups that a bundler breaks are fixed with it. A packet's wire id and its codec
  override were both resolved from `constructor.name`, and a bundler renames a class whose name
  collides with another in the same chunk: the compiled binary ended up with a `DeathInfoPacket2`
  and refused to register it. Both now resolve through the packet barrel's export keys, which are
  property names that survive bundling. The override lookup silently missing would have sent a
  2225 session the 2193 layout of every packet whose layout changed.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cfaf00d`](https://github.com/JSPrismarine/JSPrismarine/commit/cfaf00d727b7a3e8a6dc0815fe75fb53c420b325) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply `minecraft:can_fly` to aerial pathfinding and Bedrock actor metadata.

- [#2618](https://github.com/JSPrismarine/JSPrismarine/pull/2618) [`1990d87`](https://github.com/JSPrismarine/JSPrismarine/commit/1990d875c3e39e0017b661e18cfa33f7d56f4cb9) Thanks [@filiphsps](https://github.com/filiphsps)! - Document config.json as the settings file

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bd32c08`](https://github.com/JSPrismarine/JSPrismarine/commit/bd32c08eac967ec9e0068cd56cf1788053539a6b) Thanks [@filiphsps](https://github.com/filiphsps)! - Move slope-directed fluid flow, falling levels, and source conversion into the data-driven liquid family.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ef7fe41`](https://github.com/JSPrismarine/JSPrismarine/commit/ef7fe4152192b1a355f07682016b75a018356fae) Thanks [@filiphsps](https://github.com/filiphsps)! - Map Java entity type tags into entity predicate views.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`27ddebb`](https://github.com/JSPrismarine/JSPrismarine/commit/27ddebbf95495c43f403edfdae265bbdfbcbd3a8) Thanks [@filiphsps](https://github.com/filiphsps)! - Process chained block neighbor notifications iteratively so large leaf updates do not overflow the call stack.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5f61e75`](https://github.com/JSPrismarine/JSPrismarine/commit/5f61e75cc39c41a36aad61188b032bd6363a4a3e) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the carvers after the surface materials, and leave open air alone.
  
  `DataDrivenGenerator` carved before building the surface, so the surface rules ran over terrain
  that was already full of holes. The 26.3 server jar's `terrain` status runs `doFill`, then
  `buildSurface`, then `generateCarvers`, so a cave mouth should cut through finished grass instead.
  
  A carver's mask can also reach above the terrain, because `carver/cave.json` runs up to `y: 180`.
  Writing there was a no-op in value but went through the region, which tracks each column's highest
  block, so a cell that is already air is now skipped.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`54b4102`](https://github.com/JSPrismarine/JSPrismarine/commit/54b4102a469b0c77022bf60c762644a907cca76d) Thanks [@filiphsps](https://github.com/filiphsps)! - Prevent empty item actors

- [#2612](https://github.com/JSPrismarine/JSPrismarine/pull/2612) [`b898ad5`](https://github.com/JSPrismarine/JSPrismarine/commit/b898ad5220836d825b2c15ce5089c6b0f1d22c4e) Thanks [@filiphsps](https://github.com/filiphsps)! - Persist entities in Bedrock LevelDB chunks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0d31902`](https://github.com/JSPrismarine/JSPrismarine/commit/0d319021731d94a315e9044f13d108e7436c21a0) Thanks [@filiphsps](https://github.com/filiphsps)! - Let spawn eggs use mob-target placement behavior

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`93c71b2`](https://github.com/JSPrismarine/JSPrismarine/commit/93c71b27b6df648a5d9638c26e2897ad8d8b890a) Thanks [@filiphsps](https://github.com/filiphsps)! - Hand a generated chunk to the Bedrock storage by its palette rather than block by block.
  
  `DataDrivenGenerator.toChunk` translated each of the column's blocks on its own: a mapping lookup
  for the Java state, a sub chunk lookup, and a palette insert, roughly 18000 times. It now
  translates the generation region's palette once, a few hundred materials, and reindexes the block
  buffer into one `BlockStorage` per sub chunk. A sub chunk whose palette never grows past air is
  left out, which is what the per-block fill did by never writing into it.
  
  `recordBiomes` resolved each sub chunk's sixty-four biome cells and then spelled them out over
  4096 single-block writes, which expanded the section to 8 KiB on the first cell that disagreed
  even when it would pack straight back down. It now hands the section over whole through the new
  `ChunkBiomes.setSection`, so a section whose cells all agree stays one number.
  
  Measured on one overworld column, best of five rounds of twenty-five: the block fill went from
  3.17 ms to 0.10 ms and the biome fill from 1.57 ms to 0.35 ms, where the biome figure is the
  mixed-section worst case. The output is unchanged; the generation corpus regenerates block for
  block and biome for biome.
  
  This is the main thread's share of a chunk, so it is what caps a generator that hands work to a
  worker pool: at 100 chunks a second the old shape spent close to half a core doing nothing but
  receiving.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`d6dfe5f`](https://github.com/JSPrismarine/JSPrismarine/commit/d6dfe5f1253fb72b166e7724b89576748722c840) Thanks [@filiphsps](https://github.com/filiphsps)! - Drain in-flight chunk deliveries and close the per-dimension entity runtimes during server shutdown, so a chunk still generating cannot land in a world mid-teardown and the runtimes' live bodies are released.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`96e5752`](https://github.com/JSPrismarine/JSPrismarine/commit/96e575293aa8e95bce8aebdfa416d145e1d670e3) Thanks [@filiphsps](https://github.com/filiphsps)! - `Chunk.setBlock` now places the state the `Block` carries. It resolved the runtime id by name alone, so a block with a non-default state, such as a log lying along x, was stored as its default state.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2e922ce`](https://github.com/JSPrismarine/JSPrismarine/commit/2e922ce3b1e06c27fbcfac65d2d01a977f2e5ccc) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement the data-driven target-nearby sensor

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`98f7eb0`](https://github.com/JSPrismarine/JSPrismarine/commit/98f7eb0693663780eca418293c39eaef4835e04a) Thanks [@filiphsps](https://github.com/filiphsps)! - Wind the portal cooldown back on every tick an entity stands in a portal, as Java's `Entity.setAsInsidePortal` does, and hold a player's cooldown while their client is still loading into the last dimension change. A traveler who arrives inside the destination portal is no longer sent straight back; the trip back needs leaving the portal for the whole cooldown and stepping back in.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`efbec44`](https://github.com/JSPrismarine/JSPrismarine/commit/efbec44c0f4048789f80d37dada672d757591c61) Thanks [@filiphsps](https://github.com/filiphsps)! - Draw random ticks only for the sections Java draws for, which is `LevelChunkSection.isRandomlyTicking`: a scan of the section's palette rather than a test for an empty sub chunk. A section of solid stone was being drawn for, and because the draw state is one counter shared across the world, every extra draw shifted every position drawn afterwards, so the ticked-position sequence was not Java's. Over 441 simulated chunks the pass went from 3528 sections and about 3.2 ms to 441 sections and about 0.52 ms.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`29ef9eb`](https://github.com/JSPrismarine/JSPrismarine/commit/29ef9eb86e38fa3b3967fe2ac1488c9688a5e3bc) Thanks [@filiphsps](https://github.com/filiphsps)! - Match Java entity pushing by skipping horizontal push impulses for entities with coincident centers.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2df14f8`](https://github.com/JSPrismarine/JSPrismarine/commit/2df14f843bce26edf0b4da6ddc83b1fa2fef323a) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix fish surface placement and forward guardian monument spawn overrides.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8dcafc0`](https://github.com/JSPrismarine/JSPrismarine/commit/8dcafc0df27c1211ef7a243e903f80d5a7d868c2) Thanks [@filiphsps](https://github.com/filiphsps)! - Let a command fill a container block.
  
  `/loot insert` refused with "this server has no container block entities", which stopped being
  true once a chunk started keeping a block's `Items`. The roll goes into the block at the named
  position, growing a matching stack before it opens an empty slot, which is Java's
  `LootCommand.insertIntoContainer` step for step. A stack that only half fits puts in the half, and
  the reported count is the half. The command refuses by position when nothing standing there stores
  anything, and refuses when the container is full.
  
  `/replaceitem block <pos> slot.container <n>` is Mojang's other two overloads of a command that
  only had the entity pair here, and `/loot replace block` reaches the same slots through Java's
  `container.N` spelling. `BLOCK_EQUIPMENT_SLOTS` is the one value Mojang's `BlockEquipmentSlot`
  enum holds.
  
  `/replaceitem entity @s slot.enderchest <n>` writes the ender chest, which is a container this
  server has always carried for a player and never let a command name, and `slot.armor <n>` reads as
  the four named armor slots it is Bedrock's other spelling of.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`af7c3fb`](https://github.com/JSPrismarine/JSPrismarine/commit/af7c3fb379ae8a76c488bb5bb282ca482995acc8) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep a stack's enchantments, durability, name, lore and contents in a block container. `ItemDrop`
  was `{ identifier, count }` and a container's slots are drops, so a player who put an enchanted,
  damaged or anvil-named pickaxe into a chest got a plain one back. The same drop is what a block
  break, a loot roll and a piston move carry, so the loss showed up wherever a stack passed through a
  block.
  
  `ItemDrop` now also carries `meta`, `damage`, `customName`, `lore`, `enchantments` and the
  `contents` of a container item, and every seam that produces or consumes one carries them with it.
  A container block entity writes them into Bedrock's own item compound through
  `inventory/itemNbt.ts`, which is now the one statement of that compound: the player codec writes
  its stacks through the same module, so a chest and a player's inventory keep the same things and a
  chest this server wrote is still a chest a vanilla tool reads. Enchantments go out twice for the
  reason the player codec already gave, Bedrock's numbers under `ench` and the Java ids beside them,
  because `ench` has no number for Sweeping Edge or for a datapack's enchantment.
  
  A rolled loot stack keeps what Java's table put on it. The three callers that roll a table, a block
  break, a mob death and `/loot`, read the id and the count and dropped the data components, so an
  enchanted book out of a chest table arrived unenchanted.
  
  A shulker box now survives being broken. It already refused to spill its contents, and kept them
  nowhere: the block entity died with the block. The box leaves on the ground carrying its slots,
  through the family's own drop and through the `copy_components` in Java's shulker box table alike,
  and putting it back down puts the items back in it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`15d9ef5`](https://github.com/JSPrismarine/JSPrismarine/commit/15d9ef53713b4a62a0a4b15c7882c0014e2193ae) Thanks [@filiphsps](https://github.com/filiphsps)! - Drop the content checks that nothing can make true. Removing the `content-packs` flag made
  `Server.getContent()` return a build or throw, so three guards against a server without content
  became unreachable: the `content === undefined` early return in `blockBreak.ts`, the random tick
  ternary in `WorldManager.buildWorld`, and the undefined content `loadServerFunctions` and
  `functionContentOf` accepted. `BreakWorld` and `DestroyWorld` no longer type `getContent()` as
  optional. No behavior changes; none of these modules is exported from the package entry point.
  
  Roughly fifteen comments still described the flag, most of them some form of "X is undefined while
  `content-packs` is off". Each now says what X is and when it can still be absent. A further set
  named classes the entity deletion removed: `OldVillager`, `spawnableEntities`, `Mob`,
  `Mob.applyKnockback`, `Mob.pushFromNeighbors` and `Mob.lootState`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4ebf807`](https://github.com/JSPrismarine/JSPrismarine/commit/4ebf807cb8ce8e1cbf6b1d85d204f072a55f7b5a) Thanks [@filiphsps](https://github.com/filiphsps)! - Dispatch scheduled block and liquid ticks through resolved content hooks before engine fallbacks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`59a3e5c`](https://github.com/JSPrismarine/JSPrismarine/commit/59a3e5c5b910027bcb07b47ed65faa177a2c8d98) Thanks [@filiphsps](https://github.com/filiphsps)! - Handle matching spawn eggs through the spawn_egg_interaction component hook.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5f40641`](https://github.com/JSPrismarine/JSPrismarine/commit/5f406411e3ccde1c42207e66949b5c93429ffccb) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix piston orientation and redstone dust placement

- [#2630](https://github.com/JSPrismarine/JSPrismarine/pull/2630) [`e691108`](https://github.com/JSPrismarine/JSPrismarine/commit/e6911086602b51e05bcfe603a60f41b577826555) Thanks [@filiphsps](https://github.com/filiphsps)! - Index player chunk coverage with per-chunk refcounts

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`24af483`](https://github.com/JSPrismarine/JSPrismarine/commit/24af4832d20a66b9b1bee769cdbc4ca7fd1be47d) Thanks [@filiphsps](https://github.com/filiphsps)! - Project ground-input, dash, free-camera, and vertical movement components to Bedrock actor metadata.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3a673cf`](https://github.com/JSPrismarine/JSPrismarine/commit/3a673cf89f9c11a8c3ba503c7a62dfc21ca1b5b0) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven entity teleport behavior

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`30133b3`](https://github.com/JSPrismarine/JSPrismarine/commit/30133b3bed6188e6bc9fd8222361bc5ff7b8c2d8) Thanks [@filiphsps](https://github.com/filiphsps)! - Send the player's inventory under window 0 after opening a crafting table, which is what a Bedrock
  Dedicated Server 1.26.52 sent after a click on one. The other workstations still send only their
  open, since none of them was recorded.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`23bfa3d`](https://github.com/JSPrismarine/JSPrismarine/commit/23bfa3dcd39e963d7cc41aef68a7be74e4d4a06a) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply Java's creative and spectator combat target rules, including releasing targets when players change modes.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`931294b`](https://github.com/JSPrismarine/JSPrismarine/commit/931294b82cad6bc2ed4d65a68c36e3c7c560bf00) Thanks [@filiphsps](https://github.com/filiphsps)! - Register the charged creeper marker and project its powered actor flag.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`82679b5`](https://github.com/JSPrismarine/JSPrismarine/commit/82679b595802f95dd7012e756215776ee1883a81) Thanks [@filiphsps](https://github.com/filiphsps)! - Aim entity AI at entity eye positions

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9f58b70`](https://github.com/JSPrismarine/JSPrismarine/commit/9f58b7012e39f08ef869149252312f3617c5d057) Thanks [@filiphsps](https://github.com/filiphsps)! - Dispatch entity home-block events through block behavior hooks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a1f3237`](https://github.com/JSPrismarine/JSPrismarine/commit/a1f32376b2f3071ff3c07636368552224bf1ea9e) Thanks [@filiphsps](https://github.com/filiphsps)! - Project `minecraft:can_power_jump` to the Bedrock actor metadata flag.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`440e164`](https://github.com/JSPrismarine/JSPrismarine/commit/440e164b88f43548c9c4fe8ae896387157f21701) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose merged Java datapack tag memberships on resolved block and item types.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`e1a3387`](https://github.com/JSPrismarine/JSPrismarine/commit/e1a3387f7fa1402ed15cef241344cf3432d35103) Thanks [@filiphsps](https://github.com/filiphsps)! - Finish wiring custom dimension types (Bedrock ids 1000 and up). A custom dimension's chunk payload is sent at the bounds `DimensionData` declared instead of padded to the Overworld's, the player record carries its `DimensionId` and `SpawnDimension` through the level's types, and the content adapter reads its bounds and sky light from the live world's type.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`426a6a9`](https://github.com/JSPrismarine/JSPrismarine/commit/426a6a95440a6f5fdf70e32c4042cbe4516f7385) Thanks [@filiphsps](https://github.com/filiphsps)! - Cache block solidity in the Java block oracle

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bf9bb09`](https://github.com/JSPrismarine/JSPrismarine/commit/bf9bb0905c5278e4ffc2fd88a7eebe62db6c7ea3) Thanks [@filiphsps](https://github.com/filiphsps)! - Project vanilla actor marker components to client metadata.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c0ccdfe`](https://github.com/JSPrismarine/JSPrismarine/commit/c0ccdfeb805c0869006d380408dc74f84496ddaf) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement angry component broadcasts with nearby filters and target propagation.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4a64815`](https://github.com/JSPrismarine/JSPrismarine/commit/4a64815dde3f78a206a0f69594dafb3853f0ce75) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix console input, logs, source links, and overlay dismissal

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ee83909`](https://github.com/JSPrismarine/JSPrismarine/commit/ee83909459951c39b8e44e48a80c2e1848741f49) Thanks [@filiphsps](https://github.com/filiphsps)! - Use `minecraft:shareables` surplus and wanted amounts when entities share inventory.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`6a0152a`](https://github.com/JSPrismarine/JSPrismarine/commit/6a0152a838c7779872c35c9f46f8dbd02a27e44b) Thanks [@filiphsps](https://github.com/filiphsps)! - Generate the `minecraft:debug` world instead of refusing it. A stem of that kind now lays every
  state of the content palette out as Java's `DebugLevelSource` does: one state every two blocks
  at y 70, `ceil(sqrt(count))` per row with z fastest, over a barrier floor at y 60, all in plains.
  The states come from `content.blocks.states` in runtime id order, so grid index `i` shows palette
  runtime id `i`; a state the block state catalog has no schema for is left as air and reported
  once. Building a debug stem for a dimension whose bounds miss y 60 to 70 throws at build time.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`645f70d`](https://github.com/JSPrismarine/JSPrismarine/commit/645f70d1f1a8d75175d7da550886185b01603eaf) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply buoyancy from entity data

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`71f0d47`](https://github.com/JSPrismarine/JSPrismarine/commit/71f0d4700e6306531957764d77e8ef11496cd9ec) Thanks [@filiphsps](https://github.com/filiphsps)! - Answer a command typed while the start region is still generating.
  
  `WorldManager` named the default world after `World.enable` resolved, and enabling a world
  generates its start region, so at `preload-radius: 24` there were minutes in which
  `getDefaultWorld()` answered `undefined` while its type said `World`. The console reads commands
  for that whole window, and every command path asks for the default world, if only for the
  `sendCommandFeedback` game rule, so anything typed came back as `TypeError: Cannot read properties
  of undefined (reading 'getGameRuleManager')`.
  
  The world is named as the default when it is built, before it is enabled. Nothing about it is
  missing at that point except its terrain: it has its name, its provider and its game rules, which
  is what its callers ask it for. `WorldManager.loadWorld` keeps its signature and its behavior.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3ce20e2`](https://github.com/JSPrismarine/JSPrismarine/commit/3ce20e248ddf68967062a79a0b5766bf8ac4fa8c) Thanks [@filiphsps](https://github.com/filiphsps)! - Run every destroyed block through one path.
  
  A blast, a stream of water, a piston, fire and a falling block each took blocks out with a rule
  of their own, and none of them raised the block's `onBreak`. A chest the TNT caught kept its
  contents, a double chest left its other half paired to air, and what fell was a hardcoded copy
  of the block rather than Java's loot table.
  
  `WorldAccess` gains `destroyBlock`, which the host answers by running the same path a player's
  break takes: the hook before the write, then the roll with whatever the caller knows, the blast
  radius for an explosion and nothing at all for a plank the fire burned. It also gains
  `moveBlock`, so a pushed block carries its block entity instead of being written twice and
  arriving empty. `WorldAccess.spawnItem` is gone with them.
  
  `World` now raises `onNeighborChanged` for every block write rather than only for the content
  adapter's own, so a torch whose support a command or a generator removed finally hears about it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2c459cd`](https://github.com/JSPrismarine/JSPrismarine/commit/2c459cd2ab8822f0364c1ce8e473cf0487b294a8) Thanks [@filiphsps](https://github.com/filiphsps)! - Project Java tool rules to Bedrock digger data

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5475940`](https://github.com/JSPrismarine/JSPrismarine/commit/5475940764475364919cf62452b528867e9d6b81) Thanks [@filiphsps](https://github.com/filiphsps)! - Write a chest's pair under Bedrock's own `pairx`, `pairz` and `pairlead` tags. The
  `jsprismarine:container` family records the other half under `pairedWith`, which travels under
  this project's own JSON tag, so the client was never told the two blocks were one chest: a double
  chest was 54 slots on the server and 27 on the screen.
  
  `blockEntityRecord` also reads the pair back off those tags when the record has none of its own,
  so a double chest the game itself paired is a double chest here without being paired again.
  `pairlead` goes on the half with the lower `x` and then `z`, which is the half the server orders
  the 54 slots from.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`2ef86ec`](https://github.com/JSPrismarine/JSPrismarine/commit/2ef86ec634ca96b0649e2b7822cc4c06d17ee5ca) Thanks [@filiphsps](https://github.com/filiphsps)! - Killing the ender dragon now opens the End's exit portal. The fight re-places the podium with end portal blocks in its ring, drops the dragon egg on a world's first kill, places an end gateway at Java's 96-block ring from the seed-shuffled index list, and pays the kill's experience (12000 points first, 500 after) as xp_orb drops plus a direct award to the killer. Clients also hear the dragon's death hold begin through an actor event.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`71d4e97`](https://github.com/JSPrismarine/JSPrismarine/commit/71d4e976b8f892c0d6d7645f4461dc15a35cad8c) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop a shutdown waiting on terrain it is about to throw away.
  
  `World.disable` stopped the preload at its next batch boundary, and a batch is thirty-two chunks
  asked for in one turn and answered one at a time, so the shutdown waited out whichever batch it
  landed in. Measured in a terminal at `preload-radius: 24`, with one Ctrl+C eight seconds into the
  preload: the preload ran for another 22.5 s and the process exited 29.8 s after the keypress.
  
  `Generator.stopGenerating` is new and optional. `GeneratorManager` registers it with
  `Server.releaseOnShutdown`, so it runs at the top of a shutdown before anything is awaited.
  `DataDrivenGenerator` reads it where a request reaches the front of its queue, so the chunk it is
  generating finishes and every request behind that one rejects with `GenerationStopped`. The start
  region counts those as chunks it did not prepare and stops inside the batch rather than at the end
  of it. The same keypress now stops the preload in 1.6 s and exits in 2.3 s.
  
  A chunk is never persisted half built. `LevelDB.readChunk` hands a generated chunk straight back
  without writing it, `World.loadChunk` only puts it in the world's map once generation has returned,
  and the shutdown's save walks that map, so a refused chunk is one the world never had.
  
  An interrupted spawn search now leaves the spawn unresolved instead of taking the fallback.
  `findSurfaceSpawn` answers with the origin for a world that has no dry land within range, and
  `World.enable` reads the saved spawn back on the next start, so writing the fallback for a search
  that was cut short would have made one dev restart permanent.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d231208`](https://github.com/JSPrismarine/JSPrismarine/commit/d231208b7ed03ea5f62f14a2f72741881b57f128) Thanks [@filiphsps](https://github.com/filiphsps)! - Route observer pulses through block family hooks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a2f93a1`](https://github.com/JSPrismarine/JSPrismarine/commit/a2f93a166aca94ab3cf95d086203693b143843a7) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip breeding partner searches when active entity data makes the entity ineligible.

- [#2615](https://github.com/JSPrismarine/JSPrismarine/pull/2615) [`ca2affb`](https://github.com/JSPrismarine/JSPrismarine/commit/ca2affbec3a61b1177fd73fcd46aecb6c154be1c) Thanks [@filiphsps](https://github.com/filiphsps)! - Add verbose tick lag diagnostics

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`f7759cc`](https://github.com/JSPrismarine/JSPrismarine/commit/f7759cca7ad8ea0db6630e15ffbf3e51d0f85c80) Thanks [@filiphsps](https://github.com/filiphsps)! - Complete the End dragon's four-crystal respawn sequence and validate crystal placement.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`985c08e`](https://github.com/JSPrismarine/JSPrismarine/commit/985c08e1f93cbb557a8ce8be02fb2e0a04587f31) Thanks [@filiphsps](https://github.com/filiphsps)! - Drive baby growth from ageable feed item data and honor configured result items.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4f1535f`](https://github.com/JSPrismarine/JSPrismarine/commit/4f1535fb608b5afacb2ecd64495b2d4eb0597e41) Thanks [@filiphsps](https://github.com/filiphsps)! - Route supported legacy entities added to a world through the data runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`51f59f2`](https://github.com/JSPrismarine/JSPrismarine/commit/51f59f219e849006663d3a1c58e37bb480917c57) Thanks [@filiphsps](https://github.com/filiphsps)! - Speed up feature-region copies by precomputing air palette slots.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d19be92`](https://github.com/JSPrismarine/JSPrismarine/commit/d19be9216143a40fb546b24d3f4a6196c326508e) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix ground navigators treating floatable water as vertical swim paths

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`5f68f77`](https://github.com/JSPrismarine/JSPrismarine/commit/5f68f77ef90cbf6dd18074397120c81bf46c406e) Thanks [@filiphsps](https://github.com/filiphsps)! - Generate the end city. `minecraft:end_city` was one of the two structure types with no builder,
  so a world's End had its placement computed and nothing placed. The builder is Java's
  `EndCityPieces` read from the 26.3 jar: the house tower, the tower generator with its bridges,
  the fat tower, the depth limit of 8, the batch collision rule, and the one ship a city may hang
  under a bridge. Chests under a `Chest` marker roll `minecraft:chests/end_city_treasure`, a
  `Sentry` marker stands a shulker, and an `Elytra` marker hangs the elytra in a `minecraft:frame`
  block, since Bedrock keeps an item frame as a block. A generated item frame's held stack,
  rotation and drop chance now reach the chunk's `ItemFrame` block entity. `fortress` is the one
  structure type left without a builder.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`bdbbe5e`](https://github.com/JSPrismarine/JSPrismarine/commit/bdbbe5e2e99c163f4dc944874f4d01773de91963) Thanks [@filiphsps](https://github.com/filiphsps)! - Roll the end credits once on a player's first exit through the End's portal. The transfer waits
  for the client's `ShowCredits Finished` reply, then runs the dimension change to the respawn
  point as a respawn; a player who has seen the credits transfers at once. The flag persists as
  Bedrock's `HasSeenCredits` on the player record, and Java's `seenCredits` tag is read as the
  fallback.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`90dd213`](https://github.com/JSPrismarine/JSPrismarine/commit/90dd213563a3fa749bcc7e6d6aebf571097fb8dd) Thanks [@filiphsps](https://github.com/filiphsps)! - Give the end crystal and the ender dragon their runtime behavior. A spawn can carry a beam target, base-plate visibility and invulnerability, which reach the client as the `BLOCK_TARGET` and `SHOW_BOTTOM` actor data and persist with the actor record. A killing hit's zero-fuse `minecraft:explode` now runs before removal, so a hit crystal explodes at power 6 without fire, while a crystal an explosion destroyed does not explode again. The dragon takes damage under Java's rules: only players and explosions count, and a body hit lands at a quarter of the amount plus the amount capped at one.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`1a5d3ea`](https://github.com/JSPrismarine/JSPrismarine/commit/1a5d3eaadc30e8292ce442b79244f7f17f2bd221) Thanks [@filiphsps](https://github.com/filiphsps)! - The End world now runs a persistent dragon fight. While a player is in the arena it places the
  exit podium on first contact, spawns the ender dragon at (0, 128, 0) when one should exist, shows
  the boss bar to players within 192 blocks with its percent following the dragon's health, and
  heals the dragon from nearby end crystals. The fight state persists in the world save and
  survives a restart.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`a8b30b9`](https://github.com/JSPrismarine/JSPrismarine/commit/a8b30b91030d5b8f9b4ab1c5f3f89acf9978424f) Thanks [@filiphsps](https://github.com/filiphsps)! - Derive the End's ten spike pillars from the world seed when the `end_spike` configuration lists none, as vanilla's `"spikes": []` asks. `FeatureWorld.spawnEntity` now takes an options object carrying the yaw and the crystal's beam target, base plate and invulnerability instead of a bare yaw, which is a breaking signature change for worlds that implement it; the generator's region adapter records the yaw as before.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`865a8a1`](https://github.com/JSPrismarine/JSPrismarine/commit/865a8a1651e238846603a3a0713f80f2fb0ec343) Thanks [@filiphsps](https://github.com/filiphsps)! - Generated End chunks hand their crystal spawns to the entity runtime whole. The generation
  region records the beam target, base plate flag and invulnerability a feature asked for, the
  spawn keeps them across the worker boundary and through the chunk's pending entity list, and
  `World.createGeneratedEntities` passes them into `EntityRuntime.spawn`. A freshly generated End
  pillar's crystal therefore spawns vulnerable with no beam, which is Java's worldgen
  configuration, instead of losing the options on the way to the world.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`97fde37`](https://github.com/JSPrismarine/JSPrismarine/commit/97fde374f2812e33f4b6a71bbbcf268b78963700) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply entity attack protection and attacker exception filters from entity data.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`03e6df9`](https://github.com/JSPrismarine/JSPrismarine/commit/03e6df9845bc83a24309e667bb10a7bcd17c2d88) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply lethal entity events before removal and finish the data-defined Ender Dragon death behavior.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`0fdd2c5`](https://github.com/JSPrismarine/JSPrismarine/commit/0fdd2c5a5258d602337ace508e8c588978a2daf9) Thanks [@filiphsps](https://github.com/filiphsps)! - Track portal contact and the cooldown after a dimension change on every entity, and persist
  the cooldown. `PortalContact` is Java's `PortalProcessor`: the time inside a portal climbs by
  one per tick the entity touches it and drops by four per tick outside, and the trip fires when
  it reaches 80 ticks for a player, 0 in creative and 0 for anything else. `Entity` gains
  `touchPortal`, `portalContact`, `getPortalCooldown`, `setPortalCooldown` (300 ticks for an
  entity, 10 for a player) and `isOnPortalCooldown`, with the countdown in `Entity.update`.
  
  Actor NBT now carries Bedrock's `PortalCooldown` and `DimensionId` tags, and a player record
  carries `PortalCooldown` beside its other Bedrock fields and `portalCooldown` in
  `WorldPlayerData`. Nothing dispatches a trip yet; the timers are in place for portal travel to
  read.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`82aa881`](https://github.com/JSPrismarine/JSPrismarine/commit/82aa881f1b8820c11f52791a526935cb2b63268b) Thanks [@filiphsps](https://github.com/filiphsps)! - Persist fallback projectile velocity across actor restores

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`f30ee68`](https://github.com/JSPrismarine/JSPrismarine/commit/f30ee68017fdcb4360756d1b2c57f0b8bb578c3e) Thanks [@filiphsps](https://github.com/filiphsps)! - Accept a namespaced dimension id in `/execute in` and `execute if dimension`. `minecraft:the_nether` and a custom `mypack:skylands` were both prefixed with a second `minecraft:`, so only the bare vanilla names resolved. The dimension argument now suggests the host's loaded dimensions, and the Java `minecraft:dimension` parser keeps the Bedrock `Dimension` enum in the command packet.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3d89810`](https://github.com/JSPrismarine/JSPrismarine/commit/3d89810e3456d9c9108e1b33535197d2bab4786e) Thanks [@filiphsps](https://github.com/filiphsps)! - Cast Java's explosion rays instead of clearing a sphere.
  
  `@jsprismarine/engine-systems` gains `explode`, a transcription of `ServerExplosion` from the
  pinned 26.3 jar: 1352 rays off the surface of a 16 by 16 by 16 grid, each starting at
  `radius * (0.7 + random * 0.6)` and losing `(blastResistance + 0.3) * 0.3` per block it crosses and
  0.22500001 per 0.3-block step. The blocks behind a wall now survive, a one-block moat tames TNT,
  and the crater is the irregular shape vanilla's is. Entity damage comes off
  `getSeenPercent`, which grades cover by sampling a grid of rays over the entity's box, and
  knockback reads `EXPLOSION_KNOCKBACK_RESISTANCE`.
  
  The server no longer holds its own model. `entity/Explosion.ts` and the data-driven runtime's
  `explode` both call the package, so a creeper destroys terrain where it used to leave the hole for
  later, and every block a blast takes out is rolled through its Java loot table with the
  `explosion_radius` parameter that `survives_explosion` and `explosion_decay` turn into a `1 / radius`
  chance.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`9355c0f`](https://github.com/JSPrismarine/JSPrismarine/commit/9355c0f65405075576b0e423e544d2e14b854bb1) Thanks [@filiphsps](https://github.com/filiphsps)! - Throw an eye of ender toward the nearest stronghold. `WorldActions` gains an optional `locate` query and the `locate` action becomes a `signal` action carrying the stack and the point to fly to, which removes `LocateAction` from the public union. The server answers the query through its structure search, spawns a written `EyeOfEnderSignal` that flies as Java's does and drops or shatters after eighty ticks, and offers a right click on nothing to the item in hand's `onUse`.

- [#2636](https://github.com/JSPrismarine/JSPrismarine/pull/2636) [`3c5b159`](https://github.com/JSPrismarine/JSPrismarine/commit/3c5b159feaed77fe20e34b94a6d1e557adb77796) Thanks [@filiphsps](https://github.com/filiphsps)! - Accept client camera aim assist packets without a handler error. Aim assist activation is not applied because the server does not implement camera presets.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f94da48`](https://github.com/JSPrismarine/JSPrismarine/commit/f94da4841180543ba50be440c4bc796a8a472fcb) Thanks [@filiphsps](https://github.com/filiphsps)! - Enforce the cooldown and post-damage cooldown declared by `minecraft:interact`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`701c6e7`](https://github.com/JSPrismarine/JSPrismarine/commit/701c6e7e83b91ae2eaa8aa2bbadbf049c6ef75cf) Thanks [@filiphsps](https://github.com/filiphsps)! - Load falling blocks from entity data and simulate their configured fall and landing behavior through the live entity runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`6237d25`](https://github.com/JSPrismarine/JSPrismarine/commit/6237d2570ef950f83dcc0111de283340ff35aca3) Thanks [@filiphsps](https://github.com/filiphsps)! - Move tameable item behavior into component hooks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3ffaf09`](https://github.com/JSPrismarine/JSPrismarine/commit/3ffaf0908a2cfcf4b8b23ba3d65be382a74b344a) Thanks [@filiphsps](https://github.com/filiphsps)! - Avoid allocating an async callback and promise for every unchanged entity attribute flush.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`fd43ade`](https://github.com/JSPrismarine/JSPrismarine/commit/fd43ade59e80f19e3e7ef994ca80adb15e1f7907) Thanks [@filiphsps](https://github.com/filiphsps)! - Make fire tick on a running server, and gate it on the 1.21.11 game rule.
  
  `Engine.setBlockAndUpdate` raised the six neighbor updates and the extra ones a signal source
  reaches with, and stopped. Nothing ran the work a block's own `onPlace` does, which is the work
  that reads the world the new block landed in rather than telling the world about it. Three
  systems were dead because of it: fire never got the first of the ticks that spread it and burn it
  out, so placed fire sat where it was lit; dust placed beside a live lever stayed dark; and a
  piston placed into a position something already powered never extended. `runPlacementUpdates` now
  runs `FireBlock.onPlace`, `RedstoneWireBlock.onPlace` and `PistonBaseBlock.onPlace` alongside the
  fluid's, and `createTestEngine` wires a notifying write back through `setBlockAndUpdate` so the
  package's own harness behaves like the server.
  
  `fireTick` takes an options record in place of its `increasedBurnout` flag, and its new `spreads`
  is Java's `ServerLevel.canSpreadFireAround`: false stops the tick after it has booked the next
  one, so the fire keeps its place in the tick list and does not even go out. `EngineOptions`
  gains `canSpreadFireAround` for the host to answer it.
  
  The host's answer is `minecraft:fire_spread_radius_around_player`, which 1.21.11 folded
  `doFireTick` and `allowFireTicksAwayFromPlayer` into. It is an integer with a default of 128 and
  a minimum of -1, read out of `GameRules.class` in the pinned 26.3 jar: -1 lifts the limit, and
  anything else is a euclidean distance from the block to the nearest non-spectating player. Mojang's
  own `GameRuleRegistryFix` converts the two booleans a Bedrock world still spells, so `doFireTick`
  off is 0, which no player is ever inside. `gameRuleValue` is the registry-resolved read the content
  adapter already did inline, now shared with the world code that reads a rule outside it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ed61075`](https://github.com/JSPrismarine/JSPrismarine/commit/ed61075a07b79baaad7c47b6200787149f0dfd98) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix operator command checks to use player UUIDs.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cff77f9`](https://github.com/JSPrismarine/JSPrismarine/commit/cff77f916a323f757a957f5b2b1a5c989b989f61) Thanks [@filiphsps](https://github.com/filiphsps)! - Fire five more advancement triggers, taking the count from 12 of 58 to 17. Each is raised from the
  place that knows the event rather than from a helper nothing calls.
  
  `consume_item` comes from the `feed` action in the item actor port, which is where
  `minecraft:consumable` lands. It is the whole of `husbandry/root`, whose single criterion has no
  conditions at all, so the first thing a player eats opens that branch of the tree.
  
  `item_durability_changed` comes from the `consume-durability` action beside it, reporting the
  durability left and the amount lost.
  
  `any_block_use`, `default_block_use` and `item_used_on_block` come from `useItemOnBlock`.
  `any_block_use` is raised for every interaction with a block, `default_block_use` only when the
  block's own behavior or its screen took the click, and `item_used_on_block` when the item in hand
  did, which is the one of the three whose conditions see the tool.
  
  The remaining 41 have no call site because the subsystem that would know the event does not exist:
  no status effects, brewing, beacons, fishing, breeding, taming, riding, trading, shearing,
  sleeping, recipe book or container loot generation.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`ef7ed80`](https://github.com/JSPrismarine/JSPrismarine/commit/ef7ed800b96bf9fa0807cf745af1289b627c5770) Thanks [@filiphsps](https://github.com/filiphsps)! - A `minecraft:flat` level stem may name a `worldgen/flat_level_generator_preset` id in place of
  its settings object, as Java's `world_gen_settings` allows. `parseGeneratorDefinition` keeps the
  id as a `FlatPresetGeneratorDefinition`, the `minecraft:flat` factory resolves it through the pack
  stack's preset registry and reads the document's `settings`, and the save writes the stem back
  as the id. `isFlatGenerator` narrows to a stem that carries its layers, so the `level.dat` flat
  layers and the announced biome are written only when the layers are in the stem.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`276ebd1`](https://github.com/JSPrismarine/JSPrismarine/commit/276ebd1a17e2876e128b41321145a816df6e8918) Thanks [@filiphsps](https://github.com/filiphsps)! - Move redstone placement updates and piston movement into data-driven block families

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0d68a9d`](https://github.com/JSPrismarine/JSPrismarine/commit/0d68a9d3e2446e7acb8dd1af7b44e6b9e3a59fc1) Thanks [@filiphsps](https://github.com/filiphsps)! - Persist data-driven leash relationships

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`b076d13`](https://github.com/JSPrismarine/JSPrismarine/commit/b076d137dfddecede750cd4f8951f387e07dc3e5) Thanks [@filiphsps](https://github.com/filiphsps)! - Generate the nether fortress. `minecraft:fortress` has a builder that reproduces Java's
  `NetherFortressPieces`: the bridges, crossings, stairs and blaze thrones grown from the bridge
  weight table, the castle corridors, turns, balconies and nether wart rooms grown from the castle
  table, and the bridge end fillers that close an exit nothing else fits. The layout matches the
  pieces Java lays out for the same seed, and the chests roll the `nether_bridge` loot table.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0fac2d7`](https://github.com/JSPrismarine/JSPrismarine/commit/0fac2d7fc478d9044b24d11d9693048261c7655d) Thanks [@filiphsps](https://github.com/filiphsps)! - Persist tamed entity owners by player UUID across restarts.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1d905e2`](https://github.com/JSPrismarine/JSPrismarine/commit/1d905e27de007bc64a3f8c4f3c87c46955573e2a) Thanks [@filiphsps](https://github.com/filiphsps)! - Normalize legacy entity offspring data at type resolution and use the canonical component at runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5a24de0`](https://github.com/JSPrismarine/JSPrismarine/commit/5a24de0c7b3f7cfeab3a6fad1ad7c9a8be800a32) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the weather. `EngineWorld` hardcoded `clear` and `isRainingAt` to false, so two branches of fire spread could never be reached: rain never put a fire out and never stopped it spreading. A world now steps `@jsprismarine/engine-systems`' cycle every tick under the `doWeatherCycle` game rule, keeps the five counters in `level.json` so a shower survives a restart where it left off, and sends the four level events, repeating the current state once a second so a player who just joined sees the rain they are standing in.
  
  `World.isRainingAt` is Java's: it has to be raining and the position has to see the sky, which the light engine already answers per block. `World.setWeather(kind, durationTicks)` is the seam `/weather` needs, with Java's own randomized default duration per kind.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e1fa71b`](https://github.com/JSPrismarine/JSPrismarine/commit/e1fa71b106f78a928779d5eaec35dfca2445ceed) Thanks [@filiphsps](https://github.com/filiphsps)! - Reduce the cost of ordering data-driven entity neighbor searches.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`83b0493`](https://github.com/JSPrismarine/JSPrismarine/commit/83b049364b3c6137f74a7eb1a808a14e692eeeae) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix side fire updates and piston arm replication

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c4d8fef`](https://github.com/JSPrismarine/JSPrismarine/commit/c4d8fefb900caa1e67d6d6aca4a5cb1aedc31f25) Thanks [@filiphsps](https://github.com/filiphsps)! - Throttle process title refreshes to every five seconds.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b503085`](https://github.com/JSPrismarine/JSPrismarine/commit/b503085d2c068c27dbb4087e00e3e1a12a42e384) Thanks [@filiphsps](https://github.com/filiphsps)! - Use the declared default for underwater movement

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4a64815`](https://github.com/JSPrismarine/JSPrismarine/commit/4a64815dde3f78a206a0f69594dafb3853f0ce75) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve console dashboard, TPS graph, and severity indicators

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3898407`](https://github.com/JSPrismarine/JSPrismarine/commit/3898407bcfaa4c029a7a8fa2c82d7ef7dfbef6a0) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the autosave alongside the tick rather than inside it. `World.update` awaited `save()`, and `Server.tick` installs the next tick's timer only once `update` has resolved, so the whole server stopped for as long as the save took. On a fresh Overworld whose 441 start region chunks are all dirty that was 1586 ms in one tick, close enough to the loop's 2000 ms catch-up limit that a loaded host crossed it and reported ninety skipped ticks. The tick now starts the save and moves on, which is what lets the existing `setImmediate` yields in `saveChunks` reach the tick loop instead of only the socket. Writing those chunks still takes about 1500 ms of wall time, but it is spread across ticks: over the same 70 second window the worst tick fell from 1586 ms to 59 ms and the world held 20.00 TPS.
  
  A save already running when the next falls due is skipped rather than queued, so two passes cannot write the same chunks at once and race on `Chunk.markSaved`. `World.save` waits for whatever the tick started before writing anything of its own, so a shutdown still finishes every outstanding write before it closes the provider.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`67546be`](https://github.com/JSPrismarine/JSPrismarine/commit/67546bec49a4f299b2be9b54b10a7d42865884a9) Thanks [@filiphsps](https://github.com/filiphsps)! - Support entities spawned by minecraft:interact

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7b580cf`](https://github.com/JSPrismarine/JSPrismarine/commit/7b580cf8c3355078fd50df0d1de3de51e2ad0ee0) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep player chunk generation from blocking server ticks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`542da3b`](https://github.com/JSPrismarine/JSPrismarine/commit/542da3b62a4895905847cd14c0952a97d254d472) Thanks [@filiphsps](https://github.com/filiphsps)! - Read vanilla entity air drag, ground friction, and bounciness from active component data.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`df99e83`](https://github.com/JSPrismarine/JSPrismarine/commit/df99e835455bb704b4763303cc94b0e0519a9cc4) Thanks [@filiphsps](https://github.com/filiphsps)! - Give chunk generation a depth instead of a promise tail.
  
  Every request used to chain onto `pipeline.generationTail`, so the batch of thirty-two the start
  region asks for was strictly sequential: the chunk status ladder's shared-promise path never
  fired in the server, and a worker pool fed through this would sit at a depth of one however many
  workers it had. `GenerationQueue` replaces the tail with an admission depth, which
  `DataDrivenGeneratorOptions.concurrency` sets.
  
  The depth defaults to one, because on one thread building several chunks at once is worse. A 49
  chunk fill at seed 1234, three repetitions with depth one and depth six interleaved so a load
  spike hits both: 36.8 s against 40.3 s best of three, with depth one ahead in all three pairings
  by 9 to 14%. Six half-built chunks hold six feature views and interleave at every terrain yield,
  and they share nothing that holder retention was not already sharing. The number exists to be
  raised when the terrain bodies run in workers, not before.
  
  Shutdown gets stricter and faster. The tail refused a queued request only when the chunk ahead of
  it finished; the queue refuses everything waiting the moment `stopGenerating` is called, and
  refuses a world the generator had never been asked about rather than building its first chunk.
  Because those refusals now arrive at once, the regression test is shaped like
  `World.preloadSpawnRegion` itself, which is the caller that has to catch them: the server runs
  with `--unhandled-rejections=strict`, where a refusal nobody is awaiting ends the process.
  
  `ChunkScheduler.tick` can hold several deliveries open instead of awaiting each in turn, which is
  the other half of what kept a pool one deep. Its depth also defaults to one and is raised
  alongside the generator's, because asking for more while the generator builds one at a time only
  parks them in the generator's queue and makes a tick wait for all of them.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8e0e017`](https://github.com/JSPrismarine/JSPrismarine/commit/8e0e01784136d81b82ed8739ef1e869bb69904c8) Thanks [@filiphsps](https://github.com/filiphsps)! - Translate data-driven entity state into client actor metadata through one shared projector.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8196ea9`](https://github.com/JSPrismarine/JSPrismarine/commit/8196ea9e576d0acc3e17fe6b159791e25dc1092e) Thanks [@filiphsps](https://github.com/filiphsps)! - Honor `minecraft:transient` by excluding those entities from saved actor records.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`302b081`](https://github.com/JSPrismarine/JSPrismarine/commit/302b0818166cbb602e49ce5c1f6d303c56a219eb) Thanks [@filiphsps](https://github.com/filiphsps)! - Route generic mob bodies through the data runtime

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0f11845`](https://github.com/JSPrismarine/JSPrismarine/commit/0f11845495479c8023c0b7bef302d5aca7f12f60) Thanks [@filiphsps](https://github.com/filiphsps)! - Avoid a second map lookup for cached navigation blocks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a4abb61`](https://github.com/JSPrismarine/JSPrismarine/commit/a4abb61b7a03101b4f22ebab35da281066530430) Thanks [@filiphsps](https://github.com/filiphsps)! - Add reusable access to state-specific `minecraft:light_dampening` data. Grass and mycelium now turn to dirt only beneath a dark cover that blocks more than two light levels.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`643103a`](https://github.com/JSPrismarine/JSPrismarine/commit/643103aba792210773961fc394a50306fee79411) Thanks [@filiphsps](https://github.com/filiphsps)! - Respect block occlusion in data-driven entity visibility checks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0036b51`](https://github.com/JSPrismarine/JSPrismarine/commit/0036b510ef096e3300756385a8941b55d01f1826) Thanks [@filiphsps](https://github.com/filiphsps)! - Route entity spawns and legacy restores through the data runtime, correct mob movement speed, and attribute actor sounds

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`62df686`](https://github.com/JSPrismarine/JSPrismarine/commit/62df68684596605007aef673182fc0b5d61d1a1f) Thanks [@filiphsps](https://github.com/filiphsps)! - Run nameable entity behavior through the data-driven runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c8ed1c5`](https://github.com/JSPrismarine/JSPrismarine/commit/c8ed1c5b88953b3f5f1e3ccec99e8de623faeeb2) Thanks [@filiphsps](https://github.com/filiphsps)! - Route redstone torch ticks through block family hooks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f0e1e3a`](https://github.com/JSPrismarine/JSPrismarine/commit/f0e1e3a031d8319f331ab2a95f4e44aedda18c88) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the paged help banner fit its content on narrower screens.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`918f5db`](https://github.com/JSPrismarine/JSPrismarine/commit/918f5dbb0876f076c51e2dc03a21f8db2c634c4e) Thanks [@filiphsps](https://github.com/filiphsps)! - Make `minecraft:can_climb` enable pathfinding and vertical movement on ladders.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2bea6ac`](https://github.com/JSPrismarine/JSPrismarine/commit/2bea6ac82e3a0a100ee254c7e536df73262bef9f) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose mapped Java entity type tag memberships on resolved entity types and live entities.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`68d9737`](https://github.com/JSPrismarine/JSPrismarine/commit/68d97373f077043093e58fb2c7d14275ed127b2d) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop forcing the exit when the host asks a server that is already stopping to stop.
  
  In a plain terminal one Ctrl+C reaches the server child directly, and again as the host's
  `shutdown` message. `RemoteConsole` passed that message on to `Server.shutdown`, which takes a
  second request as an interrupt and forces the exit, so the world save the first one started never
  finished. The console now ignores a shutdown request once the server has begun stopping.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c67300a`](https://github.com/JSPrismarine/JSPrismarine/commit/c67300a6cef6ec68daa9f720bc31c7f238874e01) Thanks [@filiphsps](https://github.com/filiphsps)! - Honor hurt_item in data-driven entity interactions.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0d53afd`](https://github.com/JSPrismarine/JSPrismarine/commit/0d53afdc4b0f42260231d56bbdeb2b4874f8bae7) Thanks [@filiphsps](https://github.com/filiphsps)! - Project entity interaction text to actor metadata

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d647e47`](https://github.com/JSPrismarine/JSPrismarine/commit/d647e4746b3533fbc61afac8414b749a253a32c1) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply data-driven `minecraft:interact.health_amount` effects and expose `is_missing_health` from an entity's health attribute.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b19ef52`](https://github.com/JSPrismarine/JSPrismarine/commit/b19ef529faf720e9c2b6041ef001037707301679) Thanks [@filiphsps](https://github.com/filiphsps)! - Send a stack's enchantments, custom name, lore and durability to the client. `Item.networkSerialize`
  wrote an empty `ItemInstanceUserData` whatever the stack held, so every enchantment the server
  applied, every anvil rename and every lore line was invisible in the inventory. A player enchanted a
  pickaxe, the mining speed went up, and the item looked exactly as it had before.
  
  The user data compound now carries the durability spent as `Damage`, the name and lore under
  `display`, the enchantments as `ench` with the numbers a Bedrock client knows, and what a container
  item holds as `Items`, which is the preview drawn under a shulker box. The `Items` list is written
  by the storage codec's own `itemSlotsToNbt`, so the preview and the world record cannot drift
  apart. An enchantment
  Bedrock has no number for, which is Sweeping Edge and every datapack enchantment, goes through
  `projectToBedrock`: a lore line above the stack's own lore, and an `ench` entry under an id no
  `EnchantType` has, which makes the client shine the item without printing anything about it. That
  fallback was built and tested in `@jsprismarine/enchantments` and had no call site;
  `projectToBedrock` now also takes an undefined registry, because a stack is drawn on servers that
  loaded no enchantment data.
  
  Loot drops go through `mapLootToBedrock`, which also had no call site. A block break, a mob death
  and `/loot` roll Java's tables, so a dropped `minecraft:spectral_arrow` or
  `minecraft:furnace_minecart` reached the client under a name the Bedrock registry has no item for.
  They now arrive as the reviewed fallbacks, an arrow and a hopper minecart, along with whatever a
  container item holds. An id the pinned Java version does not have is left alone rather than dropped,
  since a Bedrock pack's own table names Bedrock items.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`09fa805`](https://github.com/JSPrismarine/JSPrismarine/commit/09fa805c1716249034c4310c74a7cb5349b576d7) Thanks [@filiphsps](https://github.com/filiphsps)! - Send each session the item numbering of the protocol it negotiated.
  
  `@jsprismarine/bedrock-data/v2225` has shipped the 1.26.60 item table since the capture landed,
  but nothing selected it: `item_table` was a module-level import, so a session that negotiated
  2225 was still handed 2193's numbering. The registry is server-authoritative, so that never
  refused a join — it left the four names 1.26.60 added unreachable and put 82 items on numbers no
  other 1.26.60 server uses.
  
  `ProtocolCodec` now carries a `ProtocolItemData` beside its packet layouts: a version fixes the
  item numbering as firmly as it fixes a packet's field order, and both now travel with the codec
  the session resolved. `ItemRegistryPacket` reads it through the version a codec stamps on an
  outbound packet, `contentPayloads` takes it as an option and caches a build per version, and an
  item stack takes it from the packet it is being written to or read from — a stack's number and
  the registry's have to agree, or those 82 items resolve to the wrong item in the session they
  were sent correctly to. `prepareOutbound` now stamps the version on every outbound packet rather
  than only on one whose class it substituted, which is what lets a packet with one class at both
  versions carry version-specific data.
  
  Server-side code that asks whether Bedrock has an item at all, rather than what number to write
  for it, keeps reading the canonical 2193 table: `CreativeInventory`'s catalog filter,
  `RecipeManager.isKnown`, and the `items` code generator. Those are membership questions, and the
  recipes a client is sent name their items rather than numbering them.
  
  Protocol 2193 is byte-identical: `ItemRegistryPacket` encodes the same buffer it did before a
  version was selectable, which is asserted directly, and a version no table was captured for falls
  back to the same table. The `registry.items-2225` parity family now checks what a session is sent
  rather than only what the package publishes.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`198da06`](https://github.com/JSPrismarine/JSPrismarine/commit/198da066a386909eed869d7229208406b3af41d3) Thanks [@filiphsps](https://github.com/filiphsps)! - Unload saved chunks outside player areas, persist dropped item stacks, discard
  legacy stackless item actors on load, and despawn dropped items after 6000 ticks.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4c88047`](https://github.com/JSPrismarine/JSPrismarine/commit/4c88047abd9a979343d8f0ab9393dacd1a037275) Thanks [@filiphsps](https://github.com/filiphsps)! - Send the four join payloads from the content registries. `StartGamePacket`'s block properties,
  `ItemRegistryPacket`, `CreativeContentPacket` and `CraftingDataPacket` are written from
  `ServerContent` when `content-packs` is on, and from the captured tables when it is off, which is
  still the default. `joinContentPayloads` builds them once at startup, logs what the build sends and
  warns about what it had to invent, and returns nothing rather than throwing, so a build whose
  payloads cannot be produced leaves every packet on the path it used before.
  
  Measured against the captures for the vanilla pack stack: all 98 block definitions come out byte
  identical and the whole `StartGamePacket` matches the captured path; all 1606 items both sides name
  take the capture's number, component flag and version; and the creative menu is the same 1980
  entries in the same order with the same ids, metas, block ids and groups, 175 of which now carry
  the NBT the old path dropped. Creative picks are read against the menu that went out, so the two
  cannot disagree about which entry a position names.
  
  Two gaps are recorded rather than hidden. Mojang's vanilla behavior pack files seven items under
  pre-flattening names (`minecraft:fish`, `minecraft:muttonRaw` and five more) that a dedicated
  server renames before writing its table, so those seven travel with ids of this server's own; all
  seven modern names are in the registry as well. And the item component compounds come from Java's
  components rather than Mojang's tables, so none of the 78 captured compounds is reproduced byte for
  byte; `@jsprismarine/protocol` measures that gap field by field.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`0e6fd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/0e6fd6bcb1ddb9086002247e22da45d1051ec11c) Thanks [@filiphsps](https://github.com/filiphsps)! - The join now describes the level's dimensions to the client. `StartGame.generator` is read from the Overworld stem, Flat for a `minecraft:flat` stem and the stem type's overlay value otherwise, instead of from the join world's generator class; `StartGame.dimension` stays the join world's id, so a Nether join sends dimension 1. A level with a custom dimension type sends `DimensionData` after `StartGame` with one entry per custom type, its id from 1000 up, and the cloud fields on the wire for a 2225 session. `SetSpawnPosition` carries the player's own spawn point in that point's dimension when they have one, and the world spawn of the join world otherwise.
  
  Not checked against a real client, since none was available: whether it accepts a dimension id of 1000 or more, and whether `generator` has to describe the Overworld stem when the join dimension is another one.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b69abc9`](https://github.com/JSPrismarine/JSPrismarine/commit/b69abc94873739b51f82e504a26909b73a6bf907) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply Java-owned entity stats in the live runtime

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7c2858f`](https://github.com/JSPrismarine/JSPrismarine/commit/7c2858f600ef68f5dd63702be8a230fc15bcabc4) Thanks [@filiphsps](https://github.com/filiphsps)! - Document the exports that shipped without a description, so the generated `.d.ts` and the API docs
  say what each one does.
  
  `@jsprismarine/entity-brains` carried 101 of them: the `Brain` class itself, the three
  `BehaviorControl` implementations in `behavior/control.ts`, `ShufflingList` and `GateBehavior`, the
  `MemorySlot` readers, `BrainMobRegistry`, the `TestWorld` doubles, and the `<mob>Activities`
  function and `<MOB>_BRAIN` definition of each of the twenty mobs. Each mob's entry now states what
  is specific to it rather than repeating its name: that the camel and the happy ghast keep running
  goals, that the frog and the goat start with a full cooldown so a fresh one does not act on its
  first tick, and that the creaking falls back to its default activity while it cannot move.
  
  In `@jsprismarine/prismarine`, the eight `Scoreboard` readers, `Item.getMeta` and the `ChunkBiomes`
  class gain descriptions, and `EXHAUSTION`'s own JSDoc block is back above it after a merge left
  `ADVANCEMENT_CHECK_TICKS` sitting between the two.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`a795436`](https://github.com/JSPrismarine/JSPrismarine/commit/a79543637243eea004ee18ab2ddf64cbbe2d5761) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep the item when the host cannot perform the action it would be spent on. `WorldActions` gains an optional `supports(kind)` query, and the empty map, the knowledge book, the nine throwables, a loaded crossbow, shears on an entity and the fishing rod ask it before they consume: a host that says no gets `{}`, the click taken and the stack unchanged, the way an eye of ender with no stronghold in range already answers. The server answers the query from the same table its actor port reports unwritten systems from, and from whether the live entity runtime is attached for projectiles, leads, naming and dyeing, so a right click on nothing no longer spends an empty map or a snowball on a server that draws no maps or throws nothing, and the inventory the client predicted is sent back.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`d5f2b69`](https://github.com/JSPrismarine/JSPrismarine/commit/d5f2b69b04d5949e768ad20bfc27b77e1c2cf3b7) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the ban, permission, recipe, station, chat, and query managers as modules
  on the `@jsprismarine/kernel` module kernel inside `Server`. The public
  `getXxxManager()` getters are unchanged and now resolve their service tokens
  from the kernel.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`d9e1a24`](https://github.com/JSPrismarine/JSPrismarine/commit/d9e1a2424bfe48f012c54f00a39414a2c632f4cb) Thanks [@filiphsps](https://github.com/filiphsps)! - Build the module kernel once per `Server` instead of once per enable. The kernel
  now splits registration from start and restarts after `stop()`, so `reload()`
  reuses the same kernel and the manager modules are constructed once per server
  rather than twice per boot.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`99ab5fc`](https://github.com/JSPrismarine/JSPrismarine/commit/99ab5fc9a3d5c7351877091d58e1a1c0da4c4ef2) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Java infiniburn tags and resolved flammability components for fire.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8af4c05`](https://github.com/JSPrismarine/JSPrismarine/commit/8af4c05d67fd6160fbf2dabb7b32053c04abdb87) Thanks [@filiphsps](https://github.com/filiphsps)! - Dispatch Java game events to registered world listeners.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7562d04`](https://github.com/JSPrismarine/JSPrismarine/commit/7562d044dae9cefb977dc5f24a9a82c7121d8365) Thanks [@filiphsps](https://github.com/filiphsps)! - Gate entity ticking by simulation distance and reuse filter views

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a07c949`](https://github.com/JSPrismarine/JSPrismarine/commit/a07c94977978f0536b56a29630729bdb817cbba0) Thanks [@filiphsps](https://github.com/filiphsps)! - Decay leaves at Java's distance and stop a drop burst from taking the server down.
  
  `MAX_LEAF_DISTANCE` was 4, which is Bedrock's rule, and the trees it was applied to are built
  from Java's `worldgen/feature` data. `LeavesBlock` in the pinned 26.3 server jar has
  `DECAY_DISTANCE` 7 and decays a leaf whose `distance` state has reached it, so 6 is the last
  distance that survives; `updateDistance` takes one more than the smallest of the six neighbors',
  counting a block in `#minecraft:prevents_nearby_leaf_decay` as 0, and the fixed point of that is
  the breadth-first distance from the nearest log through leaves. `TreeFeature.updateLeaves` writes
  those distances out to 6 when the tree is generated. The radius-4 rule therefore condemned the
  outer rings of every canopy the generator placed: 59 of one chunk's 1173 leaves against the 4
  Java condemns, each one a break that rolls for a sapling. Java decides this on its own, and
  Bedrock has nowhere to disagree, because all seven of Java's `distance` values collapse onto the
  two Bedrock leaf states that differ only in `persistent_bit`.
  
  A position the decay search cannot read now counts as holding the leaf up, which is what
  `BlockPhysics` already assumes about ground it cannot read, so a canopy at the edge of the loaded
  world no longer decays for want of a chunk. `mushroom_stem` is no longer treated as a log, since
  Java leaves it out of `#minecraft:logs`.
  
  `World` now holds at most `ITEM_ENTITY_LIMIT` dropped stacks and turns the rest away with a
  warning once a second. Nothing capped this before: one tick is allowed 4096 block updates, every
  one of which can destroy a block and roll its loot table, and the reported failure was more than
  10,000 item entities falling, merging and broadcasting at once.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c5ae5e6`](https://github.com/JSPrismarine/JSPrismarine/commit/c5ae5e6e2e231751c82840c05dbc34435ccd7304) Thanks [@filiphsps](https://github.com/filiphsps)! - Avoid allocating family lists in goal neighbor checks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2768e5e`](https://github.com/JSPrismarine/JSPrismarine/commit/2768e5ea92cd1a86f8b907e76bffee0b60ac5bb5) Thanks [@filiphsps](https://github.com/filiphsps)! - Shorten incompatible breeding checks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`12c51d7`](https://github.com/JSPrismarine/JSPrismarine/commit/12c51d714bb9c85aa6592626f4119ab632afbc7b) Thanks [@filiphsps](https://github.com/filiphsps)! - Match Java air-ignore behavior for ocean structures

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a832365`](https://github.com/JSPrismarine/JSPrismarine/commit/a8323659f863708ea2b250231323799bf6f7d7d7) Thanks [@filiphsps](https://github.com/filiphsps)! - Light a loaded chunk about five times faster. The light pass asked `World.loadedBlockAt` for a full
  block - a `BlockState` out of the chunk palette, wrapped in an identifier and a record of state
  values - and then ran that identifier and those values through `@jsprismarine/mapping`'s property
  table, which splits state-override keys and merges the row it finds. It did this tens of millions
  of times while a world preloads, for two numbers that do not depend on the position at all.
  
  The world now also answers `loadedBlockRuntimeIdAt`, the same read without resolving the id, and
  `topOfColumn`, one past the highest y a column stores a block for. `WorldSystems` keeps what each
  runtime id does to light in a table of its own and hands the second to the light engine, which uses
  it to start a fresh chunk's column scan below the open sky.
  
  Lighting 441 chunks of generated Overworld terrain went from 5.4 s to 1.2 s, with every one of the
  86.7 million resulting light levels unchanged. Both reads are optional on `WorldSystemsView`: a
  view that supplies neither takes the path it took before.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`df372d4`](https://github.com/JSPrismarine/JSPrismarine/commit/df372d4786581ab3fde49caacc3b2d1419589887) Thanks [@filiphsps](https://github.com/filiphsps)! - Read an entity's stats off the components it has now. `EntityFacts` came from one throwaway
  instance built from a type's base components, so a stat a component group carries read as zero.
  Fifteen vanilla types - `slime`, `magma_cube`, `sulfur_cube`, `zombie`, `husk`, `zombie_villager`,
  `zombie_villager_v2`, `zombie_nautilus`, `nautilus`, `enderman`, `piglin`, `hoglin`, `creaking`,
  `armadillo` and `happy_ghast` - declare `minecraft:movement` only in a group their spawn event
  adds, so `MobBody.step` scaled by a speed of zero and returned before moving anything. The most
  common hostile mob in the game had been standing still.
  
  `MobBody.facts` now reads through to the entity's active components, falling back to the type's
  figure, from the moment `DataEntity` pairs a body with its instance. The same defect was under
  seven other facts: of the 128 vanilla entity files, 18 declare `minecraft:attack` only in a group,
  29 `minecraft:loot`, nine `minecraft:type_family`, six `minecraft:collision_box`, five
  `minecraft:health`, three `minecraft:knockback_resistance` and three
  `minecraft:underwater_movement`. So eighteen types dealt no melee damage, a rabbit collided as a
  full block, and only `minecraft:follow_range` was never affected.
  
  Answer a config question before `enable` has run. Every field `Config.enable` fills was declared
  with a definite-assignment `!`, so a subclass that stubs `enable` had an undefined `difficulty`:
  `getDifficulty` threw partway through the join burst and left the client waiting at
  `AWAITING_SPAWN` for packets that never came. The fields now start at the same defaults `enable`
  reads, from one table so the two cannot drift.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3b10a36`](https://github.com/JSPrismarine/JSPrismarine/commit/3b10a362fd3090b984bbdeca66f8514749357d38) Thanks [@filiphsps](https://github.com/filiphsps)! - Falling blocks now enter the data-driven entity runtime when the active content provides its falling-block definition.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`dc96d82`](https://github.com/JSPrismarine/JSPrismarine/commit/dc96d820859eb270c93b587b3c38ca744cc564c2) Thanks [@filiphsps](https://github.com/filiphsps)! - Remember the last chunk `World.getLoadedChunk` answered with. The callers ask in runs - the light
  engine scans a column of 384 blocks through it, and a path finder reads a few hundred positions
  around one point - and each ask was a map lookup. A profile of a start region preload put the
  lookup at 16% of its self time, and a profile of the entity tick with real mobs put it at 15%.
  The cache is one entry and is dropped whenever a chunk is loaded.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`26f91b6`](https://github.com/JSPrismarine/JSPrismarine/commit/26f91b6c3597133d33c413be3d0128ba8078c9b1) Thanks [@filiphsps](https://github.com/filiphsps)! - Persist player flight and data-driven attributes in LevelDB

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`514e3fd`](https://github.com/JSPrismarine/JSPrismarine/commit/514e3fd3097ef91742e6d001afb6cb4797fed000) Thanks [@filiphsps](https://github.com/filiphsps)! - Correct air-aware generation region height tracking

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`507bd0a`](https://github.com/JSPrismarine/JSPrismarine/commit/507bd0a8a76a2b610e70788fa3e4c2bbd7a63710) Thanks [@filiphsps](https://github.com/filiphsps)! - Make lit TNT detonate. Flint and steel and a redstone signal both already cleared the TNT block and spawned a `minecraft:tnt` entity with a fuse, but the entity was an empty class that read no fuse and never went off, so the only live explosion in the server was a creeper's and a player could not blow anything up.
  
  The entity is now Java's `PrimedTnt`: 80 ticks, the hop its launch speed and gravity make, and a radius-4 blast through the existing ray cast, gated on the `tntexplodes` game rule. A blast that reaches another TNT block lights it with `getRandomShortFuse`'s 10 to 29 ticks and drops no item, which is Java's `TntBlock.wasExploded`, so a pile of TNT chains and ripples outward instead of going off at once. The blame is carried through the chain, so a kill three blasts down the line is still the first lighter's.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d38ffb4`](https://github.com/JSPrismarine/JSPrismarine/commit/d38ffb4c21d2b363628184ab7e2aa461b6e843da) Thanks [@filiphsps](https://github.com/filiphsps)! - Project data-driven entity variants and colors to actor metadata

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c2429ec`](https://github.com/JSPrismarine/JSPrismarine/commit/c2429ec0f878352e0d41794a700c231f3104f8bf) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip sorting nearby entities already in arrival order

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e8c5e88`](https://github.com/JSPrismarine/JSPrismarine/commit/e8c5e8855118ebd74b5eb3526ed7fdcdba0d0946) Thanks [@filiphsps](https://github.com/filiphsps)! - Queue upcoming chunk requests to improve shared generation scheduling

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c0a8bb2`](https://github.com/JSPrismarine/JSPrismarine/commit/c0a8bb223c8369892476ad431fbb90d734ddaf57) Thanks [@filiphsps](https://github.com/filiphsps)! - Route per-item results through entity interactions

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`321a017`](https://github.com/JSPrismarine/JSPrismarine/commit/321a0170b36a2946fa3d06fe5924336222275de2) Thanks [@filiphsps](https://github.com/filiphsps)! - Route tame and breed interactions through entity data

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`97ab0e1`](https://github.com/JSPrismarine/JSPrismarine/commit/97ab0e1c419499365a437a3b7afca13d67245928) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep a stack's state when it is crafted, picked from the creative menu or moved. A crafted or
  picked pickaxe was built without the server's content, which is where an item reads its tags, so
  it matched no `#minecraft:mineable/pickaxe` rule: it did not harvest stone and cracked it at a
  fist's pace. A stack split or merged in the inventory, spent in the crafting grid or dropped when
  the grid was closed into a full inventory was rebuilt from its name and lost its enchantments,
  durability, custom name and content. A second craft onto the same slot also reported the first
  one's count to the client.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ef12ef8`](https://github.com/JSPrismarine/JSPrismarine/commit/ef12ef8dee0fb445a80811306d20c44aabeb237d) Thanks [@filiphsps](https://github.com/filiphsps)! - Four fixes the `@jsprismarine/protocol` payload builders found by comparing generated payloads against
  a captured Bedrock Dedicated Server 1.26.51.1 session.
  
  `@jsprismarine/nbt` now types an empty list `TAG_End`, which is what a Bedrock Dedicated Server
  writes, instead of `TAG_Byte`. That was the only byte of disagreement across the 98 captured block
  definitions: `minecraft:red_shrub` turns its collision box off with no boxes in it, and the writer
  gave the resulting empty list an element type the server never writes. All 98 now read and rewrite
  byte for byte, and the generated definitions match the capture byte for byte too. The reader
  already accepted both forms and still does, so worlds this server has already written load
  unchanged. A behavior fix, so `patch` under
  [the versioning policy](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/versioning.md)
  below `1.0.0`.
  
  `@jsprismarine/protocol` gains four things. `CreativeContentPacket` and `CraftingDataPacket` moved
  here from `@jsprismarine/prismarine` and take plain payload types rather than the server's `Item`
  and `Recipe` classes, so any package that builds those payloads can now be checked against them.
  `CraftingDataPacket` carries a `potionMixes` list, where the old one wrote a literal zero and the
  brewing recipes could not be sent at all. `BlockRuntimeId` holds the FNV-1a 32 hash and the little
  endian state serialization that decide a block's runtime id, which `@jsprismarine/prismarine` had
  one copy of and the protocol package another; it reproduces all 1065 `network_id` values the
  captured creative catalog carries. The packet index exports every member type a `StartGame` payload
  is built from, so a consumer no longer deep imports `@jsprismarine/protocol/packet/StartGamePacket`
  to name a `BlockProperty` or a `GameRule`. Moving public API in is a feature, which the versioning
  policy maps to `minor` below `1.0.0`.
  
  `@jsprismarine/prismarine` keeps `CreativeContentPacket`, `CraftingDataPacket` and `BlockRuntimeIds`
  with the same public interfaces and the same bytes on the wire; each now builds the payload and
  hands it to the protocol package rather than carrying its own copy of the format.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`6cd603a`](https://github.com/JSPrismarine/JSPrismarine/commit/6cd603a5d646f3b5e907dd08a45a456c0556cda6) Thanks [@filiphsps](https://github.com/filiphsps)! - Route healable item use through the entity runtime

- [#2647](https://github.com/JSPrismarine/JSPrismarine/pull/2647) [`6297bb4`](https://github.com/JSPrismarine/JSPrismarine/commit/6297bb451760ae237b5bece79d385eeeac4f6c55) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve schema URLs against the build version and unstable dist-tag

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b4526cc`](https://github.com/JSPrismarine/JSPrismarine/commit/b4526cc6b22a1365e86c5fcd457c5de63e9b1f9d) Thanks [@filiphsps](https://github.com/filiphsps)! - Reuse entity collision facts within each collision pass

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b98742b`](https://github.com/JSPrismarine/JSPrismarine/commit/b98742b80037c69e51cf6059bff2b45147e6a53e) Thanks [@filiphsps](https://github.com/filiphsps)! - Project ignited marker state to client actor metadata.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c8062d0`](https://github.com/JSPrismarine/JSPrismarine/commit/c8062d01dd6301fca9f1f36ce6c8fd05bf9931ea) Thanks [@filiphsps](https://github.com/filiphsps)! - Map spawn egg entity identifiers through Java-to-Bedrock mappings

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b54634a`](https://github.com/JSPrismarine/JSPrismarine/commit/b54634a16164ed4fd43a003a8e3f5b2dcac0a3ae) Thanks [@filiphsps](https://github.com/filiphsps)! - Read spawn egg and breeding offspring types from `minecraft:offspring` data.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b8e5940`](https://github.com/JSPrismarine/JSPrismarine/commit/b8e59403e9d63d31c9c09f55e3927cb45d5a7916) Thanks [@filiphsps](https://github.com/filiphsps)! - Use world light for entity brightness filters

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f4ec478`](https://github.com/JSPrismarine/JSPrismarine/commit/f4ec4787eb307bbeefe5d51034f43b0728088c55) Thanks [@filiphsps](https://github.com/filiphsps)! - Add slot-based equipment-change triggers to data-driven entities

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c31b0e1`](https://github.com/JSPrismarine/JSPrismarine/commit/c31b0e1914ce2c4ef3fa83a59f1063e7d57943af) Thanks [@filiphsps](https://github.com/filiphsps)! - Build a block schema's default state once instead of per call. A read of a position no sub chunk
  covers answers with air's default state, and the random tick pass over an idle flat world makes
  about 32000 of those a tick, so the server spent most of each tick in the `BlockState` constructor.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`a421da6`](https://github.com/JSPrismarine/JSPrismarine/commit/a421da6f83da69278d9b5330ba2b083d7749ccf5) Thanks [@filiphsps](https://github.com/filiphsps)! - Run one chunk generation worker pool per server instead of one per dimension. The dimension, the
  `worldgen/noise_settings` id and the biome source move out of the pool's `workerData` and into
  every task as a `PipelineKey`; a worker compiles its pipeline per key and seed on the first task
  that names them. `DataDrivenGenerator.forStem(key)` returns a `Generator` for another stem over
  the same instance, registries, caches and pool, and the `minecraft:noise` factory hands every
  stem it builds a view of one shared generator, so three dimensions share `min(6, cores - 2)`
  workers rather than starting three times that many. `builtInGeneratorFactories()` replaces the
  `BUILT_IN_GENERATOR_FACTORIES` constant and `createNoiseGeneratorFactory()` replaces
  `noiseGeneratorFactory`, because the noise factory now holds that shared generator and each
  `GeneratorFactories` registry needs its own. Overworld chunks are byte for byte what they were.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`68febb8`](https://github.com/JSPrismarine/JSPrismarine/commit/68febb838436b90836c311f7cc435676dff5a438) Thanks [@filiphsps](https://github.com/filiphsps)! - Project Bedrock marker components to matching actor flags.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`334f1ec`](https://github.com/JSPrismarine/JSPrismarine/commit/334f1ec93ad8176401d2fc2e64ac7e3f52e4c94c) Thanks [@filiphsps](https://github.com/filiphsps)! - Map item remainder identifiers for the Bedrock registry

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`23f125f`](https://github.com/JSPrismarine/JSPrismarine/commit/23f125f60d72ae737875240aa1acf92107f3e71e) Thanks [@filiphsps](https://github.com/filiphsps)! - Honor the negotiated protocol codec on the outbound path. A session's codec now converts base
  packet instances to its own classes before encoding, so a protocol 2225 client receives the
  2225 wire layouts for the packets that changed - `StartGamePacket` among them - instead of
  the 2193 bytes. Shared-batch broadcasts compress once per codec rather than once globally, so
  a mixed-version audience each receives its own layout.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c32bfed`](https://github.com/JSPrismarine/JSPrismarine/commit/c32bfededb57b65bab45897dda54e0fa621d0ff1) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Java-derived mob navigation and path costs, and separate overlapping mobs during movement.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cfa4cc7`](https://github.com/JSPrismarine/JSPrismarine/commit/cfa4cc7a51ea50c9960a79a0cbd2aa5a64191659) Thanks [@filiphsps](https://github.com/filiphsps)! - Preserve data-driven entity spawn data

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`537865c`](https://github.com/JSPrismarine/JSPrismarine/commit/537865cfe62a996b4f17872021d86ae87373b786) Thanks [@filiphsps](https://github.com/filiphsps)! - Route field-based packet codecs through the shared protocol NetworkPacket base.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0a7dc6f`](https://github.com/JSPrismarine/JSPrismarine/commit/0a7dc6f2a296d6b17a2cb470a1cd652b72b905b2) Thanks [@filiphsps](https://github.com/filiphsps)! - Route targeted entity item interactions through content

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5e47439`](https://github.com/JSPrismarine/JSPrismarine/commit/5e474396321b54f696760962ceb9d24b85917640) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve redstone conductor overrides from `minecraft:redstone_conductivity` block components.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`aecc83d`](https://github.com/JSPrismarine/JSPrismarine/commit/aecc83db4d7be989977510a5dae1e7ada44b689b) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix Java-parity block placement, crafting variants, and player item drops

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1682641`](https://github.com/JSPrismarine/JSPrismarine/commit/16826414a4ac9d97b5acdb7985335a56e4addc16) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose player positions at their feet to content systems, matching mob coordinates and avoiding eye-height offsets in AI and spawning.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`bbefd35`](https://github.com/JSPrismarine/JSPrismarine/commit/bbefd355a666636318146d771b5e825c6f636287) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the world change onto the session as `PlayerSession.changeWorld(arrival)` and send the dimension change sequence a Bedrock client expects: the record saved to the world being left, one `ChangeDimension` with the target's Bedrock id, `StopSound`, `NetworkChunkPublisherUpdate`, the server-sent `PlayerAction ChangeDimensionAck`, the arrival chunks and `PlayStatus PlayerSpawn`. The old four-step Overworld and Nether detour is sent only between two worlds of the same Bedrock id. The change stays pending until the client closes the loading screen it was given; `PlayerAuthInput` is dropped until then, and the close triggers a `MovePlayer` teleport, the attributes, the inventory, a `SetSpawnPosition` naming the spawn's dimension and the changed dimension advancement hook. `Player.setWorld(world)` forwards to `changeWorld` with the world's spawn as the arrival. A chunk batch on the wire during the change no longer marks the old world's coordinates as loaded.
  
  Not verified against a real Bedrock client: whether the client keeps inventory and attributes across the change (the re-send after `EndLoadingScreen` is the safe default) and how many arrival chunks it needs before it closes the screen. Both need a manual run.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`ea2ae86`](https://github.com/JSPrismarine/JSPrismarine/commit/ea2ae8698748e2bdda8bd709a171a4be77bce261) Thanks [@filiphsps](https://github.com/filiphsps)! - Send the player list in the protocol 2225 layout, so a Minecraft 1.26.60 client can join.
  
  At 2225 the PlayFab id changes owner: `PlayerListAddEntry` gains a `PlayFab ID` string between
  `XBL XUID` and `Platform Online ID`, and `SerializedSkin` loses the one it carried. The server
  kept sending the 2193 layout, which left a 1.26.60 client one string ahead of itself by the
  time it reached `Build Platform` - four fixed little-endian bytes it then read as a string
  length. The read ran off the entry and the client dropped the join without sending a reason,
  which its disconnect screen reports as the error code "Terracotta".
  
  `PlayerListPacket2225` and `PlayerSkinPacket2225` carry the new layout, selected by `Codec2225`,
  and `Skin.networkSerialize` and `Skin.networkDeserialize` take an optional `SkinWireLayout`
  that defaults to 2193's. Protocol 2193 sessions are unchanged.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b3360c0`](https://github.com/JSPrismarine/JSPrismarine/commit/b3360c05087155a4aa71299a2042646fa91d6f14) Thanks [@filiphsps](https://github.com/filiphsps)! - Route repeater and comparator updates and scheduled transitions through their data-driven block behavior hooks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`da3ce72`](https://github.com/JSPrismarine/JSPrismarine/commit/da3ce72c76cf61711e0727c44dc8e9b182669984) Thanks [@filiphsps](https://github.com/filiphsps)! - Mirror data-driven baby state and scale to the actor metadata clients render.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`fd43ade`](https://github.com/JSPrismarine/JSPrismarine/commit/fd43ade59e80f19e3e7ef994ca80adb15e1f7907) Thanks [@filiphsps](https://github.com/filiphsps)! - Send the last two drops that bypassed it through the one destruction path.
  
  `EntityRuntime.breakBlock`, which is how a mob harvests, wrote air and then rolled the block's
  table with no tool, no position and no level view. It was the last of the four drop mechanisms
  that were consolidated: a chest a villager harvested over kept what it held, and every table
  condition that reads where the break happened refused. It now calls the host's `destroyBlock`
  first and writes air afterwards, and keeps the bare roll as the fallback for a host with no live
  world behind it.
  
  `rules/support.ts`'s `popBlock` dropped one of the block it popped, which is a guess: deepslate
  yields cobbled deepslate, a popped crop yields its seeds, and a block with no table yields
  nothing. On the player path `blockBreak.ts` reconciles that stand-in through `spilledContents`,
  but a piston's popped block, a block that lost its support and a block a falling anvil cleared
  out of the way all went straight to the ground with it.
  
  `WorldActions` gains an optional `destroyBlock`, which the server fills from the same path, so
  those three raise the block's `onBreak` and roll Java's table. The self-drop stays as the answer
  for a world with no tables behind it, which is the test voxel world. The seam runs
  `ContentBlockAccess.destroy`, `BlockStorageAccess.destroy` and `worldBlockStorage`, all optional
  for the same reason: only a storage over a live world can tell a family's own drops apart from
  the table's roll.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`3161380`](https://github.com/JSPrismarine/JSPrismarine/commit/3161380487ac32fb8353548161db0001c1a697f3) Thanks [@filiphsps](https://github.com/filiphsps)! - Stand a player who changes world with their feet at the arrival. `PlayerSession.changeWorld` wrote the arrival, a feet position, as the player's eye position, so a portal trip, a cross-world respawn or `Player.setWorld` left them 1.62 blocks down in the arrival floor. The arrival is raised to the eyes once, and `ChangeDimension` and the closing `MovePlayer` teleport both carry those eyes. `Player.setWorld` now arrives one block above the stored spawn, centered, where a joining player's feet go.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`a924898`](https://github.com/JSPrismarine/JSPrismarine/commit/a92489801e61895fddc93c75d634855549ebb2f4) Thanks [@filiphsps](https://github.com/filiphsps)! - Entities and players standing in a lit portal now travel. `World.update` reports every ticking entity whose body overlaps a portal block to `DimensionTravel.touch`, which opens the entity's portal contact; once the contact reaches the portal rule's delay (80 ticks for a survival player in a nether portal, none for creative or for anything that is not a player), `Entity.update` resolves the trip and `DimensionTravel.transfer` moves the traveler, players through `PlayerSession.changeWorld` and everything else by `removeEntity` and `addEntity`, with a portal cooldown of 10 ticks for players and 300 for the rest. An entity that rides or carries a data-driven mob stays, as on Bedrock. Plugins can observe or cancel the trip through the new `EntityPortalEnterEvent` (`entityPortalEnter`) and `PlayerChangeDimensionEvent` (`playerChangeDimension`), and reach the service through `Server.getDimensionTravel()`. `PortalIndex` also forgets a chunk's portal blocks when the chunk unloads.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`b6c3dce`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3dce84fadaf5318cd72fcc3e4896db2289dfb) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `DimensionTravel.resolve`, which says where a trip through a portal block lands without moving anybody yet. A nether portal links to the other dimension by `coordinate_scale` with floor division and a clamp into `logical_height`, lands in the nearest lit portal within 128 blocks of the scaled position with the traveler's place in the source portal kept, and otherwise builds one for a player as `PortalForcer.createPortal` does, forced onto a platform between y 70 and ten below the ceiling when nothing fits. An end portal writes the 5 by 5 platform and lands at (100.5, 49, 0.5) facing west, one block higher for anything but a player; out of the End a player lands at their respawn point and anything else above the Overworld spawn. Every `World` keeps a `PortalIndex` of its lit portal blocks, fed from block writes and chunk loads, so the search reads a set rather than scanning blocks. The rules are the `DIMENSION_TRAVEL` and `PORTALS` tables in `world/portal/rules.ts`, with the frame and portal block lists derived from the shared `PORTAL_BLOCK_NAMES`.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`ea17f32`](https://github.com/JSPrismarine/JSPrismarine/commit/ea17f32ad6d5550bc720c3d66a55bc8b4eccbb6c) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the review findings on portal travel and the dimension change.
  
  - `PlayerSession.changeWorld` refuses a second change while one is still pending on the
    client's loading screen, and refuses a world of a custom dimension type with an error until a
    real client is seen to accept a `ChangeDimension` with an id of 1000 or more.
    `World.touchPortals` and `DimensionTravel.touch` skip a player with a pending change.
  - A player without a spawn of their own is sent `SetSpawnPosition` naming the level's Overworld
    spawn in the Overworld, where `Player.getRespawnPoint` sends them, instead of the spawn of the
    world they stand in.
  - `PortalIndex.closest` bounds the search on x and z only, as Java's `PoiManager.getInSquare`
    does, and still picks by squared distance including y.
  - `DimensionTravel.touch` awaits `entityPortalEnter` listeners, so an asynchronous listener
    can cancel the contact. `touch` returns a promise.
  - A data-driven mob keeps its runtime record through a portal: the destination runtime restores
    the same entity, component groups included, and its body takes the portal cooldown.
  - `DimensionTravelRule.respawnBlock` is gone; `RespawnPoint` reads the Java attributes.
  - `@jsprismarine/block-behaviors` exports `alongPortalAxis`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7a5070a`](https://github.com/JSPrismarine/JSPrismarine/commit/7a5070a17835528c8e253654cb524ff8501a6dd1) Thanks [@filiphsps](https://github.com/filiphsps)! - Route block property reads through the Java-sourced per-state table in `@jsprismarine/mapping`:
  `Block`'s hardness, break time, blast resistance, light emission, light filter and flammability now
  come from the Java 26.3 dump keyed by Bedrock state name, covering every palette block rather than
  the registered classes, and explosions decide what breaks from real blast resistance instead of a
  hand-kept name set. Blocks without a Java source keep their class values. Unbreakable blocks
  (hardness `-1`) now report an infinite break time.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2d6f55c`](https://github.com/JSPrismarine/JSPrismarine/commit/2d6f55c37fd95cd4477c9d4c4ceaade4a6c53a78) Thanks [@filiphsps](https://github.com/filiphsps)! - Give the block behavior families their random ticks, so crops grow. `WorldManager` builds
  `randomTickHandlers` from the content registries - one per block whose content declares an
  `onRandomTick` - and the engine's draws now reach the families instead of being discarded. A world
  started with `content-packs` off gets no handlers and behaves exactly as before, and a family that
  throws is reported once by identifier rather than taking the world tick down with it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8141f71`](https://github.com/JSPrismarine/JSPrismarine/commit/8141f71848ced8a6d3a143d4a8075273fdf6cfe9) Thanks [@filiphsps](https://github.com/filiphsps)! - Launch, move, and resolve projectile impacts through the live data-driven entity runtime.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`055a15b`](https://github.com/JSPrismarine/JSPrismarine/commit/055a15b279988132730d75574fd8316e9327f3dc) Thanks [@filiphsps](https://github.com/filiphsps)! - Speak protocol 2225 (Minecraft 1.26.60) alongside 2193, through the first delta codec.
  `Codec2225` extends `Codec2193` with the eight packet ids 1.26.60 added and subclasses for the
  six implemented layout changes - `AnimatePacket`'s trailing hand, `LevelChunkPacket`'s client
  biome update flag, `StartGamePacket`'s editor level migration version, the optional passenger
  block data on `AddActorPacket` and `AddPlayerPacket`, and the hand byte in two
  `InventoryTransactionPacket` bodies - each with both wire directions and a round-trip test,
  verified against Mojang's v1.26.60 protocol schemas and gophertunnel v1.63.0. A client of
  either version negotiates its own codec at `RequestNetworkSettings`; the handshake codec, the
  MOTD and `Identifiers` advertise the newest registered version. The remaining 1.26.60 changes
  a 2225 session still reads with 2193 layouts are recorded in
  `docs/research/protocol-2225-delta.md`.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`f82703f`](https://github.com/JSPrismarine/JSPrismarine/commit/f82703f58e970ee0dcfbcc71bf7070b43247cc93) Thanks [@filiphsps](https://github.com/filiphsps)! - Move registry-to-payload builders and injected protocol data into `@jsprismarine/protocol`, and
  update Prismarine to use the protocol payload API directly.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5121b88`](https://github.com/JSPrismarine/JSPrismarine/commit/5121b88dab4fbfd3c6f14476ef2ae0014a710086) Thanks [@filiphsps](https://github.com/filiphsps)! - Support entity item repair interactions

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`738a665`](https://github.com/JSPrismarine/JSPrismarine/commit/738a66555ddfad7912d7b6c61f28e78a575996cc) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement the remaining data-driven `minecraft:angry` target, sound, and broadcast behavior.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`36d4011`](https://github.com/JSPrismarine/JSPrismarine/commit/36d4011bf522363b9096ac9df6005e392b4b9b61) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose Java datapack tag memberships on block and item instances.

- [#2634](https://github.com/JSPrismarine/JSPrismarine/pull/2634) [`33da30f`](https://github.com/JSPrismarine/JSPrismarine/commit/33da30f855fc8a35f509117dee8623bece0a90b6) Thanks [@filiphsps](https://github.com/filiphsps)! - Ignore existing `config.yml` and `config.yaml` files when the server reads its JSON configuration.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`39877ce`](https://github.com/JSPrismarine/JSPrismarine/commit/39877cee37f63f0057ed9fed0c9f94572de8f127) Thanks [@filiphsps](https://github.com/filiphsps)! - Synchronize client-facing entity properties and stop sending survival block-break progress in creative mode.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-driven entity dyeing through the item behavior runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`59f8ec6`](https://github.com/JSPrismarine/JSPrismarine/commit/59f8ec6fcd56487b167a9641cf74d60601d8af7e) Thanks [@filiphsps](https://github.com/filiphsps)! - Run fire spread, burnout, and scheduled ticks through data-driven block behavior hooks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d81625a`](https://github.com/JSPrismarine/JSPrismarine/commit/d81625aa49324be6674946127be2aa98213b0600) Thanks [@filiphsps](https://github.com/filiphsps)! - Route entity event sounds, particles, and vibrations through world effects.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8832d19`](https://github.com/JSPrismarine/JSPrismarine/commit/8832d19e969383d14f5a8f991a0268c122590b56) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove per-tick function-name assignment from entity movement checks.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`b6cdccf`](https://github.com/JSPrismarine/JSPrismarine/commit/b6cdccf53598c32a024a774033b6cc4b06fd3da8) Thanks [@filiphsps](https://github.com/filiphsps)! - Use protocol NetworkPacket across server networking.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7010e3a`](https://github.com/JSPrismarine/JSPrismarine/commit/7010e3a61e85389b6fb92d4a90ad2316f159784a) Thanks [@filiphsps](https://github.com/filiphsps)! - Write item blocking-tick data from the `minecraft:blocks_attacks` component.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`21887ca`](https://github.com/JSPrismarine/JSPrismarine/commit/21887ca1f152fa69516fb80543e32a5ce047ec39) Thanks [@filiphsps](https://github.com/filiphsps)! - Draw random ticks only where Java draws them, which is also what makes an idle world free.
  `ServerLevel.tickChunks` visits a chunk when a player ticket holds it and draws in a section when
  that section's palette holds something that ticks; this server drew in all 24 sections of all 441
  loaded chunks with nobody online. `WorldSystemsView.randomTickChunks` is the world's answer to both
  halves, and `World` gives it from the players' simulation distance and the chunk's occupied sub
  chunks. Measured over the real loop on a flat world: 29.5 ms per tick to 3.5 with the section half,
  and to nothing at all with no players online, against a 50 ms tick budget.
  
  `EngineOptions.randomTickHandlers` now receives the block with the position. The engine has just
  read it to find the handler, so reading it again cost a chunk lookup and a block-state construction
  in the hottest loop the world has.

- [#2612](https://github.com/JSPrismarine/JSPrismarine/pull/2612) [`9bc4514`](https://github.com/JSPrismarine/JSPrismarine/commit/9bc4514b4148af9343dd4f3220a6e3ca552261b8) Thanks [@filiphsps](https://github.com/filiphsps)! - Preserve nested literal and redirected command paths

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b6d55fc`](https://github.com/JSPrismarine/JSPrismarine/commit/b6d55fc05e9452da92191a40c2a2eedd4a09638b) Thanks [@filiphsps](https://github.com/filiphsps)! - Run shared terrain and feature stages on workers to improve Overworld throughput

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`14ea6ed`](https://github.com/JSPrismarine/JSPrismarine/commit/14ea6ed574bd1edc4751fb934d65ee2c99df59f9) Thanks [@filiphsps](https://github.com/filiphsps)! - Report a chunk lost to a shutdown as a refusal, not as a thread pool failure.
  
  Stopping the generator terminates its worker threads, which is the only way to stop a worker
  halfway through a chunk, and a terminated worker rejects its task with its own error.
  `World.preloadChunk` catches `GenerationStopped` and rethrows anything else as a real fault, so
  a start region that was interrupted would have failed the world instead of saving what it had.
  `GenerationQueue` now reports a build that failed after the stop as a refusal.
  
  Measured on a cold 32 chunk batch stopped one turn in: 2.19 s and 31 refusals with the terrain
  bodies inline, where the time is the one chunk already being built; 0.13 s and 32 refusals with
  six workers, because terminating them does not wait for the chunk. Every refusal in both is a
  `GenerationStopped`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d6b83c6`](https://github.com/JSPrismarine/JSPrismarine/commit/d6b83c6930c66bbb5e0ec59b0600f536e3f4f003) Thanks [@filiphsps](https://github.com/filiphsps)! - Pack the Java world generation registries into one buffer so several threads can share the bytes.
  
  `buildRegistryBundle` writes the 1514 documents as a header, an index of
  `(registry, id, offset, length)` and the documents' UTF-8 JSON end to end;
  `readRegistryBundle` reads either an `ArrayBuffer` or the `SharedArrayBuffer` that
  `shareRegistryBundle` returns, and does not care which. Measured here: 3.11 MiB, 9.1 ms to
  build, 21.6 ms to read back, against 112 ms for the loader to walk the files with the page cache
  warm and the 430 to 573 ms a cold worker spends doing it for itself.
  
  Nothing above the parse is shareable, so a worker still rebuilds the density graph, the noise
  tables and the biome source out of these documents. What this removes is the part that is pure
  I/O and would otherwise be paid once per worker, and it avoids `workerData`, whose structured
  clone runs on the spawning thread.
  
  Production still reads the files. This lands the format and its round trip ahead of the worker
  pool that uses it.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`db163d7`](https://github.com/JSPrismarine/JSPrismarine/commit/db163d7b1723bb4e9fb99e164c7ff56c423b39d2) Thanks [@filiphsps](https://github.com/filiphsps)! - Respawn a player in the world their spawn point was set in. A death in the Nether with an Overworld bed now resolves the bed through the level, building the Overworld if it is not loaded, and the respawn exchange opens with a `ChangeDimension` marked as a respawn. A bed whose block is gone, or no spawn point at all, falls back to the Overworld spawn of the default level. A bed only sets a spawn where the dimension type's bed rule allows it and a respawn anchor only where `respawn_anchor_works` is set; the explosion Java gives elsewhere is not modeled yet.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0e7d345`](https://github.com/JSPrismarine/JSPrismarine/commit/0e7d345611f49a463d03f3762f3006f5cab2aaf6) Thanks [@filiphsps](https://github.com/filiphsps)! - Emit vibration game events for data-defined interactions

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`259282c`](https://github.com/JSPrismarine/JSPrismarine/commit/259282cf8da2397f26bea2bea8816eb6e4ec91d4) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply configured status effects from healable entity items.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e841f10`](https://github.com/JSPrismarine/JSPrismarine/commit/e841f10f39792b1f3cdc491c92aa6eb50a028752) Thanks [@filiphsps](https://github.com/filiphsps)! - Bow arrows use the data-driven projectile runtime when the active content defines `minecraft:arrow`.

- [#2638](https://github.com/JSPrismarine/JSPrismarine/pull/2638) [`7ba8c73`](https://github.com/JSPrismarine/JSPrismarine/commit/7ba8c737b299535506345222fe87ea88b3b49ff1) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep natural mobs outside the 24-block player and world-spawn exclusion.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e35e771`](https://github.com/JSPrismarine/JSPrismarine/commit/e35e77132dd26310b7e5457b061048315fa6e7ad) Thanks [@filiphsps](https://github.com/filiphsps)! - Accept creative block breaks carried in player input packets.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d889e61`](https://github.com/JSPrismarine/JSPrismarine/commit/d889e618ec1c0e8a0df6b909d5ae5ef9df5ce873) Thanks [@filiphsps](https://github.com/filiphsps)! - Drive primed TNT fuses and chain explosions from entity data.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1c80f7e`](https://github.com/JSPrismarine/JSPrismarine/commit/1c80f7e0e15c3da3223d21986640428d3fb3044f) Thanks [@filiphsps](https://github.com/filiphsps)! - Map Java repeater and comparator items to placeable Bedrock blocks, and use Java-facing piston directions for redstone behavior.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d568a7e`](https://github.com/JSPrismarine/JSPrismarine/commit/d568a7e386b711f6cda15044538ce96889b31b27) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop the autosave freezing the server. `World.saveChunks` ran `Promise.all` over every changed
  chunk, and writing a chunk is synchronous, so the whole save was one uninterrupted run of work.
  The first autosave after a start region preload has all 441 chunks to write: the event loop was
  held for ten seconds and the tick loop came back reporting 200 skipped ticks. It now writes in
  batches of eight with a yield between them, the way the preload already generates.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`01e02c6`](https://github.com/JSPrismarine/JSPrismarine/commit/01e02c679844ce70a122d2073e250df017a1c13e) Thanks [@filiphsps](https://github.com/filiphsps)! - Build a block schema's property type map once. `BlockStateSchema.getPropertyTypes` rebuilt the
  record from two intermediate arrays on every call, and reading or writing a sub chunk calls it
  once per palette entry. A schema is immutable, so it is memoized the way its default state
  already was.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`380281c`](https://github.com/JSPrismarine/JSPrismarine/commit/380281c7ededc2a9bb0df45115bf1b24c44476f4) Thanks [@filiphsps](https://github.com/filiphsps)! - Support both block breaking modes, chosen by the new `server-authoritative-block-breaking` setting.
  It is on by default, as a Bedrock Dedicated Server 1.26.52 runs it, and `StartGame` announces it.
  
  On, the client reports a break as `PREDICT_DESTROY_BLOCK` inside `PlayerAuthInput`, and the server
  carries it out. The server animates the cracks itself: when mining moves to a new block it stops the
  cracks on the old one and starts them on the new one, then every tick it sends the particles off the
  mined face and the crack progress. The cracks stop when the player lets go, disconnects, dies, or
  changes game mode or world, and when the block changes under them. A transaction claiming a block
  broke is dropped in this mode. An adventure player's predicted break is refused, and the client is
  sent the block back.
  
  Off, the client times the break and reports it with an `InventoryTransaction`, as before.
  
  In both modes the player breaking a block no longer gets the server's hit sound on top of the one
  their client plays, which made digging sound several times too fast. A break, including one a
  command makes, now sends one `PARTICLES_DESTROY_BLOCK` event for its particles and sound, as BDS
  does, instead of a sound packet plus the silent event.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5c2c514`](https://github.com/JSPrismarine/JSPrismarine/commit/5c2c51497113aa5324de5435283629227e2de826) Thanks [@filiphsps](https://github.com/filiphsps)! - Reduce dropped-item merge scans with a dedicated spatial index.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`488bc4f`](https://github.com/JSPrismarine/JSPrismarine/commit/488bc4f1f385134f68d7386135c745330e994917) Thanks [@filiphsps](https://github.com/filiphsps)! - Let a comparator read a container, and keep what the engine remembers across a restart. `EngineWorld` held its block entity records in a map local to the call that built it, and nothing ever filled the container fill level, so a comparator behind a chest read zero and forgot its own output the moment the server stopped. The records now live in the chunk's block entities, which save with the chunk: `analogOutput` is computed from the container's own slots on every read, so it cannot drift from what the chest holds, and `comparatorOutput` is written back as Java's `ComparatorBlockEntity.outputSignal`.
  
  A piston's `extended_bit` goes the same way. Bedrock's palette has no room for it and Java keeps it in the block state, so it used to live in the same local map and a piston came back from a restart thinking it was retracted.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8a20e74`](https://github.com/JSPrismarine/JSPrismarine/commit/8a20e745347d42e28b8ed38cd8a0e5b80b37dcc5) Thanks [@filiphsps](https://github.com/filiphsps)! - Route `minecraft:shareables` consume items through the carried-item goal.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b14a5c8`](https://github.com/JSPrismarine/JSPrismarine/commit/b14a5c867f0eb00691ee7b0b12a726b3823e7ba4) Thanks [@filiphsps](https://github.com/filiphsps)! - Include declared entity inventory slots when shareable items are offered and transferred.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`6d1b073`](https://github.com/JSPrismarine/JSPrismarine/commit/6d1b07376d4d3285768fc807a557ba0722dffb88) Thanks [@filiphsps](https://github.com/filiphsps)! - Equip items picked up under `minecraft:behavior.pickup_items` when item and goal data allow it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`949785e`](https://github.com/JSPrismarine/JSPrismarine/commit/949785e4be1ae2ffd834354fefe993990d5000d6) Thanks [@filiphsps](https://github.com/filiphsps)! - Use `minecraft:shareables` item names, tags, priorities, and pickup limits when entities collect drops.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`981cf5b`](https://github.com/JSPrismarine/JSPrismarine/commit/981cf5b9b2665ae087e53df6919923b4ad4181bb) Thanks [@filiphsps](https://github.com/filiphsps)! - Use `minecraft:shareables` admiration and barter flags when piglins pick up items.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e924c76`](https://github.com/JSPrismarine/JSPrismarine/commit/e924c76b5fdfad1e0c7e809ece789e98764283aa) Thanks [@filiphsps](https://github.com/filiphsps)! - Match `minecraft:shareables` item tags when entities choose items to share.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ddab524`](https://github.com/JSPrismarine/JSPrismarine/commit/ddab524eca15ee56ac73ce581943d9b9e7f5ec63) Thanks [@filiphsps](https://github.com/filiphsps)! - Check water and lava intersections in one data-driven block scan per entity.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-defined interaction loot tables, resolve legacy Bedrock item variants, and preserve item counts and drop offsets.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`6867a3f`](https://github.com/JSPrismarine/JSPrismarine/commit/6867a3f9573f1bdd575c1a9f96b11c9fbe771dcd) Thanks [@filiphsps](https://github.com/filiphsps)! - Drop Java game events when no listener is installed so entity interactions can complete.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`18d65b7`](https://github.com/JSPrismarine/JSPrismarine/commit/18d65b7d8610d067c08c218d7805cb527a2feade) Thanks [@filiphsps](https://github.com/filiphsps)! - Preserve zero stack sizes when decoding empty item descriptors

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`299d9d0`](https://github.com/JSPrismarine/JSPrismarine/commit/299d9d0aeaee23de30fa57c250b6fdbece533bc7) Thanks [@filiphsps](https://github.com/filiphsps)! - separate exactly overlapping data-driven entities

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a1c9fe5`](https://github.com/JSPrismarine/JSPrismarine/commit/a1c9fe587b5d6eb19a990c16766962c49f9614fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Move healable item behavior into its data-driven component

- [#2612](https://github.com/JSPrismarine/JSPrismarine/pull/2612) [`4555d70`](https://github.com/JSPrismarine/JSPrismarine/commit/4555d70bc9ef62bdee2184911334c9f864d2bb15) Thanks [@filiphsps](https://github.com/filiphsps)! - Save the world spawn in level.dat

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e55a56b`](https://github.com/JSPrismarine/JSPrismarine/commit/e55a56b97e7a7e4c8cf5b147f6a55f175dbd73b7) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip rebuilding an entity's family index when its data-driven families are unchanged.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`31ac981`](https://github.com/JSPrismarine/JSPrismarine/commit/31ac981990ff52769c9cb8ad3a5b70a8facc96f7) Thanks [@filiphsps](https://github.com/filiphsps)! - Route scheduled fluid ticks through the active block family when a fluid changes between source and flowing forms.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9258ef1`](https://github.com/JSPrismarine/JSPrismarine/commit/9258ef152ef8c0802eefc2cad93e1f8ddb950f46) Thanks [@filiphsps](https://github.com/filiphsps)! - Run ageable pause and reset effects, and drop data-defined items when entities grow up.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`77b1f12`](https://github.com/JSPrismarine/JSPrismarine/commit/77b1f12d915cba79651d81892a3b856608b0bf42) Thanks [@filiphsps](https://github.com/filiphsps)! - Reuse the most recently used chunk map for navigation block-cache lookups.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`26da0bf`](https://github.com/JSPrismarine/JSPrismarine/commit/26da0bf7abd5cb9d81dbf6a1a0693240f8792850) Thanks [@filiphsps](https://github.com/filiphsps)! - Cache parsed breeding rules for repeated entity pair checks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2dc5fdd`](https://github.com/JSPrismarine/JSPrismarine/commit/2dc5fdd16f38979af1867f551e8120fa2d939c94) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement shared status effect state, persistence, and /effect and item actions.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`13147a3`](https://github.com/JSPrismarine/JSPrismarine/commit/13147a33e36e0f0a00fc5935b9b7f4862e8d686d) Thanks [@filiphsps](https://github.com/filiphsps)! - Track player bed-sleeping state so cats can fire `minecraft:on_wake_with_owner` when their
  owner wakes.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`040b98b`](https://github.com/JSPrismarine/JSPrismarine/commit/040b98b4ae75a9c412cb44748b97489a5a16ccea) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix minecraft:is_collidable actor metadata mapping.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c3f2676`](https://github.com/JSPrismarine/JSPrismarine/commit/c3f2676b1136a21b9df4ee0c5f155017fbb68974) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve command help with pagination, nested syntax, and the `/?` alias.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`41e6deb`](https://github.com/JSPrismarine/JSPrismarine/commit/41e6debc1db7e0623c76f240c892090acdc4aba0) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix End and Nether ambient light in server-side gameplay checks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e76cae8`](https://github.com/JSPrismarine/JSPrismarine/commit/e76cae87a6268feaa67850a37ede578ba6820f33) Thanks [@filiphsps](https://github.com/filiphsps)! - Load Bedrock item tags and components into content

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0e8bc4e`](https://github.com/JSPrismarine/JSPrismarine/commit/0e8bc4e277ac303209baa9fd7090b942ceb39ad4) Thanks [@filiphsps](https://github.com/filiphsps)! - Reduce allocation for family-filtered entity neighbor queries.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5a45ebf`](https://github.com/JSPrismarine/JSPrismarine/commit/5a45ebfefcb641b864b6410cb108fb1d0af5f104) Thanks [@filiphsps](https://github.com/filiphsps)! - Project navigation and climbing capabilities to Bedrock actor metadata flags.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4ab02e5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ab02e5cf76b88f09ba19106e971337c1da2d1b9) Thanks [@filiphsps](https://github.com/filiphsps)! - Pass sneak state to block interactions so copper doors and trapdoors can wax or scrape correctly.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8ab8262`](https://github.com/JSPrismarine/JSPrismarine/commit/8ab82622b9be169bccd794f43b151a9685708cc7) Thanks [@filiphsps](https://github.com/filiphsps)! - Let `minecraft:can_stand_on_powder_snow` affect pathfinding and body collision.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d0b36e7`](https://github.com/JSPrismarine/JSPrismarine/commit/d0b36e7d517f9f057cadbc261c6a77d3cb58329a) Thanks [@filiphsps](https://github.com/filiphsps)! - Route server fluid ticks through data-driven block families, expose liquid state reading from block behaviors, and remove fluid handling from `Engine`.

- [#2612](https://github.com/JSPrismarine/JSPrismarine/pull/2612) [`b6ad6d8`](https://github.com/JSPrismarine/JSPrismarine/commit/b6ad6d8bff135055b0a6edda5c16d0b8a15b6196) Thanks [@filiphsps](https://github.com/filiphsps)! - Write chunk version 42 for current Bedrock format

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c219d66`](https://github.com/JSPrismarine/JSPrismarine/commit/c219d664ece65b6a8708eddc9de4f2bea59a0f20) Thanks [@filiphsps](https://github.com/filiphsps)! - Persist data-driven projectile flight state

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b96ce93`](https://github.com/JSPrismarine/JSPrismarine/commit/b96ce93238f3efd66c709f213cd8d5d42fc8f425) Thanks [@filiphsps](https://github.com/filiphsps)! - Spawn eggs now work on targeted entities, and matching eggs create babies for entity data that enables `minecraft:spawn_egg_interaction`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3c86e27`](https://github.com/JSPrismarine/JSPrismarine/commit/3c86e279350e4b8dd7c67c6ab84e9ab5b617faea) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-driven `minecraft:spawn_entity` timers through the live entity runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f0f35a9`](https://github.com/JSPrismarine/JSPrismarine/commit/f0f35a93d27de42add44b3d3da86ff43cb760c37) Thanks [@filiphsps](https://github.com/filiphsps)! - Find a world's spawn from the terrain instead of from finished chunks.
  
  `World.findSurfaceSpawn` widens in 8-block rings to a radius of 256 and asked `getChunkAt` for
  every candidate, so each one was a fully generated chunk: carved, surfaced, decorated and
  translated. A seed whose origin is open ocean pays that for every chunk between the origin and the
  nearest shore, and it pays it before the start region prints its first line. At seed 1234 the
  origin region is all ocean - 3601 of the 3602 candidates before the shore read as water - and the
  search had generated 246 chunks in 330 seconds without reaching land, so a boot showed no progress
  at all.
  
  Generators may now offer `surfaceAt`, which reports the topmost block of one noise column without
  generating anything. That is Java's `ChunkGenerator.getBaseHeight`, and it is what Java's own spawn
  finding asks. The overworld answers from the bare terrain it already lays structures out against;
  a generator that offers nothing cheaper keeps the old path.
  
  On a fresh server directory at seed 1234, the overworld's start region now prints and finishes 9
  chunks in 6.6 seconds, with the world ready 27 seconds after it began loading, where before it had
  generated nothing anyone could see after 396 seconds. At `preload-radius: 3` it is 49 chunks in
  14.4 seconds.
  
  No generated block moves. The spawn position does change for a seed where the old search settled on
  decoration: it now lands on the ground rather than on whatever grew there, since bare terrain never
  puts a leaf or a flower on top of a column.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8036594`](https://github.com/JSPrismarine/JSPrismarine/commit/8036594cf227ad9bef07b0262e20c402970d6416) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve data-driven mob movement with collision, gravity, and jumping

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7273d5c`](https://github.com/JSPrismarine/JSPrismarine/commit/7273d5c5298fcfc117982297ce78c845b397d36a) Thanks [@filiphsps](https://github.com/filiphsps)! - Show a stack growing when items are picked up onto it. A slot holds its count on the entry and on
  the item, and a pickup raised only the entry's, while the client is sent the item's: two dirt
  picked up one at a time showed as one in the hotbar. A split stack also lost its enchantments,
  durability and name. Both now go through the new `Item.withCount`, which copies the whole stack.
  
  A block whose drop has no item id now drops nothing and logs it, instead of putting an item that
  holds air on the ground.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f3e65d9`](https://github.com/JSPrismarine/JSPrismarine/commit/f3e65d9da9f6112987809bb5c876857a83b584d6) Thanks [@filiphsps](https://github.com/filiphsps)! - Restore legacy TNT and falling blocks into the data-driven runtime

- [#2618](https://github.com/JSPrismarine/JSPrismarine/pull/2618) [`f8b14e6`](https://github.com/JSPrismarine/JSPrismarine/commit/f8b14e64667966869b66153aade92c1df0850266) Thanks [@filiphsps](https://github.com/filiphsps)! - Convert existing YAML configs to config.json on startup

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9952331`](https://github.com/JSPrismarine/JSPrismarine/commit/99523316ac9152efd92ddb7ddf0617b9be7c78ab) Thanks [@filiphsps](https://github.com/filiphsps)! - Track liquid occupancy and use each entity's underwater movement speed.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3a4b571`](https://github.com/JSPrismarine/JSPrismarine/commit/3a4b57124edf4cd750d0e5a3347698e950118ffe) Thanks [@filiphsps](https://github.com/filiphsps)! - Restore item drops and resolve crafting requests against the advertised Java recipes.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`569baa3`](https://github.com/JSPrismarine/JSPrismarine/commit/569baa3a87288d9540b303d280eb0032a3cab736) Thanks [@filiphsps](https://github.com/filiphsps)! - Pass the command source dimension through `/summon` so entities enter the selected world.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b9b989b`](https://github.com/JSPrismarine/JSPrismarine/commit/b9b989b4136b0bd4cc29a43b8704a1748bfa8e6d) Thanks [@filiphsps](https://github.com/filiphsps)! - Pass Bedrock item tags into live entity interaction filters.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a3db50e`](https://github.com/JSPrismarine/JSPrismarine/commit/a3db50eef709e1d2e3848d71383d6801d5f69773) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply correct-tool rules to block loot and family drops.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e3fbb5f`](https://github.com/JSPrismarine/JSPrismarine/commit/e3fbb5f7f4db31c80f4d07a51065fc3b28a726c6) Thanks [@filiphsps](https://github.com/filiphsps)! - Parse `minecraft:strength` and include strength-based slots in entity inventory capacity.

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`52921d7`](https://github.com/JSPrismarine/JSPrismarine/commit/52921d75ccc80240b9d1ff07c7669926d2bf07b0) Thanks [@filiphsps](https://github.com/filiphsps)! - Spawn summoned entities with a neutral body pitch while preserving the command source yaw.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1b08aed`](https://github.com/JSPrismarine/JSPrismarine/commit/1b08aed5a46a79b19ee36c0cc644c958663d3c4b) Thanks [@filiphsps](https://github.com/filiphsps)! - Simulate the data-driven daylight burning component.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cc8b110`](https://github.com/JSPrismarine/JSPrismarine/commit/cc8b1109b9c174940cdd4549615a05affb459b9a) Thanks [@filiphsps](https://github.com/filiphsps)! - Play container open sounds once per open using block data

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`347a6eb`](https://github.com/JSPrismarine/JSPrismarine/commit/347a6eb7e9f08051697764cec9e1a883fbfa42c7) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop loading stackless level.json item snapshots into LevelDB worlds; migrate legacy world state into provider storage and remove the sidecar.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0906a5c`](https://github.com/JSPrismarine/JSPrismarine/commit/0906a5c44756148c85b742dca817db213fb8a34c) Thanks [@filiphsps](https://github.com/filiphsps)! - Handle block drops and container contents during environmental destruction.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`aedac18`](https://github.com/JSPrismarine/JSPrismarine/commit/aedac183fbdabb86c1140c67feab3cf21b8f0ce9) Thanks [@filiphsps](https://github.com/filiphsps)! - Fire `minecraft:on_start_takeoff` after a data-driven entity's ground jump.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`32ce6f2`](https://github.com/JSPrismarine/JSPrismarine/commit/32ce6f2f752e7e89c4445d1936e13a6e243a3a30) Thanks [@filiphsps](https://github.com/filiphsps)! - Preserve Java water states for kelp and water plants during fluid spread, and use Java's sturdy-face rule for kelp support.

- [#2618](https://github.com/JSPrismarine/JSPrismarine/pull/2618) [`b860eeb`](https://github.com/JSPrismarine/JSPrismarine/commit/b860eeba8e71f7a2758e730f66b37fab45849838) Thanks [@filiphsps](https://github.com/filiphsps)! - Use config.json as the default server configuration file

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`163c611`](https://github.com/JSPrismarine/JSPrismarine/commit/163c611a935d954736c43f98aad3bf7ffa875917) Thanks [@filiphsps](https://github.com/filiphsps)! - Move ageable result_item handling into the component hook

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a0c479e`](https://github.com/JSPrismarine/JSPrismarine/commit/a0c479e0ab28de8ba46bac842ddc90a50d9e679f) Thanks [@filiphsps](https://github.com/filiphsps)! - Tell a client which entities are standing on the ground.
  
  `MoveActorAbsolutePacket` wrote a zero header for every entity, so its on-ground flag was never set
  and a client fell back to its own guess for every mob on the server. The comment said the runtime
  modelled no grounded state to read, which is no longer true: a mob is carried through the air only
  while an impulse is still spending itself, and `EntityRuntime.coast` ends that by landing it on the
  first cell it cannot fall into.
  
  `Entity.isOnGround` is named apart from `Player.onGround`, which is the client's own report of the
  same fact for the entity it controls and which also pays out the fall damage a landing earned.
  Anything the server keeps no grounded state for reports false and is drawn from the client's guess,
  which is what every entity got while the flag was never set at all. The predicate view now answers
  `is_on_ground` for every entity rather than omitting it outside of players.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4359c6e`](https://github.com/JSPrismarine/JSPrismarine/commit/4359c6eb363d976a99cab7eb8c78345b0b0c8ead) Thanks [@filiphsps](https://github.com/filiphsps)! - Emit mob-attributed hurt feedback for runtime-applied damage.

- [#2612](https://github.com/JSPrismarine/JSPrismarine/pull/2612) [`4158282`](https://github.com/JSPrismarine/JSPrismarine/commit/4158282ba062f75acb4d64e4ab0f27c68051675e) Thanks [@filiphsps](https://github.com/filiphsps)! - Store player data in LevelDB records

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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2b58914`](https://github.com/JSPrismarine/JSPrismarine/commit/2b58914a6ba8c52933ea701e5464cbc81f53110e) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep water stored for generated kelp, seagrass, and waterlogged blocks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d06d825`](https://github.com/JSPrismarine/JSPrismarine/commit/d06d8258b8a875f15fbf4ae7b5a249377639742c) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply configured status effects on melee attacks.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`3549805`](https://github.com/JSPrismarine/JSPrismarine/commit/354980555c096e06c6a54c8d06a3710fa247a6b2) Thanks [@filiphsps](https://github.com/filiphsps)! - Pass per-connection ProtocolContext data through packet encode and decode paths.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`04c0fe4`](https://github.com/JSPrismarine/JSPrismarine/commit/04c0fe41679e246b8d668c29e91c7fad8c09a386) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement the missing wire direction for the 13 packets the codec baseline still permitted as
  one-way: `AddActorPacket`, `AddItemActorPacket`, `AddPlayerPacket`, `AvailableCommandsPacket`,
  `CraftingDataPacket`, `ItemRegistryPacket`, `ItemStackResponsePacket`, `LevelChunkPacket`,
  `NetworkChunkPublisherUpdatePacket`, `PlayerListPacket`, `SetActorDataPacket` and
  `UpdateSoftEnumPacket` gain `decodePayload`, and `ItemStackRequestPacket` gains `encodePayload`.
  Entity metadata and `PropertySyncData` gain the deserializers those packets read through, and the
  packet codec baseline is now empty.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`e5c062a`](https://github.com/JSPrismarine/JSPrismarine/commit/e5c062a229160888ecc4310040a6fdbb1a93dd20) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the server tick loop into a `prismarine:ticker` kernel module that publishes a `Ticker`
  service token. The loop itself is unchanged — fixed-epoch scheduling, the sliding-window TPS and
  smoothed tick-duration metrics, the two-second catch-up write-off, and the shutdown interaction all
  move verbatim — and `Server.getTick()`, `getTPS()`, and `getTickMs()` keep working as facades over
  the ticker. The module starts the loop on kernel start and stops it on kernel stop, so ticking now
  pauses across `Server.reload()` and resumes on a fresh scheduling epoch instead of repaying the
  downtime as a catch-up burst.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`40d1799`](https://github.com/JSPrismarine/JSPrismarine/commit/40d17998177b156c9d6f36843f29cea56fd248c5) Thanks [@filiphsps](https://github.com/filiphsps)! - Use wider entity-grid cells to reduce spatial query time.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`656a716`](https://github.com/JSPrismarine/JSPrismarine/commit/656a7167dd9cf7eb95b9e2b60297e526293c5af4) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry out data-defined entity item drop events.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9d563e8`](https://github.com/JSPrismarine/JSPrismarine/commit/9d563e84d11a5055459b7e45755bc5b15d38d34c) Thanks [@filiphsps](https://github.com/filiphsps)! - Allow shears to cut data-driven leash links

- [#2612](https://github.com/JSPrismarine/JSPrismarine/pull/2612) [`4039da2`](https://github.com/JSPrismarine/JSPrismarine/commit/4039da24f7ca0ca72ce4bc5205a9ae7c2e400014) Thanks [@filiphsps](https://github.com/filiphsps)! - Correct command argument protocol ids

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`eb60feb`](https://github.com/JSPrismarine/JSPrismarine/commit/eb60febd6336abbd90802bb09031d75ae9d84a5b) Thanks [@filiphsps](https://github.com/filiphsps)! - Wear tools as a Bedrock Dedicated Server 1.26.52 does. Nothing raised an item's `onMineBlock` hook,
  so a tool never lost durability on a break. A survival or adventure break now runs it: a wooden
  pickaxe wears by one a block on cobblestone and on dirt and by none on short grass, and a wooden
  sword wears by two a block on dirt, which is what BDS measured.
  
  The item behaviors now see a stack's durability spent and its enchantments, so a hoe, axe, shovel
  or pair of shears that runs out breaks and Unbreaking applies. A tool that breaks leaves the hand
  empty instead of staying on screen. Every item with durability sends its `Damage` tag, 0 while
  unused, byte for byte as BDS sends it; `ItemUserData.damage` is undefined for an item with none.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`2ef373e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ef373e14af0770122487912e366fdb3daafb027) Thanks [@filiphsps](https://github.com/filiphsps)! - Stand a player's feet at the coordinates a same-world `/tp` names. The command wrote them in as the player's eyes, so `/tp 10 70 10` put the feet at 68.38 within a world while the cross-dimension branch already put them at 70.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2deb53b`](https://github.com/JSPrismarine/JSPrismarine/commit/2deb53bffe18e24f93ef8d037c70e4cb0d8efe65) Thanks [@filiphsps](https://github.com/filiphsps)! - Take a block entity's type from its block when a structure processor made the compound, so a
  trail ruins suspicious gravel reaches a chunk with a loot table on it. A rule's `append_loot`
  modifier writes a compound holding a loot table and nothing else. Java needs no more than that,
  because the suspicious gravel block already has a block entity and the rule only adds the table
  to it. The conversion to a block entity request required an `id` on the compound and dropped the
  whole compound without one, so all three trail ruins archaeology processor lists came to nothing.
  
  In a generated world at seed 1234, the trail ruins at chunk -113,50 placed 76 suspicious gravel
  across its chunks and no block entities at all. It now places 76, carrying
  `loot_tables/archaeology/trail_ruins_common.json` and
  `loot_tables/archaeology/trail_ruins_rare.json` between them.
  
  `bedrockBlockEntityIds.ts` answers the type, from the Bedrock block identifier through the Bedrock
  id to the Java `block_entity_type` a request names. The inverse of the Java table is derived
  rather than written out, and is not quite a function, because Bedrock files a trapped chest under
  the same `Chest` as a plain one. Nothing downstream can tell, since the answer is turned straight
  back into the id both types share.
  
  Nothing else in the game data writes a compound without a type. All 5597 block entities Java
  26.3's 1511 structure templates save name one, and `append_loot` is the only processor that builds
  a compound at all.
  
  Suspicious sand is unchanged, because none of it reaches a generated chunk today. A comment in
  `javaStructureScattered.ts` records that the desert pyramid leaves its four corridors out. Java's
  ocean ruin templates carry no suspicious block. The desert well's feature holds the only other
  `append_loot` in the game data and places its template through `placeJavaTemplate`, which writes
  blocks and no block entities, and which reads a processor list only by name where the desert well
  writes one inline.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`b5a67c2`](https://github.com/JSPrismarine/JSPrismarine/commit/b5a67c2ecd505de2d0b80be482ff63a0e4c7ba59) Thanks [@filiphsps](https://github.com/filiphsps)! - Extract the network transport seam: RakNet is wrapped behind a `Transport`/`TransportConnection` interface, connection and packet routing move from inline `Server.bootstrap` closures into a tested `NetworkDispatcher`, and `MinecraftSession` depends on the transport connection instead of the RakNet session. Behavior on the wire is unchanged.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`44af981`](https://github.com/JSPrismarine/JSPrismarine/commit/44af98118f826cc9cb9394083d3904ba68260382) Thanks [@filiphsps](https://github.com/filiphsps)! - Reduce repeated data-driven tag resolution during brain block searches

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`fbebf0e`](https://github.com/JSPrismarine/JSPrismarine/commit/fbebf0ed51a1bb06c7f9f48939f03f46a6077c47) Thanks [@filiphsps](https://github.com/filiphsps)! - Preserve Java recipe variants in Bedrock crafting data

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`db7f57b`](https://github.com/JSPrismarine/JSPrismarine/commit/db7f57b12941bf4a441c386df918274680b8b10a) Thanks [@filiphsps](https://github.com/filiphsps)! - Sort small entity query results without decorating each result

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`439eb59`](https://github.com/JSPrismarine/JSPrismarine/commit/439eb59cfd5c5bea9050c4945b8a57f0038ecd66) Thanks [@filiphsps](https://github.com/filiphsps)! - Preserve captured Bedrock components for vanilla items

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7ddfa43`](https://github.com/JSPrismarine/JSPrismarine/commit/7ddfa4319dcf42685218014950ad48dafbacc051) Thanks [@filiphsps](https://github.com/filiphsps)! - Move breed item handling into component hooks

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`a645006`](https://github.com/JSPrismarine/JSPrismarine/commit/a645006caa290b45c728b7ad87435249091cbd56) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry an `onUseOn` behavior's stack result back to the player's hand, so bone meal and other consumables used on a block are spent. An `onPlayerInteract` block hook can now answer with `{ consumed: true, consumesHeldItem: true }`, which the interaction dispatch charges to the hand outside creative; the portal family uses it to spend the eye of ender that fills an end portal frame.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`03e7f72`](https://github.com/JSPrismarine/JSPrismarine/commit/03e7f729a0fd42a8c6cb42582914f646b4a6762d) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply minecraft:interact add_items loot to the player inventory.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5a1ab40`](https://github.com/JSPrismarine/JSPrismarine/commit/5a1ab4010008ca1065cc934efb11701831d2c8ac) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-defined entity interaction filters, events, and held-item transformations through the live inventory.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`6821ad2`](https://github.com/JSPrismarine/JSPrismarine/commit/6821ad2f2100b87c6750a4fe086dd6e52265a08d) Thanks [@filiphsps](https://github.com/filiphsps)! - Ask the block below a plant for Java's support tag, not for a sturdy top face.
  
  The generated world grew grass on exposed stone, dark oaks and oaks on top of the huge mushrooms
  in the dark forest, and trees on bare stone and gravel. All three came from one approximation in
  the data-driven generator's block oracle: `canSurvive` answered yes for any block that was not a
  full cube standing on a block with a sturdy top face. Stone, gravel, sandstone, deepslate, snow
  blocks, packed ice, logs and the mushroom blocks all have one.
  
  Java does not ask that. `VegetationBlock.mayPlaceOn` is `state.is(BlockTags.SUPPORTS_VEGETATION)`,
  which resolves to `#minecraft:dirt`, `#minecraft:mud`, `#minecraft:moss_blocks`,
  `#minecraft:grass_blocks` and farmland, and a subclass that wants a different base names its own
  tag. The oracle now carries that association from the placed block to its support tag and reads
  the membership out of the datapack's own `tags/block`, so the sapling and small flower lists stay
  where Mojang writes them. Cactus, sugar cane, bamboo, the lily pad, the mangrove propagule, the
  wither rose, the azaleas and the dry grasses each get the tag their block class tests.
  
  The sturdy top face rule stays as the fallback, because that is what `LeafLitterBlock` and the
  other `canSurvive` overrides that read `isFaceSturdy` genuinely do.
  
  This moves generated worlds. Plants and trees no longer land on stone or gravel, and a rejected
  position leaves the feature's random stream where it was, so later features in the same chunk
  place differently, the way they do in Java.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cd01052`](https://github.com/JSPrismarine/JSPrismarine/commit/cd01052548178421cd323b316d77d87374cee9dc) Thanks [@filiphsps](https://github.com/filiphsps)! - Project Java repair materials into Bedrock item components

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bed113d`](https://github.com/JSPrismarine/JSPrismarine/commit/bed113d91a2de02b80d5688c3f43eadf802271c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve optional tag members against loaded content and normalize default namespaces.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4d8347a`](https://github.com/JSPrismarine/JSPrismarine/commit/4d8347ad5b756160a405fb105c4b4f1391450829) Thanks [@filiphsps](https://github.com/filiphsps)! - Wire `/weather` to the weather cycle. The command was held back while nothing raised rain or
  thunder; the cycle now exists, so `/weather` sets it and reads it back.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`62adb46`](https://github.com/JSPrismarine/JSPrismarine/commit/62adb46d01dcc35fca9449b2afa80dcf2641e071) Thanks [@filiphsps](https://github.com/filiphsps)! - Restore level-file entities through the data runtime

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e45352f`](https://github.com/JSPrismarine/JSPrismarine/commit/e45352f21e15711f6dac0e5622d0320d46ccc4c6) Thanks [@filiphsps](https://github.com/filiphsps)! - Aim data-driven entities from their eye height when tracking targets.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`2bc247b`](https://github.com/JSPrismarine/JSPrismarine/commit/2bc247b3ca88cb38663bfdbc9e49926b5fbca146) Thanks [@filiphsps](https://github.com/filiphsps)! - Move the `GameRule` wire structure and its codecs to `network/type/GameRule`, and import `ActorEvent` from `@jsprismarine/minecraft` in entity and world code. `GameRulesChangedPacket` and `ActorEventPacket` keep deprecated re-exports, so existing imports still work.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0527ffa`](https://github.com/JSPrismarine/JSPrismarine/commit/0527ffacdbf37e49d105227c719d73b7ca4683e7) Thanks [@filiphsps](https://github.com/filiphsps)! - Honor Java structure-only natural spawn overrides

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`286e343`](https://github.com/JSPrismarine/JSPrismarine/commit/286e3433af815a68a7421cc3d5b03685ea27296e) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose the module kernel as the supported service API and finish the phase 6 server extractions.
  
  - `Server.getKernel()` returns the kernel; the package index now exports the service token barrel
    (`bansToken`, `permissionsToken`, `recipesToken`, `stationsToken`, `chatToken`, `queryToken`,
    `tickerToken`, `networkToken`) plus `Kernel`, `createToken`, and the `Module`/`ModuleContext`/
    `ServiceToken` types.
  - The kernel-backed `getXxxManager()` getters are deprecated in favor of
    `server.getKernel().get(token)`. They keep working unchanged.
  - RakNet listener wiring moved into a `prismarine:network` module providing a `Networking` service;
    startup and shutdown ordering are unchanged, as is `Server.bootstrap(ip, port)`.

- [#2618](https://github.com/JSPrismarine/JSPrismarine/pull/2618) [`a11f107`](https://github.com/JSPrismarine/JSPrismarine/commit/a11f1076201f18457ca0a51e313c2a0afde86b9e) Thanks [@filiphsps](https://github.com/filiphsps)! - Add versioned Draft 7 schemas for runtime JSON files

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`93b891a`](https://github.com/JSPrismarine/JSPrismarine/commit/93b891a9b26cbeb5a0872759b33558857daaca2a) Thanks [@filiphsps](https://github.com/filiphsps)! - Route block and block entity changes through a typed `WorldChange` stream: the world emits `block-set` and `block-entity-set` changes through its change sink's `worldChanged`, and the network replicator translates them into packets. The wire behavior is unchanged.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`70d10a0`](https://github.com/JSPrismarine/JSPrismarine/commit/70d10a0de3b0ea90dc2e900edfd85024dd55e837) Thanks [@filiphsps](https://github.com/filiphsps)! - `WorldManager` loads every `worlds.*` entry as a `Level`, with `level-name` as the default. The
  stems of a level come from its `preset`, with each `dimensions.<id>` entry replacing that stem's
  type or generator or adding a dimension; the Overworld is built at startup and the other stems on
  first entry unless the entry says `load: 'eager'`. A save that already carries `worldGenSettings`
  keeps those stems over the config, and the server logs each dimension whose saved generator kind
  differs from the configured one; a save without them gets them on its first load. An entry still
  written as `generator` and `layers` is logged as deprecated once and written back through
  `Config.setWorld` as `preset` and `dimensions`. `getDefaultLevel()`, `getWorldByDimension(id)` over
  the default level's loaded worlds and `worldFor(id)`, which builds a lazy dimension, are new;
  `loadLevel` replaces `loadWorld`, and `getWorlds()` is deprecated. `BaseProvider.setLevel` takes
  the save's name and seed, which is all a format reads from its level. The command layer resolves
  dimensions through the default level and accepts every stem's dimension, and `/teleport` into
  another dimension waits for the world change before it sets the position.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`b74581e`](https://github.com/JSPrismarine/JSPrismarine/commit/b74581ecc39ef3496abef11427fa30d1f78993f6) Thanks [@filiphsps](https://github.com/filiphsps)! - A `worlds.<name>` entry in `config.json` now reads as `{ seed, provider, preset?, dimensions? }`.
  `preset` is a Java `worldgen/world_preset` id and defaults to `minecraft:normal`; each
  `dimensions.<id>` entry may set that dimension's `type`, `generator` (a level stem generator
  object) and `load` (`eager` or `lazy`). The old `generator: 'Overworld' | 'Flat'` and `layers`
  keys are deprecated but still read: `normalizeWorldData` translates them row for row into the new
  shape and reports what it translated, `worldDataOf` gives the entry to write back, and
  `Config.setWorld` stores it. A new config writes `preset: 'minecraft:normal'` instead of
  `generator: 'Overworld'`. The JSON schema marks `generator` and `layers` deprecated.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`46c5f40`](https://github.com/JSPrismarine/JSPrismarine/commit/46c5f406a2aab5dd5b32a7a0d024e065545bbeed) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop a world shutdown from racing its own start region. `World.disable` saved the world and closed
  the provider while the preload was still generating chunks, so the next chunk request reached a
  closed LevelDB and threw "The world provider is not enabled" out of `World.enable` - a rejection
  nothing on the startup path catches. Every dev-watcher restart during the 441 chunk preload ended
  that way, which is most of them.
  
  `World` now tracks where it is in its own shutdown. `disable` marks the world closing, which stops
  the preload at its next batch boundary and stops the tick, waits for the start region work already
  in flight so that every chunk it generated is saved rather than dropped, saves, and closes the
  provider last.
  
  `saveLevelData` writes the spawn point the world already knows instead of resolving one. Resolving
  it searches for dry land, and searching generates terrain, so saving a world used to generate
  chunks - from inside the autosave's tick, and from the middle of a shutdown. `World.enable` settles
  the spawn once, up front, so there is one to write by the time anything saves. A world whose spawn
  is still unknown writes the rest of its level data and leaves the stored spawn where it is.
  
  `savePlayerData` declines once the world has closed. A shutdown kicks everyone, and each client's
  connection closes after the world has already saved and gone, so every player produced a "Failed to
  save player data" error against a provider that was no longer there.
  
  `Progress.finish` takes an optional note, so a run that stopped early says so instead of reporting
  work it never did.

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

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`62ca946`](https://github.com/JSPrismarine/JSPrismarine/commit/62ca94600095745c7b58a3e647d457498070e1bf) Thanks [@filiphsps](https://github.com/filiphsps)! - Read the data-driven generator's Java world generation registries out of the pack stack
  `@jsprismarine/packs` composes instead of walking the vanilla datapack directory.
  `loadJavaWorldgenRegistriesFrom(definitions, reports)` projects a loaded `Definitions` object
  into the generator's registries, `loadJavaWorldgenRegistries(sources)` stays as a wrapper over a
  one-member stack of the vanilla datapack, and `JavaWorldgenRegistries` gains `dimensionTypes`,
  `dimensions`, `worldPresets`, `flatLevelGeneratorPresets` and `multiNoiseParameterLists`. The
  biome parameter reports are not datapack content and keep their own reader. Generated chunks do
  not change.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`7c239b3`](https://github.com/JSPrismarine/JSPrismarine/commit/7c239b31aa952c226fbb9f5b916641604158ef4d) Thanks [@filiphsps](https://github.com/filiphsps)! - `WorldManager` builds the Java worldgen registries its levels read from the server's composed
  pack stack instead of from the vanilla datapack alone, so a datapack in the stack can add a
  `dimension_type` or a `worldgen/noise_settings` document and a stem can name it. The `preset`
  a world names resolves against the built-in two presets with every `worldgen/world_preset` the
  stack carries over them. The deprecated `Overworld` generator class keeps reading the vanilla
  datapack for itself and opens its own worker pool, as its JSDoc now says; it goes in the next
  release.

- [#2612](https://github.com/JSPrismarine/JSPrismarine/pull/2612) [`a592bfb`](https://github.com/JSPrismarine/JSPrismarine/commit/a592bfb22322d7950da5b9a84e52e51de81cad9b) Thanks [@filiphsps](https://github.com/filiphsps)! - Correct the Bedrock chunk tag ids

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2291a0d`](https://github.com/JSPrismarine/JSPrismarine/commit/2291a0d0ce40d73af8eb09cf0e46cfa2ab79db5c) Thanks [@filiphsps](https://github.com/filiphsps)! - Support entity take-item interactions
- Updated dependencies [[`30c3b75`](https://github.com/JSPrismarine/JSPrismarine/commit/30c3b757659005a41f24948cb22c1aad2d7c0a8d), [`89ab0e0`](https://github.com/JSPrismarine/JSPrismarine/commit/89ab0e0af955bbd8212b9761f044507da2d42dff), [`35dc8ab`](https://github.com/JSPrismarine/JSPrismarine/commit/35dc8ab56ba8acf18a68357c3c0ca1e4ed1f8801), [`3f0e622`](https://github.com/JSPrismarine/JSPrismarine/commit/3f0e6228843e07f161a665424b7d7fad69273188), [`94378af`](https://github.com/JSPrismarine/JSPrismarine/commit/94378afa7703ea12239c4837f8b18fbc4b5974cc), [`d4d0080`](https://github.com/JSPrismarine/JSPrismarine/commit/d4d00808c51e69517519dd35cc4071952387c88b), [`f60ce7d`](https://github.com/JSPrismarine/JSPrismarine/commit/f60ce7dd0fef48e4f586f4c307b215e370a69d17), [`b8ee548`](https://github.com/JSPrismarine/JSPrismarine/commit/b8ee548b13eb663a2aab41a4197e054854b4e2db), [`f5ea701`](https://github.com/JSPrismarine/JSPrismarine/commit/f5ea701bd7297d63eb524be1d4b76c07cf204569), [`428fd29`](https://github.com/JSPrismarine/JSPrismarine/commit/428fd2953c93ea8472696575798735a4a36ec51b), [`d5dc760`](https://github.com/JSPrismarine/JSPrismarine/commit/d5dc760107a1dbc9c5ba9eb5fc9fb544d725c02d), [`c140ef6`](https://github.com/JSPrismarine/JSPrismarine/commit/c140ef6e3072eb97c7a8b123876ea08726ed9910), [`91a7a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/91a7a0bfac2eac8c81961d5263e54b53dc0c3fc5), [`232a1ce`](https://github.com/JSPrismarine/JSPrismarine/commit/232a1ce20b5ade2e33b703300fb671f0c3f62076), [`e0b6601`](https://github.com/JSPrismarine/JSPrismarine/commit/e0b6601c7d15192bf5067a4b6c0dd7aa6741e2f9), [`760fe99`](https://github.com/JSPrismarine/JSPrismarine/commit/760fe99a8336fdaf1fdf38ef8b097da1dd199a1d), [`ea083fb`](https://github.com/JSPrismarine/JSPrismarine/commit/ea083fb8d67d0c285724b73bf94b41947afc4013), [`f33a57c`](https://github.com/JSPrismarine/JSPrismarine/commit/f33a57c3750488f1ed77a441ab26b7c1086eff68), [`cde1039`](https://github.com/JSPrismarine/JSPrismarine/commit/cde1039d276df8d3787b361e072fafdb32a6da9a), [`f3fa1c6`](https://github.com/JSPrismarine/JSPrismarine/commit/f3fa1c6bf9096223ac9d2b0396bcc71cd04e244e), [`57f252b`](https://github.com/JSPrismarine/JSPrismarine/commit/57f252b2781508290fac2e842cf37fb652467d66), [`f8a43ce`](https://github.com/JSPrismarine/JSPrismarine/commit/f8a43ce910da3d8e1c88091c8886a7c1d09ab0c0), [`d4afedd`](https://github.com/JSPrismarine/JSPrismarine/commit/d4afeddfc1a6016173261b800813e9f248208db8), [`89a02c8`](https://github.com/JSPrismarine/JSPrismarine/commit/89a02c81dd66293ab2b303851aad61c891535081), [`bfb9a31`](https://github.com/JSPrismarine/JSPrismarine/commit/bfb9a31a40c8173f1b811ee63b2308f357c47fd0), [`4fd861a`](https://github.com/JSPrismarine/JSPrismarine/commit/4fd861abbae002d42f680a9e17c85f6e37fdb8d1), [`b3a2a6f`](https://github.com/JSPrismarine/JSPrismarine/commit/b3a2a6f2d8baca370c541439257bfb4dc4786902), [`fd8d132`](https://github.com/JSPrismarine/JSPrismarine/commit/fd8d132d15fb3e3d98e2dc4b00ec2676ce16e6b1), [`09979cd`](https://github.com/JSPrismarine/JSPrismarine/commit/09979cd9e3d6e3971f7d3e3d370f9a32473b8bf4), [`ff19749`](https://github.com/JSPrismarine/JSPrismarine/commit/ff19749df1f7e776064bd80a13547dcc9c421ac1), [`e96d1b7`](https://github.com/JSPrismarine/JSPrismarine/commit/e96d1b76f18207192a9e815e6a2a558a8c4005ff), [`3e00071`](https://github.com/JSPrismarine/JSPrismarine/commit/3e00071b6842b6a9769032fbfc066ee0c3a75299), [`1583bc0`](https://github.com/JSPrismarine/JSPrismarine/commit/1583bc08667502a555ca4bb43056bf98c5f66f20), [`0d64a00`](https://github.com/JSPrismarine/JSPrismarine/commit/0d64a00ec60a7c2064030bfdcec0b2ca26de5236), [`376f8e2`](https://github.com/JSPrismarine/JSPrismarine/commit/376f8e258ba349d5fa5d7c496b3aa6b8045dec46), [`91eaefa`](https://github.com/JSPrismarine/JSPrismarine/commit/91eaefae197242e2476901190792924edcabb0fe), [`09883cc`](https://github.com/JSPrismarine/JSPrismarine/commit/09883cceba7c537b878891ee0200d8e6d52b8e48), [`b6eccf4`](https://github.com/JSPrismarine/JSPrismarine/commit/b6eccf49493ed702c5c13eb831ad9fa54258a47d), [`b194cc3`](https://github.com/JSPrismarine/JSPrismarine/commit/b194cc3b8a647bd944f78b60903cf23edcc04d1b), [`c9d1849`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d1849bc559d8222140b20852f7af89074660d6), [`e17199e`](https://github.com/JSPrismarine/JSPrismarine/commit/e17199e28be25659495b398dc05d6a48baa2b593), [`14ff23a`](https://github.com/JSPrismarine/JSPrismarine/commit/14ff23ad9b2df838457f98d58fcef567d7242d68), [`59b7764`](https://github.com/JSPrismarine/JSPrismarine/commit/59b7764f55d61489763474c4e25751ea6a60fa89), [`153ef65`](https://github.com/JSPrismarine/JSPrismarine/commit/153ef650f6a99338115fac97ce4face3a59ededf), [`9617d18`](https://github.com/JSPrismarine/JSPrismarine/commit/9617d187fd9dad87384a46b57548d94441123eeb), [`c59762e`](https://github.com/JSPrismarine/JSPrismarine/commit/c59762eb7d8d7e58bd477e48de087667c565045b), [`182066c`](https://github.com/JSPrismarine/JSPrismarine/commit/182066cbdd69eb2fcbe6456efc3c4c31462db59e), [`2ea0264`](https://github.com/JSPrismarine/JSPrismarine/commit/2ea0264cadb5621e9b4e5f8eff140df570366a76), [`cfaf00d`](https://github.com/JSPrismarine/JSPrismarine/commit/cfaf00d727b7a3e8a6dc0815fe75fb53c420b325), [`2622782`](https://github.com/JSPrismarine/JSPrismarine/commit/262278286682d66bbd354b77de4965e8ea8d273b), [`18f0d0c`](https://github.com/JSPrismarine/JSPrismarine/commit/18f0d0ca7bfb691c75d2d2453eb21b0126e4a4e3), [`bd32c08`](https://github.com/JSPrismarine/JSPrismarine/commit/bd32c08eac967ec9e0068cd56cf1788053539a6b), [`c05aede`](https://github.com/JSPrismarine/JSPrismarine/commit/c05aede46fe83da30912ee8c20c99984fc313f9a), [`0dac56a`](https://github.com/JSPrismarine/JSPrismarine/commit/0dac56a679dfcb3b0a2953e1bb451592833ec2a4), [`dbdbe5c`](https://github.com/JSPrismarine/JSPrismarine/commit/dbdbe5cfb8e43929ad1f4687bc5eed8353c5525d), [`b79c330`](https://github.com/JSPrismarine/JSPrismarine/commit/b79c33066896e4639b4c5a06b6739add55a3d361), [`ca2b1d0`](https://github.com/JSPrismarine/JSPrismarine/commit/ca2b1d0607a3ee8dba90b78175870044266934b4), [`efe67c0`](https://github.com/JSPrismarine/JSPrismarine/commit/efe67c07af9bf5f951666e0fdaea628aecb3d728), [`99d3b92`](https://github.com/JSPrismarine/JSPrismarine/commit/99d3b92dbd5aaf8df7af54d3a7fee60f7b4da33c), [`84c654b`](https://github.com/JSPrismarine/JSPrismarine/commit/84c654beb9c4fc383c167485a558cbd76824e6aa), [`459b7db`](https://github.com/JSPrismarine/JSPrismarine/commit/459b7dbc50083483e4341062bfc6d20a69fd2795), [`7045f2f`](https://github.com/JSPrismarine/JSPrismarine/commit/7045f2f8fc58cf9296e2a5b52d31f0d54ec83c8f), [`8ea92d7`](https://github.com/JSPrismarine/JSPrismarine/commit/8ea92d76a3d9a95ef2898a07242538556eca5f71), [`2e922ce`](https://github.com/JSPrismarine/JSPrismarine/commit/2e922ce3b1e06c27fbcfac65d2d01a977f2e5ccc), [`9dffb9a`](https://github.com/JSPrismarine/JSPrismarine/commit/9dffb9aa993febd34d79d0bd40afb4334bcd09fa), [`3561178`](https://github.com/JSPrismarine/JSPrismarine/commit/3561178664c8a57459f841687f80e6c4be9c2661), [`94793d0`](https://github.com/JSPrismarine/JSPrismarine/commit/94793d040e3e687f3698758c6aac5e18b8df5c5f), [`9ec832e`](https://github.com/JSPrismarine/JSPrismarine/commit/9ec832e9cb80462b10f2f9584af2e73bc327a498), [`a6ac7fb`](https://github.com/JSPrismarine/JSPrismarine/commit/a6ac7fbf544857054537cae5befea249aa44b186), [`2df14f8`](https://github.com/JSPrismarine/JSPrismarine/commit/2df14f843bce26edf0b4da6ddc83b1fa2fef323a), [`8dcafc0`](https://github.com/JSPrismarine/JSPrismarine/commit/8dcafc0df27c1211ef7a243e903f80d5a7d868c2), [`af7c3fb`](https://github.com/JSPrismarine/JSPrismarine/commit/af7c3fb379ae8a76c488bb5bb282ca482995acc8), [`d6c235d`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c235da420d30ee681ea6c74fc229e2307bedb5), [`d4a2a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/d4a2a0b2787e171583e6db0aec1b750e8aeb1e95), [`4ebf807`](https://github.com/JSPrismarine/JSPrismarine/commit/4ebf807cb8ce8e1cbf6b1d85d204f072a55f7b5a), [`59a3e5c`](https://github.com/JSPrismarine/JSPrismarine/commit/59a3e5c5b910027bcb07b47ed65faa177a2c8d98), [`5a0b34b`](https://github.com/JSPrismarine/JSPrismarine/commit/5a0b34b3da74e8c0d4d1e83ddab701563c9505ce), [`7ee8d6c`](https://github.com/JSPrismarine/JSPrismarine/commit/7ee8d6cfd30248841511bc6fb4f69e2db705b96d), [`5f40641`](https://github.com/JSPrismarine/JSPrismarine/commit/5f406411e3ccde1c42207e66949b5c93429ffccb), [`3a673cf`](https://github.com/JSPrismarine/JSPrismarine/commit/3a673cf89f9c11a8c3ba503c7a62dfc21ca1b5b0), [`23bfa3d`](https://github.com/JSPrismarine/JSPrismarine/commit/23bfa3dcd39e963d7cc41aef68a7be74e4d4a06a), [`931294b`](https://github.com/JSPrismarine/JSPrismarine/commit/931294b82cad6bc2ed4d65a68c36e3c7c560bf00), [`82679b5`](https://github.com/JSPrismarine/JSPrismarine/commit/82679b595802f95dd7012e756215776ee1883a81), [`9f58b70`](https://github.com/JSPrismarine/JSPrismarine/commit/9f58b7012e39f08ef869149252312f3617c5d057), [`440e164`](https://github.com/JSPrismarine/JSPrismarine/commit/440e164b88f43548c9c4fe8ae896387157f21701), [`bf9bb09`](https://github.com/JSPrismarine/JSPrismarine/commit/bf9bb0905c5278e4ffc2fd88a7eebe62db6c7ea3), [`c0ccdfe`](https://github.com/JSPrismarine/JSPrismarine/commit/c0ccdfeb805c0869006d380408dc74f84496ddaf), [`6f75f38`](https://github.com/JSPrismarine/JSPrismarine/commit/6f75f3808e7b5ddebcd16fa5a9f9dd33787f8043), [`ee83909`](https://github.com/JSPrismarine/JSPrismarine/commit/ee83909459951c39b8e44e48a80c2e1848741f49), [`d66cf52`](https://github.com/JSPrismarine/JSPrismarine/commit/d66cf527b79391e194f85137e1e5b573993c7947), [`3d31eca`](https://github.com/JSPrismarine/JSPrismarine/commit/3d31ecaa4cb2b13394deacdfc3b95ae4eb0de51e), [`9f5dcbe`](https://github.com/JSPrismarine/JSPrismarine/commit/9f5dcbeff3a03f2061efb3d6179def3ef176c62b), [`eee1692`](https://github.com/JSPrismarine/JSPrismarine/commit/eee1692f9692eb172a6ba6abbb64e46daa060a9c), [`2244da2`](https://github.com/JSPrismarine/JSPrismarine/commit/2244da2ab1a8f6b1f46d42a68de40af4e8023e2d), [`2f86764`](https://github.com/JSPrismarine/JSPrismarine/commit/2f86764d56a7e9ae5038854c27dd8fc9b3dfd0de), [`2bc83d4`](https://github.com/JSPrismarine/JSPrismarine/commit/2bc83d4e6b2cca1e29a091753300862fa84006ab), [`3ce20e2`](https://github.com/JSPrismarine/JSPrismarine/commit/3ce20e248ddf68967062a79a0b5766bf8ac4fa8c), [`fee087d`](https://github.com/JSPrismarine/JSPrismarine/commit/fee087d594e2a2961e5b75d7d16403518c143a14), [`1606252`](https://github.com/JSPrismarine/JSPrismarine/commit/16062522d82a4d15282a6bdf4bb027394cacd3e6), [`2c459cd`](https://github.com/JSPrismarine/JSPrismarine/commit/2c459cd2ab8822f0364c1ce8e473cf0487b294a8), [`a825e54`](https://github.com/JSPrismarine/JSPrismarine/commit/a825e5478baccfc586fc3acd3fd5d8d9fc17a02d), [`3d3a422`](https://github.com/JSPrismarine/JSPrismarine/commit/3d3a422dff9605ff66b7e1fb336440996c0a3330), [`e578a2f`](https://github.com/JSPrismarine/JSPrismarine/commit/e578a2f231be55ebc222cd4c0579b6276304a515), [`d231208`](https://github.com/JSPrismarine/JSPrismarine/commit/d231208b7ed03ea5f62f14a2f72741881b57f128), [`d220519`](https://github.com/JSPrismarine/JSPrismarine/commit/d220519e2e460148a90cbde9d643033e27bf8f5e), [`c776757`](https://github.com/JSPrismarine/JSPrismarine/commit/c77675747b1bb4ef14e48c28dda0865bdd232ad2), [`a2f93a1`](https://github.com/JSPrismarine/JSPrismarine/commit/a2f93a166aca94ab3cf95d086203693b143843a7), [`31ec74a`](https://github.com/JSPrismarine/JSPrismarine/commit/31ec74a54779952d8bccc0f9dacd8e5131f3e363), [`38422a0`](https://github.com/JSPrismarine/JSPrismarine/commit/38422a034cfdd5efd8956bbd4552830a103a8a18), [`f7759cc`](https://github.com/JSPrismarine/JSPrismarine/commit/f7759cca7ad8ea0db6630e15ffbf3e51d0f85c80), [`985c08e`](https://github.com/JSPrismarine/JSPrismarine/commit/985c08e1f93cbb557a8ce8be02fb2e0a04587f31), [`de3128c`](https://github.com/JSPrismarine/JSPrismarine/commit/de3128cc89765361b2afd2a3533756d50f8754b0), [`3cde97f`](https://github.com/JSPrismarine/JSPrismarine/commit/3cde97f56f87dbf9ce3636a6ccf142950fa23cf8), [`d19be92`](https://github.com/JSPrismarine/JSPrismarine/commit/d19be9216143a40fb546b24d3f4a6196c326508e), [`c2295bc`](https://github.com/JSPrismarine/JSPrismarine/commit/c2295bcc3e0b4d6f0cdfc83646f6ba5b725c846d), [`3baa83c`](https://github.com/JSPrismarine/JSPrismarine/commit/3baa83c92db539f0b095d32ec434fc41e2420a0b), [`a8b30b9`](https://github.com/JSPrismarine/JSPrismarine/commit/a8b30b91030d5b8f9b4ab1c5f3f89acf9978424f), [`7b155cd`](https://github.com/JSPrismarine/JSPrismarine/commit/7b155cdeb90769ec011f29706cb65a95832196f5), [`609b543`](https://github.com/JSPrismarine/JSPrismarine/commit/609b543617f8731ab597322cf5a6132e4d4ca519), [`582536f`](https://github.com/JSPrismarine/JSPrismarine/commit/582536f53c4ed407b065155dc6dce7f5f48982d8), [`97fde37`](https://github.com/JSPrismarine/JSPrismarine/commit/97fde374f2812e33f4b6a71bbbcf268b78963700), [`2a0ba1b`](https://github.com/JSPrismarine/JSPrismarine/commit/2a0ba1b22a2a9018de410940b9a2ff955df9e341), [`03e6df9`](https://github.com/JSPrismarine/JSPrismarine/commit/03e6df9845bc83a24309e667bb10a7bcd17c2d88), [`2708df3`](https://github.com/JSPrismarine/JSPrismarine/commit/2708df314b5234ddebacfcd11119c9c6497e7f40), [`d29e1d4`](https://github.com/JSPrismarine/JSPrismarine/commit/d29e1d4ef750af20698531f32a3e36040312d3a9), [`c1f0bc3`](https://github.com/JSPrismarine/JSPrismarine/commit/c1f0bc3fe5abfffa6c43d9cc44a407e4e25fd10a), [`cd8645c`](https://github.com/JSPrismarine/JSPrismarine/commit/cd8645c9b8bfcb48162a0c9f99a5d4c7449ea613), [`42adf17`](https://github.com/JSPrismarine/JSPrismarine/commit/42adf17723e47eb83a36561e13e643805068805a), [`5a0d8e1`](https://github.com/JSPrismarine/JSPrismarine/commit/5a0d8e1cc55a81414223aa2089fce8301776f8f7), [`f30ee68`](https://github.com/JSPrismarine/JSPrismarine/commit/f30ee68017fdcb4360756d1b2c57f0b8bb578c3e), [`3d89810`](https://github.com/JSPrismarine/JSPrismarine/commit/3d89810e3456d9c9108e1b33535197d2bab4786e), [`9355c0f`](https://github.com/JSPrismarine/JSPrismarine/commit/9355c0f65405075576b0e423e544d2e14b854bb1), [`56487c6`](https://github.com/JSPrismarine/JSPrismarine/commit/56487c6347873aedbc3c828b2e532ea13a10fb00), [`f94da48`](https://github.com/JSPrismarine/JSPrismarine/commit/f94da4841180543ba50be440c4bc796a8a472fcb), [`701c6e7`](https://github.com/JSPrismarine/JSPrismarine/commit/701c6e7e83b91ae2eaa8aa2bbadbf049c6ef75cf), [`6237d25`](https://github.com/JSPrismarine/JSPrismarine/commit/6237d2570ef950f83dcc0111de283340ff35aca3), [`7af8680`](https://github.com/JSPrismarine/JSPrismarine/commit/7af86809e55ed550b22a4d04118e1532d729262d), [`809b151`](https://github.com/JSPrismarine/JSPrismarine/commit/809b15120f5dac495a25bb6974bc5e1c9f4912d3), [`485ac0b`](https://github.com/JSPrismarine/JSPrismarine/commit/485ac0b0b901a9495c733dc668ff53b4061e03c0), [`0627e9b`](https://github.com/JSPrismarine/JSPrismarine/commit/0627e9be0fbf1813ed28999742165c4ed9ca3a4d), [`fd43ade`](https://github.com/JSPrismarine/JSPrismarine/commit/fd43ade59e80f19e3e7ef994ca80adb15e1f7907), [`5794f0b`](https://github.com/JSPrismarine/JSPrismarine/commit/5794f0bccdc0cc2123b46b71af342ece984e774a), [`d1a241c`](https://github.com/JSPrismarine/JSPrismarine/commit/d1a241c40329c0cb5a1c7ad49c2896d89bdae2a1), [`ef7ed80`](https://github.com/JSPrismarine/JSPrismarine/commit/ef7ed800b96bf9fa0807cf745af1289b627c5770), [`276ebd1`](https://github.com/JSPrismarine/JSPrismarine/commit/276ebd1a17e2876e128b41321145a816df6e8918), [`fb05654`](https://github.com/JSPrismarine/JSPrismarine/commit/fb05654bbe320a1aa3638813de8ef930ad4bff0e), [`b6b916f`](https://github.com/JSPrismarine/JSPrismarine/commit/b6b916fa7328a12b7467f9112791d3281cd43cfb), [`832be6b`](https://github.com/JSPrismarine/JSPrismarine/commit/832be6b0f6dece7ba5b7b57c92b657cf33c3b7d2), [`62e14d2`](https://github.com/JSPrismarine/JSPrismarine/commit/62e14d2bf3c19d77897733a422885cdffdf13334), [`1d905e2`](https://github.com/JSPrismarine/JSPrismarine/commit/1d905e27de007bc64a3f8c4f3c87c46955573e2a), [`c132c90`](https://github.com/JSPrismarine/JSPrismarine/commit/c132c9073992d5a0e8a7f9203298ec8711b0d585), [`83b0493`](https://github.com/JSPrismarine/JSPrismarine/commit/83b049364b3c6137f74a7eb1a808a14e692eeeae), [`e678a6a`](https://github.com/JSPrismarine/JSPrismarine/commit/e678a6a48dd00568f1186f37f2d460b1c898f059), [`b503085`](https://github.com/JSPrismarine/JSPrismarine/commit/b503085d2c068c27dbb4087e00e3e1a12a42e384), [`4a64815`](https://github.com/JSPrismarine/JSPrismarine/commit/4a64815dde3f78a206a0f69594dafb3853f0ce75), [`8687de7`](https://github.com/JSPrismarine/JSPrismarine/commit/8687de7e31ac990b5b0b79c0b9059db2c127d106), [`67546be`](https://github.com/JSPrismarine/JSPrismarine/commit/67546bec49a4f299b2be9b54b10a7d42865884a9), [`542da3b`](https://github.com/JSPrismarine/JSPrismarine/commit/542da3b62a4895905847cd14c0952a97d254d472), [`0bc486e`](https://github.com/JSPrismarine/JSPrismarine/commit/0bc486e90372d7ae43425da17c71275a097e9722), [`28b5c00`](https://github.com/JSPrismarine/JSPrismarine/commit/28b5c00af0d5377e7030e82d409b6def544619ba), [`146cd6e`](https://github.com/JSPrismarine/JSPrismarine/commit/146cd6e7d8918f1330b954ff0e00044144655ddb), [`7ad1f37`](https://github.com/JSPrismarine/JSPrismarine/commit/7ad1f3794974f484897322173db4385e9dbd8fd2), [`8196ea9`](https://github.com/JSPrismarine/JSPrismarine/commit/8196ea9e576d0acc3e17fe6b159791e25dc1092e), [`a540a4c`](https://github.com/JSPrismarine/JSPrismarine/commit/a540a4cc5879f62d5d3b39d59100200af8e3d313), [`a4abb61`](https://github.com/JSPrismarine/JSPrismarine/commit/a4abb61b7a03101b4f22ebab35da281066530430), [`62df686`](https://github.com/JSPrismarine/JSPrismarine/commit/62df68684596605007aef673182fc0b5d61d1a1f), [`c8ed1c5`](https://github.com/JSPrismarine/JSPrismarine/commit/c8ed1c5b88953b3f5f1e3ccec99e8de623faeeb2), [`ccfb982`](https://github.com/JSPrismarine/JSPrismarine/commit/ccfb982275c8bcfa98de89f61048daeff811819c), [`1150058`](https://github.com/JSPrismarine/JSPrismarine/commit/1150058a0dad77ee54871f7c4ba234ef3d8c79b8), [`2d20fee`](https://github.com/JSPrismarine/JSPrismarine/commit/2d20fee23b5fd58cf78dfa12b266f074dab110b8), [`918f5db`](https://github.com/JSPrismarine/JSPrismarine/commit/918f5dbb0876f076c51e2dc03a21f8db2c634c4e), [`2bea6ac`](https://github.com/JSPrismarine/JSPrismarine/commit/2bea6ac82e3a0a100ee254c7e536df73262bef9f), [`c67300a`](https://github.com/JSPrismarine/JSPrismarine/commit/c67300a6cef6ec68daa9f720bc31c7f238874e01), [`0cf1eb0`](https://github.com/JSPrismarine/JSPrismarine/commit/0cf1eb0f08e14c795136a1caa6540f470a7cb7df), [`fb2eeaa`](https://github.com/JSPrismarine/JSPrismarine/commit/fb2eeaa6c76b546d45742c3cca1800c512a04e63), [`0d53afd`](https://github.com/JSPrismarine/JSPrismarine/commit/0d53afdc4b0f42260231d56bbdeb2b4874f8bae7), [`86444b4`](https://github.com/JSPrismarine/JSPrismarine/commit/86444b41bb7281acbd0e556ad9421fe913321af0), [`01d95b3`](https://github.com/JSPrismarine/JSPrismarine/commit/01d95b3a07c6924cf90386536e6d4a69deaa407c), [`91bdbee`](https://github.com/JSPrismarine/JSPrismarine/commit/91bdbee54178fda1cfa835e4eda6a51f8ffa0c59), [`d647e47`](https://github.com/JSPrismarine/JSPrismarine/commit/d647e4746b3533fbc61afac8414b749a253a32c1), [`86526cc`](https://github.com/JSPrismarine/JSPrismarine/commit/86526cc6d8e3422b6154963f75715fc3f7fba376), [`074f6a7`](https://github.com/JSPrismarine/JSPrismarine/commit/074f6a79ca56188e02a3a01440fc5971a40977e5), [`b19ef52`](https://github.com/JSPrismarine/JSPrismarine/commit/b19ef529faf720e9c2b6041ef001037707301679), [`bbda9ea`](https://github.com/JSPrismarine/JSPrismarine/commit/bbda9ea5c0ed57fe60e93c25d6131234a7e8e049), [`f198a15`](https://github.com/JSPrismarine/JSPrismarine/commit/f198a156a8c307c941efd01a4bd4604eba0f5626), [`f370405`](https://github.com/JSPrismarine/JSPrismarine/commit/f37040563ed0cac590fe971ef3a448cb2e01a581), [`c1591b1`](https://github.com/JSPrismarine/JSPrismarine/commit/c1591b1e567a51dc80ecbbdfdbdc8e7c7f4f6c42), [`1acfa57`](https://github.com/JSPrismarine/JSPrismarine/commit/1acfa5708eace6165592fde0fa80032416957bdf), [`7b70cc7`](https://github.com/JSPrismarine/JSPrismarine/commit/7b70cc76fb8f1584746b76ee406ad48811d5d6a2), [`f939230`](https://github.com/JSPrismarine/JSPrismarine/commit/f93923009aeecd86cc40835805fe08527aec6435), [`4c88047`](https://github.com/JSPrismarine/JSPrismarine/commit/4c88047abd9a979343d8f0ab9393dacd1a037275), [`7c2858f`](https://github.com/JSPrismarine/JSPrismarine/commit/7c2858f600ef68f5dd63702be8a230fc15bcabc4), [`abd3869`](https://github.com/JSPrismarine/JSPrismarine/commit/abd38698ac421ed89eda5afc3e6aac1ab03981ae), [`a795436`](https://github.com/JSPrismarine/JSPrismarine/commit/a79543637243eea004ee18ab2ddf64cbbe2d5761), [`99ab5fc`](https://github.com/JSPrismarine/JSPrismarine/commit/99ab5fc9a3d5c7351877091d58e1a1c0da4c4ef2), [`68cef3f`](https://github.com/JSPrismarine/JSPrismarine/commit/68cef3f794575714fef335397e8d6e21aa7ae512), [`7562d04`](https://github.com/JSPrismarine/JSPrismarine/commit/7562d044dae9cefb977dc5f24a9a82c7121d8365), [`3204465`](https://github.com/JSPrismarine/JSPrismarine/commit/320446537230cbe4830ff9ca0bffa05133cf0592), [`3eac4a7`](https://github.com/JSPrismarine/JSPrismarine/commit/3eac4a7901492b6b46231baeacba64081799d2cd), [`a07c949`](https://github.com/JSPrismarine/JSPrismarine/commit/a07c94977978f0536b56a29630729bdb817cbba0), [`710f60e`](https://github.com/JSPrismarine/JSPrismarine/commit/710f60e077c7c9a8471436669e123e6796b13c4d), [`88db8cd`](https://github.com/JSPrismarine/JSPrismarine/commit/88db8cdc94238bbdec632ca8451d8f36bf4b2416), [`de6e39c`](https://github.com/JSPrismarine/JSPrismarine/commit/de6e39c1520b6fbaaa031eaebd6914fd4fcccfad), [`c5ae5e6`](https://github.com/JSPrismarine/JSPrismarine/commit/c5ae5e6e2e231751c82840c05dbc34435ccd7304), [`9611f5d`](https://github.com/JSPrismarine/JSPrismarine/commit/9611f5d1588935528a0fa5dbd95b8ab08498739a), [`5051888`](https://github.com/JSPrismarine/JSPrismarine/commit/505188860d3c261bdce0cb97562f4e71e7055554), [`db08972`](https://github.com/JSPrismarine/JSPrismarine/commit/db089721e086f1591e40609ee7a1a9faec2d19ca), [`b197add`](https://github.com/JSPrismarine/JSPrismarine/commit/b197add97829722b6bcfa5def5a747d6543da92e), [`a1c295a`](https://github.com/JSPrismarine/JSPrismarine/commit/a1c295a3fc29e44a4c89a9f5eea9ab1bda99500c), [`8c5e1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/8c5e1ba96ca39d69cab3a221a23bd4d5fe613981), [`13dfa33`](https://github.com/JSPrismarine/JSPrismarine/commit/13dfa33ec7dc3602ce8c35d8f87067b172da3f26), [`57d71c3`](https://github.com/JSPrismarine/JSPrismarine/commit/57d71c36dd6b3c5dc78c712fdad70eedc99536f4), [`1c5b1f5`](https://github.com/JSPrismarine/JSPrismarine/commit/1c5b1f565fc01402dfafa1028455d402e12fd985), [`3a0903e`](https://github.com/JSPrismarine/JSPrismarine/commit/3a0903ec44fb7dde2149ba1b52bbbcb64656c7ed), [`1e9ada2`](https://github.com/JSPrismarine/JSPrismarine/commit/1e9ada27d7fd15b209521870328a5257440ee4a7), [`e3a0042`](https://github.com/JSPrismarine/JSPrismarine/commit/e3a0042b06e7493219bd869523775a0f10423440), [`934b5d2`](https://github.com/JSPrismarine/JSPrismarine/commit/934b5d22e8c158cde43c80ea9df8d7589e8bcafa), [`507bd0a`](https://github.com/JSPrismarine/JSPrismarine/commit/507bd0a8a76a2b610e70788fa3e4c2bbd7a63710), [`f544fb4`](https://github.com/JSPrismarine/JSPrismarine/commit/f544fb40304013ab7bf257d030a75eab0346719c), [`cd3077c`](https://github.com/JSPrismarine/JSPrismarine/commit/cd3077c55d5ee9984512f8e34660e7aae5b55680), [`321a017`](https://github.com/JSPrismarine/JSPrismarine/commit/321a0170b36a2946fa3d06fe5924336222275de2), [`88c985e`](https://github.com/JSPrismarine/JSPrismarine/commit/88c985edcb1666f9e15c79eb4c3ee2ee1f134e62), [`c9cafc8`](https://github.com/JSPrismarine/JSPrismarine/commit/c9cafc8529e05fe90ea2812920feb76cbcaf4a1b), [`8518afc`](https://github.com/JSPrismarine/JSPrismarine/commit/8518afc7b9ee684ebe4255ce26e7b56d612a145a), [`a751da2`](https://github.com/JSPrismarine/JSPrismarine/commit/a751da28fed5879c5d941bc1cebd369560271dfb), [`4355293`](https://github.com/JSPrismarine/JSPrismarine/commit/4355293f75d669659511516448b9c600900c351b), [`5053f00`](https://github.com/JSPrismarine/JSPrismarine/commit/5053f003598eab2d2d7cc59338e5ad9ab55d3232), [`fee1601`](https://github.com/JSPrismarine/JSPrismarine/commit/fee1601bb697b8ba9625b0d10e292d66f33d3391), [`da1793e`](https://github.com/JSPrismarine/JSPrismarine/commit/da1793e286c051351c49dfb1e35b002a6e787bce), [`a0c479e`](https://github.com/JSPrismarine/JSPrismarine/commit/a0c479e0ab28de8ba46bac842ddc90a50d9e679f), [`d490871`](https://github.com/JSPrismarine/JSPrismarine/commit/d49087199730fb9eac7d8ee1976ad36df8475394), [`ab2abdd`](https://github.com/JSPrismarine/JSPrismarine/commit/ab2abddd4567a51630e851566dc55a226d0cbccd), [`b786016`](https://github.com/JSPrismarine/JSPrismarine/commit/b78601670a934710ae604a88a33e47aaaff408ab), [`7a20ad8`](https://github.com/JSPrismarine/JSPrismarine/commit/7a20ad80c99ab96a461e1a37c363cf1d64904d8e), [`fec76ec`](https://github.com/JSPrismarine/JSPrismarine/commit/fec76ec7039ebf9543a62cc4167732f16754927c), [`08de1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/08de1bac21f3c5785a02649e4faa11d9a11f82b0), [`ef12ef8`](https://github.com/JSPrismarine/JSPrismarine/commit/ef12ef8dee0fb445a80811306d20c44aabeb237d), [`6b0d00b`](https://github.com/JSPrismarine/JSPrismarine/commit/6b0d00bd2876ba30c45e45aa8e1d31b535050f27), [`707964d`](https://github.com/JSPrismarine/JSPrismarine/commit/707964d1a85072dbd157d74a63dd2471aafa8b8f), [`b98742b`](https://github.com/JSPrismarine/JSPrismarine/commit/b98742b80037c69e51cf6059bff2b45147e6a53e), [`57e3422`](https://github.com/JSPrismarine/JSPrismarine/commit/57e34226bd0f570548282994e088db7213f7fdc8), [`f4ec478`](https://github.com/JSPrismarine/JSPrismarine/commit/f4ec4787eb307bbeefe5d51034f43b0728088c55), [`1fa9eda`](https://github.com/JSPrismarine/JSPrismarine/commit/1fa9edaec739e3f7b11648b5662d9860cf569c45), [`1427d68`](https://github.com/JSPrismarine/JSPrismarine/commit/1427d68b60d21a54c1a077792f71be0eccdac36e), [`d1ba51f`](https://github.com/JSPrismarine/JSPrismarine/commit/d1ba51fa3f516153c06103d14b2badd9223fba0a), [`f060520`](https://github.com/JSPrismarine/JSPrismarine/commit/f060520321901b222197f2c65e75d5771c47cdfe), [`b46c7f5`](https://github.com/JSPrismarine/JSPrismarine/commit/b46c7f5886ad6ce3aa0468630995743af6dc4cfd), [`68febb8`](https://github.com/JSPrismarine/JSPrismarine/commit/68febb838436b90836c311f7cc435676dff5a438), [`f3f9fc3`](https://github.com/JSPrismarine/JSPrismarine/commit/f3f9fc3e9918a58054715f1923ad7e88b1804d91), [`0626058`](https://github.com/JSPrismarine/JSPrismarine/commit/06260585d51d8ce0668b7cf854663bb1aea9aee9), [`2fcd89f`](https://github.com/JSPrismarine/JSPrismarine/commit/2fcd89f8ff551915692aedca68cd556735432590), [`91fcf8b`](https://github.com/JSPrismarine/JSPrismarine/commit/91fcf8b9a7c4334c8fab86bc4fae2b94356351d5), [`015a810`](https://github.com/JSPrismarine/JSPrismarine/commit/015a8102014c24f224797dec0b1919d3a045e1c3), [`29aa940`](https://github.com/JSPrismarine/JSPrismarine/commit/29aa940e8ddc1db5bf37b213179adad8e3eb21a5), [`78694d1`](https://github.com/JSPrismarine/JSPrismarine/commit/78694d1577b8bc994963b5eb53d712858ee363df), [`908645b`](https://github.com/JSPrismarine/JSPrismarine/commit/908645b1f8ea87a6e511dbe25675f39760b41627), [`c32bfed`](https://github.com/JSPrismarine/JSPrismarine/commit/c32bfededb57b65bab45897dda54e0fa621d0ff1), [`537865c`](https://github.com/JSPrismarine/JSPrismarine/commit/537865cfe62a996b4f17872021d86ae87373b786), [`d795857`](https://github.com/JSPrismarine/JSPrismarine/commit/d7958576ad576a489298cdd772a8d68759af55c0), [`5e47439`](https://github.com/JSPrismarine/JSPrismarine/commit/5e474396321b54f696760962ceb9d24b85917640), [`aecc83d`](https://github.com/JSPrismarine/JSPrismarine/commit/aecc83db4d7be989977510a5dae1e7ada44b689b), [`a7192d2`](https://github.com/JSPrismarine/JSPrismarine/commit/a7192d24a34fc313bb255d8ff083a81515e567fb), [`3f5537f`](https://github.com/JSPrismarine/JSPrismarine/commit/3f5537fb7ff52b79b5a5211c96c1e38545e32f98), [`c889ff9`](https://github.com/JSPrismarine/JSPrismarine/commit/c889ff93e1ab889d16fe0b6ddf401693e1ef2837), [`b3360c0`](https://github.com/JSPrismarine/JSPrismarine/commit/b3360c05087155a4aa71299a2042646fa91d6f14), [`fd43ade`](https://github.com/JSPrismarine/JSPrismarine/commit/fd43ade59e80f19e3e7ef994ca80adb15e1f7907), [`fc10888`](https://github.com/JSPrismarine/JSPrismarine/commit/fc10888391866037519afbf8e057d4ecece48757), [`e60d525`](https://github.com/JSPrismarine/JSPrismarine/commit/e60d525e436fb4b7d1cf0748d0966d45eedc184e), [`6bac6b1`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac6b173e5e283b4e6e3d106268319caa51ed40), [`ea17f32`](https://github.com/JSPrismarine/JSPrismarine/commit/ea17f32ad6d5550bc720c3d66a55bc8b4eccbb6c), [`8e0355a`](https://github.com/JSPrismarine/JSPrismarine/commit/8e0355ae0f6f497f82ecaed6fa4fec714785ff46), [`d42e7c3`](https://github.com/JSPrismarine/JSPrismarine/commit/d42e7c33d23361c5b159078ae6635a230ff70701), [`33c3920`](https://github.com/JSPrismarine/JSPrismarine/commit/33c39204cf625a581b63f3f133bfc68f7adb6510), [`52eadb2`](https://github.com/JSPrismarine/JSPrismarine/commit/52eadb2560ba6b12082ffff1a0aaf8d6adfb68f8), [`9d93172`](https://github.com/JSPrismarine/JSPrismarine/commit/9d931725e8d48fab773c2fe9f659b2f3e1d26325), [`3c40d16`](https://github.com/JSPrismarine/JSPrismarine/commit/3c40d1636595c254ba2869a6a1b03f6e30f929ce), [`f82703f`](https://github.com/JSPrismarine/JSPrismarine/commit/f82703f58e970ee0dcfbcc71bf7070b43247cc93), [`5ada190`](https://github.com/JSPrismarine/JSPrismarine/commit/5ada190f45738827cd2b67328404ce49226aea56), [`220290c`](https://github.com/JSPrismarine/JSPrismarine/commit/220290cf27e6ffeea04c6e0fc2e4d2e124ab4341), [`5121b88`](https://github.com/JSPrismarine/JSPrismarine/commit/5121b88dab4fbfd3c6f14476ef2ae0014a710086), [`738a665`](https://github.com/JSPrismarine/JSPrismarine/commit/738a66555ddfad7912d7b6c61f28e78a575996cc), [`707964d`](https://github.com/JSPrismarine/JSPrismarine/commit/707964d1a85072dbd157d74a63dd2471aafa8b8f), [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a), [`59f8ec6`](https://github.com/JSPrismarine/JSPrismarine/commit/59f8ec6fcd56487b167a9641cf74d60601d8af7e), [`5445a16`](https://github.com/JSPrismarine/JSPrismarine/commit/5445a16a437bddc8726e71d4ae135d5286e351bb), [`7bbe9d6`](https://github.com/JSPrismarine/JSPrismarine/commit/7bbe9d66c3bc2f032f0fbc98f4c10c1cfaabfc35), [`b6cdccf`](https://github.com/JSPrismarine/JSPrismarine/commit/b6cdccf53598c32a024a774033b6cc4b06fd3da8), [`d0e884d`](https://github.com/JSPrismarine/JSPrismarine/commit/d0e884d8a40a80047ec6bb948f1f8e1637ccb804), [`21887ca`](https://github.com/JSPrismarine/JSPrismarine/commit/21887ca1f152fa69516fb80543e32a5ce047ec39), [`703bf42`](https://github.com/JSPrismarine/JSPrismarine/commit/703bf42237b001abcacbbdfbd67d3a8ed9de555e), [`cf0908c`](https://github.com/JSPrismarine/JSPrismarine/commit/cf0908cb644c07241cb0cef6c8f4acf4282e7d59), [`f0584a3`](https://github.com/JSPrismarine/JSPrismarine/commit/f0584a381c6bab5c61e5aa2cd3782218bc8d74e7), [`0d1512e`](https://github.com/JSPrismarine/JSPrismarine/commit/0d1512e0d028a2644883407b03ff20fe7c224633), [`4855bcc`](https://github.com/JSPrismarine/JSPrismarine/commit/4855bcc3a5fffef4b6a2e362415caa6f672126dd), [`0e7d345`](https://github.com/JSPrismarine/JSPrismarine/commit/0e7d345611f49a463d03f3762f3006f5cab2aaf6), [`1825a4c`](https://github.com/JSPrismarine/JSPrismarine/commit/1825a4cf5443453bf306e6282c31c80446fd59e5), [`259282c`](https://github.com/JSPrismarine/JSPrismarine/commit/259282cf8da2397f26bea2bea8816eb6e4ec91d4), [`5e89923`](https://github.com/JSPrismarine/JSPrismarine/commit/5e89923aca9bb066d82f54756dd39ba30e591a0a), [`587b01a`](https://github.com/JSPrismarine/JSPrismarine/commit/587b01a9e42381394bfc195c5a5597315145a1e8), [`7ba8c73`](https://github.com/JSPrismarine/JSPrismarine/commit/7ba8c737b299535506345222fe87ea88b3b49ff1), [`1c80f7e`](https://github.com/JSPrismarine/JSPrismarine/commit/1c80f7e0e15c3da3223d21986640428d3fb3044f), [`e648da4`](https://github.com/JSPrismarine/JSPrismarine/commit/e648da4bbd2bfa55fe80d603e7c8e9f0fea39dfc), [`f3501ba`](https://github.com/JSPrismarine/JSPrismarine/commit/f3501ba313b497cbd28fd465a962867a08738e32), [`4c72fc6`](https://github.com/JSPrismarine/JSPrismarine/commit/4c72fc6761f1059209742d493514d279b04ae85a), [`817f97b`](https://github.com/JSPrismarine/JSPrismarine/commit/817f97b219ef9a87d7920194aeeaad70398103a6), [`8a20e74`](https://github.com/JSPrismarine/JSPrismarine/commit/8a20e745347d42e28b8ed38cd8a0e5b80b37dcc5), [`b14a5c8`](https://github.com/JSPrismarine/JSPrismarine/commit/b14a5c867f0eb00691ee7b0b12a726b3823e7ba4), [`6d1b073`](https://github.com/JSPrismarine/JSPrismarine/commit/6d1b07376d4d3285768fc807a557ba0722dffb88), [`949785e`](https://github.com/JSPrismarine/JSPrismarine/commit/949785e4be1ae2ffd834354fefe993990d5000d6), [`981cf5b`](https://github.com/JSPrismarine/JSPrismarine/commit/981cf5b9b2665ae087e53df6919923b4ad4181bb), [`e924c76`](https://github.com/JSPrismarine/JSPrismarine/commit/e924c76b5fdfad1e0c7e809ece789e98764283aa), [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247), [`a1c9fe5`](https://github.com/JSPrismarine/JSPrismarine/commit/a1c9fe587b5d6eb19a990c16766962c49f9614fe), [`d304979`](https://github.com/JSPrismarine/JSPrismarine/commit/d3049792f9f15adc6936c8049c56a913732ce036), [`9258ef1`](https://github.com/JSPrismarine/JSPrismarine/commit/9258ef152ef8c0802eefc2cad93e1f8ddb950f46), [`5f838b2`](https://github.com/JSPrismarine/JSPrismarine/commit/5f838b2c01ab875611fefd411c05a18f3172f26a), [`13147a3`](https://github.com/JSPrismarine/JSPrismarine/commit/13147a33e36e0f0a00fc5935b9b7f4862e8d686d), [`c3f2676`](https://github.com/JSPrismarine/JSPrismarine/commit/c3f2676b1136a21b9df4ee0c5f155017fbb68974), [`f24718e`](https://github.com/JSPrismarine/JSPrismarine/commit/f24718e513d296bdf0e07ec042564f7f9eda0f64), [`d63f254`](https://github.com/JSPrismarine/JSPrismarine/commit/d63f2548bda8ae87f6406309f6cf7c6428ebf188), [`f5c7d59`](https://github.com/JSPrismarine/JSPrismarine/commit/f5c7d591d3fe46e95c5058c2114c382ecc61784a), [`eca419a`](https://github.com/JSPrismarine/JSPrismarine/commit/eca419a4641cb31e7c2e0e790520a25ce59527e2), [`8086b8c`](https://github.com/JSPrismarine/JSPrismarine/commit/8086b8c5b689736084844b4ed11587df9d432fbf), [`4ab02e5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ab02e5cf76b88f09ba19106e971337c1da2d1b9), [`8ab8262`](https://github.com/JSPrismarine/JSPrismarine/commit/8ab82622b9be169bccd794f43b151a9685708cc7), [`62c83dd`](https://github.com/JSPrismarine/JSPrismarine/commit/62c83dda69b32e25c7d21207b30c3a07fde22609), [`d0b36e7`](https://github.com/JSPrismarine/JSPrismarine/commit/d0b36e7d517f9f057cadbc261c6a77d3cb58329a), [`f0294ef`](https://github.com/JSPrismarine/JSPrismarine/commit/f0294ef0b8e358f4fda308d7c8f1c901bf1bf3e7), [`e2fcf7a`](https://github.com/JSPrismarine/JSPrismarine/commit/e2fcf7afa78e58a5a768d0f42abc035e50389a33), [`c3277be`](https://github.com/JSPrismarine/JSPrismarine/commit/c3277be5928541348011c503daaf74c671050d20), [`3093e34`](https://github.com/JSPrismarine/JSPrismarine/commit/3093e340fc9a98a5a408f3c175e844b576289940), [`b96ce93`](https://github.com/JSPrismarine/JSPrismarine/commit/b96ce93238f3efd66c709f213cd8d5d42fc8f425), [`3c86e27`](https://github.com/JSPrismarine/JSPrismarine/commit/3c86e279350e4b8dd7c67c6ab84e9ab5b617faea), [`88f05b1`](https://github.com/JSPrismarine/JSPrismarine/commit/88f05b1e498a83f210e0fc02ca2f039746bad0f9), [`5daf9a4`](https://github.com/JSPrismarine/JSPrismarine/commit/5daf9a40ab0e55c6bd8e2242e440c3df070ca381), [`0f9d3c1`](https://github.com/JSPrismarine/JSPrismarine/commit/0f9d3c18e72967d0f4d1ba40221a1076bf24ac42), [`569baa3`](https://github.com/JSPrismarine/JSPrismarine/commit/569baa3a87288d9540b303d280eb0032a3cab736), [`a3db50e`](https://github.com/JSPrismarine/JSPrismarine/commit/a3db50eef709e1d2e3848d71383d6801d5f69773), [`e3fbb5f`](https://github.com/JSPrismarine/JSPrismarine/commit/e3fbb5f7f4db31c80f4d07a51065fc3b28a726c6), [`c27bc3c`](https://github.com/JSPrismarine/JSPrismarine/commit/c27bc3cdecae4ffd63dcf68af7e1c6d1d17c2b91), [`258e9d9`](https://github.com/JSPrismarine/JSPrismarine/commit/258e9d915c9d067a86f576ae64f07b992b7c4485), [`61c3417`](https://github.com/JSPrismarine/JSPrismarine/commit/61c3417ea32f651a7add6275c6ef81fbbfda3611), [`6a91053`](https://github.com/JSPrismarine/JSPrismarine/commit/6a910532df85e7109d7a90c85f4e7cdc161e20bf), [`18b2fa6`](https://github.com/JSPrismarine/JSPrismarine/commit/18b2fa6dfe248dc201e6d9a232413831dcaf7060), [`9b7576e`](https://github.com/JSPrismarine/JSPrismarine/commit/9b7576eb0c331f5cc07fdfab59ac031a0a4549ca), [`1b08aed`](https://github.com/JSPrismarine/JSPrismarine/commit/1b08aed5a46a79b19ee36c0cc644c958663d3c4b), [`a0d4b3f`](https://github.com/JSPrismarine/JSPrismarine/commit/a0d4b3fc39cc6ad3637e7b81ad535ae5afd869fd), [`cc8b110`](https://github.com/JSPrismarine/JSPrismarine/commit/cc8b1109b9c174940cdd4549615a05affb459b9a), [`3cb7c4d`](https://github.com/JSPrismarine/JSPrismarine/commit/3cb7c4d773526e3bc45a7cb786a37b199cde00ad), [`aedac18`](https://github.com/JSPrismarine/JSPrismarine/commit/aedac183fbdabb86c1140c67feab3cf21b8f0ce9), [`32ce6f2`](https://github.com/JSPrismarine/JSPrismarine/commit/32ce6f2f752e7e89c4445d1936e13a6e243a3a30), [`163c611`](https://github.com/JSPrismarine/JSPrismarine/commit/163c611a935d954736c43f98aad3bf7ffa875917), [`4cf5c25`](https://github.com/JSPrismarine/JSPrismarine/commit/4cf5c25c105f4d7dbea3d1d877d67cce48006234), [`168bbb6`](https://github.com/JSPrismarine/JSPrismarine/commit/168bbb6c45890879074549cab88cf987a5fef829), [`ef39583`](https://github.com/JSPrismarine/JSPrismarine/commit/ef395830d28b1b242b20a7246c8bb6ec781f5f4c), [`7efae53`](https://github.com/JSPrismarine/JSPrismarine/commit/7efae5385415852da187f6b3ec1c010592b00d98), [`d06d825`](https://github.com/JSPrismarine/JSPrismarine/commit/d06d8258b8a875f15fbf4ae7b5a249377639742c), [`3549805`](https://github.com/JSPrismarine/JSPrismarine/commit/354980555c096e06c6a54c8d06a3710fa247a6b2), [`35e7df5`](https://github.com/JSPrismarine/JSPrismarine/commit/35e7df54b5bba03f65c9e3a972bac32b01ba4fe4), [`152ff12`](https://github.com/JSPrismarine/JSPrismarine/commit/152ff1277534718f1c46827040b5f9e18fd806d8), [`9847149`](https://github.com/JSPrismarine/JSPrismarine/commit/9847149ce4428d5a4c166f9ec4d87c78f7406d83), [`fafc156`](https://github.com/JSPrismarine/JSPrismarine/commit/fafc15668419770e6bd847d39e2a9e0656427cb9), [`0084efd`](https://github.com/JSPrismarine/JSPrismarine/commit/0084efda365f5532929114f8bb8b0dfdd67aab71), [`13792da`](https://github.com/JSPrismarine/JSPrismarine/commit/13792daea4f024f559c9392e93328694db22e164), [`0e208a5`](https://github.com/JSPrismarine/JSPrismarine/commit/0e208a5c1b79d9d568083e6cc6f473c6df89b33b), [`68fe15f`](https://github.com/JSPrismarine/JSPrismarine/commit/68fe15f5e63d3b46c19bc333510c0e79a5a236ad), [`245a4ba`](https://github.com/JSPrismarine/JSPrismarine/commit/245a4ba580b33366701f3f19fc6dc19eec24a2ea), [`439eb59`](https://github.com/JSPrismarine/JSPrismarine/commit/439eb59cfd5c5bea9050c4945b8a57f0038ecd66), [`7ddfa43`](https://github.com/JSPrismarine/JSPrismarine/commit/7ddfa4319dcf42685218014950ad48dafbacc051), [`de16ae0`](https://github.com/JSPrismarine/JSPrismarine/commit/de16ae07c1f0167885a280a1fc91030b9fbfe0cf), [`9e53c61`](https://github.com/JSPrismarine/JSPrismarine/commit/9e53c61399266bf9e26dd87160c45ccd251a21f8), [`8b1bf1b`](https://github.com/JSPrismarine/JSPrismarine/commit/8b1bf1b337e7cb9e1d8f61d8df8b42e2b2badcb6), [`1e7a45b`](https://github.com/JSPrismarine/JSPrismarine/commit/1e7a45b8f9209c7844a76693b019ddb040bdd475), [`eb85543`](https://github.com/JSPrismarine/JSPrismarine/commit/eb85543638be38c53b604d70e11358ba72c9f61f), [`25fcdf8`](https://github.com/JSPrismarine/JSPrismarine/commit/25fcdf8b3d3835ecb66c0d4effe0da1a80b95368), [`a645006`](https://github.com/JSPrismarine/JSPrismarine/commit/a645006caa290b45c728b7ad87435249091cbd56), [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c), [`03e7f72`](https://github.com/JSPrismarine/JSPrismarine/commit/03e7f729a0fd42a8c6cb42582914f646b4a6762d), [`5a1ab40`](https://github.com/JSPrismarine/JSPrismarine/commit/5a1ab4010008ca1065cc934efb11701831d2c8ac), [`23450ee`](https://github.com/JSPrismarine/JSPrismarine/commit/23450ee6e61092c05e2cebeca492c95b28e8da0d), [`cd01052`](https://github.com/JSPrismarine/JSPrismarine/commit/cd01052548178421cd323b316d77d87374cee9dc), [`bed113d`](https://github.com/JSPrismarine/JSPrismarine/commit/bed113d91a2de02b80d5688c3f43eadf802271c4), [`912f83e`](https://github.com/JSPrismarine/JSPrismarine/commit/912f83eb3dd233d756506e1d6a309ed780fde00a), [`2e24f49`](https://github.com/JSPrismarine/JSPrismarine/commit/2e24f499570960f91e53c0388e6ea00a7f662116), [`0527ffa`](https://github.com/JSPrismarine/JSPrismarine/commit/0527ffacdbf37e49d105227c719d73b7ca4683e7), [`494be3e`](https://github.com/JSPrismarine/JSPrismarine/commit/494be3e9d5dae9d074c7cc084d6eb136f86ae231), [`d5056d3`](https://github.com/JSPrismarine/JSPrismarine/commit/d5056d3fe5f8d2be49f42d3d03edab591bedf55a), [`8128a63`](https://github.com/JSPrismarine/JSPrismarine/commit/8128a6344645e6798453b7c7eae77a69594e848c), [`ea7ce22`](https://github.com/JSPrismarine/JSPrismarine/commit/ea7ce225dad2500f1fdc5b5c71665d44daab7143), [`8a368eb`](https://github.com/JSPrismarine/JSPrismarine/commit/8a368ebb1f02d851ba3f8585a37639b4a418d9c8), [`1b92d98`](https://github.com/JSPrismarine/JSPrismarine/commit/1b92d984399f419962640740bfd8f689a3c5c5d3), [`bd6780f`](https://github.com/JSPrismarine/JSPrismarine/commit/bd6780f89c73c69635adb9785a997f3103145fb1), [`2515674`](https://github.com/JSPrismarine/JSPrismarine/commit/2515674ce840cad4dd80739d4042228c5e6172c4), [`bd65536`](https://github.com/JSPrismarine/JSPrismarine/commit/bd65536e966bab81bbf9af147a0bf5440890cdae), [`c29803c`](https://github.com/JSPrismarine/JSPrismarine/commit/c29803c5f9f502263fa51fe8c29d41a846048019), [`20a16d1`](https://github.com/JSPrismarine/JSPrismarine/commit/20a16d1aec16579eaf25b61f7eeffd261408ef3b), [`2291a0d`](https://github.com/JSPrismarine/JSPrismarine/commit/2291a0d0ce40d73af8eb09cf0e46cfa2ab79db5c)]:
  - @jsprismarine/protocol@0.16.0
  - @jsprismarine/advancements@0.16.0
  - @jsprismarine/entities@0.16.0
  - @jsprismarine/item-behaviors@0.16.0
  - @jsprismarine/entity-goals@0.16.0
  - @jsprismarine/bedrock-data@0.16.0
  - @jsprismarine/minecraft@0.16.0
  - @jsprismarine/mapping@0.16.0
  - @jsprismarine/items@0.16.0
  - @jsprismarine/block-behaviors@0.16.0
  - @jsprismarine/blocks@0.16.0
  - @jsprismarine/packs@0.16.0
  - @jsprismarine/brigadier@0.16.0
  - @jsprismarine/engine-systems@0.16.0
  - @jsprismarine/commands@0.16.0
  - @jsprismarine/chunkgen@0.16.0
  - @jsprismarine/worldgen@0.16.0
  - @jsprismarine/spawning@0.16.0
  - @jsprismarine/content@0.16.0
  - @jsprismarine/entity-brains@0.16.0
  - @jsprismarine/features@0.16.0
  - @jsprismarine/leveldb@0.16.0
  - @jsprismarine/mcfunction@0.16.0
  - @jsprismarine/enchantments@0.16.0
  - @jsprismarine/console-protocol@0.16.0
  - @jsprismarine/structures@0.16.0
  - @jsprismarine/lighting@0.16.0
  - @jsprismarine/loot@0.16.0
  - @jsprismarine/predicates@0.16.0
  - @jsprismarine/nbt@0.16.0
  - @jsprismarine/logger@0.16.0
  - @jsprismarine/recipes@0.16.0
  - @jsprismarine/raknet@0.16.0
  - @jsprismarine/trading@0.16.0
  - @jsprismarine/binaryutils@0.16.0
  - @jsprismarine/color-parser@0.16.0
  - @jsprismarine/errors@0.16.0
  - @jsprismarine/kernel@0.16.0
  - @jsprismarine/math@0.16.0

## 0.15.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/binaryutils@0.15.2
  - @jsprismarine/color-parser@0.15.2
  - @jsprismarine/errors@0.15.2
  - @jsprismarine/leveldb@0.15.2
  - @jsprismarine/logger@0.15.2
  - @jsprismarine/math@0.15.2
  - @jsprismarine/minecraft@0.15.2
  - @jsprismarine/nbt@0.15.2
  - @jsprismarine/protocol@0.15.2
  - @jsprismarine/raknet@0.15.2

## 0.15.1

### Patch Changes

- [#2599](https://github.com/JSPrismarine/JSPrismarine/pull/2599) [`24e9693`](https://github.com/JSPrismarine/JSPrismarine/commit/24e9693285faea53a54264af5233f1c54724aa46) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency fast-jwt to v6.3.5

- [#2610](https://github.com/JSPrismarine/JSPrismarine/pull/2610) [`10b7a13`](https://github.com/JSPrismarine/JSPrismarine/commit/10b7a1361bf615d62b22ef5c463d07d785eed56a) Thanks [@enricoangelon](https://github.com/enricoangelon)! - Fix respawning: pressing Respawn after a death left the client frozen, unable to move or act. The server now runs the respawn exchange as a Bedrock Dedicated Server 1.26.52 does. It answers the client's `ClientReadyToSpawn` with `SearchingForSpawn` at the spawn block and then `ReadyToSpawn` at eye height, with nothing after them. On the respawn action it sends `ActorEvent(SPAWN_ALIVE)`, the health, the attributes and the actor data, without moving the client. Every `Respawn` now names runtime id 0.
- Updated dependencies []:
  - @jsprismarine/binaryutils@0.15.1
  - @jsprismarine/color-parser@0.15.1
  - @jsprismarine/errors@0.15.1
  - @jsprismarine/leveldb@0.15.1
  - @jsprismarine/logger@0.15.1
  - @jsprismarine/math@0.15.1
  - @jsprismarine/minecraft@0.15.1
  - @jsprismarine/nbt@0.15.1
  - @jsprismarine/protocol@0.15.1
  - @jsprismarine/raknet@0.15.1

## 0.15.0

### Minor Changes

- [`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c) Thanks [@filiphsps](https://github.com/filiphsps)! - `Event.isCanceled`, `BlockEntityRegistry.isModeled`, and `EntitySerializer.isModeled` replace their British spellings. Update imports and calls to the American names. `vanillaRecipes` also uses American spellings in its two generated recipe IDs; callers that store those IDs must update them.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove constructs that ahead-of-time compilation with scriptc cannot lower, keeping runtime behavior the same.
  
  - `@jsprismarine/bedrock-data` exports `creativeitems` from a generated, explicitly typed module (`CreativeItemEntry[]`) instead of the raw JSON.
  - `@jsprismarine/brigadier` keeps each argument builder in the module of the node it builds (the old paths re-export), declares `literal` and `argument` as functions, and its exception types call message factories positionally.
  - `@jsprismarine/errors` declares its `Error` base without a type parameter.
  - `@jsprismarine/math` exposes `Vector2.ZERO` and `Vector3.ZERO` as shared immutable instances, and `Vector3` subclasses keep their class through `withX` and friends by overriding `create`.
  - `@jsprismarine/minecraft` exports `blockSchemas` from a generated, typed module (`BlockSchemaCatalog`).
  - `@jsprismarine/prismarine` replaces the `evt`-based event bus with its own `EventEmitter` (same `on`, `once`, `removeListener`, `removeAllListeners`, `emit` and `post`), carries inventory transaction data as a discriminated union (`kind`), exposes `allBlocks()`, `allItems()` and `allEntities()` registries, and drops the `heap`, `evt`, `fast-jwt` and `confbox` dependencies.
  - `@jsprismarine/raknet` declares `sendPacket` without a type parameter.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`f7d2297`](https://github.com/JSPrismarine/JSPrismarine/commit/f7d2297ce7176489a19a141ab4b071eb7a2461a6) Thanks [@filiphsps](https://github.com/filiphsps)! - Read the game data from CloudburstMC/Data at 1.26.50, because pmmp/BedrockData is gone.
  
  The `resources` submodule pointed at pmmp/BedrockData, pinned to 1.21.40. That repository was archived in July 2026 at 1.26.30 and will never carry the version this server targets, so the submodule now points at [CloudburstMC/Data](https://github.com/CloudburstMC/Data) at commit `659ce1e`, which is the 1.26.50 drop. The pin is a commit rather than a branch on purpose: the branch head carries 1.26.60, whose item runtime ids disagree with protocol 2193. Its item table was checked against this project's own capture of a 1.26.51 server and agrees on all 2076 items, ids and component flags included.
  
  **21 vanilla recipes come back.** `item_tags` stopped at 1.21.40 and had never heard of `minecraft:egg`, `minecraft:metal_nuggets` or `minecraft:mushrooms_for_stew`, so every recipe asking for one was dropped as unsatisfiable - correctly, for the wrong reason. The table is now dragonfly's, at 1.26.50 and 77 tags, vendored under `src/vendor` with its MIT notice.
  
  **The creative menu gains its headings and 62 entries.** The old list had 1919 entries, 1918 of which the item table could name, and no group data at all, so `CreativeContentPacket` filed everything under one anonymous group. The new one has 1980 entries and 124 groups across the four tabs. `CreativeContentPacket.items` becomes `entries`, each an item and the group it sits under, and `CreativeInventory` gains `getEntries` and `getGroups`.
  
  Removed, none of which had a consumer: `banner_patterns`, `biome_id_map`, `entity_id_map`, `block_id_map`, `biome_definitions` (superseded by `biome_definitions_network`), `canonical_block_states` and `r12_to_current_block_map`. `item_tags` is now typed by the question a caller asks - a tag name is a string, not one of the 77 keys the file happens to hold. The published `dist` drops from 22 MB to 5.3 MB, because the submodule's raw files are inputs to the generator and were never meant to be bundles.

- [#2585](https://github.com/JSPrismarine/JSPrismarine/pull/2585) [`6bac604`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac604599b909ba32f93fc855de11e88455d184) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace `as` type assertions with inferred types, type guards and narrower parameter types across the packages.
  
  Most of the change is internal, but a few public signatures moved so the compiler can carry the type instead of a cast:
  
  - **brigadier.** `ArgumentType.parse` receives an `ArgumentParseContext<S>` (the dispatcher's context builder, which is what it always got at runtime) instead of a `CommandContext`. `ParseResults.getExceptions()` holds `Error` values, since argument parsers throw plain errors. `CommandContext.getLastChild()` no longer claims it can return `null`. `ArgumentType` and `ArgumentParseContext` are exported from the package root.
  - **protocol.** `DataItem` is built from one `DataItemEntry` whose `type` tag decides the type of `value`, and exposes `getId`, `getType` and `getValue`. `NetworkStructure.deserialize` now returns a real instance: it used to copy the prototype with `Object.assign`, which copies nothing, so a decoded `BlockPos` or `Vec3` had no `serialize` method and failed `instanceof`.
  - **raknet.** `ServerName` takes a `ServerNameSource` naming the two methods it reads instead of `any`.
  - **client.** `ClientPacketRegistry` exports an `isPacket(packet, id)` guard that narrows `DecodedPacket.data` by id. The handshake rejects a JWT claim that is present but not a string with the existing clear error instead of a later `TypeError`.
  - **minecraft.** `BlockSchemaProperty.type` is the union of the three NBT tags the palette uses, so a palette with a new tag fails type-checking instead of slipping through as a string.
  - **prismarine.** The command dispatcher is typed over `CommandExecutor`, with typed `literal`/`argument` builders and runtime-checked argument accessors; selectors and relative coordinates from the console fail with a clear error instead of a `TypeError`, and relative `~` coordinates, which threw on every use, now work. `Metadata` stores typed entries so a value that does not match its `FlagType` is a compile error. Several managers take the narrow slice of `Server` they use (`BanManager`, `BlockManager`, `PacketRegistry`, `RecipeManager`, `CreativeInventory`), so tests build plain doubles. A shorthand ambient module had typed every import from `@jsprismarine/bedrock-data` as `any` inside the package; it is gone, so the generated types reach the compiler.
  - **logger, nbt, leveldb.** No signature changes. `Logger.getNamespace` returns an empty string instead of throwing when `Error.stack` is undefined, and `NBTTagCompound` getters return the default for a tag of the wrong kind instead of throwing.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`95c1def`](https://github.com/JSPrismarine/JSPrismarine/commit/95c1defed96f389f944c2b61a70d4fe356d271c7) Thanks [@filiphsps](https://github.com/filiphsps)! - Drop dependencies and constructs that block ahead-of-time compilation with scriptc.
  
  - `@jsprismarine/logger` no longer wraps winston. The `Logger` API is unchanged; transports now implement the package's own `LogTransport` interface, and a `FileTransport` replaces winston's file transport.
  - `@jsprismarine/color-parser` declares its ANSI sequences directly instead of reading them out of chalk-cjs. The emitted escapes are identical; the chalk-specific exports are gone.
  - `@jsprismarine/prismarine` decodes login JWTs with plain base64url instead of fast-jwt, parses config files with json5 and js-yaml instead of confbox, and drops the debug-only `Symbol.toStringTag` accessors on `Entity`, `Block` and `BlockState`.
  - `@jsprismarine/brigadier` merges the exception classes into one module to remove an import cycle; the old module paths re-export from it.
  - `@jsprismarine/math` widens `Vector3.equals` to accept `Vector2` (returning `false`), matching the base signature.
  - `@jsprismarine/server` reads env files with `process.loadEnvFile` instead of dotenv.

- [#2592](https://github.com/JSPrismarine/JSPrismarine/pull/2592) [`5a94fc5`](https://github.com/JSPrismarine/JSPrismarine/commit/5a94fc5b9ffab382f86092dea42cbe768f7b9acc) Thanks [@filiphsps](https://github.com/filiphsps)! - Require lowercase command literals and correct the gamerule command name.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`9d3de40`](https://github.com/JSPrismarine/JSPrismarine/commit/9d3de4018f18712d426d0cc4246849d7dfbc4c3b) Thanks [@filiphsps](https://github.com/filiphsps)! - `Packets.AdventureSettingsPacket` is gone. The class is exported as `Packets.UpdateAdventureSettingsPacket`, its real name; update imports that used the alias.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`5c8d0aa`](https://github.com/JSPrismarine/JSPrismarine/commit/5c8d0aa8e9481714f17eb3a6568b79fcf8d7a2fa) Thanks [@filiphsps](https://github.com/filiphsps)! - Every entity now spawns under an actor type the client was told about in `AvailableActorIdentifiersPacket`. `EvokerIllager` uses `minecraft:evocation_illager` instead of the unknown `minecraft:evoker_illager`. The `Chalkboard`, `MovingBlock` and `Shield` entity classes are removed from `Entities`: their types are not in the 1.26.51 identifier list, so a client could never draw them.

- [#2604](https://github.com/JSPrismarine/JSPrismarine/pull/2604) [`5939ba5`](https://github.com/JSPrismarine/JSPrismarine/commit/5939ba5a647da3c987e05f3753e5dc829955bad3) Thanks [@filiphsps](https://github.com/filiphsps)! - `ConfigBuilder` keeps the comments and blank lines in a config file when it writes a key, and a key it writes for the first time can carry a comment: `get(key, defaults, comment)` and `set(key, value, comment)`. Reading goes through the new `ConfigDocument` layer (exported too), built on `yaml` and `jsonc-parser`, which edit the file text in place rather than dumping a value over it. A `.json` config may hold `//` and `/* */` comments and trailing commas; JSON5-only syntax such as unquoted keys is no longer accepted. A file that does not parse now raises an error naming the file instead of being treated as empty and overwritten with defaults.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`06dd676`](https://github.com/JSPrismarine/JSPrismarine/commit/06dd676cc007df4aa616b858767c358477a72410) Thanks [@filiphsps](https://github.com/filiphsps)! - `InputMode.MotionController` in `network/packet/PlayerAuthInputPacket` is now `InputMode.MotionController_Deprecated`, the name Mojang's datagen snapshot gives member 4. The 1.26.51 docs' member list drops it, but the value is still below `Count` (5), so the member stays. Values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`9a1abc3`](https://github.com/JSPrismarine/JSPrismarine/commit/9a1abc305179d8c5d573d353971a23475daf8c4d) Thanks [@filiphsps](https://github.com/filiphsps)! - The enums exported from `network/packet/InventoryTransactionPacket` now carry the docs' names: `UseItemAction` is `ItemUseActionType` with members `PLACE`, `USE`, `DESTROY` and `USE_AS_ATTACK` (formerly `CLICK_BLOCK`, `CLICK_AIR`, `BREAK_BLOCK`), `UseItemOnEntityAction` is `ItemUseOnActorActionType`, `ReleaseItemAction` is `ItemReleaseActionType`, and `ActionSource` is `InventorySourceType`. Values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`047d691`](https://github.com/JSPrismarine/JSPrismarine/commit/047d6911d8423575826102154a49ca1911261bb8) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename four enums under `network/packet/` to the docs' names: `CreativeCategory` is now `CreativeItemCategory`, `ResourcePackType` is `PackType`, `LoadingScreenPacketType` is `ServerboundLoadingScreenPacketType`, and `PlayerLocationType` is `PlayerLocationPacketType`. Members and values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`651a963`](https://github.com/JSPrismarine/JSPrismarine/commit/651a963921bfcb9bd72ab40323acecd8e3dd91d3) Thanks [@filiphsps](https://github.com/filiphsps)! - Enum members under `network/` now carry the docs' names. `RespawnState` is `PlayerRespawnState` with members `SearchingForSpawn`, `ReadyToSpawn` and `ClientReadyToSpawn`; `SpawnType` is `SpawnPositionType` with `PlayerRespawn` and `WorldSpawn`; `CreditsState.End` is `Finished`; `InteractAction.LeaveVehicle`, `MouseOver` and `OpenNPC` are `StopRiding`, `InteractUpdate` and `NpcOpen`; `CommandBlockMode.Impulse` is `Normal`; `CommandOriginType.Block` and `MinecartBlock` are `CommandBlock` and `MinecartCommandBlock`. Values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a848770`](https://github.com/JSPrismarine/JSPrismarine/commit/a8487700bb0534a0a3b7415671a69edbb8628e3a) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename the `PlayStatusType` enum to `PlayStatus`, the docs' name, and move it from `network/type/PlayStatusType` to `network/type/PlayStatus`. Its members now carry the docs' names: `LoginFailedClient` is `LoginFailed_ClientOld`, `LoginFailedServer` is `LoginFailed_ServerOld`, `LoginFailedInvalidTenant` is `LoginFailed_InvalidTenant`, `LoginFailedVanillaEdu` and `LoginFailedEduVanilla` are `LoginFailed_EditionMismatchEduToVanilla` and `LoginFailed_EditionMismatchVanillaToEdu`, `LoginFailedServerFull` is `LoginFailed_ServerFullSubClient`, and `LoginFailedEditorVanilla` and `LoginFailedVanillaEditor` are `LoginFailed_EditorMismatchEditorToVanilla` and `LoginFailed_EditorMismatchVanillaToEditor`. Values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1cbf13d`](https://github.com/JSPrismarine/JSPrismarine/commit/1cbf13d6fbf30be2e747057cbe2805d286e8f6a6) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename the `PlayerAction` enum exported from `network/packet/PlayerActionPacket` to `PlayerActionType`, the docs' name. Members now carry the docs' names in PascalCase: `START_BREAK` is `StartDestroyBlock`, `JUMP` is `StartJump`, `BUILD_DENIED` is `DenyDestroyBlock`, `CREATIVE_PLAYER_DESTROY_BLOCK` is `CreativeDestroyBlock`, `DIMENSION_CHANGE_ACK` is `ChangeDimensionAck`, `START_SPRINT` is `StartSprinting`, and so on for every member. Values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`efd7572`](https://github.com/JSPrismarine/JSPrismarine/commit/efd757225cfc82132c928c25996b69ee0e43e780) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerLocationPacketType` in `network/packet/PlayerLocationPacket` uses the docs' member names: `Coordinates` is now `PLAYER_LOCATION_COORDINATES` and `Hide` is `PLAYER_LOCATION_HIDE`. Values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f4f55c1`](https://github.com/JSPrismarine/JSPrismarine/commit/f4f55c1664bdff45e0d35c90f400b4bc3b3f6691) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename the `MovementType` enum to `PositionMode`, the name the Bedrock docs give the Position Mode byte of `MovePlayerPacket`. Its members `Reset` and `Pitch` are now `Respawn` and `OnlyHeadRot`, matching the docs. Values are unchanged. The import path moves from `network/type/MovementType` to `network/type/PositionMode`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`fcc8ebf`](https://github.com/JSPrismarine/JSPrismarine/commit/fcc8ebffa6b7b4f56da20211c251780b303219b0) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove `network/type/AnimateActionType` and `network/type/ViolationType`, and the `Types.AnimateActionType` export. Both duplicated enums that the packet files already define with the docs' names: use `AnimateAction` from `network/packet/AnimatePacket` and `PacketViolationSeverity` from `network/packet/PacketViolationWarningPacket`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c7e1818`](https://github.com/JSPrismarine/JSPrismarine/commit/c7e18181643ebdec5efadcc2d00e0bcf36626882) Thanks [@filiphsps](https://github.com/filiphsps)! - `ResourcePackStackPacket` now writes the full protocol 2193 stack. Each `texturePackList` entry is a `PackInstanceId` with `packId`, `version` and `subPackName`, the `baseGameVersion` string and `includeEditorPacks` flag are fields instead of hardcoded values, and `experiments` is an `Experiment` array written with the uint32 little-endian count the docs specify. The packet also decodes. The unused `addonList` field is gone and `experiments` is no longer a `Map`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`800f815`](https://github.com/JSPrismarine/JSPrismarine/commit/800f81543aa7fce7a7d1ca0e93318f430a100cbb) Thanks [@filiphsps](https://github.com/filiphsps)! - `StructureSettings` and its `Rotation`, `Mirror` and `AnimationMode` enums now live in `network/type/StructureSettings`, together with `defaultStructureSettings`, `readStructureSettings` and `writeStructureSettings`. `StructureBlockUpdatePacket` and `StructureTemplateDataRequestPacket` share them instead of each exporting its own copy; the `Structure*`-prefixed enums are gone, and `Rotation` carries the docs' `Clockwise90`, `Clockwise180` and `CounterClockwise90` aliases for 1, 2 and 3. Field names follow the docs: `shouldIgnoreEntities`, `shouldIgnoreBlocks`, `shouldAllowNonTickingPlayerAndTickingAreaChunks` on `StructureSettings` and `shouldIncludePlayers`, `shouldShowBoundingBox` on `StructureEditorData`. Wire bytes are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`5b96d5a`](https://github.com/JSPrismarine/JSPrismarine/commit/5b96d5ac59cfbc754a3977aeaaa57e9991a1404a) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename the `TextType` enum to `TextPacketType`, the docs' name for the Message Type of `TextPacket`, and move it from `network/type/TextType` to `network/type/TextPacketType`. `Types.TextType` is now `Types.TextPacketType`. Members now use the docs' names: `Translation` is `Translate`, `System` is `SystemMessage`, and `JsonWhisper`, `Json`, `JsonAnnouncement` are `TextObjectWhisper`, `TextObject`, `TextObjectAnnouncement`. Values are unchanged.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`fae2f4f`](https://github.com/JSPrismarine/JSPrismarine/commit/fae2f4f9952bd5ede5c0bdceaca9bffb11195029) Thanks [@filiphsps](https://github.com/filiphsps)! - Send positional packets only to the players near them, and stop sending several of them to the entire server.
  
  Nothing filtered by distance. Two players ten thousand blocks apart still received each other's movement, each other's block updates and each other's sounds, and each other's arm swings. The code knew: `World.sendWorldEvent` and `World.sendActorEvent` both carried a `// TODO: Limit distance`, the second of them reading "as with every other broadcast here".
  
  Several of those broadcasts were worse than world-wide. Block placement, the animate handler, the disconnect despawn loop, the pairwise spawn at join and `Player.sendSettings` all went through `SessionManager.getAllPlayers()`, so they reached every player on the server regardless of which world they were in. Latent while only one world is loaded, and a wall in front of any multi-world work.
  
  Recipients are now chosen in one place. `World.getViewers(position, options)` answers "who should be told about this", and `World.broadcast` and `World.broadcastAround` are the two ways to reach them; `Server.broadcastPacket` stays as the genuinely global channel for the player list, the command tree and shutdown. Chat, the time of day and the command tree are unchanged.
  
  The test is done in chunk space against the recipient's own negotiated view distance, not against a fixed radius and not against the set of chunks the server believes it has sent. That last option is nominally the most accurate and is the wrong trade: `loadedChunks` is only marked once a batch has finished compressing and is never marked if that compression fails, so building entity visibility on it makes a compression failure show up as permanently invisible mobs. Being slightly too generous costs a packet the client discards on its own; being too stingy costs an entity that is never drawn. The chunk test is circular rather than square because `needNewChunks` loads terrain on `dx² + dz² > viewDistance²` — what a client holds is a disc, so a square test would send updates for four corners it has no ground for. Both cost the same arithmetic.
  
  Entity visibility follows vanilla in being per type rather than one radius for everything. `Entity.getTrackingRange` and `getTrackingInterval` default to 8 chunks and 3 ticks; players override to 32 chunks — past any view distance, so the viewer's own radius decides — and dropped items to 6 chunks and 20 ticks. Items are the reason this matters: they are the most numerous entity in any world and the least worth seeing at a distance, and one mob farm at the generic radius streams thousands of them to everybody nearby.
  
  Each session now tracks which entities its client actually holds, reconciled when the player crosses a chunk boundary and every few ticks otherwise, with hysteresis between the radius at which an entity appears and the one at which it goes away — with a single radius a player standing on the boundary produces an `AddActor` and a `RemoveActor` for everything out there on alternating passes. Entities are recorded as tracked only after their spawn has reached the wire, so a failed spawn is retried rather than being remembered as delivered and never sent again. Movement is gated on that tracked set rather than on distance: a `MoveActorAbsolutePacket` for a runtime id a client was never given is discarded at the other end anyway, which makes tracking both the correct gate and a set lookup instead of arithmetic on the hottest path in the server.
  
  `proximity-broadcast: false` turns the filtering off. It restores world-wide delivery, not the server-wide fan-out, which was a bug rather than a behavior. `entity-tracking-hysteresis` and `entity-tracking-interval` tune the rest.
  
  Three bugs came out of the audit that had nothing to do with distance:
  
  `Player.sendSettings` sent one player's `UpdateAdventureSettingsPacket` to every other client. That packet has no target actor field at all — it describes the client receiving it — so a single spectator set `worldImmutable`, `noAttackingPlayers` and `noAttackingMobs` on everybody else on the server. `PlayerSession.sendSpawn` had the same defect the other way round, pushing the *viewer's* settings onto the player being spawned on every spawn. Adventure settings now go to their own client only; `UpdateAbilitiesPacket`, which does carry `targetActorUniqueId`, still reaches everyone who can see the player.
  
  The chat listener was never unregistered. It was registered with `this.chatHandler.bind(this)` and removed by passing the naked method, which is a different function object, so every disconnected player stayed subscribed to chat for the life of the process.
  
  `CoordinateUtils.fromBlockToChunk` was `v >> 4`, and `>>` converts through `ToInt32`, which truncates towards zero. Entity positions are floats, so anything standing between -1 and 0 was placed in chunk 0 rather than chunk -1.
  
  Performance, alongside the reduction in recipients:
  
  Broadcasts compress once. `Server.broadcastPacket` was a serial `await` in a loop that built a fresh `BatchPacket` per recipient, so one `UpdateBlockPacket` going to twenty players was twenty runs of zlib over identical bytes, each waiting on the one before it. `MinecraftSession.sendSharedBatch` frames bytes somebody else encoded, through the same ordering chain so it cannot overtake a chunk batch still compressing.
  
  `needNewChunks` no longer runs every tick. It rebuilt a heap of a few hundred candidates twenty times a second per player, for a player who had not moved a block; it now runs when the player changes chunk, which is the same signal that drives entity visibility.
  
  A tick's movement is deduplicated per entity. `Entity.setX`, `setY` and `setZ` each announce a move of their own, so a single diagonal step queued three identical packets naming the same destination.
  
  `SetTimePacket` goes out once a second instead of twenty times a second. The client runs its own day cycle in between, which is why the packet is in the default `log-excluded-packets` in the first place.
  
  Dead code removed: `Player.chunkSendQueue`, a `Set<Chunk>` never read or written that shadowed the real queue on `PlayerSession` by name; `PlayerSession.sendChunk`, which had no callers and was superseded by `flushChunkBatch`; and `DataPacket.getAllowBatching`, which read a field nothing ever set. `PlayerSession.send` now returns its send instead of dropping the promise, so awaiting a broadcast means something and framing errors are no longer swallowed. `PlayerSession.broadcastMove` is renamed `sendMove`, since it sends to one session and the fan-out of that name lives on `World`. `SessionManager.getAllPlayers` now filters on `isOnline()` as `World.getPlayers` already did, so a connection still in the login handshake is no longer among the recipients of every broadcast.
  
  `Vector3` gains `distanceTo` and `distanceSquaredTo`. There were five hand-rolled copies of that arithmetic across the server using three different metrics.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`2b474b7`](https://github.com/JSPrismarine/JSPrismarine/commit/2b474b739ec7420dea21d02751fbb66f3a7f6a04) Thanks [@filiphsps](https://github.com/filiphsps)! - Give worlds their real vertical range. The Overworld is now -64 to 319 across 24 sub chunks, as it has been in vanilla since 1.18, instead of 0 to 255 across 16.
  
  A new `Dimension` describes where a world's floor sits and how tall it is, and every vertical bound - sub chunk indices, the serialiser's loops, generator and decorator depth bands - derives from it rather than from a constant. Sub chunk indices are signed, so index -4 is the Overworld's bottom sub chunk, which is also exactly how a Bedrock world stores it.
  
  `Chunk.networkSerialize` no longer prepends four hardcoded empty sub chunks to fake the space below y=0; that space is real now, and a dimension whose floor is above the client's still gets the padding it needs, derived rather than hardcoded.
  
  Fixes four defects in the chunk stack that this uncovered, all of which broke reading a chunk back:
  
  - `Chunk`'s constructor ignored the sub chunks it was handed, so every chunk read from disk came out empty and the Filesystem provider silently regenerated the terrain instead.
  - `SubChunk.networkDeserialize` skipped the version byte and read its value, 8, as the layer count.
  - `Chunk.networkDeserialize` always read a fixed 16 sub chunks however many were written, and never consumed the biome and border trailer.
  - `getSubChunk` accepted an index one past the top of the world.
  
  `Chunk.getHighestBlockAt` now returns `null` for an empty column rather than `-1`, which is a height a real block can occupy once the floor is below zero.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`1b825f1`](https://github.com/JSPrismarine/JSPrismarine/commit/1b825f10efeeb776ff859a1d10eea15f43d306f6) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the `Filesystem` world provider. `LevelDB` is the only default.
  
  It wrote each chunk as its own file containing the network payload — the bytes the server puts on the wire, which is a format nothing else reads, not the game and not any other server. It never wrote block entities, entities or level metadata, so anything the world held beyond terrain was gone on the next load; and because a chunk that failed to read fell through to `generator.generateChunk`, a world that had silently stopped saving looked exactly like a world that was working.
  
  `LevelDB` was already the default for a world with no `provider:` line. It is now the only one alongside `Anvil`.
  
  A config still naming `Filesystem` is refused at startup rather than quietly switched. The two keep their chunks in different places, so loading one as the other would present an empty world where a populated one used to be, which is the one failure mode worth being loud about. The error names the providers that do exist.
  
  `LevelDB` already warned when it found a `chunks` directory and no `db` beside it; it still does, and still touches nothing, but no longer suggests setting `provider: Filesystem` to get the old world back. There is nothing to convert those files into.
  
  `Server.test.ts` now gives each of its two servers a world of its own. Both stub `shutdown`, so the first server is left holding its world, and LevelDB takes a directory lock — two writers on one world delete each other's files rather than racing for a stale read. Sharing a folder was invisible under a provider with no locking and is a correct refusal under this one.

### Patch Changes

- [`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c) Thanks [@filiphsps](https://github.com/filiphsps)! - Give players somewhere to put armor, so the armor they already had starts working.
  
  Both ends of this were finished long before the middle was. Twenty-four armor items have declared their defense points since they were written, and the damage formula has known what to do with them since the pipeline was laid - but `HumanInventory` was `super(36)` and nothing else, so there was nowhere to read from and every blow landed as though the player were naked.
  
  **The armor is a container of its own**, not four more slots on the end of the main one. The client addresses it that way - `ContainerUiId.ARMOR_CONTAINER`, window 120 - and anything walking the inventory looking for space would otherwise offer to put a pickaxe on your head. An off-hand slot comes with it, since the protocol carries the two together.
  
  Equipping works through the drag machinery that was already there: `ItemStackRequestHandler` learned to read and write the armor container alongside the cursor and the crafting grid, so the same code path that moves a stack between two inventory slots moves a helmet onto a head. The slot id is range-checked, because a request naming slot nine would otherwise write past the end of a four-slot container.
  
  **`MobArmorEquipmentPacket`** is what lets anybody else see it. `AddPlayerPacket` carries the held item and nothing more, so armor has to follow a player into view as a packet of its own - exactly as the skeleton's bow does. It is positional and always all five pieces, empty ones sent as air: a client that was handed three would read the next packet's bytes as the fourth.
  
  The `firedamage`-style rules already knew that drowning and starving ignore armor, so a chestplate now takes the edge off a sword and does nothing at all against a lungful of water. Toughness does what it was written to do - iron protects less and less as a blow gets harder, and diamond holds up.
  
  Durability is still not decremented, on armor or on weapons. It needs a slot to be told to the client as it changes, which is now possible, and it is the next thing rather than a thing left out.

- [#2600](https://github.com/JSPrismarine/JSPrismarine/pull/2600) [`f320277`](https://github.com/JSPrismarine/JSPrismarine/commit/f320277d45ccd2ed2242f07f3818264605b2e9b8) Thanks [@enricoangelon](https://github.com/enricoangelon)! - Place a player who has no saved position the way a Bedrock Dedicated Server does. The feet go one block above the stored spawn height, centered on the block. A spot inside solid blocks moves up to the first free space, and a spot above leaves moves to a random column up to 15 blocks away. The join now sends BDS's `StartGame` position for that player and the three `Respawn` packets BDS sends after the inventory. New worlds store the surface block itself as the spawn height, which is how Bedrock worlds store it.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`1b825f1`](https://github.com/JSPrismarine/JSPrismarine/commit/1b825f10efeeb776ff859a1d10eea15f43d306f6) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the codec for Minecraft: Bedrock Edition's on-disk chunk format, so a world folder can be read and written exactly as the game writes it.
  
  - **Keys.** Chunk records are addressed by x and z as signed little endian int32s, the dimension only when it is not the Overworld, a tag byte, and for a sub chunk a *signed* index byte - 0xfc is -4, the Overworld's bottom slice. Non-chunk keys such as `~local_player` and `portals` are recognized as not being chunk records rather than mis-parsed.
  - **Sub chunks.** Versions 1, 8 and 9, including the second storage layer that water-logging uses. The version a sub chunk was read at is kept, so writing it back does not silently upgrade it.
  - **Block storage.** The same bit packing as the network form, but with the persistent flag clear, a fixed width palette count, and each palette entry an NBT compound of `{name, states, version}`. Palette entries go through the existing `BlockRuntimeIds`, which already hashes exactly that compound - so there is no second mapping table to keep in step. A block this version does not know resolves to the unknown id, and a known block with an unknown property value falls back to its default state, rather than either making a whole world unreadable.
  - **Biomes.** The `Data3D` record: a 512 byte heightmap measured from the world floor, then one palette per sub chunk with little endian int32 biome ids, including the header byte that means "the same as the sub chunk below" and the truncated tail the game leaves when the rest would all inherit.
  - **level.dat.** The 8 byte header and little endian NBT payload, plus `levelname.txt`, keeping the previous file as `level.dat_old` the way the game does.
  
  `BlockStorage` gains `getPalette` and `getPaletteIndexAt`, which the disk codec needs to write the packed indices directly instead of round-tripping every block through the palette. `@jsprismarine/bedrock-data` now exports `biome_id_map`.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`6b60a88`](https://github.com/JSPrismarine/JSPrismarine/commit/6b60a88e40ad9751ea177f4273779869486de7e0) Thanks [@filiphsps](https://github.com/filiphsps)! - Move JSBinaryUtils into the monorepo as `@jsprismarine/binaryutils`.
  
  It was developed in its own repository and consumed here as a pinned npm dependency, which meant a
  change to the binary stream needed a release there before it could be used here. It now lives in
  `packages/binaryutils` and every consumer resolves it through the workspace, so it builds, typechecks
  and tests together with the packages that use it.
  
  The published name changes: `@jsprismarine/jsbinaryutils` is deprecated on npm and its last release
  re-exports this package, so existing installs keep working. The API is unchanged.
  
  Two things came along with the jump from the pinned 5.5.3 to current: `write()` accepted a
  `Uint8Array` in its signature but called `Buffer#copy` on it, so anything not already a `Buffer`
  threw at runtime — it now uses `set`. And the single internal `buffer` field is split into a read and
  a write buffer, so code reaching past the public API to assign `.buffer` no longer populates the read
  side; use `setReadBuffer()`.
  
  `@jsprismarine/protocol` also gained the dependency in its manifest — it imported the package while
  relying on it being hoisted into the root `node_modules`.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`30008ec`](https://github.com/JSPrismarine/JSPrismarine/commit/30008ec028477ee99d2fa503e421c21de4207787) Thanks [@filiphsps](https://github.com/filiphsps)! - Model block entities, and give entities a form they can be stored in.
  
  `packages/prismarine/src/blockentity/` is new: a `BlockEntity` base, a registry that mirrors `entity/Entities.ts`, and classes for chests, barrels, shulker boxes, hoppers, furnaces, signs, skulls, beds, banners, item frames and mob spawners. `Chunk` holds them, keyed by position, and drops one when the block it belonged to is replaced, so a broken chest cannot leave an orphan tile behind. `EntitySerializer` and `GenericEntity` do the same job for actors.
  
  Both follow one rule, and it is the whole design: reading keeps the *entire* source compound, a class lifts out only the fields it models, and writing starts from what is left and puts those fields back. A type nobody has modeled becomes the generic form, whose remainder is everything, and round-trips byte for byte.
  
  That is not tidiness. A world is full of blocks and mobs written by versions and behavior packs this server knows nothing about, and a provider that wrote back only the fields it understood would erase a player's chests one save at a time with nothing to say it had happened. For actors it is stricter still: vanilla NBT carries a `definitions` list naming the component groups the actor was assembled from, and one saved without it comes back broken.
  
  A sign is read in both the flat pre-1.19.80 shape and the current front-and-back-face one.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`2423ed0`](https://github.com/JSPrismarine/JSPrismarine/commit/2423ed0c8b5ada9b59c6441f1c2bbcd70df8c554) Thanks [@filiphsps](https://github.com/filiphsps)! - Give blocks physics, and players fall damage.
  
  Four behaviors were asked for - plants breaking when their support goes, sand and gravel falling, water running into holes, and fall damage - and the first three are the same problem wearing different hats: something changed *there*, so something may now have to happen *here*. So the work is one mechanism and three rules rather than three features.
  
  **`World.setBlockRuntimeId` is now the only way a block changes.** It writes the block, tells every client, and queues the block and its six neighbors to look at themselves. `breakBlock` and block placement both go through it, which is what makes breaking or placing anything have consequences; a caller that writes into a chunk directly changes the world without anything noticing, and the sand above stays in mid air.
  
  **`BlockUpdateScheduler`** holds the queue. It deduplicates by position, because a cascade queues the same places repeatedly and would otherwise grow faster than it drains; it supports delays, because water spreads on a timer and a falling block descends a block at a time; and it has a per-tick budget, so a lake breached into a cavern is spread over several ticks rather than taking one down.
  
  **The rules** live in `world/physics/`, keyed by block state name. Deliberately not by the registered `Block` classes: those cover eighty of the twelve hundred blocks the client knows and `getBlock` returns air for the rest, so a rule that consulted them would silently do nothing for most of what world generation actually places - which is the worst way for physics to fail, since it looks implemented.
  
  - Plants, crops and torches break and drop when what holds them up is removed. A block at the edge of the loaded world is assumed supported rather than guessed at, so borders do not strip themselves.
  - Sand and gravel are handed to a `FallingBlock` entity, which accelerates under vanilla's figures and turns back into a block where it lands - or drops as an item if the place it came to rest will not take one. It has to be an entity: a block is only ever in one place or another, so stepping it down through the world could only ever move it at a fixed rate, and sand would drift rather than drop. The client draws it from the block runtime id in its `VARIANT` metadata, which is also why `Metadata` gained a `setInt` - a short would truncate the hash to nonsense.
  - Water spreads outward losing a level each block and falls at full strength, so it goes *down* a hole rather than across the floor, and a waterfall does not thin out on the way. Flowing water with nothing feeding it dries up, so breaking a source takes the stream with it.
  
  **Fall damage** is a half-heart per block past the third, canceled by water and by the other things that break a fall, and never charged to a creative or flying player. Movement is client authoritative here, so the server cannot simulate the fall and instead adds up the positions it is told about - which means rising has to reset the distance, or every jump would be measured from the floor it started on.

- [#2589](https://github.com/JSPrismarine/JSPrismarine/pull/2589) [`733c0e1`](https://github.com/JSPrismarine/JSPrismarine/commit/733c0e1ed7bca0a47a4a1be9b13821413916a420) Thanks [@filiphsps](https://github.com/filiphsps)! - Add shared Yargs-based command-line parsing and shell completion to the server and client. The server accepts `--port`, and the development launcher forwards command-line arguments to it.

- [#2593](https://github.com/JSPrismarine/JSPrismarine/pull/2593) [`b4ec81c`](https://github.com/JSPrismarine/JSPrismarine/commit/b4ec81c119bf3a4d95660541c438d07d8fca58cc) Thanks [@filiphsps](https://github.com/filiphsps)! - Log the configured server port when starting without an explicit bootstrap port.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`d4e1796`](https://github.com/JSPrismarine/JSPrismarine/commit/d4e1796deb7b4132021b362ef3561df3f958de72) Thanks [@filiphsps](https://github.com/filiphsps)! - Decode the client cache status packet instead of warning about it on every join.
  
  The client sends `ClientCacheStatusPacket` (0x81) once after login to say whether it can keep a blob cache. The server had no class for it, so every join logged `Packet 0x81 isn't implemented`. It now decodes the flag and records it at debug level. Chunks still go out with the cache off, so nothing on the wire changes ([#2582](https://github.com/JSPrismarine/JSPrismarine/issues/2582)).

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`5cd4d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/5cd4d0aaf1b101135135157e9f11c55c4c73a5f9) Thanks [@filiphsps](https://github.com/filiphsps)! - The client can log in. `@jsprismarine/client` connects to a Bedrock server, completes the handshake and stands in the world - proved by a test that boots a real `Server` in-process and joins it with nothing mocked in between.
  
  **`@jsprismarine/auth`, new.** The login identity: the JWT chain, the client data blob, and the P-384 key both are signed with. A package of its own because the proxy shares it - it needs to *verify* an incoming chain when acting as a server in online mode, which a client never does. A provider is chosen at the edge of the application, so which one is in play is a deployment decision rather than a build-time one. `OfflineAuthProvider` signs the single self-signed chain link a real client sends when it is not signed in, and generates its key per instance, because the key *is* the identity: five hundred bots under one name still need five hundred of them.
  
  The default skin is generated from flat color blocks laid over the regions the classic humanoid geometry samples. Mojang's textures cannot be redistributed and a client that refused to log in without one would be useless. It is also not optional in the way it looks: the server builds a `Skin` out of the client data and dereferences eighteen fields without checking any of them, so a client that omits one crashes the login handler rather than being refused.
  
  **Ten packets migrated to `NetworkPacket<T>`** - the ones a join cannot do without. `Login` is among them, and is encodable for the first time: `LoginPacket.encodePayload` had been a commented-out block with a hardcoded chain in it since it was written. `StartGame` is deliberately partial, reading the fields a client cannot function without and stopping; the rest is positional and would have to be modeled in full before any of it could be read. Stopping early is safe because a batch length-delimits each packet.
  
  **`@jsprismarine/client`, rebuilt.** It was a 230-line proof of concept that could not finish a handshake - it hardcoded RakNet protocol 10 against this repository's own 11, drove a *server* session by passing itself as `this as any`, and sent a Login that encoded nothing. It is now a transport seam, a packet registry with no `Server` in the signature, a batching session and a login state machine, and it depends on `@jsprismarine/protocol` rather than on the server.
  
  Three bugs found by pointing it at a real server:
  
  - **Inbound batches were dispatched out of order.** Decoding is asynchronous because inflating runs on libuv's thread pool, so a batch takes as long as its *size* says, and a large one was overtaken by every small one that arrived while it was still inflating. A 37 KiB `StartGame` surfacing after the `PlayStatus` that was meant to follow it is not a slow `StartGame`, it is a missing one - the login failed with "the server spawned us without ever sending StartGame" while the packet was still inflating. Inbound is now a chain, the receiving mirror of the one `MinecraftSession` already kept on the way out.
  - **`ResourcePackResponsePacket.encodePayload` could not be read by its own `decodePayload`**: a spare `writeUnsignedShortLE(0)` sat in front of the count. Latent while only the server handled this packet, which decodes and never writes one.
  - **`World.getPlayerData` raised "Player has no XUID"** for every unauthenticated player - a case `LoginHandler` explicitly permits, `savePlayerData` has always written a file for, and the very next line already had a fallback for. It logged as an error on every offline join. Reader and writer now share one key.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`98a5594`](https://github.com/JSPrismarine/JSPrismarine/commit/98a55948a7e966fc1e46ca13707a8212dedba6fa) Thanks [@filiphsps](https://github.com/filiphsps)! - Decode the packets a 1.26.51 client sends during play instead of warning `Packet 0x.. isn't implemented` and dropping them.
  
  Twenty-three client-to-server packets gain a class, a handler, and a registry entry: `ServerboundLoadingScreenPacket`, `ServerboundDiagnosticsPacket`, `NetworkStackLatencyPacket`, `UpdateClientOptionsPacket`, `ClientCacheBlobStatusPacket`, `ResourcePackChunkRequestPacket`, `RequestAbilityPacket`, `RequestPermissionsPacket`, `ClientMovementPredictionSyncPacket`, `PlayerLocationPacket`, `EmotePacket`, `SetDifficultyPacket`, `ModalFormResponsePacket`, `BookEditPacket`, `LecternUpdatePacket`, `CommandBlockUpdatePacket`, `ServerboundPackSettingChangePacket`, `PlayerToggleCrafterSlotRequestPacket`, `BlockPickRequestPacket`, `ActorPickRequestPacket`, `MapInfoRequestPacket`, `AnvilDamagePacket`, and `SubChunkRequestPacket`. Each decodes the full protocol 2193 layout and logs at debug level. `EmotePacket` is also relayed to the other online players under the sender's runtime id with the server-side flag set; the rest change no server state yet, and each handler names the gap it leaves. `Identifiers` gains the ten ids that were missing.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`cc3a371`](https://github.com/JSPrismarine/JSPrismarine/commit/cc3a37165fe66ea44bc72fd48f8d59c0f2359031) Thanks [@filiphsps](https://github.com/filiphsps)! - Give damage an attacker, a grace period and a way of reaching the client.
  
  There was already a working health system - health is an attribute, `damage` takes it off, `onDeath` fires once on the transition - and falling, drowning and starving all used it. What it could not express was somebody doing it to somebody else, which is every interesting kind of damage there is. This lays the pipeline that the rest of combat is built on; nothing yet swings a weapon.
  
  **`DamageSource`** replaces the bare cause at the point where it matters. It carries who is answerable for a hit, what actually made contact when that is not the same thing, and how much extra shove the blow is worth. `damage()` takes either form - `DamageSource.of` normalizes - so every existing call site that only ever had a cause was left exactly as it was. `DamageCause` moved into a file of its own, re-exported from `Entity`, because `DamageSource` names both it and `Entity` and leaving it where it was would have closed a runtime import cycle. It gained the causes the rest of the work needs: lava, contact, suffocation, explosion, projectile, magic, wither and thorns.
  
  **The reduction formulas** are in `entity/Damage.ts` as pure functions, checked against numbers a player can look up: a ten point blow is six through full iron and three through diamond. Armor first, then the Protection enchantments on it, then Resistance - the order is load-bearing, since each takes a percentage of what the last one left. Armor points and armor *enchantments* are bypassed by separate lists, which is not fussiness: a fall ignores the points but is still reduced by Feather Falling, and folding the two together makes the best boots in the game do nothing.
  
  **Invulnerability frames.** Ten ticks after a hit lands, and the vanilla rule rather than the obvious one: a *harder* blow still gets through, for the difference, so swinging a better weapon at a freshly-hit target is worth doing. The flash, the shove and the timer belong to the hit that opened the period; a follow-up that only lands the difference is not a second hit to look at. Without any of this a mob standing in a cactus would die in a fifth of a second.
  
  **Knockback** is worked out in one place - direction from the source, strength from the blow, scaled by the knockback resistance attribute - and handed to an `applyKnockback` the two kinds of entity implement completely differently. A `Mob` queues it and spends it in `applyPhysics` alongside the shove from its neighbors, for the reason the comment there already gives: a blow is something happening *to* the mob, and putting it through the acceleration model would absorb two thirds of it. A `Player` cannot be moved by the server at all - their position is their own client's - so they are sent a velocity and asked to do it themselves, which is what `SetActorMotionPacket` is for.
  
  **A mob's health can now reach the client at all.** It could not before: the only code that sent attributes had the local player's runtime id written into it, so a mob's health changed on the server and no client was ever told. Attributes reached a client exactly once, inside the packet that spawned the entity - which is why the bar over a hurt zombie never moved and it appeared to die in one hit from full. `WorldChangeSink` gained `entityAttributesChanged`, the world drains each entity's dirty set once per tick next to where it flushes movement, and the replicator turns that into `UpdateAttributesPacket` for whoever is tracking the entity.
  
  **Death messages** moved out of `Player` into `entity/DeathMessages.ts` and learned who did it, so a death can be announced as somebody's work - and vanilla's distinction between being slain by a person and by a mob is kept. `World.getEntity(runtimeId)` exposes the map that was already there, because everything arriving from a client names an entity by runtime id and resolving that by walking every entity in the world is a linear scan for something a map answers in one step.
  
  `EntityDamageEvent` is cancellable and its amount writable, so a plugin can make a region safe or a mob tougher in one place rather than intercepting every source separately. `EntityDeathEvent` is not - by the time it runs the health is gone and the client has been told.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`d7ddc4f`](https://github.com/JSPrismarine/JSPrismarine/commit/d7ddc4fb1c0cd3493b22af3edc4274d529441d7b) Thanks [@filiphsps](https://github.com/filiphsps)! - Send command parameter types a 1.26.50 client understands ([#2582](https://github.com/JSPrismarine/JSPrismarine/issues/2582)).
  
  `CommandParameterType` still carried the argument type ids of a much older protocol (`Target` 7, `String` 0x20, `Position` 0x29), while `AvailableCommandsPacket` kept its own copy with newer numbers, so a `/tp` target went out typed as a comparison operator (id 7 in 2193) and every string as id 32, a selector argument value. Both now read from one table in `CommandParameter.ts` that matches gophertunnel's `command.go` at protocol 2193 (`Target` 8, `String` 56, `Position` 65, `Message` 67, `RawText` 70, `Json` 74, `Command` 87); the packet's unused `ARG_*` fields are gone. A soft enum parameter's type word also pointed at the hard enum table instead of the soft one, and a soft enum that only a parameter named was never written at all; the packet writes the collected soft enum list and indexes into it.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`9300913`](https://github.com/JSPrismarine/JSPrismarine/commit/93009135c3977ea4d43b5ab5de3460f674a698c6) Thanks [@filiphsps](https://github.com/filiphsps)! - Print join, leave and death announcements on the console in English instead of as raw translation keys.
  
  These chats are sent to players as a `%`-prefixed key and parameters, which each client renders in its own language. The console has no client and logged `%multiplayer.player.joined` with the name dropped. It now fills the English text for the keys the server sends; an unknown key is printed with its parameters in brackets. The packets players receive are unchanged.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`bf3d6d7`](https://github.com/JSPrismarine/JSPrismarine/commit/bf3d6d7786b7cc36237336674f3a7a0909f0559a) Thanks [@filiphsps](https://github.com/filiphsps)! - Make creepers explode, and align knockback with vanilla's.
  
  **`entity/Explosion.ts`** is a blast given a power rather than a creeper's method, because everything that explodes explodes the same way and differs only in how hard: TNT is 4, a creeper 3, a charged one 6. The damage curve is vanilla's - `((impact² + impact) / 2) × 7 × diameter + 1` - and it is steep on purpose, so a creeper at point blank does forty-three half-hearts and kills an unarmored player outright while one at four blocks costs a couple.
  
  Cover works. A ray is walked from the blast to the middle of each body and anything solid on the way stops it, so a wall between you and a creeper protects you. Deliberately all-or-nothing where vanilla grades a corner by sampling a grid of rays through the whole box - cheaper, and it gets the case that matters right. One thing that is *not* treated as cover is an unloaded chunk: `BlockView.isSolid` answers "yes" for anything not in memory, which is the correct conservative answer for a pathfinder and exactly the wrong one here, since it would have made a blast at the edge of the loaded world silently harmless.
  
  Blocks are removed as a sphere, gated on `mobGriefing`, and checked by *name* against a blast-proof list rather than through the block registry - the registry knows a fifth of the blocks the client does and returns air for the rest, so a blast-resistance check through it would quietly decide most of the world was air and blow up the lot.
  
  **`SwellGoal`** is the fuse. It is a goal and not an argument to `MeleeAttackGoal` because a creeper's attack is a *timer*: it stops, hisses, and is interruptible for a second and a half, none of which a swing has any concept of. Backing away puts it out, which is the point of the mob - a creeper is something you beat by moving rather than something that simply costs you health. It escapes at a wider range than it ignites at, so a target circling the boundary does not light and snuff it every other tick.
  
  **Mob metadata can now reach a client at all**, which the fuse needed and which had exactly the same shape as the attribute gap fixed earlier: everything that sent metadata had the local player's runtime id baked in, so it arrived once, inside the packet that spawned the entity. A creeper could light its fuse and a mob could catch fire with nobody ever seeing either. `WorldChangeSink` gained `entityMetadataChanged`.
  
  **Knockback now matches vanilla, and was too strong.** Vanilla shoves *twice* for a sprint hit - once from being hurt and once from the attack - and each shove halves whatever the last one left before adding its own. Modeling that as one combined impulse of `0.4 + 0.5` is not the same thing and is noticeably harder: it sent a sheep half again as far as vanilla does. The composition is now exact, so a sprint hit both throws less far and cancels more of the run the target was making. A plain hit is unchanged.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`58ef8d6`](https://github.com/JSPrismarine/JSPrismarine/commit/58ef8d68e9e96a7031c74d864af8e449ee440a2d) Thanks [@filiphsps](https://github.com/filiphsps)! - Despawn the old world's entities when a player changes world.
  
  The server used to forget what the client was showing and send nothing, on the assumption that a dimension change made the client drop every entity. It does not, so mobs from the world a player left stayed on screen in the new one. `Player.setWorld` now sends a `RemoveActor` for every entity the client held before the dimension change goes out.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`cc3a371`](https://github.com/JSPrismarine/JSPrismarine/commit/cc3a37165fe66ea44bc72fd48f8d59c0f2359031) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the world dangerous to everything in it, not just to players.
  
  Falling, drowning and burning were all implemented, and all of them applied to exactly one kind of entity. A player drowned; a zombie stood in lava indefinitely, at full health, for as long as the chunk stayed loaded.
  
  **`entity/Environment.ts`** holds the rules and nothing else - which blocks break a fall, how far is free, how often a burn hurts. Deliberately constants and small functions rather than a base class, because the two things that need them could hardly be less alike: a player's fall is *reported* by their own client and has to be added up from position packets, while a mob's is simulated here and falls straight out of its velocity. Only the rules are shared; the bookkeeping cannot be.
  
  **`BlockView` learned what a hazard actually does.** It already knew which blocks a mob would rather walk round, as a flat set - enough for the pathfinder, which only asks "would this hurt". The damage code needs to know *how*: burning to death and being pricked by a cactus are different deaths, and armor helps with one and not the other. The set became a map to a `DamageCause`, and the same lookup now also answers which blocks break a fall, so the whole of what a mob needs to know about where it is standing comes through the one synchronous reader the pathfinder already uses. Awaiting a chunk load per mob per tick would cost more than the mobs do.
  
  Mobs now take fall damage, burn in fire and lava and keep burning for eight seconds after getting out, are pricked by cacti, suffocate inside blocks, drown, and die in the void. The burn outlasting the fire is what makes walking *through* one worse than walking past it, and what makes water worth running to.
  
  **Which things breathe water is stated, not inferred.** The obvious proxy - a swim speed above a walk speed - reads correctly in vanilla and not here, because every mob currently gets the same movement attributes; it would have answered "no" for every fish in the game and drowned the lot of them. `MobStats` carries an `aquatic` flag instead. Dolphins and turtles are deliberately not aquatic: they breathe air, and in vanilla they drown.
  
  **The gamerules do something.** `falldamage`, `firedamage`, `drowningdamage` and `naturalregeneration` have been registered and defaulted since long before anything read one of them; they are now honored, for players as well as mobs. `GameRules.DrowingDamage` is spelled correctly at last - the *value* was always right, so the rule worked, but the constant's name was missing an `n` and anything reaching for the correctly-spelled one silently looked up a gamerule called "undefined".
  
  The player's own duplicated copies of the fall and water tables are gone; there is one of each now, and both kinds of entity read the same one.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`b390249`](https://github.com/JSPrismarine/JSPrismarine/commit/b39024922c3f95f7823f52aeef41ae00c46273af) Thanks [@filiphsps](https://github.com/filiphsps)! - Register `/gamerule` under the name its id gives it.
  
  The command's id is `minecraft:gamerule` but its root literal was spelled `gameRule`. The command list sent to the client matches literals against the id suffix case-sensitively, so the server logged `Can't find corresponding command class for "gameRule"` on every join, left the command out of the client's list, and neither `/gamerule` nor `/gameRule` ran. The literal is now `gamerule`, and a test checks that every registered command is reachable under its id suffix.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`7f7431c`](https://github.com/JSPrismarine/JSPrismarine/commit/7f7431cb36545eaac5942df60ce3da8915391914) Thanks [@filiphsps](https://github.com/filiphsps)! - Send the login-to-spawn packets in the order a 1.26.51 client accepts.
  
  A retail client at protocol 2193 dropped the connection with `InitialConnection-90` (bad packet) the moment the server logged the join. Four things were wrong with the sequence, none of them visible with the server's own client, which tolerated all of them.
  
  `Player.enable` sent the gamemode, adventure settings, abilities and a `MovePlayer` per player from inside `LoginHandler`, before `PlayStatus(LoginSuccess)`. Nothing but PlayStatus and ResourcePacksInfo leaves the server during login now; the settings go out from the join burst after StartGame, and the MovePlayer is gone because `AddPlayer` already carries each player's position.
  
  The join burst sent three `Respawn` packets, one of them `CLIENT_READY_TO_SPAWN`, a state only a client sends. No vanilla server sends a Respawn at login, so none goes out. `sendRespawn` is unchanged for deaths.
  
  `PlayerList` and `SetTime` went out before `StartGame`. StartGame and the registries come first now, then the player list, time and spawn position, then the local player's settings, attributes, metadata and inventory, then the join message. `JigsawStructureData` stays ahead of StartGame, since a client that reaches StartGame without it disconnects with `MissingStructureData`.
  
  `Player.completeSpawn` ran twice, from the join burst and again when the client reported itself initialized, so the inventory and settings were sent twice. It runs once now, from `SetLocalPlayerAsInitializedHandler`, where the client has rebuilt its local player and needs them again.
  
  `ActorEvent` and `PlayerSkin` were registered packets with no handler, so every one a client sent was logged as a handler error. Both have handlers that accept the packet and log at debug level. Skin changes are still not applied.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`1b825f1`](https://github.com/JSPrismarine/JSPrismarine/commit/1b825f10efeeb776ff859a1d10eea15f43d306f6) Thanks [@filiphsps](https://github.com/filiphsps)! - Make `LevelDB` the default world provider, so a new install stores its world in the format Minecraft: Bedrock Edition uses rather than in one only this server understands.
  
  Existing installs are untouched. `ConfigBuilder` writes resolved defaults back into the config file the first time it reads them, so any world that has already run carries an explicit `provider:` line and keeps whatever it had. To move a world to the other provider, change that line. The data formats do not share a directory layout, so the old `chunks` folder is left alone rather than converted.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`1b825f1`](https://github.com/JSPrismarine/JSPrismarine/commit/1b825f10efeeb776ff859a1d10eea15f43d306f6) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the `LevelDB` world provider, which stores a world the way Minecraft: Bedrock Edition does — a `db` directory of LevelDB files, a `level.dat` and a `levelname.txt` beside it. A world written by the server opens in the game, and a world made in the game opens on the server.
  
  It reads and writes sub chunks across the whole −64 to 319 range, the `Data3D` biome record, the chunk version and finalized state, and block entities. An all-air sub chunk is stored by not being stored, which is what the game does too. A chunk with no version record is one that was never generated, so the generator is asked for it; anything else is a chunk that exists and is read as best it can be rather than being overwritten with fresh terrain.
  
  Two things it refuses to do quietly. Opening a folder that already holds a Filesystem world logs what it found and starts a fresh database beside the old `chunks` directory instead of over it. And opening a world the game already has open fails outright, because two writers on one LevelDB do not produce a stale read — they rewrite each other's files and the world does not survive it.
  
  `Chunk` gains `markSaved`, without which `hasChanged` only ever went true: every chunk a player had walked through was rewritten on every save for the rest of the session, and a chunk merely *read* from disk was written straight back out. `World` gains `getDimension`. The dangling `@types/level` module declaration, which described a package nothing imported, is gone.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`e319eb5`](https://github.com/JSPrismarine/JSPrismarine/commit/e319eb53013b17a99a2e0e8c4647747fbc0bdb3f) Thanks [@filiphsps](https://github.com/filiphsps)! - Log why a client disconnected, including one that gave up during the join.
  
  A `DisconnectPacket` from the client used to hit "Invalid handler with id 5" and the reason it carried was lost. The server now logs the reason and message at info level and hangs up on RakNet; the RakNet close that follows releases the player as before. A RakNet close for a connection that has not logged in, or whose player has not been added to a world yet, is also logged at info instead of debug, so a client that drops out between login and spawn leaves a line in the console ([#2582](https://github.com/JSPrismarine/JSPrismarine/issues/2582)).

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`bf3d6d7`](https://github.com/JSPrismarine/JSPrismarine/commit/bf3d6d7786b7cc36237336674f3a7a0909f0559a) Thanks [@filiphsps](https://github.com/filiphsps)! - Let players actually hit things.
  
  Every attack a client has ever sent this server was decoded in full and then thrown away. `InventoryTransactionHandler` had a branch that logged `Unhandled inventory transaction type` and returned, and that branch was where melee arrives - not `InteractPacket`, which despite the name carries mounting, dismounting and opening a villager's trades. One missing case was the whole reason nothing could be killed.
  
  **`entity/Combat.ts`** holds the swing: free functions rather than a method, because both sides of a fight need the same code and they live in different hierarchies - a `Player` is a `Human`, a zombie is a `Mob`, and their only common ancestor is `Entity`, which has no business knowing what a weapon is. It deliberately imports neither `Player` nor `Mob`: a goal will call this in the next change, goals are reached from `Mob`, and `Mob` would then import it back. Anything species-specific is passed in by whoever knows it, which is why the reach and the critical are options rather than being worked out here.
  
  **Reach is measured to the body, not between two positions**, and that distinction is the whole difficulty. A player's position is their *eyes* and every other entity's is its *feet*, so a straight point-to-point distance compares two things that are not the same kind of thing - it is the same trap that once made a player able to shove a villager and nothing else. Measured to the box, a player standing on a cow and one standing beside it are both within reach. Survival gets three blocks and creative six.
  
  **Weapon damage** is one table on `TieredTool`, not a method in each of thirty item files, and it can be one because a tiered tool already knows both things the answer depends on: the tier from there and the tool type from the item itself. The tier index is the *harvest* order, where gold sits between wood and stone - gold mines what stone mines but hits like wood, so the rows are not ascending runs and a table that assumed they were would have made golden swords wrong. Anything that is not a weapon does one point, which is vanilla's rule rather than a placeholder: a fist does one, and so does a torch.
  
  **Criticals** need the player to be *descending*, not merely off the ground - `Player.getFallDistance` is now readable for exactly this, because a player rising through a jump is airborne too and vanilla does not let them crit on the way up. A critical is half again as much and throws stars around what was hit.
  
  Sprinting is worth one knockback level, the same as one level of the enchantment, which is what makes a sprint-hit send somebody flying where a standing one nudges them. A swing that connects costs 0.1 exhaustion; a miss is free, which is why it is charged after the fact rather than before the attempt. Every swing makes a noise, including one that does nothing - the alternative is a swing that produces no sign at all and reads as the server having dropped the packet.
  
  `SetActorMotionPacket` and the PvP gamerule both do something for the first time: knockback on a *player* has to be a request rather than a move, since their position is their own client's, and `canHarm` is the one place the rules about who may hit whom are stated.
  
  Weapon durability is not decremented yet. It is left with the armor work, where the machinery for telling a client that a held item has changed lives - decrementing it here would drift the server's number away from the one the client is drawing, which is worse than not doing it.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`ef1fd47`](https://github.com/JSPrismarine/JSPrismarine/commit/ef1fd47b9d28a22b006d21ab497103367f081085) Thanks [@filiphsps](https://github.com/filiphsps)! - Teach mobs to fight, and let them fight each other.
  
  A zombie already walked up to you and then stood there. The pursuit was all there; what was missing was a target it could act on and anything that swung.
  
  **A target belongs to the mob, not to a goal.** Several goals need the same answer - one picks somebody, another walks to them, a third hits them - and a target private to whichever goal found it would have to be rediscovered by each of the others, which is how they drift apart the moment one changes its mind. The mob also does the forgetting: a target that dies, leaves the world, or spends five seconds out of range is dropped once, centrally, rather than by each goal separately. That forgetting runs before the loaded-chunk check, because a mob holding a reference to a corpse until somebody walks back into the area is both a leak and a fight it would resume with a dead thing.
  
  **Four new goals, and the interesting thing is that three of them claim no lanes.** Vanilla has a separate "target selector" running beside its goal selector; here that falls out of the lane system already present - a goal with no lanes blocks nothing and is blocked by nothing, so choosing who to fight runs alongside whatever is currently walking the mob, which is exactly right because deciding is not something that competes with moving.
  
  - `NearestAttackableTargetGoal` finds somebody, filtered. It reads the entity grid rather than the whole world, and stands down while the mob already has a target - re-picking every tick makes a mob swap between two equidistant players and reach neither.
  - `HurtByTargetGoal` turns on whoever hit it. **This is the whole of mob-versus-mob, and nothing in it knows that mobs can fight each other**: a skeleton's stray arrow hits a zombie, the zombie asks who hurt it, and every goal downstream carries on as it would against a player. It has to remember which blow it has already answered, because `getLastDamageSource` keeps its answer indefinitely and the mob could otherwise never be distracted again.
  - `MeleeAttackGoal` swings, on a one-second cooldown, and sends the arm-swing event - vanilla calls it `StartAttacking` - so the target is not hurt by something that visibly never moved.
  - `PanicGoal` is what an animal does instead of fighting back. Before it, being hit did nothing at all and a herd stood placidly while it was slaughtered.
  
  **`ApproachPlayerGoal` became `ApproachTargetGoal`** and stopped hunting for its own target. That one change is what lets a zombie chasing a person and a golem chasing a zombie share every line of pursuit code; the three fighting brains now differ from each other in exactly one argument - which filter they hand the targeting goal. A fourth, `neutralBrain`, is the hostile one with that goal simply left out, so a wild wolf wanders until somebody hits it.
  
  An iron golem is a guardian rather than a villager now, and hunts the monsters a village needs driving off - not creepers, for vanilla's reason: a golem that charged one would set it off inside the village it is guarding.
  
  **Difficulty exists.** `StartGamePacket` wrote a hardcoded zero, which is *peaceful*, so however a server was configured every client was told monsters could not hurt anybody. It is now a config option named in words rather than numbered, it reaches the client, mob damage is scaled by Mojang's documented multipliers - a zombie's three becomes two on easy and five on hard - and peaceful stops monsters spawning at all rather than spawning harmless ones that would still crowd the caps.
  
  Only mob attacks scale. A player's sword does what the sword says whatever the world is set to, and so does falling and drowning: the setting is about how dangerous the monsters are, not how dangerous the world is.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`ef1fd47`](https://github.com/JSPrismarine/JSPrismarine/commit/ef1fd47b9d28a22b006d21ab497103367f081085) Thanks [@filiphsps](https://github.com/filiphsps)! - Give mobs their own vitals, and let them die.
  
  Two gaps, and the second was the more visible: every mob shared the base attribute defaults, so a chicken and an iron golem both had twenty health and one point of attack; and `Entity.onDeath` was an empty hook that only `Player` overrode, so a mob whose health reached zero simply stood there for ever.
  
  **`MobStats`** is a table of health, attack, knockback resistance and follow range keyed by entity identifier, and `Mob` builds its attributes from it. A table for the reason `EntitySize` is one: every mob shares a single class and differs only in what it is made of, so the alternative was an override in each of a hundred four-line files - a hundred places for a number to be wrong and nowhere to read the game's own figures against. A test asserts every class that extends `Mob` appears in it, which caught `minecraft:zombie_villager_v2` the first time it ran.
  
  The health *maximum* moves with the value, not just the value: a golem given a hundred health with the ceiling left at twenty would have been clamped straight back down and been no tougher than a zombie.
  
  Speed is deliberately not in the table. A mob's pace is `ai/Speed` and `Mob.walkSpeed`, which is what the server actually walks it at; `minecraft:movement` is only what the client is told. A second number here would let the two disagree, which is the failure `EntitySize` was written to end.
  
  **Dying** now takes a second, because the client's death animation does. A mob that ran out of health used to be nothing at all; if it had been removed the moment its health hit zero it would have been deleted mid-roll and appeared to vanish. So it stops its goals, plays the animation and the sound, stands still for twenty ticks, drops what it was carrying and is then taken out of the world. The death bookkeeping runs before `update`'s loaded-chunk check, or a mob that died in a chunk that then unloaded would never reach the end of it.
  
  **Loot** is rolled through the very same `DropTable` a block's drops go through - they are the same problem stated twice, and the table already existed, was already tested, and already takes its chance source as an argument so a roll can be made to repeat. Every item name in it is checked against `required_item_list.json`, which is the authority on what the client can be told about. The `doMobLoot` gamerule is honored, which is the first time any of the gamerules that were registered and defaulted has actually been read.
  
  **Sounds.** `WorldChangeSink` gained `actorSound`, separate from `blockSound` because the wire format differs in a way that matters: a mob's sound carries which mob is making it, so a client picks the zombie's grunt over the skeleton's rattle, where a block's carries the block's runtime id instead. Being hurt is now audible - the red flash is the client's own animation and makes no noise, so until now every hit landed silently.
  
  **Death messages** learned who did it. They moved out of `Player` into `entity/DeathMessages.ts`, gained the attacker-aware keys, and keep vanilla's distinction between being slain by a person and by a mob. A mob killer with no nametag is named after its type rather than left blank.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`b7c7ff9`](https://github.com/JSPrismarine/JSPrismarine/commit/b7c7ff9deea743b61f96ce3b173327e13dea6d11) Thanks [@filiphsps](https://github.com/filiphsps)! - Tell a client on the wrong protocol version why it was refused ([#1586](https://github.com/JSPrismarine/JSPrismarine/issues/1586)).
  
  The version check happens on the first packet a client sends, before login, and a mismatch used to end in a disconnect with the reason hidden. The player saw "Disconnected from Server" and nothing else. The server now sends the client the same failed play status the login step would have, which the client shows as "Outdated client" or "Outdated server", and the disconnect that follows names the version to use. The refusal is also logged with both protocol numbers.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`3942a02`](https://github.com/JSPrismarine/JSPrismarine/commit/3942a02618a86c57fecbdd8eb710ba88db71ac16) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix a 1.26.51 client with a character-creator skin being dropped right after joining with `InitialConnection-90` ([#2582](https://github.com/JSPrismarine/JSPrismarine/issues/2582)).
  
  The player list carries every player's skin, and a persona skin's pieces and tints were still written in a layout the client stopped reading long ago. The piece type and pack id went out as strings and the tint colours as a counted list of strings. Protocol 2193 reads the piece type as a 32-bit id, the pack id as a 16-byte UUID, and each tint as a short name followed by exactly four 4-byte colours. Every field after the skin was read from the wrong offset, so the join failed for anyone whose skin came out of the character creator. Classic skins were not affected. The skin colour now goes out in the byte order the client reads, and a `#rrggbb` skin colour is read as opaque.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`5ff5249`](https://github.com/JSPrismarine/JSPrismarine/commit/5ff5249c6ae85f22c78c824b19aec4f25944cdc5) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerSkinPacket` now decodes and encodes the full protocol 2193 layout (`UUID`, `SerializedSkin`, the two localized skin names) through the new `Skin.networkDeserialize`, and the handler stores the new skin on the player and forwards the packet to every other online player. The packet's `trusted` field is gone; the flag lives inside the skin as `Skin.isTrusted`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f41832a`](https://github.com/JSPrismarine/JSPrismarine/commit/f41832a37db074e0a50daaea73d586281cf83505) Thanks [@filiphsps](https://github.com/filiphsps)! - `ActorEventHandler` accepts only the events a vanilla client sends (`FEED`) and only about the sender's own player, then relays them to the players tracking it. Events naming another actor or a server-only event are dropped.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`4f9f167`](https://github.com/JSPrismarine/JSPrismarine/commit/4f9f1674ffad59abf28f373841d4c9e94948c1d3) Thanks [@filiphsps](https://github.com/filiphsps)! - `AnimatePacket` exports an `AnimateAction` enum with the numbers a protocol 2193 client sends (Swing 1, WakeUp 3, CriticalHit 4, MagicCriticalHit 5). `AnimateHandler` relays only those actions and only when the packet names the sender's own runtime id; anything else is logged at debug level and dropped.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`bccb4ab`](https://github.com/JSPrismarine/JSPrismarine/commit/bccb4abebd93c636ceb8f9f7e2030edfb873423c) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerSession.sendInventory` now sends the armor window (container id 120) with the `ArmorContainer` container name instead of `CombinedHotbarAndInventoryContainer`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`d05b02d`](https://github.com/JSPrismarine/JSPrismarine/commit/d05b02d7899de717176e66b9bc01bcc7ab1ae5c9) Thanks [@filiphsps](https://github.com/filiphsps)! - Write `AvailableCommandsPacket` fields at the widths the protocol 2193 docs give: `Flags` as an unsigned 16 bit integer and a constraint's `Enum Value Symbol` and `Enum Symbol` as unsigned 32 bit integers. An `Enum Data` entry now writes the number of indices it actually contains, and an enum that only a constraint names is added to the enum table so the constraint's symbols point at an entry that exists.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f2ec14a`](https://github.com/JSPrismarine/JSPrismarine/commit/f2ec14ab4fa633683af6ca54e8e5fd116115e6e7) Thanks [@filiphsps](https://github.com/filiphsps)! - Describe brigadier arguments and permission levels in `AvailableCommandsPacket`. Commands built on brigadier's `string()`, `greedyString()` and `integer()` (`/say`, `/me`, `/time`, the reason of `/ban` and `/kick`) went out with empty overloads because those types were checked after the prismarine-argument guard had returned; they are now sent under their node names as `Message`, `String` and `Int` parameters. Overloads two branches spell the same way are folded into one. Every command also reported permission level `any`; a command the default permissions allow is `any` and anything else `gamedirectors`, capped at the recipient's own level so the client never hides a command the server would run for them.

- [#2604](https://github.com/JSPrismarine/JSPrismarine/pull/2604) [`b31c809`](https://github.com/JSPrismarine/JSPrismarine/commit/b31c80982ec3bd2b2c773e38e383370de7d4ab49) Thanks [@filiphsps](https://github.com/filiphsps)! - `/ban` and `/pardon` change only the affected player's line in `banned-players.json`, so comments and formatting in the file survive. The file may hold `//` and `/* */` comments and trailing commas; JSON5-only syntax such as unquoted keys is no longer accepted. An entry without a `name` is skipped instead of banning `undefined`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c40174e`](https://github.com/JSPrismarine/JSPrismarine/commit/c40174e64c7358a8763fb56ed49915765e087f9d) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerSession.sendAbilities` names all twenty abilities in its base layer, including `VerticalFlySpeed` and `PrivilegedBuilder`, so the client applies the vertical fly speed the packet already carried. `AbilityLayerType` gains `LOADING_SCREEN`, and `UpdateAbilitiesPacket` is exported from the packet registry.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`2594d19`](https://github.com/JSPrismarine/JSPrismarine/commit/2594d1902fc6569998f57053531b08968c37951c) Thanks [@filiphsps](https://github.com/filiphsps)! - Log the packets inside an asynchronously compressed batch at `silly` level. Chunk batches went out through `MinecraftSession.sendBatchAsync` with no traffic line, so a packet trace of a join showed the `NetworkChunkPublisherUpdate` packets with a gap where each `LevelChunkPacket` was sent. `BatchPacket.getPacketNames()` reports what a batch holds, and `PacketLogFilter.shouldLogName()` applies `log-excluded-packets` by name.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a5eda59`](https://github.com/JSPrismarine/JSPrismarine/commit/a5eda5987311bc6506c4cb044a2a16a35cd2ab3c) Thanks [@filiphsps](https://github.com/filiphsps)! - `BlockActorDataPacket` writes its compound under an empty root name, as the client expects,
  even when the `NBTTagCompound` it was given carries a name of its own.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`7d27c72`](https://github.com/JSPrismarine/JSPrismarine/commit/7d27c72514d37772b6e1ef2d3ba37123cf087705) Thanks [@filiphsps](https://github.com/filiphsps)! - A player's chat now reaches other clients the way a dedicated server sends it: a `Chat` text whose author is the sender's name and whose XUID is the sender's, with the message as typed. The server used to put `<name>` into the message and leave the author blank, which the client draws as its own empty `<>`. The console prints the same `<name> message` line. `TextHandler` drops a text whose type is not `Chat`, the only type a client sends, and `Chat` defaults to `RAW`, so a line the server formatted itself is shown as written.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`72e5d6d`](https://github.com/JSPrismarine/JSPrismarine/commit/72e5d6d53c7d6bff54395d93bcc0ae6d7e13ba98) Thanks [@filiphsps](https://github.com/filiphsps)! - A chunk's block entities now travel with the chunk. `Chunk.networkSerialize` appends one network NBT compound per block entity after the border block byte, the way a Bedrock server does, so a chest or sign loaded from a world reaches the client with the terrain it stands in instead of never being sent. Adding or removing a block entity also drops the chunk's cached payload.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1e37459`](https://github.com/JSPrismarine/JSPrismarine/commit/1e37459b0af59d87deb445ea63b5f6563dfcd07e) Thanks [@filiphsps](https://github.com/filiphsps)! - Shape a chunk's network payload for the dimension it belongs to. The padding below a shallow dimension and the number of biome sections now follow the range the client gives the chunk's dimension id, so a Nether chunk goes out with no padding and 8 biome sections and an End chunk with 16, where both used to get the Overworld's four padding sub chunks and 24 sections.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`b752e88`](https://github.com/JSPrismarine/JSPrismarine/commit/b752e881aa60db17479ea6225d71e6fc443bc808) Thanks [@filiphsps](https://github.com/filiphsps)! - `RequestChunkRadiusHandler` logs each radius request and the radius it granted at debug level, so a join that stalls shows whether the client ever asked for terrain.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`5ad6f00`](https://github.com/JSPrismarine/JSPrismarine/commit/5ad6f001ae52e6c156d02919d7f47e68bfc7d1c7) Thanks [@filiphsps](https://github.com/filiphsps)! - `CommandEnumConstraint` now reports the offending offset in its "Invalid enum value offset" error instead of the literal text `$valueOffset`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`4a89177`](https://github.com/JSPrismarine/JSPrismarine/commit/4a89177a12ea1473d930b6a96548e7e9991edeb0) Thanks [@filiphsps](https://github.com/filiphsps)! - `CommandRequestHandler` drops a request whose origin is not `Player`, since a client has no
  business claiming a command block or automation origin, and answers each dispatched command
  with a `CommandOutputPacket` that echoes the request's origin and reports whether the command
  ran as its success count. `CommandManager.dispatchCommand` resolves to that boolean instead of
  `void`. `CommandRequestPacket` gains `encodePayload`, and its `commandOriginData` is always set
  rather than possibly `null`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`ccf3672`](https://github.com/JSPrismarine/JSPrismarine/commit/ccf36723ef0fd8eb8415d44bf670fd93dbc5072d) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerSession` now remembers the container windows it opens, and `ContainerCloseHandler` closes the window on the server before answering. The answer always carries `Server Initiated Close` false, as the docs ask for a close the player made, instead of echoing whatever the client sent. A close for a window the session never opened is logged at debug level and still answered. `PlayerSession.closeWindow` is new.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c1d755e`](https://github.com/JSPrismarine/JSPrismarine/commit/c1d755e07898685e11382f36674bdd0863e4b5ae) Thanks [@filiphsps](https://github.com/filiphsps)! - `CraftingDataPacket` numbers recipes from one when no `netIdOf` function is given, instead of sending every recipe as net id 0. The packet's ingredient and result layouts are documented and pinned by byte-exact tests for smithing transform recipes and tag ingredients.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`90f8798`](https://github.com/JSPrismarine/JSPrismarine/commit/90f87988dc6f2498dc62e18735047870117d93ad) Thanks [@filiphsps](https://github.com/filiphsps)! - The creative menu sends every block entry and group icon with the block runtime id vanilla records for it. Pistons, dispensers, droppers and glow lichen showed their default state instead of the one the menu draws, and the item form of doors, beds and hanging signs carried a block id where vanilla sends none. `Item` takes an optional `blockRuntimeId` and exposes `getBlockRuntimeId()`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1b7a41f`](https://github.com/JSPrismarine/JSPrismarine/commit/1b7a41f982a379becefc4b1716042eb9c33c3375) Thanks [@filiphsps](https://github.com/filiphsps)! - Send `DeathInfoPacket` (id 189) to a player who dies, after the `Respawn` packet, so the client's death screen shows the cause. It carries the same translation key and parameters as the chat announcement from `DeathMessages`, with the key's leading `%` removed, since the death screen takes the bare key. The packet class is new and registered.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`3813ce9`](https://github.com/JSPrismarine/JSPrismarine/commit/3813ce9501db9cd859fcc0e3bdf3aeb0712cadcd) Thanks [@filiphsps](https://github.com/filiphsps)! - Add two debugging aids for a join that fails without a `Disconnect` or `PacketViolationWarning`: `JSP_DEBUG_DROP_PACKETS` names clientbound packet classes the server withholds, and `JSP_DEBUG_DUMP_PACKETS` names packets whose encoded bytes are written to files under `JSP_DEBUG_DUMP_DIR`. Each withheld or dumped packet logs a warning.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`0aefdfa`](https://github.com/JSPrismarine/JSPrismarine/commit/0aefdfae1a68f61d66581e8836718ff37e127ec9) Thanks [@filiphsps](https://github.com/filiphsps)! - `SetDefaultGameTypeHandler` refuses a value the config cannot hold (such as `Default`,
  `WorldDefault`, or a number that is no game type) instead of throwing from
  `Config.setGamemode`, and answers a refused request with the default the server has so the
  client's world settings screen shows it again. An accepted change is also sent back to every
  client, as the protocol docs describe.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`b6e5ccb`](https://github.com/JSPrismarine/JSPrismarine/commit/b6e5ccbdfe29d972699a7fe92c27cc5084798cef) Thanks [@filiphsps](https://github.com/filiphsps)! - `SetDifficultyHandler` sends the configured difficulty back when a client asks for a
  different one, so the client's settings menu no longer shows a difficulty the server does
  not have. A value that is no difficulty is answered the same way and nothing is thrown.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`4072778`](https://github.com/JSPrismarine/JSPrismarine/commit/407277842093c7f82f5584b4c477963b7a42321d) Thanks [@filiphsps](https://github.com/filiphsps)! - Every `ChangeDimensionPacket` the server sends now carries a `Loading Screen Id`, handed out by the new `PlayerSession.beginLoadingScreen()`, and `ServerboundLoadingScreenHandler` checks a closed screen off with `PlayerSession.endLoadingScreen(id)`. `ChangeDimensionPacket.dimension` is typed as the `Dimension` enum from `@jsprismarine/minecraft`; plain numbers still assign to it.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`ece6eac`](https://github.com/JSPrismarine/JSPrismarine/commit/ece6eacc885e4e24359d95655002289bc33cc812) Thanks [@filiphsps](https://github.com/filiphsps)! - When a client sends `DisconnectPacket`, the log line now names the `DisconnectReason` next to its number, for example `reason 3 (UNRECOVERABLE_ERROR)`. A number the enum does not list is logged bare.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`698f891`](https://github.com/JSPrismarine/JSPrismarine/commit/698f891b8fc43f38fd616a979ca6a0d58a48bfa1) Thanks [@filiphsps](https://github.com/filiphsps)! - The server's `DisconnectPacket` now reads and writes `Skip Message` as the one bool byte the client uses, and `skipMessage` defaults to false. It was a varuint compared against 1, which agreed with the client for 0 and 1 but took any other byte as "strings follow" and read past the packet.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`2f78483`](https://github.com/JSPrismarine/JSPrismarine/commit/2f78483cb75978a304c2da8bc7144536cf9a07aa) Thanks [@filiphsps](https://github.com/filiphsps)! - `EmoteHandler` now drops an emote that names another player's runtime id or whose emote id is not a uuid string, and `EmoteListHandler` drops a list for another runtime id. Both log the drop at debug level.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f0e7cd3`](https://github.com/JSPrismarine/JSPrismarine/commit/f0e7cd3482f6575aa4004e765723fd9602042cae) Thanks [@filiphsps](https://github.com/filiphsps)! - Send an empty `FeatureRegistryPacket` (id 191) to every joining client, after `BiomeDefinitionList` in the registry group of the join burst, as a Bedrock Dedicated Server does for a world with no custom features. The packet class is new and registered.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`82db23a`](https://github.com/JSPrismarine/JSPrismarine/commit/82db23a22169fd09e027051b3b6f3f7f56981ee5) Thanks [@filiphsps](https://github.com/filiphsps)! - `NpcRequestPacket`, `PurchaseReceiptPacket` and `ShowCreditsPacket` and their handlers are registered, so a client sending one no longer logs an unimplemented packet warning. `ModalFormRequestPacket`, `SetTitlePacket` and `ShowStoreOfferPacket` are registered as well.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`436f4af`](https://github.com/JSPrismarine/JSPrismarine/commit/436f4afdaf1f3a91cbb642dfbed19250e443ff71) Thanks [@filiphsps](https://github.com/filiphsps)! - `ModalFormResponseHandler` drops a form response whose text does not parse as JSON and logs it at warn, instead of recording it as a submitted form.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`e00c31d`](https://github.com/JSPrismarine/JSPrismarine/commit/e00c31de32f4cf67f55253d83df1a65caad1b4b7) Thanks [@filiphsps](https://github.com/filiphsps)! - A game rule changed through `/gamerule` or `GameRuleManager.setGameRule` is now sent to every
  player in the world as `GameRulesChangedPacket`. Before, a client only learned the rules once,
  in `StartGamePacket`, and kept showing coordinates or running the day cycle however it had
  been told at login.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`37afa90`](https://github.com/JSPrismarine/JSPrismarine/commit/37afa9046fd2dddb31e34f4f66e3b2b004769096) Thanks [@filiphsps](https://github.com/filiphsps)! - Game rules now reach the client under the names it knows. `StartGamePacket` and
  `GameRulesChangedPacket` wrote every rule name in lowercase (`showcoordinates`,
  `dodaylightcycle`), and the client, which matches a rule by exact string, had no rule by
  those names. The names are now spelled as a Bedrock Dedicated Server spells them
  (`showCoordinates`, `doDayLightCycle`). Lookups through `GameRuleManager` ignore case, so
  level files written by an older server still load, and the `GameRules` constants carry the
  new spelling. An integer rule is written as a signed int32, so a negative value no longer
  throws while the join packets are being encoded.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`8a5570c`](https://github.com/JSPrismarine/JSPrismarine/commit/8a5570cf072483d412a7a591a6da83105b9b3993) Thanks [@filiphsps](https://github.com/filiphsps)! - A player's game type change is followed by `UpdatePlayerGameTypePacket` to every client in
  the world, which the protocol docs ask for so each client's cached game type and permission
  flags for that player stay current. The packet carries the receiving client's last input tick
  when the player is its own, and zero for anyone else.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1d14d17`](https://github.com/JSPrismarine/JSPrismarine/commit/1d14d17dcce52599ecb729afb38e61fe97029b51) Thanks [@filiphsps](https://github.com/filiphsps)! - `SessionManager.getPlayerById` returns `null` for an unknown runtime id instead of throwing an assertion error.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`f1cad6a`](https://github.com/JSPrismarine/JSPrismarine/commit/f1cad6a43599ff3e39528a9a0039d254738ad665) Thanks [@filiphsps](https://github.com/filiphsps)! - Packet handlers no longer act on client-supplied positions without checking them.
  `PlayerActionHandler` refuses a block action further than a player can reach, which stopped a
  client from breaking blocks it cannot see and from driving terrain generation anywhere on the
  map one packet per chunk; it also refuses a creative break from a player who is not in
  creative, and any block action from a spectator. `LevelSoundEventHandler` drops a sound
  reported from somewhere the sender is not.
  
  `EmoteHandler` relays within the sender's world to the clients that have the sender on screen,
  and signs the emote with the server's record of the sender's XUID rather than the one the
  client sent. `TextHandler` strips formatting codes and control characters from a chat message
  and cuts it to 512 characters, so a message can no longer draw a line that looks like another
  player said it.
  
  `SetLocalPlayerAsInitializedHandler` drops a repeat notice, which used to re-announce the
  player to everyone who can see it and resend its whole state, and reads the player's own
  world rather than the default one.
  
  `ServerSettingsRequestHandler` no longer answers with `UpdateAdventureSettingsPacket`, which
  was unrelated to the request. `NetworkStackLatencyHandler` now echoes a ping that asks for an
  answer, with the request flag cleared.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`7b82d53`](https://github.com/JSPrismarine/JSPrismarine/commit/7b82d537de1732ca6f5c7f6e19e7a4efdeb3ab56) Thanks [@filiphsps](https://github.com/filiphsps)! - `InteractHandler` now checks what a client names before acting. An `OpenInventory` whose target is not the sender's own runtime id is dropped, an `NpcOpen` is dropped unless the actor is one the client has been shown and is within reach, and an action no client sends is logged instead of silently falling through.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`85e04c8`](https://github.com/JSPrismarine/JSPrismarine/commit/85e04c8246593f9252f0364174941bdd016d2ab9) Thanks [@filiphsps](https://github.com/filiphsps)! - `InventoryTransactionPacket` keeps a transaction type it does not know instead of throwing from `decodePayload`, so the handler can drop the packet at debug level rather than the server logging an error for it. The packet refuses an Actions list longer than the 100 the docs allow before allocating it. `ActionSource.INVALID`, a `-1` that was never a wire value, is gone; `NON_IMPLEMENTED_TODO` stays `99999`, the value the client sends. `ReleaseItemAction` names the docs' `ItemReleaseActionType` (`RELEASE` 0, `USE` 1).

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`22dbd48`](https://github.com/JSPrismarine/JSPrismarine/commit/22dbd4869341ed3d6c43edc45eb7f37d95eee226) Thanks [@filiphsps](https://github.com/filiphsps)! - `InventoryTransactionHandler` checks every field of an item use, a use on an entity and a release before acting on it. A transaction whose type, action source, action type, hand, hotbar slot, face or position is not one the docs allow is dropped at debug level. One whose hotbar slot is not the slot the server has selected, or whose block is further than a creative reach from where the server has the player, is dropped at verbose level. A clicked block is placed with the item the server holds in the player's hand, not the item the client named, and a swing at a runtime id the world does not track is dropped. The handler no longer throws on anything a client can send.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`b856cf6`](https://github.com/JSPrismarine/JSPrismarine/commit/b856cf6f362943185236cbfe6ca7b896d3b7ef64) Thanks [@filiphsps](https://github.com/filiphsps)! - `ItemRegistryPacket` sends each item with the `Item Version` and `Item Component Data` a Bedrock Dedicated Server 1.26.51 sends, instead of `DataDriven` and an empty compound for all 2076 items. The 31 data-driven vanilla items (bundles, spears, trial keys, the apple) now reach the client with the components it builds them from.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`8227f46`](https://github.com/JSPrismarine/JSPrismarine/commit/8227f469b15c36222af11f3161b72687db72c56a) Thanks [@filiphsps](https://github.com/filiphsps)! - `ItemStackRequestPacket` reading follows the 1.26.51 docs more closely. A deprecated crafting result's `Stack size` is read as a uint16 and its item descriptor accepts all four descriptor kinds; an auto craft keeps its `Recipe Net Id`; a `Dynamic ID` is read unsigned; and a packet or request naming more than the documented 100 requests or actions is refused with a `RangeError` instead of being allocated for.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`e414269`](https://github.com/JSPrismarine/JSPrismarine/commit/e414269e9f12ed33aec044ee15169e4f7373a6ae) Thanks [@filiphsps](https://github.com/filiphsps)! - `ItemStackRequestHandler` refuses a request whose id is not a negative odd client request id, one with no actions, and one whose amount is outside 1 to 64, answering each with an `Error` under the same id. A step that throws is now rolled back and answered as a refusal instead of leaving the request unanswered. A successful response names only the containers whose slots changed.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`0f387a9`](https://github.com/JSPrismarine/JSPrismarine/commit/0f387a9e70e2868a93f1f5c461ecd7290e32a2ca) Thanks [@filiphsps](https://github.com/filiphsps)! - `ItemStackResponsePacket` writes its two optionals the way the 1.26.51 docs define them. `Containers` is present exactly when the result is `Success`, so an accepted request that changed nothing now carries an empty list instead of an absent one; before, the client read a success in the shape of a refusal. A slot's `Item Stack Net Id` is present exactly when `Amount` is above zero rather than when the id is positive. A container's `Dynamic ID` is written as an unsigned 32-bit integer, and a `Durability Correction` outside the int16 range is refused with a `RangeError` instead of being sent.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a3ea9cf`](https://github.com/JSPrismarine/JSPrismarine/commit/a3ea9cf44dc9ccb74b12dbfbe7703b3403390ffd) Thanks [@filiphsps](https://github.com/filiphsps)! - `ItemUseMethod` gains `Unknown = -1`, the value Mojang's enum snapshot lists ahead of `EquipArmor`, so a `CompletedUsingItemPacket` carrying it decodes to a named member.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`8ce9329`](https://github.com/JSPrismarine/JSPrismarine/commit/8ce9329b1f92a5c18f492e4e8b5735037d7e8354) Thanks [@filiphsps](https://github.com/filiphsps)! - `LevelSoundEventPacket` now carries `Fire At Position` through a decode and encode as `fireAtPosition` instead of reading it and dropping it, and resolves a sound name through a prebuilt map rather than scanning the enum. `LevelSoundEventHandler` drops a client sound attributed to an actor other than the sender, in addition to one reported out of the sender's reach.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`10944b8`](https://github.com/JSPrismarine/JSPrismarine/commit/10944b82e83d11d18cd05004d83623c559f0f684) Thanks [@filiphsps](https://github.com/filiphsps)! - Refuse a login the way the client expects.
  
  `LoginPacket` now reads only `Client Network Version` and the connection request framing when the version is not the server's. It used to parse the certificate chain and client data regardless, and a client of another version whose blobs did not have the 2193 shape failed to decode, which dropped the packet before `LoginHandler` could answer with `PlayStatus(LoginFailed_ClientOld)` or `PlayStatus(LoginFailed_ServerOld)`. The player saw a timeout instead of "outdated client".
  
  Each refusal `LoginHandler` sends as a `Disconnect` now carries the `DisconnectReason` the client shows on its disconnect screen: `INVALID_PLAYER` for a login with no username or no identity, `NOT_AUTHENTICATED` for an unauthenticated login on a server in online mode, `NOT_ALLOWED` for a banned player, and `LOGGED_IN_OTHER_LOCATION` for the player a new login replaces. All of them used to go out as `DISCONNECTED`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`60ba0b6`](https://github.com/JSPrismarine/JSPrismarine/commit/60ba0b6e04eba800d2e66be0ed66f3719784ef41) Thanks [@filiphsps](https://github.com/filiphsps)! - `MapInfoRequestPacket` rejects a `Client Pixels List` count above the 16384 pixels the docs allow before reading any entry, and exports that limit as `MAX_CLIENT_PIXELS`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`cf75135`](https://github.com/JSPrismarine/JSPrismarine/commit/cf75135eb27fd9bb08137673bf0c8c50dd7e29ec) Thanks [@filiphsps](https://github.com/filiphsps)! - `ClientboundMapItemDataPacket` now writes a decoration's `Color` and each `Pixels` entry as a little-endian int32 of the packed ARGB value, the byte order the client reads. They were written big-endian, which swapped the alpha and blue channels with the red and green ones.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1412a24`](https://github.com/JSPrismarine/JSPrismarine/commit/1412a24f7bd59941afa6b36256ff140f4deb1eb6) Thanks [@filiphsps](https://github.com/filiphsps)! - `MapCreateLockedCopyPacket`, `PositionTrackingDBClientRequestPacket` and their handlers are registered, along with `ClientboundMapItemDataPacket` and `PositionTrackingDBServerBroadcastPacket`. Locking a map at a cartography table or holding a lodestone compass no longer makes the server warn that packet 0x83 or 0x9a is not implemented.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`4732653`](https://github.com/JSPrismarine/JSPrismarine/commit/4732653db60cd2c389e5deffc16be34c43dbc9ca) Thanks [@filiphsps](https://github.com/filiphsps)! - Write a `CompoundTag` entity data item as network NBT. `Metadata.networkSerialize` threw for a `FlagType.ITEM` entry; it now writes the compound in little-endian NBT with varint lengths, as the `DataItemCompoundTagPayload` docs ask for. The entry layout is unchanged: id, the one-of selector as a varuint, the same type as a byte, then the value.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1bbc264`](https://github.com/JSPrismarine/JSPrismarine/commit/1bbc264ffb76061b8d1854736b2cc0388a9b9cc8) Thanks [@filiphsps](https://github.com/filiphsps)! - `MobArmorEquipmentPacket` can be decoded as well as encoded, and both equipment packets have
  tests that pin the protocol 2193 byte layout: the runtime id, then one full
  `NetworkItemStackDescriptor` per slot with an empty slot written as eight zero bytes.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`7a9e9c9`](https://github.com/JSPrismarine/JSPrismarine/commit/7a9e9c9e9abe96e1d30e1fe7fa7a528337908418) Thanks [@filiphsps](https://github.com/filiphsps)! - `MobEquipmentHandler` checks what a client reports before acting on it. A packet naming a
  container other than the player inventory or the offhand is dropped, and so is one whose slot or
  selected slot lies outside the nine hotbar slots. An offhand report is accepted and ignored,
  since the off hand is kept through item stack requests. A valid hotbar change now reaches the
  other players in the sender's world that have the sender on screen, as a `MobEquipmentPacket`
  carrying the server's copy of the stack in that slot rather than the one the client claimed.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c5d8aa2`](https://github.com/JSPrismarine/JSPrismarine/commit/c5d8aa2ddf44f1e8e083a3e40084a60344a67dde) Thanks [@filiphsps](https://github.com/filiphsps)! - `MoveActorAbsolutePacket` names all four `Header` bits (`FLAG_FORCE_MOVE_LOCAL_ENTITY` and `FLAG_FORCE_COMPLETION` join on ground and teleport) and can decode a packet as well as encode one.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`dd2df4b`](https://github.com/JSPrismarine/JSPrismarine/commit/dd2df4b765a500b25ce5e529d0a64e1f4107c9f0) Thanks [@filiphsps](https://github.com/filiphsps)! - `MovePlayerPacket` and `SetActorMotionPacket` now carry the `PlayerInputTick` the protocol docs ask for: the tick of the client's last handled `PlayerAuthInputPacket` when the packet is about the receiving player, and zero when it shows them another player. Both used to send the server's tick counter, which the client cannot match against its prediction history. The server also reads a server-bound `MovePlayerPacket`, which at protocol 2193 only the bot harness sends, on the docs' terms: it must name the sender's own runtime id in Normal or OnlyHeadRot mode, and anything else is dropped.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`47aa6e1`](https://github.com/JSPrismarine/JSPrismarine/commit/47aa6e16f289451963ef552d5f146cfd5d7ac5d3) Thanks [@filiphsps](https://github.com/filiphsps)! - Send each command to the client once. `CommandManager.getCommandsList()` returned one entry per top-level argument branch, so `AvailableCommandsPacket` carried `tp` four times and `execute`, `ban`, `kick`, `gamemode`, `time`, `debug` and `gamerule` two or three times each, and the client kept whichever copy it read last. Each command is now one entry whose overloads cover every branch, with an empty overload for a command that also runs without arguments.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`9b950dd`](https://github.com/JSPrismarine/JSPrismarine/commit/9b950dd857fbd6a1a4a6d8daa8667612432a4f4f) Thanks [@filiphsps](https://github.com/filiphsps)! - Log a client's `PacketViolationWarningPacket` at warning level with the rejected packet's name, the violation type and severity by name, and the client's context string. `PacketViolationWarningPacket` now exports `PacketViolationType` and `PacketViolationSeverity`, numbered from -1 as the client sends them.

- [#2604](https://github.com/JSPrismarine/JSPrismarine/pull/2604) [`ebc42a1`](https://github.com/JSPrismarine/JSPrismarine/commit/ebc42a102a7128ddb8c538cb1d379c54f18f709e) Thanks [@filiphsps](https://github.com/filiphsps)! - `/op` and `/deop` change only the affected player's line in `ops.json`, and a fresh `permissions.json` is written with a comment above each key explaining it. Both files may hold `//` and `/* */` comments and trailing commas; JSON5-only syntax such as unquoted keys is no longer accepted. Entries without a `name`, and permission lists that are not lists of strings, are skipped instead of being taken as they are. `PermissionManager` now takes a `PermissionManagerServer`, the part of the server it uses.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`399f05d`](https://github.com/JSPrismarine/JSPrismarine/commit/399f05daa9879d6a30dce1d57e51fced9c64d718) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix a 1.26.51 client with a character-creator skin being unable to join: a persona tint's piece type now travels as the lower-case `persona::PieceType` member name (`facialhair`, `high_pants`), not the client data's `facial_hair`. A client given the old spelling treated `PlayerListPacket` as malformed and closed the connection about a second after `StartGame`, with no `Disconnect` or `PacketViolationWarning`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`4efbc9e`](https://github.com/JSPrismarine/JSPrismarine/commit/4efbc9e63f551fe62d6fd080e0ce2985f1392e33) Thanks [@filiphsps](https://github.com/filiphsps)! - `PhotoTransferPacket` and `PhotoTransferHandler` are registered. A photo an Education Edition
  client sends is decoded and logged at debug level instead of being dropped with a "packet 0x63
  isn't implemented" warning.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c2dbce4`](https://github.com/JSPrismarine/JSPrismarine/commit/c2dbce4145b325e9363cad8c802f6a3e1190c784) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerActionHandler` drops a `PlayerActionPacket` whose `Player Runtime ID` is not the sender's, ignores the block-breaking actions that a 1.26.51 client only sends inside `PlayerAuthInputPacket`, toggles flight for `StartFlying` and `StopFlying`, and accepts the dimension change ack and the swimming, gliding, crawling, sleeping and spin attack actions without logging them as unhandled.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c7e634e`](https://github.com/JSPrismarine/JSPrismarine/commit/c7e634e23aa8165680e01e4f9ec0617fa81e18ae) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerAuthInputPacket` documents the protocol 2193 wire layout with the docs' field names, derives its input flag bound from `PlayerAuthInputData` instead of a hand-kept constant, refuses more than the docs' 100 block actions before allocating for them, and exports the `InputMode`, `ClientPlayMode` and `NewInteractionModel` enums with the numbering the 1.26.60 docs corrected.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`3f05143`](https://github.com/JSPrismarine/JSPrismarine/commit/3f05143f8641a5c6339e0378516bb9536a02d2cc) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerAuthInputHandler` drops, at debug level and without throwing, an input whose flags, input mode, play mode, interaction model, position, rotation or block actions hold a value the docs do not allow, and acts on the item use, item stack request and block action sections only when the `Input Data` flag the docs gate each on is set.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`e9010e6`](https://github.com/JSPrismarine/JSPrismarine/commit/e9010e68975bfc21aeb6edb913afef3d4ff02ec5) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerSkinHandler` relays a skin change as a packet the server writes itself instead of forwarding the bytes the client sent, so a client's `TrustedSkinFlag` claim no longer reaches other players. It also replaces the sender's player list entry, so a player who joins later receives the new skin, and it drops a skin whose image bytes do not fill its size, whose image is more than 4096 pixels a side, or whose geometry is not JSON. `PlayerListEntry.withSkin` returns a copy of an entry carrying another skin.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`62c2ee8`](https://github.com/JSPrismarine/JSPrismarine/commit/62c2ee83247e10e45ccac5d3476e288b7c0e32c5) Thanks [@filiphsps](https://github.com/filiphsps)! - `PositionTrackingDBClientRequestHandler` drops a request whose `Action` is not `Query`, the only action the docs list, with a debug log line instead of reading it as a query.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`73e3455`](https://github.com/JSPrismarine/JSPrismarine/commit/73e3455ab183e92e48994c696e5940d1b47899e2) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerAuthInputHandler` records each input's `Tick` on the session before doing anything else, so the packets the server sends back about that player carry it as their `PlayerInputTick`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f345277`](https://github.com/JSPrismarine/JSPrismarine/commit/f345277ad0ee92353b71ff29bc9562575f8e8c17) Thanks [@filiphsps](https://github.com/filiphsps)! - A refused login now ends the way the protocol docs describe. A client on the wrong protocol gets the `LoginFailed_ClientOld` or `LoginFailed_ServerOld` play status and then a disconnect carrying `OutdatedClient` or `OutdatedServer`, from both `RequestNetworkSettingsHandler` and `LoginHandler`. A full server sends `LoginFailed_ServerFullSubClient` and then a disconnect carrying `ServerFull`. `LoginHandler` used to send the status and leave the connection open, and `RequestNetworkSettingsHandler` sent the generic `Disconnected` code. `PlayerSession.sendPlayStatus` now takes a `PlayStatusType` instead of any number.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`0cb1faa`](https://github.com/JSPrismarine/JSPrismarine/commit/0cb1faa002e22c9bfb423092b9baf00c6a2e73fc) Thanks [@filiphsps](https://github.com/filiphsps)! - Register the fifty packets and three handlers that had implementations but were missing from `Packets.ts` and `Handlers.ts`, so the server no longer drops them as unimplemented. A test now checks that every packet and handler file is exported, that ids are distinct and match `Identifiers`, and that `Identifiers` matches `@jsprismarine/protocol`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`d692152`](https://github.com/JSPrismarine/JSPrismarine/commit/d692152ea08791fe408f2093a58fc2a3dadf5c74) Thanks [@filiphsps](https://github.com/filiphsps)! - Register `SimpleEventPacket`, `MultiplayerSettingsPacket`, `DebugInfoPacket`, `LegacyTelemetryEventPacket` and `ClientboundDebugRendererPacket` with the packet registry, and `SimpleEventHandler` and `MultiplayerSettingsHandler` with the handler registry. A client flipping the commands switch or asking for an Education Edition join code is now decoded and logged at debug level instead of being reported as an unimplemented packet.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`2f8caed`](https://github.com/JSPrismarine/JSPrismarine/commit/2f8caed2eecf581b0f6e47e4b2e6cfdeb80dedc3) Thanks [@filiphsps](https://github.com/filiphsps)! - `RequestAbilityHandler` applies the client's flight toggle through `Player.setFlying` and answers every other request, or a refused one, by resending the player's abilities, so the client no longer waits for an `UpdateAbilitiesPacket` that never comes. `RequestPermissionsHandler` lets an operator add or remove another player from the op list through the player list's permission dropdown and resends the current abilities for a `Custom` level or a non-operator requester.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`cab994b`](https://github.com/JSPrismarine/JSPrismarine/commit/cab994bb54ccec937e7a6280a0a2ec29734b8290) Thanks [@filiphsps](https://github.com/filiphsps)! - `ResourcePackChunkRequestHandler` now disconnects a client that asks for a resource pack chunk,
  with the resource pack disconnect reason, instead of logging the request and leaving the client
  on its download screen. The server serves no packs, so no requested chunk exists.
  `ResourcePackType` gains the `Invalid = 0` member from Mojang's `PackType` enum.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`2dbbcbf`](https://github.com/JSPrismarine/JSPrismarine/commit/2dbbcbffdba35f64824bf1d018e1431cc2fd2dee) Thanks [@filiphsps](https://github.com/filiphsps)! - `ResourcePackClientResponseHandler` answers every status a client can send. A player that
  refuses the packs, or asks the server to send packs it never offered, is disconnected with
  the resource pack reason instead of being left on the loading screen until the connection
  times out. A repeated `Completed` no longer starts the join again, which used to announce
  the player to everyone a second time, and a repeated `HaveAllPacks` after the join started
  no longer sends a second pack stack. A status outside the four is logged and dropped.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`5fa2f55`](https://github.com/JSPrismarine/JSPrismarine/commit/5fa2f555ffac50d5f3c2315a499af172edad1f64) Thanks [@filiphsps](https://github.com/filiphsps)! - `RespawnHandler` drops a `RespawnPacket` that names another player's runtime id, and answers `ClientReadyToSpawn` with the world spawn while the player is still dead instead of the position they died at.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c19ffdf`](https://github.com/JSPrismarine/JSPrismarine/commit/c19ffdf5636a495013995042960cd30a38377b74) Thanks [@filiphsps](https://github.com/filiphsps)! - `SetDisplayObjectivePacket` exports an `ObjectiveSortOrder` enum (`Ascending` = 0, `Descending` = 1) and types its `sortOrder` field with it. The JSDoc of `SetScorePacket` and `SetScoreboardIdentityPacket` now records why the pre-2193 type-byte layouts no longer apply, and the scoreboard packets link to the 1.26.51 docs.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c5e40b4`](https://github.com/JSPrismarine/JSPrismarine/commit/c5e40b4f2e3dc6eadfb46d89affb990ab00861e3) Thanks [@filiphsps](https://github.com/filiphsps)! - The handlers for `StructureBlockUpdate`, `StructureTemplateDataRequest`, `LecternUpdate`, `LabTable`, `AnvilDamage` and `PlayerToggleCrafterSlotRequest` drop a packet whose position is out of reach, in a chunk that is not loaded, or not the block the screen belongs to, and log the reason at verbose level. `BookEditHandler` drops an edit whose slot holds no book and quill or whose page number a book cannot have. None of these blocks are stored yet; the checks keep a crafted packet from being taken at its word or from loading terrain.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`dfb64e9`](https://github.com/JSPrismarine/JSPrismarine/commit/dfb64e9af7853e51cbe04e50dd01487ced986054) Thanks [@filiphsps](https://github.com/filiphsps)! - Decode `ResourcePacksReadyForValidationPacket` (id 340), `PartyChangedPacket` (id 342) and `SetPlayerFurnaceOptionsPacket` (id 351) instead of warning `Packet 0x.. isn't implemented` when a 1.26.51 client sends them. Each gains a class, a handler and a registry entry. The resource pack report has no fields and needs no reply; the party change is logged with its id and leader flag, and an id over the schema's 49 characters is dropped; the furnace options are logged, and a furnace type, tab or layout outside its enum is dropped. `FurnaceType`, `FurnaceLeftTabIndex` and `FurnaceLayout` are exported from the furnace packet module. None of the three changes server state yet.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`e1b44b2`](https://github.com/JSPrismarine/JSPrismarine/commit/e1b44b272cd941c6106039b4b21329c45abd06bb) Thanks [@filiphsps](https://github.com/filiphsps)! - `SetActorDataPacket` carries the receiving player's last input tick for its own entity and zero for any other entity, instead of the server tick.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`fd4bbc4`](https://github.com/JSPrismarine/JSPrismarine/commit/fd4bbc482770f43d8378b39773109f3e688016bd) Thanks [@filiphsps](https://github.com/filiphsps)! - `SetActorLinkPacket`, `AddPaintingPacket` and `SetActorLinkHandler` are registered, so a client mounting something no longer logs an unimplemented packet warning. The handler drops a link that does not have the sender at either end.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`eb3fd44`](https://github.com/JSPrismarine/JSPrismarine/commit/eb3fd44b6ff60a6adc0597402cfd1d4018a4cff2) Thanks [@filiphsps](https://github.com/filiphsps)! - `SetLocalPlayerAsInitializedPacket` now encodes as well as decodes, so a client built on the package can send it. Its JSDoc lists the protocol 2193 layout: `Player ID` as one varuint64.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f74ff2f`](https://github.com/JSPrismarine/JSPrismarine/commit/f74ff2f7e77619af2d10da78bc6cd9743ce72bdb) Thanks [@filiphsps](https://github.com/filiphsps)! - The join sequence floors a fractional world spawn before writing it into `SetSpawnPositionPacket`, so a spawn at `-0.5` names block `-1` instead of block `0`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`761a713`](https://github.com/JSPrismarine/JSPrismarine/commit/761a71380bade91ace18a3df0ebf565443d9ca86) Thanks [@filiphsps](https://github.com/filiphsps)! - `SettingsCommandPacket` and `SettingsCommandHandler` are registered, so a world setting toggled
  from the client's settings screen (for example `/gamerule showcoordinates true`) reaches the
  command manager instead of being logged as an unimplemented packet and dropped.
  `CommandOutputPacket` and `ServerSettingsResponsePacket` are exported from `Protocol.Packets`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`062aa3b`](https://github.com/JSPrismarine/JSPrismarine/commit/062aa3b75a4d2aa55bad733dfb9e00eeb5b58647) Thanks [@filiphsps](https://github.com/filiphsps)! - `StartGamePacket` now fills its fixed level and join fields with the values a Bedrock Dedicated Server 1.26.51 sends: the spawn biome name is `minecraft:plains`, Nether Type is false, Limited World Width and Depth are 16, Server Version is the newest version the server speaks, and Server Configuration Join Info is present and empty rather than absent.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`856ec37`](https://github.com/JSPrismarine/JSPrismarine/commit/856ec374b2feb8da6df03563c9f7b09a8d181de8) Thanks [@filiphsps](https://github.com/filiphsps)! - `StartGamePacket` now carries the world's generator type and dimension instead of a fixed Overworld generator in dimension 0. A flat world is announced as `Flat`, which is what a Bedrock Dedicated Server sends for one.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`e59720d`](https://github.com/JSPrismarine/JSPrismarine/commit/e59720d1524333e38579ff2eea26ef7bacccf88d) Thanks [@filiphsps](https://github.com/filiphsps)! - `StructureBlockUpdatePacket` reads and writes `Redstone Save Mode` as a ZigZag varint32, the compressed integer the 1.26.51 docs describe, instead of a plain byte. A client that picks `SavesToDisk` sends the byte 0x02, which used to decode as 2 rather than 1.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`2a803b4`](https://github.com/JSPrismarine/JSPrismarine/commit/2a803b4b31084924ce86dacd5cb9daa9fcf80068) Thanks [@filiphsps](https://github.com/filiphsps)! - `SubChunk.networkDeserialize` reads version 9 and version 1 records correctly. It skipped the signed index byte a version 9 sub chunk carries after its layer count, so the first layer's header was read one byte early, and it read a layer-count byte from a version 1 record, which has none.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f21e70a`](https://github.com/JSPrismarine/JSPrismarine/commit/f21e70a71a65729844f85b7dea051febc4e589ac) Thanks [@filiphsps](https://github.com/filiphsps)! - Register `SubClientLoginPacket` (id 94) and its handler. Both existed but neither was exported from the packet and handler registries, so a split-screen player's login was logged as an unimplemented packet. The handler still only logs the attempt at debug level; the server binds one player per connection and has nowhere to put a second one.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f0d1719`](https://github.com/JSPrismarine/JSPrismarine/commit/f0d17195a6daa6eb0502b5bd0f54f45084352f1c) Thanks [@filiphsps](https://github.com/filiphsps)! - Fill the `EntityType` command enum from the server's spawnable entity registry, so `/summon` offers the entities it can build instead of an empty list.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`e80abed`](https://github.com/JSPrismarine/JSPrismarine/commit/e80abed43a45f30eeee69e153c5e96d50b4544ff) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerSession.sendMessage` sends an empty `Filtered Message` in `TextPacket` instead of repeating the message.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`09b66b9`](https://github.com/JSPrismarine/JSPrismarine/commit/09b66b9d71f61549e4173e4efaf3a981e0d70566) Thanks [@filiphsps](https://github.com/filiphsps)! - `UpdateAttributesPacket` now carries the `PlayerInputTick` the protocol docs ask for: the tick of the client's last handled `PlayerAuthInputPacket` for its own attributes, and zero for other entities. It used to send the server's tick counter. `PlayerSession.recordInputTick` stores the client's tick.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a5cbae7`](https://github.com/JSPrismarine/JSPrismarine/commit/a5cbae769bf072ba88b8b76cea3dc23b75c2d876) Thanks [@filiphsps](https://github.com/filiphsps)! - Block changes broadcast to clients now carry the `Network` flag in `UpdateBlockPacket`, as a
  Bedrock Dedicated Server does, instead of no flags. `UpdateBlockPacket.flags` and `.layer`
  default to `None` and `Normal` rather than being left undefined.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`b294f3f`](https://github.com/JSPrismarine/JSPrismarine/commit/b294f3faf684a9810ee38e4cf6fa3b97e16c3d68) Thanks [@filiphsps](https://github.com/filiphsps)! - `UUID` accepts unsigned 32-bit words in its constructor. A word above `2^31 - 1`, such as `0x8899aabb`, used to throw a `RangeError` when the uuid was serialized or printed; it is now wrapped to the signed form `fromString` and `fromBinary` produce, so such a uuid equals, prints, and serializes the same either way.

- [#2604](https://github.com/JSPrismarine/JSPrismarine/pull/2604) [`8bbdd64`](https://github.com/JSPrismarine/JSPrismarine/commit/8bbdd646984bf5894b8061d125e4c34083a9b819) Thanks [@filiphsps](https://github.com/filiphsps)! - A world's `level.json` and player data files are written key by key, so a comment left in them survives the next save. They may hold `//` and `/* */` comments and trailing commas; JSON5-only syntax such as unquoted keys is no longer accepted.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`bf3d6d7`](https://github.com/JSPrismarine/JSPrismarine/commit/bf3d6d7786b7cc36237336674f3a7a0909f0559a) Thanks [@filiphsps](https://github.com/filiphsps)! - Give skeletons bows, and arrows something to hit.
  
  **`Projectile`** is not a mob with the thinking removed. It has no goals, no pathfinding and no business being shoved by its neighbors, and it needs one thing a mob does not: to notice what it passes *through* rather than only what it ends up inside. An arrow crossing three blocks in a tick steps clean over anybody standing between the two positions, so a check at the destination alone finds nothing at all. Hence the sweep - the flight is walked in quarter-block samples, entities before blocks, so somebody standing in a doorway is hit rather than the wall behind them.
  
  The shooter is immune for the first few ticks, because an arrow starts inside the bow that fired it and nothing would ever leave the string otherwise. An arrow that cannot hurt what it meets - a creative player, something inside its grace period - carries on through rather than stopping dead in mid-air against them.
  
  Arrows stick where they land and stay there, which needs the flight to stop entirely: ticking a stuck arrow would send it through the floor it just hit. Damage comes from *speed*, which is what makes drawing a bow fully worth doing - a skeleton's shot and a player's are the same arrow launched at different speeds. Snowballs and eggs hurt nothing and shove everything; that cannot go through `Entity.damage`, which refuses a blow of zero and would take the knockback with it.
  
  **Drawing a bow is measured, not reported.** Bedrock says "started" in one transaction and "released" in another, and the gap between them is the charge - so `RELASE_ITEM`, which until now was logged and dropped, closes a clock that `CLICK_AIR` opens. The power curve is vanilla's rather than a straight fraction of the time, and the difference is the point: it is slow at first and fast at the end, so the last few ticks of a draw are worth far more than the first few, which is what makes half-drawing feel weak rather than merely weaker. A full draw crits.
  
  Aiming uses Minecraft's own angle convention, where yaw runs clockwise from south - the x term is a negative sine and the z term a positive cosine. Getting that wrong sends every arrow off at ninety degrees to where the player was pointing, which looks like a physics bug rather than a sign error.
  
  **Skeletons and strays got a brain of their own.** `rangedBrain` is the hostile one with the swing swapped for a bow, and unlike the melee goal the ranged one claims the *movement* lane - keeping its distance is half of how an archer fights. It outranks the approach, so a skeleton that has got within bow range stops closing and starts shooting, and backs off if you walk into it. That is what makes a bow dangerous rather than a worse sword.
  
  **They visibly hold the bow, and visibly draw it**, and neither of those was possible before. `AddActorPacket` has no room for equipment, so a mob's weapon has to follow it as a packet of its own - without which a skeleton fires arrows out of an empty fist.
  
  The pose took three goes to get right, and the first two were reasonable and wrong. Metadata could not reach a client at all for anything but the local player, so `entityMetadataChanged` had to exist first. Then the bow was being lowered for the single tick of each loose, which is worse than it sounds: a client that plays its release animation when the flag goes false shows *only* that - a twitch once a shot, and never a draw.
  
  **The thing that actually poses the mob is `query.has_target`.** Mojang's own skeleton animation controller transitions into its attack state on `query.has_target && !query.facing_target_to_range_attack` and never looks at `is_using_item` at all, so what the client needed was not a flag but the *target's runtime id*, in the `TARGET_ENTITY_ID` metadata field. `Mob.setTarget` now publishes it - and clears it again when the mob gives up, or the skeleton would keep aiming at nothing. `USINGITEM` and `CHARGING` are still set, since the humanoid bow animations do read them.
  
  @see https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/animation_controllers/skeleton.animation_controllers.json
  
  Arrows are not taken out of the quiver and the bow is not worn down. Both need the same thing - telling a client that a slot has changed - and both are left with the armor work where that machinery lives, because a server that silently disagrees with the client about what is in a player's hand is worse than one that has not got round to the accounting.

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

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a) Thanks [@filiphsps](https://github.com/filiphsps)! - Build declaration files with TypeScript 7 through `tsc-ts`. JSON data exports are now typed structurally (`string`, `number`) instead of as literal values.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`ecf472e`](https://github.com/JSPrismarine/JSPrismarine/commit/ecf472ebcd2a7f87d38b7b7ecdbe52f03a7d043f) Thanks [@filiphsps](https://github.com/filiphsps)! - `StartGame` now tells the client the server has not enabled client-side chunk generation, so a 1.26.51 client no longer generates vanilla terrain for chunks the server has not sent. The off-hand item goes out in a `MobEquipment` packet for the offhand container instead of `MobArmorEquipment`'s body armor slot. `ClientConnection.disconnect` takes a `DisconnectReason` code, defaulting to `DISCONNECTED`; `Player.kick` sends `KICKED` and the server shutdown sends `SHUTDOWN`. `AddPlayer` carries the player's build platform, permission levels, and platform chat id.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`fae2f4f`](https://github.com/JSPrismarine/JSPrismarine/commit/fae2f4f9952bd5ede5c0bdceaca9bffb11195029) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the server tick at a steady twenty ticks a second, and stop measuring time with a clock that can move underneath us.
  
  The tick loop corrected the same lateness twice. `executionTime` was measured from the _end_ of the previous tick, so it already contained that tick's sleep, and `MINECRAFT_TICK_TIME_MS - executionTime` was therefore a complete drift correction on its own. The comparison of `elapsedTime` against `expectedElapsedTime` that followed applied a second one, against the accumulated total. Two corrections for one error is a loop gain of two, and the loop oscillated exactly as that predicts: it alternated a near-zero gap with a near-hundred-millisecond one, averaging a perfectly correct twenty ticks a second while never actually holding fifty milliseconds. Measured against real timers, the interval had a standard deviation of 47 ms around a 50 ms target. Everything that leaves a tick as a batch — entity movement, chunk sends — went out in pairs separated by silence, which is not what a client interpolating between updates expects to receive.
  
  Each tick's deadline is now derived from one fixed origin, and the correction happens once. The same measurement gives a standard deviation of zero.
  
  Lateness beyond two seconds is now written off with a `Can't keep up!` warning rather than repaid in full. A ten second stall used to be owed back as two hundred consecutive zero-delay ticks, running the world at maximum speed and starving the event loop precisely when it was already in trouble. Shorter hitches are still made up, so a brief stall does not leave the world permanently running late.
  
  TPS is measured over a sliding one-second window instead of one that reset its own baseline whenever it crossed a second — the first reading after each reset covered a single tick and was noise reported as a rate. It is also no longer clamped to twenty: a loop making up lost time genuinely runs faster than that, and the clamp meant the one metric that should expose the fault reported perfect health throughout.
  
  The `tick` event is awaited. A plugin's tick handler now runs inside the tick like every other piece of tick work, instead of having its continuation land in the middle of some later tick and its rejection escape as an unhandled rejection.
  
  In RakNet, every deadline a session keeps — the retransmission timeout, the split reassembly timeout, the session timeout — and every round trip sample now comes from a monotonic clock. On `Date.now()` a forward step from an NTP correction or a suspend/resume expired all of them at once and folded a step-sized round trip into the RTT estimate; a backward step put them out of reach and stopped retransmission until real time caught up. Timestamps that travel on the wire still use `Date.now()`: they are values the peer echoes back, not durations we measure.
  
  `Session.update()` now takes that reading itself when given no argument, because a caller mixing the two clocks does not get a slightly wrong answer, it gets epoch milliseconds compared against process-relative ones — every deadline expired at once and the session timed out on its first idle pass. An argument is still accepted, for updating several sessions against one instant and for driving time forward in a test.
  
  The RakNet tick loop no longer stops when a session update throws. It scheduled its own next call as the last statement of the callback, so a single session raising an exception took acknowledgments, retransmissions and timeouts down permanently for every connection on the server. Each session is now isolated from the next and the loop reschedules from `finally`. It also subtracts the work it just did from the interval, so the polling rate no longer falls away as sessions are added — with three milliseconds of work per pass it had dropped from ~98 Hz to ~80 Hz.
  
  World auto-save ran once. `currentTick / 20 === 120` is true for exactly one value of the counter, so a world was saved two minutes after startup and then never again for the life of the process; it is a remainder now. `World.save` also handed an async callback to `forEach`, which discards the returned promise, so player writes were still in flight — and their failures unobserved — after `save` had resolved. A shutdown save could report success before a single player had reached disk.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`4b93318`](https://github.com/JSPrismarine/JSPrismarine/commit/4b933182ab382f78dd4d660dd91c2cb86b85c851) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix `/tp @s @s` and `/tp <you> <you>` sending the player to NaN, which the client showed as -2147483648 ([#460](https://github.com/JSPrismarine/JSPrismarine/issues/460)).
  
  A position argument now refuses anything that is not three finite numbers, so a selector or a player name can no longer be read as coordinates. `/tp 1 2 3` works again as well; the numbers used to be tried as a player name first. An entity also refuses to move to a position with a NaN or infinite coordinate, and whole coordinates in `/tp` land in the middle of the named block (`10` becomes `10.5`) instead of half a block short of it.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`aeaf717`](https://github.com/JSPrismarine/JSPrismarine/commit/aeaf7171f271b7c6b03df42a6152d1f63b82826b) Thanks [@filiphsps](https://github.com/filiphsps)! - Read a batch the client chose not to compress, instead of dropping the login.
  
  The compression algorithm travels at two widths that do not agree. `NetworkSettingsPacket` negotiates it in a two byte field, where "none" is `0xffff`; every batch afterwards repeats it in a *single* byte, where none is `0xff`. Reading that byte straight into `PacketCompressionAlgorithm` matched neither ZLIB, SNAPPY nor NONE, fell through to the unsupported branch and threw.
  
  It showed up as `Failed to inflate batched content` a few packets into a login that had otherwise completed - the big packets are compressed and decoded fine, so the first small one the client sent uncompressed was the first to fail, and the client then sat until it timed out.
  
  `CompressionProvider.fromBatchPrefix` now widens the byte to the negotiated form, and `BatchPacket` goes through it on both decode paths. The encode side already wrote `ZLIB` as a byte, which is 0 either way.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`ef1fd47`](https://github.com/JSPrismarine/JSPrismarine/commit/ef1fd47b9d28a22b006d21ab497103367f081085) Thanks [@filiphsps](https://github.com/filiphsps)! - Set the undead alight in the morning.
  
  Night ended and nothing happened to the things that came out in it, so a zombie that wandered into the open at dawn stood there all day. It is one of the loudest signals in the game that time is passing, and its absence made a world feel static however much else was moving.
  
  **Which mobs burn is stated per species rather than guessed.** "Is it undead" and "does it burn" are different questions with different answers: a husk's entire reason to exist is that it is the zombie that survives the desert sun, and a wither skeleton comes from a dimension with no sky. Zombies, zombie villagers, drowned, skeletons, strays and phantoms burn; husks, wither skeletons, zombie pigmen and zoglins do not.
  
  Water saves you - which is why a drowned is safe in its river and alight the moment it climbs out - and the head is what counts, since a zombie in a one-deep pool has its feet under water and its skull in the sun. A helmet would save you too in vanilla; there are no armor slots yet, so that is not modeled.
  
  Burning shares its timer with standing in a fire, so a zombie that walks out of one into daylight goes on burning rather than starting afresh, and one that reaches shade keeps burning for the usual eight seconds. `firedamage` is honored.
  
  **The sky check is on an interval, not every tick.** Working out whether anything stands between a mob and the sky means walking the column above it, which is cheap once and not cheap for every zombie on the server twenty times a second. It only runs for species that can burn at all, so nothing pays for it that would not catch fire anyway.
  
  **`world/DayCycle.ts`** now holds the clock. The spawner had its own private copy of the day length and the dusk and dawn ticks, and two things now care what time it is - monsters may only spawn at night, and the undead burn in the morning. Two copies of those numbers would let a zombie spawn into a world that was about to set it on fire. `BlockView.seesSky` likewise replaces the spawner's own private version, so everything a mob is told about the world above it comes through the same reader as everything else.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`0a792e7`](https://github.com/JSPrismarine/JSPrismarine/commit/0a792e773989dc75658f46609f0acfeddc1dc3a5) Thanks [@filiphsps](https://github.com/filiphsps)! - Put villages and wildlife into the overworld, and give mobs an AI that moves them smoothly.
  
  **Structures.** `world/generators/structure/` is new. A structure is a pure function of its origin: the world is cut into a grid of regions, each region's origin is arithmetic on the world seed, and any chunk can work out on its own which structures reach it, plan each one in full, and draw the slice it owns through a canvas that discards everything outside its sixteen blocks. Each of the dozen chunks a village covers does the same work and keeps a different part of it, and the parts fit because they came from the same plan. No chunk needs a neighbor to have been generated, and generating one twice gives the same result - which is what makes a structure larger than a chunk possible at all when chunks are generated alone and in no particular order.
  
  Villages are the first: a well, streets running out from it, and houses, fields and lamp posts along them. Buildings level the ground they stand on - foundations below, headroom cleared above - and are held within a few blocks of the village's own level, so a village drapes over a rise rather than being quarried into it. Sites that are underwater or too rugged are refused, which puts a village roughly every four to five hundred blocks.
  
  **Mobs.** `entity/Mob.ts` and `entity/ai/` are new, and the mobs that spawn now derive from `Mob`. Behavior is a list of small goals - float, approach, stroll, watch, look around - claiming *lanes* rather than one state machine per species, so a mob can walk somewhere and watch you at the same time. Routes come from A\* over the block grid, and are then straightened by string-pulling and followed by aiming at a point some way *along* the route rather than at the next corner.
  
  Movement is deliberately physical: velocity integrated per tick, chasing a desired velocity rather than being assigned it, with a limited turn rate taking the short way round the circle. A server that decides "the mob is now one block north" produces stuttering no client can hide, so the smoothness is on the server, where it has to be.
  
  The timings and speeds are taken from the vanilla Bedrock behavior packs rather than invented, and `entity/ai/Speed.ts` holds them in blocks per *second* so they can be judged against a player's 4.317. The one that matters most is `random_stroll`'s `interval: 120` - a one in a hundred and twenty chance *per tick* of setting off, which makes the wait geometric with a long tail. A fixed or uniform pause instead makes a whole field of animals visibly pulse, and each one plainly on a timer. `look_at_player` likewise runs on a 2% roll rather than whenever somebody is in range.
  
  **Movement on the wire.** Three separate faults, none visible in the movement model:
  
  - Rotation was never sent, so every mob faced north whatever it was doing.
  - The three rotations were written as pitch, *head* yaw, body yaw. The packet's order is pitch, body yaw, head yaw, so an entity's head was set from its body and its body from its head - a head stuck at an angle that never turned.
  - Every move was sent as its own compressed batch and its own RakNet frame, *and* `sendDataPacket` queues behind any chunk still compressing. So while a walking player streamed terrain, every mob's movement waited behind it and arrived in a burst: mobs froze and jumped in the rhythm the chunks were arriving in. A tick's movement now goes out as one batch per player.
  
  Pathfinding was also costing milliseconds a route on the tick thread - the open set was re-sorted on every expansion, the expansion budget did not scale with the distance, and ties were not broken - and a late tick is visible as stuttering however smooth the model underneath is.
  
  `MobSpawner` puts animals on grass by day and monsters in the dark, in groups, around players, and takes away again the ones nobody is near. Village inhabitants and anything restored from the save file are marked persistent and are never tidied away.
- Updated dependencies [[`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c), [`74722e8`](https://github.com/JSPrismarine/JSPrismarine/commit/74722e8b07e5865ca42b04ff81503f2a0559bd0b), [`6b60a88`](https://github.com/JSPrismarine/JSPrismarine/commit/6b60a88e40ad9751ea177f4273779869486de7e0), [`5cd4d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/5cd4d0aaf1b101135135157e9f11c55c4c73a5f9), [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36), [`5cd4d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/5cd4d0aaf1b101135135157e9f11c55c4c73a5f9), [`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c), [`6bac604`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac604599b909ba32f93fc855de11e88455d184), [`95c1def`](https://github.com/JSPrismarine/JSPrismarine/commit/95c1defed96f389f944c2b61a70d4fe356d271c7), [`e6dc892`](https://github.com/JSPrismarine/JSPrismarine/commit/e6dc892304b478bc4e0dfe47d33ebdbd12a13310), [`e6dc892`](https://github.com/JSPrismarine/JSPrismarine/commit/e6dc892304b478bc4e0dfe47d33ebdbd12a13310), [`60e9e6f`](https://github.com/JSPrismarine/JSPrismarine/commit/60e9e6f981cce46edf2bb2ee0b7b1eea3b7360ee), [`aeaf717`](https://github.com/JSPrismarine/JSPrismarine/commit/aeaf7171f271b7c6b03df42a6152d1f63b82826b), [`b176610`](https://github.com/JSPrismarine/JSPrismarine/commit/b176610cbad718b946e0144aec3fbe118a329eeb), [`44eacb3`](https://github.com/JSPrismarine/JSPrismarine/commit/44eacb30f3c214dbe3ac6179d0ad18df49d7ce36), [`513ded0`](https://github.com/JSPrismarine/JSPrismarine/commit/513ded056f2857f2206c9c12fe8b86923fa9ea56), [`d158cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/d158cd1a9e9daabf3fc0f7c4d229ec1783fc1a1a), [`69c8c8b`](https://github.com/JSPrismarine/JSPrismarine/commit/69c8c8be34bea5b6b86e34e76702f82e912d09b5), [`45e2180`](https://github.com/JSPrismarine/JSPrismarine/commit/45e21809b6517e710b6d675375b35a1015d5d6dc), [`b60eb24`](https://github.com/JSPrismarine/JSPrismarine/commit/b60eb241bf2cb4efa47f802f67244644d079b290), [`252710e`](https://github.com/JSPrismarine/JSPrismarine/commit/252710ecac704f75053a3ab2998da56f6a74e5d3), [`ee36e67`](https://github.com/JSPrismarine/JSPrismarine/commit/ee36e67f668a141c8fea4e25c68acc67aab318f3), [`dc254e3`](https://github.com/JSPrismarine/JSPrismarine/commit/dc254e3444729fcec772e269741496ad24d0a4c2), [`36cce55`](https://github.com/JSPrismarine/JSPrismarine/commit/36cce5505a3b9498b12d6d6d676199d224559090), [`c6ae6ee`](https://github.com/JSPrismarine/JSPrismarine/commit/c6ae6ee9c4fba9ef58124d3d96b3c62713c51658), [`f7c3678`](https://github.com/JSPrismarine/JSPrismarine/commit/f7c3678c0ce868a4240a1c41e68ab2c9e06fa670), [`8f80b82`](https://github.com/JSPrismarine/JSPrismarine/commit/8f80b82f2d9f3e5ed58b3c72f9fbdd46be53f6dc), [`3d1383d`](https://github.com/JSPrismarine/JSPrismarine/commit/3d1383d3be610562d340519258d24c3792483f56), [`cebaebc`](https://github.com/JSPrismarine/JSPrismarine/commit/cebaebcb4d05adb428e749ab3492ae8c2b490eb3), [`8b69964`](https://github.com/JSPrismarine/JSPrismarine/commit/8b69964a6aa92258025e8a63df11d15e7c574b57), [`5803605`](https://github.com/JSPrismarine/JSPrismarine/commit/5803605491d65c38f335e7b32cb16503334b2af1), [`02be069`](https://github.com/JSPrismarine/JSPrismarine/commit/02be069794557206af5ede656b0ccba4894a9a75), [`242cd92`](https://github.com/JSPrismarine/JSPrismarine/commit/242cd92e03b3a7efb106bc9678c3d3677e6da889), [`1574fdb`](https://github.com/JSPrismarine/JSPrismarine/commit/1574fdb63320fc99e02cf2a4c80b8b12226a29e0), [`567faa0`](https://github.com/JSPrismarine/JSPrismarine/commit/567faa09375d9c9632ac893a7cb62ddca2d71b12), [`8535455`](https://github.com/JSPrismarine/JSPrismarine/commit/85354556a17db4908eccbf4d7aa6662324bd3b39), [`8eded3f`](https://github.com/JSPrismarine/JSPrismarine/commit/8eded3f230c4b8b707cb15047ac596fcfe264a65), [`fadb03d`](https://github.com/JSPrismarine/JSPrismarine/commit/fadb03d2b763c427686e926cc86eeb71ffbf8b9f), [`25bfb44`](https://github.com/JSPrismarine/JSPrismarine/commit/25bfb44acf70c2d3f1d7ab79c5c821ee355b78cb), [`377749c`](https://github.com/JSPrismarine/JSPrismarine/commit/377749cf41e27510fd2d2dd28311e2745ad11936), [`ebf5ed5`](https://github.com/JSPrismarine/JSPrismarine/commit/ebf5ed5475c44b1ddf41065acae664f8d1d5c8a9), [`601c5f8`](https://github.com/JSPrismarine/JSPrismarine/commit/601c5f8f3814455400c06b3bfd6392960ce1b203), [`576437e`](https://github.com/JSPrismarine/JSPrismarine/commit/576437ecff1a00d451b79a7d98f3553ccf222600), [`9d1b862`](https://github.com/JSPrismarine/JSPrismarine/commit/9d1b8623bcfe95396ae65b64b840fa7b25ac4ffc), [`2420ef3`](https://github.com/JSPrismarine/JSPrismarine/commit/2420ef3d6aa588ec09d635e4de06d2e65dd313fc), [`a844cb3`](https://github.com/JSPrismarine/JSPrismarine/commit/a844cb3e402095e24deece5e9c1e16ca3edf98a6), [`f74b8e1`](https://github.com/JSPrismarine/JSPrismarine/commit/f74b8e11788d3ef9eed1be2de8056f09bc28420e), [`277da2e`](https://github.com/JSPrismarine/JSPrismarine/commit/277da2ed6c76cb85b500863cd5243ebf935e5ba0), [`b78d24b`](https://github.com/JSPrismarine/JSPrismarine/commit/b78d24be2d037d03bad94c3bd5941f83c3eb2850), [`78f79e3`](https://github.com/JSPrismarine/JSPrismarine/commit/78f79e367d1affbf6da3593cd4e5c4b58892a61c), [`8ef0331`](https://github.com/JSPrismarine/JSPrismarine/commit/8ef0331839c6d0d4f25fbb5268e6249474474da3), [`de5a310`](https://github.com/JSPrismarine/JSPrismarine/commit/de5a310503c3050a4c39f489a7ee8dd02b881102), [`988e073`](https://github.com/JSPrismarine/JSPrismarine/commit/988e073a443a69d815549645889f638c973b37f1), [`35948e3`](https://github.com/JSPrismarine/JSPrismarine/commit/35948e3f020af2db2cf4de827e8b67defb0144b6), [`fbc2fdd`](https://github.com/JSPrismarine/JSPrismarine/commit/fbc2fdd0a2c1acd0a85e2c6d9da713f07fcc4ad9), [`cda08a0`](https://github.com/JSPrismarine/JSPrismarine/commit/cda08a0343ab6b072945b289c3e891ef698b9e9b), [`8c3d052`](https://github.com/JSPrismarine/JSPrismarine/commit/8c3d052c043b6d54c8d443a94fc13410a4d7ebe5), [`93b0c1a`](https://github.com/JSPrismarine/JSPrismarine/commit/93b0c1aae5ef1198187fd05ba4388bf4646cb40e), [`4905238`](https://github.com/JSPrismarine/JSPrismarine/commit/49052388894748c9d1acdf19f3927111678eb119), [`6c69430`](https://github.com/JSPrismarine/JSPrismarine/commit/6c6943009b0a483c9274c122e1f84ea5b8aba912), [`a8561c8`](https://github.com/JSPrismarine/JSPrismarine/commit/a8561c8014907284fcab23c24c5b1f1b7305d97e), [`a848770`](https://github.com/JSPrismarine/JSPrismarine/commit/a8487700bb0534a0a3b7415671a69edbb8628e3a), [`1cbf13d`](https://github.com/JSPrismarine/JSPrismarine/commit/1cbf13d6fbf30be2e747057cbe2805d286e8f6a6), [`fed1f50`](https://github.com/JSPrismarine/JSPrismarine/commit/fed1f50db5800ef6b8dea15e5a66263039c5c25d), [`688119a`](https://github.com/JSPrismarine/JSPrismarine/commit/688119aa7fde987dc8430003fc4975dc5a431b0b), [`e05ae9d`](https://github.com/JSPrismarine/JSPrismarine/commit/e05ae9d01e1ef72f3b77b22a45341205f9d118e0), [`f4f55c1`](https://github.com/JSPrismarine/JSPrismarine/commit/f4f55c1664bdff45e0d35c90f400b4bc3b3f6691), [`67883b8`](https://github.com/JSPrismarine/JSPrismarine/commit/67883b85f3524614cc257d0c80f7bc86fb1677c6), [`ab1c7b5`](https://github.com/JSPrismarine/JSPrismarine/commit/ab1c7b556dda4b6c1f6bb33b10f5339e5aab415a), [`743ff36`](https://github.com/JSPrismarine/JSPrismarine/commit/743ff360ae20b8f61f299ecfb5de66004aae694d), [`bb82cdb`](https://github.com/JSPrismarine/JSPrismarine/commit/bb82cdba221175a5e83592536b16d474902f9fb1), [`6b77308`](https://github.com/JSPrismarine/JSPrismarine/commit/6b773085d0cd87fd285949908efa68facce446fd), [`ebbe3f9`](https://github.com/JSPrismarine/JSPrismarine/commit/ebbe3f9476dde4f3282ff6ec5c6f9c24282e8571), [`a4fa498`](https://github.com/JSPrismarine/JSPrismarine/commit/a4fa498f84cf78da063928af6ab658a9c5993c22), [`fbe7f4b`](https://github.com/JSPrismarine/JSPrismarine/commit/fbe7f4b42c880929ad15f35c420f825e4d722e15), [`d85faf3`](https://github.com/JSPrismarine/JSPrismarine/commit/d85faf37fd9be0295931458c58c86f40750c7abb), [`d9b1496`](https://github.com/JSPrismarine/JSPrismarine/commit/d9b1496ad2144ec3d9ed0cf3f48e7f14005f5901), [`655dbd0`](https://github.com/JSPrismarine/JSPrismarine/commit/655dbd0f5c721a9325ad3144c1e245ce068ec423), [`78a5a6c`](https://github.com/JSPrismarine/JSPrismarine/commit/78a5a6c10d10a4f3bf27098d6093a9988736df40), [`f60310c`](https://github.com/JSPrismarine/JSPrismarine/commit/f60310c669ad1b212ff4ec1b3905f34c29d1083d), [`8b37263`](https://github.com/JSPrismarine/JSPrismarine/commit/8b37263e758c8f64a2328dc4f26103d0998990e9), [`a2d820c`](https://github.com/JSPrismarine/JSPrismarine/commit/a2d820c16b89fbfd81e272cd7a43c9a0d71e63e9), [`5fd1c5e`](https://github.com/JSPrismarine/JSPrismarine/commit/5fd1c5ed275a800446ee803e6145b26a626928ef), [`64e1df3`](https://github.com/JSPrismarine/JSPrismarine/commit/64e1df3061e97ef1e45932a830960825e276d1f9), [`0fcc990`](https://github.com/JSPrismarine/JSPrismarine/commit/0fcc9902098c8f825f95a8737b158e1a23d88250), [`5b96d5a`](https://github.com/JSPrismarine/JSPrismarine/commit/5b96d5ac59cfbc754a3977aeaaa57e9991a1404a), [`5940943`](https://github.com/JSPrismarine/JSPrismarine/commit/59409430950ae131ce1cdc5e15220bac176b4b62), [`52e4907`](https://github.com/JSPrismarine/JSPrismarine/commit/52e490722eb7c0d76c6342d3ac7ddc6fe88d91a2), [`650d0bf`](https://github.com/JSPrismarine/JSPrismarine/commit/650d0bf72f637e0972c287095eb74145ec8ed638), [`64cc66e`](https://github.com/JSPrismarine/JSPrismarine/commit/64cc66e90d5c29aa03016d66e6e393daec1f5063), [`1f304c1`](https://github.com/JSPrismarine/JSPrismarine/commit/1f304c13099487c5381a676929c8c7671bf4d560), [`09fa244`](https://github.com/JSPrismarine/JSPrismarine/commit/09fa2442ab5677d0ea64547b7260d386deb149f5), [`fae2f4f`](https://github.com/JSPrismarine/JSPrismarine/commit/fae2f4f9952bd5ede5c0bdceaca9bffb11195029), [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a), [`e25f62b`](https://github.com/JSPrismarine/JSPrismarine/commit/e25f62bdba9c0c42193f1f368c69c22cf07e91de), [`2eda0da`](https://github.com/JSPrismarine/JSPrismarine/commit/2eda0da630ef2d917c6906dc79b1cc1266607dd9), [`cb93c6c`](https://github.com/JSPrismarine/JSPrismarine/commit/cb93c6c598798cf7d1d0b489c8c46e6c2e082e23), [`218a8a8`](https://github.com/JSPrismarine/JSPrismarine/commit/218a8a856e48d82f02b4c93f976939b900302dc7), [`8b66629`](https://github.com/JSPrismarine/JSPrismarine/commit/8b666295644f770b2e99c5e4b6839a79f9a0c4ab), [`a10d86a`](https://github.com/JSPrismarine/JSPrismarine/commit/a10d86aad180120f14dcf3fe0e5944c3dc373235), [`0f058dd`](https://github.com/JSPrismarine/JSPrismarine/commit/0f058dd7353e522b61ec1c45366c667bab12a389), [`c76286f`](https://github.com/JSPrismarine/JSPrismarine/commit/c76286f0101f6fad70f78023282271801880b394), [`5b57bc3`](https://github.com/JSPrismarine/JSPrismarine/commit/5b57bc3cac03393219507b3cbb700cae8b174d13), [`b20d325`](https://github.com/JSPrismarine/JSPrismarine/commit/b20d3256b5005a0b594d2a8d1abadc3142ef0503), [`fae2f4f`](https://github.com/JSPrismarine/JSPrismarine/commit/fae2f4f9952bd5ede5c0bdceaca9bffb11195029)]:
  - @jsprismarine/minecraft@0.15.0
  - @jsprismarine/protocol@0.15.0
  - @jsprismarine/raknet@0.15.0
  - @jsprismarine/binaryutils@0.15.0
  - @jsprismarine/math@0.15.0
  - @jsprismarine/nbt@0.15.0
  - @jsprismarine/color-parser@0.15.0
  - @jsprismarine/errors@0.15.0
  - @jsprismarine/leveldb@0.15.0
  - @jsprismarine/logger@0.15.0

## 0.14.2

### Patch Changes

- [`6b15f32`](https://github.com/JSPrismarine/JSPrismarine/commit/6b15f32341e8131b1c498013f2f951b774adff64) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix several long standing bugs and issues.
- Updated dependencies []:
  - @jsprismarine/color-parser@0.14.2
  - @jsprismarine/errors@0.14.2
  - @jsprismarine/logger@0.14.2
  - @jsprismarine/math@0.14.2
  - @jsprismarine/minecraft@0.14.2
  - @jsprismarine/nbt@0.14.2
  - @jsprismarine/protocol@0.14.2
  - @jsprismarine/raknet@0.14.2

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
    - @jsprismarine/color-parser@0.14.1
    - @jsprismarine/errors@0.14.1
    - @jsprismarine/logger@0.14.1
    - @jsprismarine/math@0.14.1
    - @jsprismarine/minecraft@0.14.1
    - @jsprismarine/nbt@0.14.1
    - @jsprismarine/protocol@0.14.1
    - @jsprismarine/raknet@0.14.1

## 0.14.0

### Minor Changes

- [`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a) Thanks [@filiphsps](https://github.com/filiphsps)! - Republish every package with its compiled `dist/` output. The previous stable release shipped without any built code — every tarball on npm contained only `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` — because `pnpm run build` had been commented out of the release workflow at the time of the cut. The build step has since been restored; this minor bump forces a fresh stable publish so consumers actually receive the compiled code.

### Patch Changes

- [`c572c06`](https://github.com/JSPrismarine/JSPrismarine/commit/c572c06c61f668cd7cfababb05e7adbc219876ca) Thanks [@filiphsps](https://github.com/filiphsps)! - Bogus change to test changeset PR creation with `MACHINE_USER`.

- [`3aa7813`](https://github.com/JSPrismarine/JSPrismarine/commit/3aa78132d3805cefe776d8de835b0b1081ca3095) Thanks [@filiphsps](https://github.com/filiphsps)! - Bump TypeScript to 6.0.3 and drop deprecated `downlevelIteration`/`baseUrl` from tsconfigs.

- Updated dependencies [[`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a), [`3aa7813`](https://github.com/JSPrismarine/JSPrismarine/commit/3aa78132d3805cefe776d8de835b0b1081ca3095)]:
    - @jsprismarine/color-parser@0.14.0
    - @jsprismarine/errors@0.14.0
    - @jsprismarine/logger@0.14.0
    - @jsprismarine/math@0.14.0
    - @jsprismarine/minecraft@0.14.0
    - @jsprismarine/nbt@0.14.0
    - @jsprismarine/protocol@0.14.0
    - @jsprismarine/raknet@0.14.0

## 0.13.5

### Patch Changes

- [`f8dddf8`](https://github.com/JSPrismarine/JSPrismarine/commit/f8dddf8bbd7e444248d82fa4179eacf538485100) Thanks [@filiphsps](https://github.com/filiphsps)! - Update dependenices.

- [`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51) Thanks [@filiphsps](https://github.com/filiphsps)! - Force-republish all packages at 0.13.4 to recover from a broken release pipeline.

    Previous attempts to publish 0.13.3 left the npm registry in an inconsistent state: a handful of packages (`brigadier`, `client`, `color-parser`, `errors`, `prismarine`, `raknet`) were pushed under the `unstable` dist-tag at the non-snapshot version `0.13.3`, while the rest failed mid-publish. Rather than try to repair 0.13.3 in place, we're skipping it entirely and resyncing every package on `latest` at 0.13.4.

- Updated dependencies [[`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51)]:
    - @jsprismarine/color-parser@0.13.5
    - @jsprismarine/errors@0.13.5
    - @jsprismarine/logger@0.13.5
    - @jsprismarine/math@0.13.5
    - @jsprismarine/minecraft@0.13.5
    - @jsprismarine/nbt@0.13.5
    - @jsprismarine/protocol@0.13.5
    - @jsprismarine/raknet@0.13.5

## 0.13.2

### Patch Changes

- [`ab719cb`](https://github.com/JSPrismarine/JSPrismarine/commit/ab719cb2a58f3b099a3017694ce4ce610bf5cf54) Thanks [@filiphsps](https://github.com/filiphsps)! - Update dependenices (including vulnerable dependencies).

- Updated dependencies []:
    - @jsprismarine/color-parser@0.13.2
    - @jsprismarine/errors@0.13.2
    - @jsprismarine/logger@0.13.2
    - @jsprismarine/math@0.13.2
    - @jsprismarine/minecraft@0.13.2
    - @jsprismarine/nbt@0.13.2
    - @jsprismarine/protocol@0.13.2
    - @jsprismarine/raknet@0.13.2

## 0.13.1

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.13.1
    - @jsprismarine/errors@0.13.1
    - @jsprismarine/logger@0.13.1
    - @jsprismarine/math@0.13.1
    - @jsprismarine/minecraft@0.13.1
    - @jsprismarine/nbt@0.13.1
    - @jsprismarine/protocol@0.13.1
    - @jsprismarine/raknet@0.13.1

## 0.13.0

### Patch Changes

- [`ea1948a`](https://github.com/JSPrismarine/JSPrismarine/commit/ea1948a494893e0cb03774c5530971d20e7bfdaf) Thanks [@filiphsps](https://github.com/filiphsps)! - Update dependenices.

- Updated dependencies []:
    - @jsprismarine/color-parser@0.13.0
    - @jsprismarine/errors@0.13.0
    - @jsprismarine/logger@0.13.0
    - @jsprismarine/math@0.13.0
    - @jsprismarine/minecraft@0.13.0
    - @jsprismarine/nbt@0.13.0
    - @jsprismarine/protocol@0.13.0
    - @jsprismarine/raknet@0.13.0

## 0.12.1

### Patch Changes

- [`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix types order in package.json.

- [`6bf4e8d`](https://github.com/JSPrismarine/JSPrismarine/commit/6bf4e8dcfb07d45c1c1a6ff32b4993b0f8f4f96e) Thanks [@filiphsps](https://github.com/filiphsps)! - Throw when trying to get player data for a player with XUID.

- Updated dependencies [[`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72)]:
    - @jsprismarine/color-parser@0.12.1
    - @jsprismarine/minecraft@0.12.1
    - @jsprismarine/protocol@0.12.1
    - @jsprismarine/errors@0.12.1
    - @jsprismarine/logger@0.12.1
    - @jsprismarine/raknet@0.12.1
    - @jsprismarine/math@0.12.1
    - @jsprismarine/nbt@0.12.1

## 0.12.0

### Minor Changes

- [`b025e15`](https://github.com/JSPrismarine/JSPrismarine/commit/b025e153f6777aaae672d8331926b2ac91e7e2e0) Thanks [@filiphsps](https://github.com/filiphsps)! - Change config option `enable-title` to `enable-process-title`.

### Patch Changes

- [`0a8f8d7`](https://github.com/JSPrismarine/JSPrismarine/commit/0a8f8d7f2d8638f3da68abdbf65ba3c48dcda038) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve reloading stability.

- [`b025e15`](https://github.com/JSPrismarine/JSPrismarine/commit/b025e153f6777aaae672d8331926b2ac91e7e2e0) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve ticking.

- [`98ec1c5`](https://github.com/JSPrismarine/JSPrismarine/commit/98ec1c58363e95f04fec9c6118e637e21ad5fc1e) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix world loading order and simplify getter.

- Updated dependencies [[`d761626`](https://github.com/JSPrismarine/JSPrismarine/commit/d761626b51b8a402b13d111e3dd25b560bfdf8fe)]:
    - @jsprismarine/raknet@0.12.0
    - @jsprismarine/color-parser@0.12.0
    - @jsprismarine/errors@0.12.0
    - @jsprismarine/logger@0.12.0
    - @jsprismarine/math@0.12.0
    - @jsprismarine/minecraft@0.12.0
    - @jsprismarine/nbt@0.12.0
    - @jsprismarine/protocol@0.12.0

## 0.11.1

### Patch Changes

- [`a79d837`](https://github.com/JSPrismarine/JSPrismarine/commit/a79d837e132bd2fbf1a91452b680341dafa76fe2) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix shutting down the server sometimes leaving socket open.

- Updated dependencies []:
    - @jsprismarine/color-parser@0.11.1
    - @jsprismarine/errors@0.11.1
    - @jsprismarine/logger@0.11.1
    - @jsprismarine/math@0.11.1
    - @jsprismarine/minecraft@0.11.1
    - @jsprismarine/nbt@0.11.1
    - @jsprismarine/protocol@0.11.1
    - @jsprismarine/raknet@0.11.1

## 0.11.0

### Minor Changes

- [`e962b51`](https://github.com/JSPrismarine/JSPrismarine/commit/e962b514e196511111877e9ad856a00291216c6e) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `enable-title` and `enable-ticking`.

- [`3303be8`](https://github.com/JSPrismarine/JSPrismarine/commit/3303be822a8aff09142172e0796e66473dc2fef2) Thanks [@filiphsps](https://github.com/filiphsps)! - Simplify console enable/disable.

- [`ad0e562`](https://github.com/JSPrismarine/JSPrismarine/commit/ad0e5623a34f0424bd520b68131b56e92dec1cea) Thanks [@filiphsps](https://github.com/filiphsps)! - Add config option to enable/disable the query.

- [`51ba84e`](https://github.com/JSPrismarine/JSPrismarine/commit/51ba84e1fe3b7ad99a9fb07039048c9cab2075b6) Thanks [@filiphsps](https://github.com/filiphsps)! - Add headless mode (running without console).

### Patch Changes

- [`4b7f94d`](https://github.com/JSPrismarine/JSPrismarine/commit/4b7f94d805480a171728bc82829874c3d0258fc3) Thanks [@filiphsps](https://github.com/filiphsps)! - Allow for shutting dowing without killing the parent process.

- Updated dependencies [[`4b7f94d`](https://github.com/JSPrismarine/JSPrismarine/commit/4b7f94d805480a171728bc82829874c3d0258fc3)]:
    - @jsprismarine/logger@0.11.0
    - @jsprismarine/color-parser@0.11.0
    - @jsprismarine/errors@0.11.0
    - @jsprismarine/math@0.11.0
    - @jsprismarine/minecraft@0.11.0
    - @jsprismarine/nbt@0.11.0
    - @jsprismarine/protocol@0.11.0
    - @jsprismarine/raknet@0.11.0

## 0.10.0

### Minor Changes

- [`ef1e604`](https://github.com/JSPrismarine/JSPrismarine/commit/ef1e604cdcddc73ea8b23b545142592a90b34884) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve server stopping.
  Fix incorrect order of actions in `world.addEntity``.
  Improve the console.

- [#1695](https://github.com/JSPrismarine/JSPrismarine/pull/1695) [`306495d`](https://github.com/JSPrismarine/JSPrismarine/commit/306495dff6d34e8a1dca1187bf5e9a285325ec8f) Thanks [@filiphsps](https://github.com/filiphsps)! - Simplify `json` and `yaml` handling.
    > We now properly handle parsing those files with comments, though they're not preserved when writing to the file.

### Patch Changes

- [`99566e3`](https://github.com/JSPrismarine/JSPrismarine/commit/99566e363f4a726de5180f998e7fd2fd36cc5bf7) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix onw case of an export not being marked as a type export.

- [`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Bring tooling closer to supporting `composite: true`.

- Updated dependencies [[`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a), [`a7f7e16`](https://github.com/JSPrismarine/JSPrismarine/commit/a7f7e16c3b5ee8415a9561b8eb388d81bd23fd9c)]:
    - @jsprismarine/color-parser@0.10.0
    - @jsprismarine/minecraft@0.10.0
    - @jsprismarine/protocol@0.10.0
    - @jsprismarine/errors@0.10.0
    - @jsprismarine/logger@0.10.0
    - @jsprismarine/raknet@0.10.0
    - @jsprismarine/math@0.10.0
    - @jsprismarine/nbt@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [[`9963470`](https://github.com/JSPrismarine/JSPrismarine/commit/996347038b55d4d08b08b1efdc451e89d7265b30)]:
    - @jsprismarine/minecraft@0.9.0
    - @jsprismarine/protocol@0.9.0
    - @jsprismarine/color-parser@0.9.0
    - @jsprismarine/errors@0.9.0
    - @jsprismarine/logger@0.9.0
    - @jsprismarine/math@0.9.0
    - @jsprismarine/nbt@0.9.0
    - @jsprismarine/raknet@0.9.0

## 0.8.0

### Minor Changes

- [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a) Thanks [@filiphsps](https://github.com/filiphsps)! - - Update to latest bedrock edition.

### Patch Changes

- [#1685](https://github.com/JSPrismarine/JSPrismarine/pull/1685) [`40af4b2`](https://github.com/JSPrismarine/JSPrismarine/commit/40af4b23802f74b2eecd34a4f05e90044d51fd56) Thanks [@filiphsps](https://github.com/filiphsps)! - - Migrate `@jsprismarine/bedrock-data` to monorepo.

- [`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7) Thanks [@filiphsps](https://github.com/filiphsps)! - - Replace `assert` with `with`.

- Updated dependencies [[`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7), [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a)]:
    - @jsprismarine/color-parser@0.8.0
    - @jsprismarine/minecraft@0.8.0
    - @jsprismarine/protocol@0.8.0
    - @jsprismarine/errors@0.8.0
    - @jsprismarine/logger@0.8.0
    - @jsprismarine/raknet@0.8.0
    - @jsprismarine/math@0.8.0
    - @jsprismarine/nbt@0.8.0

## 0.7.0

### Minor Changes

- [#1520](https://github.com/JSPrismarine/JSPrismarine/pull/1520) [`142c6e1`](https://github.com/JSPrismarine/JSPrismarine/commit/142c6e1ca4f8961271d1c8caa8fbf0c71dc315b6) Thanks [@enricoangelon](https://github.com/enricoangelon)! - Properly implement Position, Vector2 & Vector3

- [#1517](https://github.com/JSPrismarine/JSPrismarine/pull/1517) [`1e013a6`](https://github.com/JSPrismarine/JSPrismarine/commit/1e013a60b9987929b53b2cc1d333daf8b5d45196) Thanks [@enricoangelon](https://github.com/enricoangelon)! - Bump to bedrock protocol 686

### Patch Changes

- Updated dependencies [[`142c6e1`](https://github.com/JSPrismarine/JSPrismarine/commit/142c6e1ca4f8961271d1c8caa8fbf0c71dc315b6)]:
    - @jsprismarine/math@0.7.0
    - @jsprismarine/color-parser@0.7.0
    - @jsprismarine/errors@0.7.0
    - @jsprismarine/logger@0.7.0
    - @jsprismarine/minecraft@0.7.0
    - @jsprismarine/nbt@0.7.0
    - @jsprismarine/protocol@0.7.0
    - @jsprismarine/raknet@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.6.0
    - @jsprismarine/errors@0.6.0
    - @jsprismarine/logger@0.6.0
    - @jsprismarine/math@0.6.0
    - @jsprismarine/minecraft@0.6.0
    - @jsprismarine/nbt@0.6.0
    - @jsprismarine/protocol@0.6.0
    - @jsprismarine/raknet@0.6.0

## 0.5.0

### Minor Changes

- [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`c8d976f`](https://github.com/JSPrismarine/JSPrismarine/commit/c8d976f627ef96deb9b2213561848f84214c07a1) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename `GameType` to `Gametype` (parity fix).

### Patch Changes

- [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade `typescript` to `v5.5.2`.

- [`3a00892`](https://github.com/JSPrismarine/JSPrismarine/commit/3a00892ab6d8e0647c94da96bb85553f08a8484b) Thanks [@filiphsps](https://github.com/filiphsps)! - Protocol changes.

- Updated dependencies [[`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53), [`c8d976f`](https://github.com/JSPrismarine/JSPrismarine/commit/c8d976f627ef96deb9b2213561848f84214c07a1)]:
    - @jsprismarine/color-parser@0.5.0
    - @jsprismarine/minecraft@0.5.0
    - @jsprismarine/protocol@0.5.0
    - @jsprismarine/errors@0.5.0
    - @jsprismarine/logger@0.5.0
    - @jsprismarine/raknet@0.5.0
    - @jsprismarine/math@0.5.0
    - @jsprismarine/nbt@0.5.0

## 0.4.5

### Patch Changes

- [#1460](https://github.com/JSPrismarine/JSPrismarine/pull/1460) [`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly revamp build system to allow for way better dev UX.

    Fix error getting thrown on first run due to missing the `level.json`
    file. We no longer try to read it if it doesn't exist.

    Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
    `pid` validation.

- [#1458](https://github.com/JSPrismarine/JSPrismarine/pull/1458) [`2d32a17`](https://github.com/JSPrismarine/JSPrismarine/commit/2d32a17c994a3cbd3d98d94dd0f33280a863c81a) Thanks [@filiphsps](https://github.com/filiphsps)! - As a parity change with Java and BDS the console will no longer require
  you to type a `/` (slash) before running a command. As a consequence of
  this change the chat functionality of the console has been removed, to
  send chat messages now you will need to use one of the many commands
  like `/say`, `/me`, `/tellraw`, and more.

    All on `enable` and `disable` hooks have now been documented with JSDoc
    and also given proper return types.

- [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade turbo to v2.

- Updated dependencies [[`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe), [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3)]:
    - @jsprismarine/color-parser@0.4.5
    - @jsprismarine/minecraft@0.4.5
    - @jsprismarine/protocol@0.4.5
    - @jsprismarine/errors@0.4.5
    - @jsprismarine/logger@0.4.5
    - @jsprismarine/raknet@0.4.5
    - @jsprismarine/math@0.4.5
    - @jsprismarine/nbt@0.4.5

## 0.4.4

### Patch Changes

- [`adffd12`](https://github.com/JSPrismarine/JSPrismarine/commit/adffd12b09d07dc878a2e01cd795c3056317946a) Thanks [@filiphsps](https://github.com/filiphsps)! - Migrate to @jsprismarine/Minecraft's `gametype`.

- [`2b5bc2f`](https://github.com/JSPrismarine/JSPrismarine/commit/2b5bc2fbffe777c329fd5684e342050cd2e13c43) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix "Blocks in negative coordinates don't behave correctly." [#1328](https://github.com/JSPrismarine/JSPrismarine/issues/1328).

- [`07bc6d0`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc6d0920e48b2fa593b346ac73949517c0fb7a) Thanks [@filiphsps](https://github.com/filiphsps)! - Move `pitch`, `yaw` and `headYaw` to `Entity`.

- [#1334](https://github.com/JSPrismarine/JSPrismarine/pull/1334) [`4f8bf3f`](https://github.com/JSPrismarine/JSPrismarine/commit/4f8bf3f367d42dbd710cf353c075e25bcb5370f7) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix "Take advantage of raknet/src/utils/ServerName.ts." [#1313](https://github.com/JSPrismarine/JSPrismarine/issues/1313).

- [`07bc6d0`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc6d0920e48b2fa593b346ac73949517c0fb7a) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix spawn location.
  Send entity metadata to clients.
  Slightly Simplify working with positions.
- Updated dependencies [[`adffd12`](https://github.com/JSPrismarine/JSPrismarine/commit/adffd12b09d07dc878a2e01cd795c3056317946a), [`4f8bf3f`](https://github.com/JSPrismarine/JSPrismarine/commit/4f8bf3f367d42dbd710cf353c075e25bcb5370f7)]:
    - @jsprismarine/minecraft@0.4.4
    - @jsprismarine/raknet@0.4.4
    - @jsprismarine/protocol@0.4.4
    - @jsprismarine/color-parser@0.4.4
    - @jsprismarine/errors@0.4.4
    - @jsprismarine/logger@0.4.4
    - @jsprismarine/math@0.4.4
    - @jsprismarine/nbt@0.4.4

## 0.4.3

### Patch Changes

- [`b0a232b`](https://github.com/JSPrismarine/JSPrismarine/commit/b0a232b9be5d6456c33d5300582a0c7e33d76a6e) Thanks [@filiphsps](https://github.com/filiphsps)! - Bump version due to previous publishing failure.

- Updated dependencies []:
    - @jsprismarine/color-parser@0.4.3
    - @jsprismarine/errors@0.4.3
    - @jsprismarine/logger@0.4.3
    - @jsprismarine/nbt@0.4.3
    - @jsprismarine/raknet@0.4.3

## 0.4.2

### Patch Changes

- [#1299](https://github.com/JSPrismarine/JSPrismarine/pull/1299) [`384f571`](https://github.com/JSPrismarine/JSPrismarine/commit/384f5716d593f2f3bac4a9521578d32107e671a8) Thanks [@filiphsps](https://github.com/filiphsps)! - CommandManager: Remove legacy `execute` function.

- [#1303](https://github.com/JSPrismarine/JSPrismarine/pull/1303) [`7d7283b`](https://github.com/JSPrismarine/JSPrismarine/commit/7d7283ba87e6fc030d25be8a2a542745a5c94745) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename `onEnable` and `onDisable` to `enable` and `disable`.

- [#1312](https://github.com/JSPrismarine/JSPrismarine/pull/1312) [`a66c1b9`](https://github.com/JSPrismarine/JSPrismarine/commit/a66c1b981698fa26570bb0fd9ebf667240a172b7) Thanks [@filiphsps](https://github.com/filiphsps)! - Entity: Refactor Metadata to be more user-friendly.

- [#1299](https://github.com/JSPrismarine/JSPrismarine/pull/1299) [`b54350e`](https://github.com/JSPrismarine/JSPrismarine/commit/b54350eb6341fc487b05781b149c148bae3a5f55) Thanks [@filiphsps](https://github.com/filiphsps)! - World: Simplify `LevelData` handling.
  WorldManager: Improve `isWorldLoaded` check.
  Entities: Simplify.
  Player: Move UUID handling to `Entity`.

- [#1315](https://github.com/JSPrismarine/JSPrismarine/pull/1315) [`941fb74`](https://github.com/JSPrismarine/JSPrismarine/commit/941fb74a7818afd21e87804f62e004cf8465e0c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/logger` package.

- Updated dependencies [[`941fb74`](https://github.com/JSPrismarine/JSPrismarine/commit/941fb74a7818afd21e87804f62e004cf8465e0c4)]:
    - @jsprismarine/logger@0.4.2
    - @jsprismarine/color-parser@0.4.2
    - @jsprismarine/errors@0.4.2
    - @jsprismarine/nbt@0.4.2
    - @jsprismarine/raknet@0.4.2

## 0.4.1

### Patch Changes

- [#1296](https://github.com/JSPrismarine/JSPrismarine/pull/1296) [`44c25e1`](https://github.com/JSPrismarine/JSPrismarine/commit/44c25e132b55174a1e57aee9152e6fbb73c90cf6) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix stdin on Windows.
  Add input history.
  Improve exit reliability.

- [#1292](https://github.com/JSPrismarine/JSPrismarine/pull/1292) [`8bc4525`](https://github.com/JSPrismarine/JSPrismarine/commit/8bc452534b5048b71a08e509d2823203bf07a407) Thanks [@filiphsps](https://github.com/filiphsps)! - Refactor `Server` to extend our custom `EventEmitter`.
  So, instead of using the `getEventManager()` function to get something emittable;
  you now just do a simple `server.emit('id', event);`.

- [`e1ba6e7`](https://github.com/JSPrismarine/JSPrismarine/commit/e1ba6e71a2757cd6bba00c95d15d0d672c8cf476) Thanks [@filiphsps](https://github.com/filiphsps)! - Refactor Chat constructor.

- [#1296](https://github.com/JSPrismarine/JSPrismarine/pull/1296) [`69dae84`](https://github.com/JSPrismarine/JSPrismarine/commit/69dae84d2fde2bb754442f58a85dc4a865e28966) Thanks [@filiphsps](https://github.com/filiphsps)! - Add basic tab-completion support.

- Updated dependencies []:
    - @jsprismarine/color-parser@0.4.1
    - @jsprismarine/errors@0.4.1
    - @jsprismarine/nbt@0.4.1
    - @jsprismarine/raknet@0.4.1

## 0.4.0

### Patch Changes

- [#1279](https://github.com/JSPrismarine/JSPrismarine/pull/1279) [`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Codecov bundler plugin to vite.

- [`fad26e2`](https://github.com/JSPrismarine/JSPrismarine/commit/fad26e2affc095a94cfaed417891bbc9605af589) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `Server.instance`.
    - Remove passing of version from `@jsprismarine/server` to `@jsprismarine/prismarine`.

- [`91b556d`](https://github.com/JSPrismarine/JSPrismarine/commit/91b556de0064b8e670ea46b61f0c51817ea7b425) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve `js/insecure-randomness`.

- [#1280](https://github.com/JSPrismarine/JSPrismarine/pull/1280) [`c7965d4`](https://github.com/JSPrismarine/JSPrismarine/commit/c7965d446ce591b29e71a75bfed0ae6ca5ef91cb) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix bug resulting in config sometimes being null.
  Fix cases where stdin would continue being held by the process.
  Fix `isConsole` util function on `Entity`.
  Improve console logging.
- Updated dependencies [[`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5), [`52a041c`](https://github.com/JSPrismarine/JSPrismarine/commit/52a041cfa567842ea77196c10434eb42aa9f791b)]:
    - @jsprismarine/color-parser@0.4.0
    - @jsprismarine/errors@0.4.0
    - @jsprismarine/raknet@0.4.0
    - @jsprismarine/nbt@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.3.0
    - @jsprismarine/errors@0.3.0
    - @jsprismarine/nbt@0.3.0
    - @jsprismarine/raknet@0.3.0

## 0.2.0

### Minor Changes

- [#1251](https://github.com/JSPrismarine/JSPrismarine/pull/1251) [`f7e0fc4`](https://github.com/JSPrismarine/JSPrismarine/commit/f7e0fc414117553581aa246eedd3861b2122eadf) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove `experimental-flags`.

### Patch Changes

- [#1259](https://github.com/JSPrismarine/JSPrismarine/pull/1259) [`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1) Thanks [@renovate](https://github.com/apps/renovate)! - Deps: Update dependency @types/node to v20.12.3.

- [#1249](https://github.com/JSPrismarine/JSPrismarine/pull/1249) [`6477e70`](https://github.com/JSPrismarine/JSPrismarine/commit/6477e7079ef9f8eca981f4ab539b7045ee514e2f) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `@jsprismarine/updater`.
    - We don't need an updater at the moment, in the future that job should probably be up to npm/jsr/etc.

- [#1252](https://github.com/JSPrismarine/JSPrismarine/pull/1252) [`6001709`](https://github.com/JSPrismarine/JSPrismarine/commit/6001709dcfddb12e6ddf0c8fe919cabacb5d6122) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix running a command using it's full ID (`/minecraft:help`).

- Updated dependencies [[`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1)]:
    - @jsprismarine/color-parser@0.2.0
    - @jsprismarine/errors@0.2.0
    - @jsprismarine/nbt@0.2.0
    - @jsprismarine/raknet@0.2.0

## 0.1.1

### Patch Changes

- [`323a666`](https://github.com/JSPrismarine/JSPrismarine/commit/323a666b2d4b82e399ff21711ff8cc7ca6f520dd) Thanks [@filiphsps](https://github.com/filiphsps)! - Add safety checks and fix invalid logic.

- [#1231](https://github.com/JSPrismarine/JSPrismarine/pull/1231) [`491b688`](https://github.com/JSPrismarine/JSPrismarine/commit/491b688adc0c38426b767646b6cc748b8e774e30) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `EvalCommand`.
    - It was potentially if not already a security risk.
    - We could potentially add something similar running under a virtual environment in the future, but not a priority at the moment.
    - Fix and substantially improve stdin/tty.
        - There are still ways to go, but it's a lot better now.

- [`20a8ea4`](https://github.com/JSPrismarine/JSPrismarine/commit/20a8ea47c25eaf21548f1994bf915c4c22a0f395) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix `level.json` loading.

- [`7073f41`](https://github.com/JSPrismarine/JSPrismarine/commit/7073f414487b7403765686b05d04f99c6878d88a) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix issue with some commands failing due to a `getParameters()` call.

- [`cdecbaa`](https://github.com/JSPrismarine/JSPrismarine/commit/cdecbaaf823a6f2db15e1793b50da9925deb3716) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly improve circular-dep hell.

- [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5) Thanks [@filiphsps](https://github.com/filiphsps)! - Include CHANGELOG.md with releases.

- Updated dependencies [[`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5), [`c6a627d`](https://github.com/JSPrismarine/JSPrismarine/commit/c6a627da60bae29bd0e6dfead9d44dddbeb0dafd)]:
    - @jsprismarine/color-parser@0.1.1
    - @jsprismarine/raknet@0.1.1
    - @jsprismarine/nbt@0.1.1

## 0.1.0

### Patch Changes

- [#1226](https://github.com/JSPrismarine/JSPrismarine/pull/1226) [`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5) Thanks [@filiphsps](https://github.com/filiphsps)! - - Migrated to vite.
    - The build system has been refactored to support both esm and cjs.
    - Releases are now managed by changeset.
- Updated dependencies [[`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5)]:
    - @jsprismarine/color-parser@0.1.0
    - @jsprismarine/raknet@0.1.0
    - @jsprismarine/nbt@0.1.0
