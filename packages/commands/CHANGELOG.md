# @jsprismarine/commands

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- Updated dependencies [[`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d)]:
  - @jsprismarine/brigadier@0.17.0
  - @jsprismarine/mapping@0.17.0
  - @jsprismarine/minecraft@0.17.0

## 0.16.0

### Minor Changes

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

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`59b7764`](https://github.com/JSPrismarine/JSPrismarine/commit/59b7764f55d61489763474c4e25751ea6a60fa89) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Java Edition command tree data and parser replacement support.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a6ac7fb`](https://github.com/JSPrismarine/JSPrismarine/commit/a6ac7fbf544857054537cae5befea249aa44b186) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/commands`, the data-driven command layer. Mojang publishes Bedrock's whole
  command set as machine-readable data, so the package generates its table from
  `metadata/command_modules/mojang-commands.json` in `Mojang/bedrock-samples` rather than
  hand-writing a tree: 84 commands, 279 overloads, 1186 parameters, 236 command enums holding 14281
  values and 26 basic parameter types, every count asserted by a test.
  
  The command tree is the Brigadier port's own, so Java fork and redirect semantics run server-side,
  and a flattener turns it into the flat overload list `AvailableCommandsPacket` carries.
  Flattening reports rather than drops: a redirect cycle becomes the chained-subcommand encoding
  Mojang itself uses for `/execute`, a redirect to the dispatcher root becomes one `CODEBUILDERARGS`
  parameter, an argument Bedrock has no parameter type for becomes a string, a fork is noted because
  the client cannot run the fan-out, and a self-referential node or an expansion past the overload
  cap is reported as dropped. `buildAvailableCommands` produces the packet's eight fields as values,
  so the package stays free of the protocol and server packages.
  
  `parseSelector(input, dialect)` reads Java's 6 base selectors and 21 arguments or Bedrock's 7 and
  24 into one model, normalizing Bedrock's split ranges, gamemode shorthands and signed count onto
  the Java spelling, and noting every argument that belongs to the other edition instead of dropping
  it.
  
  The command set is 50 commands: the 46 names the two editions share plus `/data`, `/item`,
  `/attribute` and `/random`. `/execute` is a real subcommand chain with Java's 14 subcommands, 13
  `if`/`unless` conditions, 8 `on` relations and 5 `store` targets. Everything that needs world
  state goes through an injected `CommandHost`, and `testCommandHost` builds a fully typed double.
  
  The gamerule registry carries the 26.3 `minecraft:game_rule` names and the 1.21.11 renames, so
  `minecraft:max_command_sequence_length` and `minecraft:max_command_forks` resolve from their
  `maxCommandChainLength` and `maxCommandForkCount` spellings as well.

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

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`f30ee68`](https://github.com/JSPrismarine/JSPrismarine/commit/f30ee68017fdcb4360756d1b2c57f0b8bb578c3e) Thanks [@filiphsps](https://github.com/filiphsps)! - Accept a namespaced dimension id in `/execute in` and `execute if dimension`. `minecraft:the_nether` and a custom `mypack:skylands` were both prefixed with a second `minecraft:`, so only the bare vanilla names resolved. The dimension argument now suggests the host's loaded dimensions, and the Java `minecraft:dimension` parser keeps the Bedrock `Dimension` enum in the command packet.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`8c5e1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/8c5e1ba96ca39d69cab3a221a23bd4d5fe613981) Thanks [@filiphsps](https://github.com/filiphsps)! - Give `/locate` Java's three forms, `structure`, `biome` and `poi`, each taking an id or a `#tag`, and answer the way Java's `LocateCommand` does: `The nearest <name> is at [x, ~, z] (N blocks away)` for a structure, a real height and a three-axis distance for a biome, Java's not-found lines, and the distance as the command result. The name argument suggests Mojang's list plus every id and tag the host's generator knows through the new `WorldCommandHost.locateNames`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`817f97b`](https://github.com/JSPrismarine/JSPrismarine/commit/817f97b219ef9a87d7920194aeeaad70398103a6) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix Java command argument routing for game profiles and resource selectors.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c3f2676`](https://github.com/JSPrismarine/JSPrismarine/commit/c3f2676b1136a21b9df4ee0c5f155017fbb68974) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve command help with pagination, nested syntax, and the `/?` alias.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`62c83dd`](https://github.com/JSPrismarine/JSPrismarine/commit/62c83dda69b32e25c7d21207b30c3a07fde22609) Thanks [@filiphsps](https://github.com/filiphsps)! - Lowercase command registry enum values and send atlas keys for vanilla items that need explicit icons.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`569baa3`](https://github.com/JSPrismarine/JSPrismarine/commit/569baa3a87288d9540b303d280eb0032a3cab736) Thanks [@filiphsps](https://github.com/filiphsps)! - Pass the command source dimension through `/summon` so entities enter the selected world.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`245a4ba`](https://github.com/JSPrismarine/JSPrismarine/commit/245a4ba580b33366701f3f19fc6dc19eec24a2ea) Thanks [@filiphsps](https://github.com/filiphsps)! - Add locate registry name completion
- Updated dependencies [[`f5ea701`](https://github.com/JSPrismarine/JSPrismarine/commit/f5ea701bd7297d63eb524be1d4b76c07cf204569), [`428fd29`](https://github.com/JSPrismarine/JSPrismarine/commit/428fd2953c93ea8472696575798735a4a36ec51b), [`91a7a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/91a7a0bfac2eac8c81961d5263e54b53dc0c3fc5), [`232a1ce`](https://github.com/JSPrismarine/JSPrismarine/commit/232a1ce20b5ade2e33b703300fb671f0c3f62076), [`cde1039`](https://github.com/JSPrismarine/JSPrismarine/commit/cde1039d276df8d3787b361e072fafdb32a6da9a), [`f8a43ce`](https://github.com/JSPrismarine/JSPrismarine/commit/f8a43ce910da3d8e1c88091c8886a7c1d09ab0c0), [`1583bc0`](https://github.com/JSPrismarine/JSPrismarine/commit/1583bc08667502a555ca4bb43056bf98c5f66f20), [`59b7764`](https://github.com/JSPrismarine/JSPrismarine/commit/59b7764f55d61489763474c4e25751ea6a60fa89), [`42adf17`](https://github.com/JSPrismarine/JSPrismarine/commit/42adf17723e47eb83a36561e13e643805068805a), [`28b5c00`](https://github.com/JSPrismarine/JSPrismarine/commit/28b5c00af0d5377e7030e82d409b6def544619ba), [`f370405`](https://github.com/JSPrismarine/JSPrismarine/commit/f37040563ed0cac590fe971ef3a448cb2e01a581), [`c1591b1`](https://github.com/JSPrismarine/JSPrismarine/commit/c1591b1e567a51dc80ecbbdfdbdc8e7c7f4f6c42), [`f544fb4`](https://github.com/JSPrismarine/JSPrismarine/commit/f544fb40304013ab7bf257d030a75eab0346719c), [`c9cafc8`](https://github.com/JSPrismarine/JSPrismarine/commit/c9cafc8529e05fe90ea2812920feb76cbcaf4a1b), [`8518afc`](https://github.com/JSPrismarine/JSPrismarine/commit/8518afc7b9ee684ebe4255ce26e7b56d612a145a), [`08de1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/08de1bac21f3c5785a02649e4faa11d9a11f82b0), [`9d93172`](https://github.com/JSPrismarine/JSPrismarine/commit/9d931725e8d48fab773c2fe9f659b2f3e1d26325), [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a), [`f0584a3`](https://github.com/JSPrismarine/JSPrismarine/commit/f0584a381c6bab5c61e5aa2cd3782218bc8d74e7), [`9b7576e`](https://github.com/JSPrismarine/JSPrismarine/commit/9b7576eb0c331f5cc07fdfab59ac031a0a4549ca), [`32ce6f2`](https://github.com/JSPrismarine/JSPrismarine/commit/32ce6f2f752e7e89c4445d1936e13a6e243a3a30), [`9e53c61`](https://github.com/JSPrismarine/JSPrismarine/commit/9e53c61399266bf9e26dd87160c45ccd251a21f8), [`8b1bf1b`](https://github.com/JSPrismarine/JSPrismarine/commit/8b1bf1b337e7cb9e1d8f61d8df8b42e2b2badcb6), [`23450ee`](https://github.com/JSPrismarine/JSPrismarine/commit/23450ee6e61092c05e2cebeca492c95b28e8da0d)]:
  - @jsprismarine/minecraft@0.16.0
  - @jsprismarine/mapping@0.16.0
  - @jsprismarine/brigadier@0.16.0
