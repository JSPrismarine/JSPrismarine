# @jsprismarine/commands

## 0.27.0

### Minor Changes

- [#3833](https://github.com/JSPrismarine/JSPrismarine/pull/3833) [`8fc6f7f`](https://github.com/JSPrismarine/JSPrismarine/commit/8fc6f7fc20630e20abacc8ec3294a5e3fe7e4fa4) Thanks [@filiphsps](https://github.com/filiphsps)! - Players now have a recipe book, as in Java. The Bedrock recipe book shows only the recipes a player has unlocked, so filtering it to craftable recipes no longer lists recipes the player cannot make. A recipe is unlocked by `/recipe give` or by an advancement's `rewards.recipes`, which is how vanilla's `recipes/` advancements unlock a recipe once the player holds one of its ingredients. Each unlock raises the `recipe_unlocked` trigger. The book is saved in the player record as `recipeBook`, and a record saved before this change gets the recipes its completed advancements reward.
  
  Crafting table recipes go out in `CraftingDataPacket` with an unlocking requirement the client does not meet on its own, and the server sends the book with `UnlockedRecipesPacket` at join and after every change. `NetworkContentPayloads` has a new `bookEntriesByRecipe` map, `SessionPresenter` has a new `showRecipeBook` method, and `BedrockPresenter` takes an optional second argument that names each recipe's book entries.
  
  `ServerCommandHost.recipes` in `@jsprismarine/commands` now returns one `RecipeChange` per player instead of a count, and `/recipe` gives Java's feedback: the number of recipes unlocked or taken, and the player's name when only one player's book changed. Naming a recipe the book does not hold answers `Unknown recipe: <id>`.

- [#3868](https://github.com/JSPrismarine/JSPrismarine/pull/3868) [`52d2fac`](https://github.com/JSPrismarine/JSPrismarine/commit/52d2fac490a5762c20728e009d00b5cd7d7745ae) Thanks [@filiphsps](https://github.com/filiphsps)! - `/scoreboard objectives add` checks its criterion as Java does and hands the host the criterion's full name, so `custom:play_time` arrives as `minecraft.custom:minecraft.play_time`, and an unknown criterion is a syntax error. The new `@jsprismarine/commands/criteria` module looks criteria up with `criterionByName`. `ContentRegistryIds.statistics` lists the entries each statistic type counts, and the criterion is checked against it. `setdisplay` takes Java's `below_name` as well as `belowname`, and hands the host `belowname` for both. `scoreboard players set`, `add`, `remove` and `operation` refuse a read-only objective such as `health`, while `execute store` still writes it. `scoreboard objectives modify <objective> displayname` renames an objective. `ScoreboardCommandHost` gains two required members, `criterionOf` and `setDisplayName`, so a host that implements it has to add them.

### Patch Changes

- [#3743](https://github.com/JSPrismarine/JSPrismarine/pull/3743) [`ddbf63c`](https://github.com/JSPrismarine/JSPrismarine/commit/ddbf63cd7d5c971e4ef224f11c72f5227acc5816) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies

- [#3758](https://github.com/JSPrismarine/JSPrismarine/pull/3758) [`f71822e`](https://github.com/JSPrismarine/JSPrismarine/commit/f71822e9a631edf44c55b8fbe70dfc9a728e78cc) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies

- [#3900](https://github.com/JSPrismarine/JSPrismarine/pull/3900) [`36b2e68`](https://github.com/JSPrismarine/JSPrismarine/commit/36b2e68d104716d104f3d90b5e5776d0861e7fb2) Thanks [@filiphsps](https://github.com/filiphsps)! - `/help` lists only the commands a player may run. The page list, `/help <command>` and the subcommands and forms it shows leave out every command the player's permission nodes or level refuse, and `/help op` for a player who may not run `/op` answers as it does for an unknown command. The console still sees every command. `CommandHost.server.usage` takes the source that asked as an optional second argument, and `CommandManager.usageLines` takes it too.
- Updated dependencies [[`44c0251`](https://github.com/JSPrismarine/JSPrismarine/commit/44c02515fa4810e75de3185001a8490aa7766ebd), [`c836dac`](https://github.com/JSPrismarine/JSPrismarine/commit/c836dac76a41e697fb7c8d1594224cdaf5cdbece), [`edb1160`](https://github.com/JSPrismarine/JSPrismarine/commit/edb116075c62fa251747acaf9d6db80bf1b448c4), [`3a7e94b`](https://github.com/JSPrismarine/JSPrismarine/commit/3a7e94b89acda05d76e99409711ea15afd122c0f), [`d4faaf4`](https://github.com/JSPrismarine/JSPrismarine/commit/d4faaf4250ea34c1f244a7a5047072c7dcff8b6b), [`17718cc`](https://github.com/JSPrismarine/JSPrismarine/commit/17718cc881c0d491e01c5f35dae0e3b9bf21dc5e), [`88fc786`](https://github.com/JSPrismarine/JSPrismarine/commit/88fc78645d05b732a620dbfcc6ee2a106950c093), [`ddbf63c`](https://github.com/JSPrismarine/JSPrismarine/commit/ddbf63cd7d5c971e4ef224f11c72f5227acc5816), [`f71822e`](https://github.com/JSPrismarine/JSPrismarine/commit/f71822e9a631edf44c55b8fbe70dfc9a728e78cc), [`ffb86ad`](https://github.com/JSPrismarine/JSPrismarine/commit/ffb86ad9e67431eeb9f1568ea66758a5cbffd050), [`78a7882`](https://github.com/JSPrismarine/JSPrismarine/commit/78a788299aea78261d12c200641934a48ee1e30b), [`cf7fe3c`](https://github.com/JSPrismarine/JSPrismarine/commit/cf7fe3c485a52482dcdbda6da2f822749b256f36), [`7756f1c`](https://github.com/JSPrismarine/JSPrismarine/commit/7756f1c349bb40b381252a231d6fd4b6518ae997), [`6580502`](https://github.com/JSPrismarine/JSPrismarine/commit/6580502b8aa1bab3091d98d581fd3501d5049b36), [`832bd7b`](https://github.com/JSPrismarine/JSPrismarine/commit/832bd7b2e1237f1cc98622cdcb1c21a3a6d37503), [`68a0e1b`](https://github.com/JSPrismarine/JSPrismarine/commit/68a0e1b820981bab5d69830066d824ca937e1021), [`14aeb2c`](https://github.com/JSPrismarine/JSPrismarine/commit/14aeb2cf0b75913f02907de47112af392f517d53), [`c35144a`](https://github.com/JSPrismarine/JSPrismarine/commit/c35144acb33d5b1a6237c523595df8674e349a0f), [`0cd4ddb`](https://github.com/JSPrismarine/JSPrismarine/commit/0cd4ddb62d4a05f212368dbca7f217a8bb3a7f08), [`fd07315`](https://github.com/JSPrismarine/JSPrismarine/commit/fd07315101923766c69a1f1fd2981de9afb9cf99), [`37722e2`](https://github.com/JSPrismarine/JSPrismarine/commit/37722e2d12c913328b9dfa9776e70b6300868d5e), [`dfe4b85`](https://github.com/JSPrismarine/JSPrismarine/commit/dfe4b85f7b9c075988d0231f4fb48e572e332ce1)]:
  - @jsprismarine/errors@0.27.0
  - @jsprismarine/mapping@0.27.0
  - @jsprismarine/brigadier@0.27.0
  - @jsprismarine/minecraft@0.27.0

## 0.26.0

### Minor Changes

- [#3680](https://github.com/JSPrismarine/JSPrismarine/pull/3680) [`bc7e7c2`](https://github.com/JSPrismarine/JSPrismarine/commit/bc7e7c2d9ded65c6713e4ca5e43b90365b538ef2) Thanks [@filiphsps](https://github.com/filiphsps)! - `execute if items` counts the items in the slots it names that match Java's item predicate, instead of reading the slot name as an NBT path, and takes its `block <pos>` form and every entity a selector matches. `DataCommandHost` has a new required verb, `countSlotItems`, which a host implements to answer it. The `minecraft:item_predicate` argument reads component tests in brackets, with spaces inside quotes, and is no longer a loot table id.

- [#3680](https://github.com/JSPrismarine/JSPrismarine/pull/3680) [`9184280`](https://github.com/JSPrismarine/JSPrismarine/commit/918428018be06df4cba3c9420ef0553d490152b7) Thanks [@filiphsps](https://github.com/filiphsps)! - `execute if slots (block <pos>|entity <targets>) <slot_source>` counts the slots a slot source selects, instead of answering 0, and `execute if items` reads its slots as a slot source too, as Java 26.3 does. A slot source is a slot name, the id or `#tag` of a datapack's slot source, or one written as SNBT, and all six of Java's types are evaluated. `DataCommandHost` has a new required verb, `countSlots`, which a host implements to answer it.

### Patch Changes

- [#3709](https://github.com/JSPrismarine/JSPrismarine/pull/3709) [`ec53015`](https://github.com/JSPrismarine/JSPrismarine/commit/ec53015a6a6466cc10c65f7ce3df31238b49ac7b) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies

- [#3726](https://github.com/JSPrismarine/JSPrismarine/pull/3726) [`c59ae85`](https://github.com/JSPrismarine/JSPrismarine/commit/c59ae850f9b6cccbacbadabc233c5ca534234b1f) Thanks [@filiphsps](https://github.com/filiphsps)! - `/fill … replace <filter>` replaces only the blocks the filter names. The `fill` tree read no filter after `replace`, so the command filled the whole region. It now takes Bedrock's `replaceTileName` and `replaceBlockStates` after `replace`, and refuses a filter after any other mode. A filter with no states matches every state of its block, so `replace minecraft:portal` finds a portal on either axis; one with states matches only the states it lists.
- Updated dependencies [[`ec53015`](https://github.com/JSPrismarine/JSPrismarine/commit/ec53015a6a6466cc10c65f7ce3df31238b49ac7b), [`6b879ba`](https://github.com/JSPrismarine/JSPrismarine/commit/6b879ba04da81bbc81e3d9652c70c8699d91130f), [`42d89cb`](https://github.com/JSPrismarine/JSPrismarine/commit/42d89cb12a2d727d59651fb0b3799e39bc9871bd), [`ea601a5`](https://github.com/JSPrismarine/JSPrismarine/commit/ea601a5497b38b1357c3c83d23e202921ef5b698)]:
  - @jsprismarine/brigadier@0.26.0
  - @jsprismarine/errors@0.26.0
  - @jsprismarine/mapping@0.26.0
  - @jsprismarine/minecraft@0.26.0

## 0.25.0

### Minor Changes

- [#3653](https://github.com/JSPrismarine/JSPrismarine/pull/3653) [`2aeca21`](https://github.com/JSPrismarine/JSPrismarine/commit/2aeca21e5f8099902f4db6ffc78c6c59a84402a2) Thanks [@filiphsps](https://github.com/filiphsps)! - Adds `/allowlist`, with Java's `/whitelist` as its alias: `add`, `remove`, `list`, `on`, `off` and `reload`, answering with the lines Bedrock Dedicated Server's console prints for each. `/allowlist on` is refused while `online-mode` is off, as on BDS. A player whose allow list entry has `ignoresPlayerLimit` set now joins a full server.
  
  `ServerCommandHost` has a new `allowList` member, so a host that implements it has to add one. The `minor` bump is that change.

- [#3590](https://github.com/JSPrismarine/JSPrismarine/pull/3590) [`11bef4d`](https://github.com/JSPrismarine/JSPrismarine/commit/11bef4dd11a310c1bd5c3d75efb2d9ae640af072) Thanks [@filiphsps](https://github.com/filiphsps)! - `DataCommandHost.getData` takes an optional scale and returns `{ snbt, result }`, the tag and the number Java's `/data get` returns, so the command no longer reads its result from the printed text. `runFunction` takes a `stored` flag, set when the argument compound is a stored one printed back, so a printed `Infinityd` reads as a number. `modifyData` takes a `DataModifySource`, either a typed value or another target to read from, and returns how many tags changed; `removeData` returns how many tags it removed.
  
  The tree gains `/data modify … from (block|entity|storage) <source> [<sourcePath>]` and `/function <name> with (block|entity|storage) <source> [<path>]`. A `with` source that is missing or not a compound fails the line, as in Java, and so does a `/data get` that matches nothing and a `/data merge|modify|remove` that changes nothing, so `execute store success` stores 0; `commands/support` exports the `refuse` it fails with. `/data` prints Java's feedback. `execute store … <type> <scale>` writes a typed tag, cast the way Java casts it (`5b`, `-56b`, `5L`, `5.0f`). `execute store … bossbar` writes into the storage `jsprismarine:bossbar/<namespace>/<path>`, which is a valid resource location, and stores again: the Java routes merged into the tree had been taking the line and dropping the store. An NBT path argument keeps a quoted key with a space in it, such as `a."b c"`, and a pattern with spaces, such as `Items[{id: "minecraft:stone"}]`.

- [#3590](https://github.com/JSPrismarine/JSPrismarine/pull/3590) [`9936ad9`](https://github.com/JSPrismarine/JSPrismarine/commit/9936ad9a4438618b2347363cfa3107aadb0aeb43) Thanks [@filiphsps](https://github.com/filiphsps)! - The slot verbs take what has slots and nothing else: `SlotTarget`, a block or an entity, which `DataTarget` now extends with the storage form. `setSlot`, `applyItemModifier` and `copySlots` take every target a line names instead of one, and `LootDestination`'s `replace` carries `targets`, so `/loot replace` rolls once for all of them as Java does. `setSlot` takes a `SlotWriteMode`, which adds Java's `fill` and `override` to Bedrock's `replace`, `destroy` and `keep`, and returns how many slots it wrote. `copySlots` takes the sources, the targets, the mode and the modifier in that order.
  
  `/item replace|fill|override … from` takes a source of either kind under either target, named `source`, where it took only a source of the target's own kind under the target's argument name. `/item` reports Java's `Replaced N slot(s) on <target>`, and `/replaceitem` reports Bedrock's `Replaced <slot> slot <n> of <target> with <count> * <item>`, or that the slot was occupied when `keep` left it.

### Patch Changes

- [#3656](https://github.com/JSPrismarine/JSPrismarine/pull/3656) [`d8c99ac`](https://github.com/JSPrismarine/JSPrismarine/commit/d8c99ace8564fd624413a972103b4e057a4a916f) Thanks [@filiphsps](https://github.com/filiphsps)! - Command blocks keep the command a player sets and run it. An operator in creative mode opens a command block's screen, and the edit is stored in the block's `CommandBlock` block entity, under Bedrock's own tags. An impulse block runs on the rising edge of redstone power, a repeating block runs every tick while powered or always active, and the chain blocks in front of a block that ran follow it, with conditional blocks reading the success of the block behind them. Bedrock's tick delay and "execute on first tick" apply, and a comparator reads a block's success count. The `commandblocksenabled` game rule turns them off.
  
  A command block minecart keeps a command it is given and runs it, as the cart, every four ticks over a powered activator rail, as Java's does. Its screen does not show the stored command yet ([#3655](https://github.com/JSPrismarine/JSPrismarine/issues/3655)).
  
  `@jsprismarine/block-behaviors` adds the `jsprismarine:command_block` family and an optional `WorldActions.runCommand`. A `CommandSource` can carry a `name` that `/say` and `/me` speak as when it has no entity.

- [#3621](https://github.com/JSPrismarine/JSPrismarine/pull/3621) [`e4ee0ab`](https://github.com/JSPrismarine/JSPrismarine/commit/e4ee0aba17dd623984e7bd40b0adf77d09669868) Thanks [@filiphsps](https://github.com/filiphsps)! - `buildAvailableCommands` lists every command name and alias in the `CommandName` enum and names each alias enum after its command, such as `teleportCommandAliases`, as a Bedrock Dedicated Server does. A Bedrock client offers a namespaced command, such as `jsp:tpsbar`, in autocomplete only when `CommandName` lists it. `@jsprismarine/commands/flatten` exports `COMMAND_NAME_ENUM`, `aliasEnumName` and `commandNames`.

- [#3626](https://github.com/JSPrismarine/JSPrismarine/pull/3626) [`5071b80`](https://github.com/JSPrismarine/JSPrismarine/commit/5071b805cf863783709293c5d4709e37496aab3b) Thanks [@filiphsps](https://github.com/filiphsps)! - The command packet leaves out any keyword with an uppercase letter, such as `/gamerule`'s pre-1.21.11 `doDaylightCycle`. A Bedrock client refused each one and logged "Keywords in commands need to be lower case". The server still accepts those names when a player types them, and each one adds an `uppercase-keyword` note to the flatten result.
- Updated dependencies [[`dda9dbe`](https://github.com/JSPrismarine/JSPrismarine/commit/dda9dbe5ebfdcdc338e37bf24ae8fe561c9308bb), [`2bc46a0`](https://github.com/JSPrismarine/JSPrismarine/commit/2bc46a044e70e952719e26eab1b3743b94752efd), [`2132959`](https://github.com/JSPrismarine/JSPrismarine/commit/2132959244601c90055b091a4273a008eadf0f3d), [`d4adb53`](https://github.com/JSPrismarine/JSPrismarine/commit/d4adb5381a368d2076a0648ce2522c12cf72ab48), [`27c272f`](https://github.com/JSPrismarine/JSPrismarine/commit/27c272f90af03738b7fd9778e2bddea955fe9cb6), [`d1e9714`](https://github.com/JSPrismarine/JSPrismarine/commit/d1e97142dcfdab12f895719eca9bcbee78346c9a), [`47aad59`](https://github.com/JSPrismarine/JSPrismarine/commit/47aad598440fd81e5177c60ffeb49972ce697960), [`fc513cf`](https://github.com/JSPrismarine/JSPrismarine/commit/fc513cf74a16caf6f9da30f3323b094c519d1043), [`253f214`](https://github.com/JSPrismarine/JSPrismarine/commit/253f214c096cad79e6f53cd8a88a828b262af315), [`c053dfc`](https://github.com/JSPrismarine/JSPrismarine/commit/c053dfcdd32006386469c31b8448cdfa33b9333f), [`239659a`](https://github.com/JSPrismarine/JSPrismarine/commit/239659a6927aa7f2b713ad994fe92fab0f2cece9), [`fea2fcd`](https://github.com/JSPrismarine/JSPrismarine/commit/fea2fcd1d4424bf4c766ba996e9eb0ceb742310a), [`055b1ca`](https://github.com/JSPrismarine/JSPrismarine/commit/055b1ca984f47515b42af6109ea88a7ec7b4d451), [`f76f4f2`](https://github.com/JSPrismarine/JSPrismarine/commit/f76f4f25eb0449327fcc06b46797588a0b6879ff), [`c6fc056`](https://github.com/JSPrismarine/JSPrismarine/commit/c6fc056233588d453bcb33febae92189ecfc8b4b)]:
  - @jsprismarine/errors@0.25.0
  - @jsprismarine/brigadier@0.25.0
  - @jsprismarine/mapping@0.25.0
  - @jsprismarine/minecraft@0.25.0

## 0.24.0

### Patch Changes

- [#3485](https://github.com/JSPrismarine/JSPrismarine/pull/3485) [`bc200dd`](https://github.com/JSPrismarine/JSPrismarine/commit/bc200dddd1ec968e72710d234296669808aef360) Thanks [@filiphsps](https://github.com/filiphsps)! - Run a command at an entity in a level other than the default in that level, rather than in the default level at its coordinates. The server names such a level in the dimension a command carries, as `minecraft:overworld@<level>`, and `WorldCommandHost` gains an optional `dimensionIn` that `execute in` and `execute if dimension` ask, so they keep the source's level.
- Updated dependencies [[`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a), [`1f3b347`](https://github.com/JSPrismarine/JSPrismarine/commit/1f3b347d94e934767993eb3506a412b01d334a0b), [`3c19f11`](https://github.com/JSPrismarine/JSPrismarine/commit/3c19f11b712b228563d7af7fc5f6df6995726fe3), [`f4eb592`](https://github.com/JSPrismarine/JSPrismarine/commit/f4eb5921862accbb5e07749c38bd1c63495587a0), [`a19ba96`](https://github.com/JSPrismarine/JSPrismarine/commit/a19ba968ae53bd5c34c9515227a9d08ff7c69e33), [`a64ab41`](https://github.com/JSPrismarine/JSPrismarine/commit/a64ab41bf639ffb0144117810600a4abf306a850), [`05f03f7`](https://github.com/JSPrismarine/JSPrismarine/commit/05f03f78e186000a5e76cc34894a61a384ca5333), [`02d9cb6`](https://github.com/JSPrismarine/JSPrismarine/commit/02d9cb69d53cf22a406dd86e95f08b2bbc48eb5c), [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5), [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a), [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa), [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca), [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4), [`e515b52`](https://github.com/JSPrismarine/JSPrismarine/commit/e515b52206a0e9ce6223c860ab6bcb0da6483643)]:
  - @jsprismarine/errors@0.24.0
  - @jsprismarine/mapping@0.24.0
  - @jsprismarine/brigadier@0.24.0
  - @jsprismarine/minecraft@0.24.0

## 0.23.2

### Patch Changes

- Updated dependencies [[`5f48cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/5f48cd10e4ca5b53ef19ebd214b70b1de18acca9)]:
  - @jsprismarine/errors@0.23.2
  - @jsprismarine/brigadier@0.23.2
  - @jsprismarine/mapping@0.23.2
  - @jsprismarine/minecraft@0.23.2

## 0.23.1

### Patch Changes

- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/brigadier@0.23.1
  - @jsprismarine/errors@0.23.1
  - @jsprismarine/mapping@0.23.1
  - @jsprismarine/minecraft@0.23.1

## 0.23.0

### Minor Changes

- [#3340](https://github.com/JSPrismarine/JSPrismarine/pull/3340) [`4787e9f`](https://github.com/JSPrismarine/JSPrismarine/commit/4787e9f6008e798c737605872a81d216fbe789a0) Thanks [@filiphsps](https://github.com/filiphsps)! - Hold the time of day still while `doDayLightCycle` is off or a script paused the overworld clock, and keep the game clock running, since scheduled block ticks count by it. `/time set` and `/time add` move the time of day alone, `/time query gametime` reads the game clock, and `level.dat` saves the two as Bedrock does, under `Time` and `currentTick`. A save without `currentTick` loads its `Time` as both. `WorldCommandHost` has a new required `getGameTime()`.

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Every error the packages throw is now defined in `@jsprismarine/errors`, with a stable code, a `docs` link to its entry in the new error reference at https://jsprismarine.dev/errors/, and the values its message was built from. Each error still extends the class it did, such as `TypeError` or `CorruptionError`, and keeps its message, with three exceptions: `getGametypeName` now names the game mode it refused, the NetherNet signaling server answers a bad join path with `Expected /v1/join/<networkId>`, since braces mark a value in a catalog message, and `SnbtSyntaxError` no longer carries an `offset`.
  
  The error classes a package used to export now come from its catalog in `@jsprismarine/errors`. Import `CorruptionError`, `DatabaseLockedError` and `UnsupportedVersionError` from `@jsprismarine/errors/leveldb`, `LoginRefused` from `@jsprismarine/errors/auth`, `ZipError`, `FilterParseError`, `JsonParseError` and `BrarchiveError` from `@jsprismarine/errors/packs`, and so on for `KernelError`, `ContentError`, `BlockError`, `StructureFormatError`, `SelectorSyntaxError`, `MolangSyntaxError`, `NumberProviderError`, `NativeLibraryError`, `NetherNetUnavailableError`, `UdpPortsError`, `JoinRefusedError`, `UsageError` and `ChunkReadOutOfWindowError`. `LoginRefused` keeps its `detail`, now read from its cause. `@jsprismarine/errors` drops its `Error` class, the `ErrorKind` enum and its six error classes; `getGametypeName` and `getGametypeId` throw `MinecraftErrors.GametypeInvalid`, and `PermissionManager.setOp` throws `PrismarineServerErrors.PlayerNotFound`. `NBTStreamReader.readLength` and `expectInput` take the error class to throw instead of a message, and `fail` in `@jsprismarine/features` takes the error to throw.

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [`bf0e7ac`](https://github.com/JSPrismarine/JSPrismarine/commit/bf0e7ac428a14e0790d36c47e48ef9e2b92a68d3) Thanks [@filiphsps](https://github.com/filiphsps)! - Read a command line as the Bedrock Dedicated Server does. Any run of spaces separates two arguments, and when no form of a command reads the whole line, the syntax error points at the first word none of them could read. `/time set` takes a whole tick count, negative or not, and refuses a fraction or a unit such as `1d`. `/effect` takes Bedrock's forms, `effect <player> <effect> [seconds] [amplifier] [hideParticles]` and `effect <player> clear [effect]`, beside Java's `effect give` and `effect clear`.

- [`51661f9`](https://github.com/JSPrismarine/JSPrismarine/commit/51661f9286511af9ce29e9501921f52fee4febe9) Thanks [@filiphsps](https://github.com/filiphsps)! - Word a command line's syntax error the way the Bedrock Dedicated Server does, `Syntax error: Unexpected "nonsense": at "/time set >>nonsense<<"`, in chat and at the console, instead of Brigadier's message. `@jsprismarine/commands/syntaxError` exports `bedrockSyntaxError`, which builds that message from a `CommandSyntaxException`. `/time set` now refuses a word that names no time of day as a syntax error.

- [#3288](https://github.com/JSPrismarine/JSPrismarine/pull/3288) [`4edc710`](https://github.com/JSPrismarine/JSPrismarine/commit/4edc710f003d7abf998c9cf232f7c45a6424ace2) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the `unhandledJavaTypes` module, the reviewed list of Java gamerules the gamerule table has no row for. A test checks it against the pinned Java registry report.

- [#3340](https://github.com/JSPrismarine/JSPrismarine/pull/3340) [`61a9376`](https://github.com/JSPrismarine/JSPrismarine/commit/61a937618fc893e56e73719a572de23cc2a2330c) Thanks [@filiphsps](https://github.com/filiphsps)! - Take `true` or `false` for `/gamerule dofiretick` and `/gamerule doFireTick`, as Bedrock's `BoolGameRule` enum lists them. Java made the rule the integer `minecraft:fire_spread_radius_around_player`, so the command refused a boolean and a Bedrock player could not turn fire spread off.

- [#3259](https://github.com/JSPrismarine/JSPrismarine/pull/3259) [`357c93f`](https://github.com/JSPrismarine/JSPrismarine/commit/357c93f46d12599b79670adc65a401d7c4397a45) Thanks [@filiphsps](https://github.com/filiphsps)! - Regenerate the tables that read the default Bedrock data against Bedrock Dedicated Server 1.26.60.6 and `bedrock-samples` v1.26.60.5: the item type table, the goal inventory, the Bedrock command table and the structure state transforms.

- [`ddcf0ff`](https://github.com/JSPrismarine/JSPrismarine/commit/ddcf0ffdf3dc9dfb8b84ed4db6a8f8fc724cee02) Thanks [@filiphsps](https://github.com/filiphsps)! - Check the permission node of every command a line reaches, not only the one typed: a command nested in `/execute ... run` or run from a function is gated on the node and level of the player who typed the line, so holding `minecraft.command.execute` no longer stands in for the node of the command it runs. `CommandRegistryOptions` gains `canUse`, the gate the dispatcher asks by command name wherever it parses a command's root literal or alias, and `CommandSource.caller` is set only for a player who typed the line, never defaulted from the entity a script or a function runs as.

- [#3218](https://github.com/JSPrismarine/JSPrismarine/pull/3218) [`5e5c465`](https://github.com/JSPrismarine/JSPrismarine/commit/5e5c46591205225dfb8339e6279fdf686d84244d) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `/tickingarea`. A ticking area's chunks load, stay loaded and tick with no player near, so a mob in one updates. The command and a script's `world.tickingAreaManager` keep their areas apart. Behavior pack scripts now also reach the level's time, spawn, difficulty, game rules, music, light, biomes, explosions, loot tables and fog stacks, and a script's debug shape is drawn only for the players it names.

- [`8c745bb`](https://github.com/JSPrismarine/JSPrismarine/commit/8c745bb1367a5d24193983547167514049654c63) Thanks [@filiphsps](https://github.com/filiphsps)! - Answer `/time set` as Bedrock 1.26.60 does. The answer names the source's dimension, `Set the time of 'minecraft:overworld' to 1000`. A negative tick count is refused with `Cannot set time to before 0 ticks, the number must be at least 0`, and a word that names no time marker with `Cannot find time marker 'nonsense' on 'minecraft:overworld'` instead of a syntax error.

- [`3c7a098`](https://github.com/JSPrismarine/JSPrismarine/commit/3c7a09872272cac3aa07809e0fba3879769708ae) Thanks [@filiphsps](https://github.com/filiphsps)! - The console's usage card now knows how many words each argument takes, so in `tp @s 0 64` it keeps `<position>` marked through all three coordinates instead of moving on to the next argument. Argument types say how many words they read (`argumentWords`): three for a position, two for a Java rotation or two-dimensional position, and the rest of the line for a message, JSON, NBT or a nested command. `CommandManager.commandReference()` sends a count for each part of each form as `usageWords`, and the console protocol's `CommandInfo` carries it.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`a479514`](https://github.com/JSPrismarine/JSPrismarine/commit/a479514a5fd26c18f49895ee7e5578c0d880d000), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`2dd8ff2`](https://github.com/JSPrismarine/JSPrismarine/commit/2dd8ff2fda5afab035cae34e1542c73443cfeb3b), [`2d461cb`](https://github.com/JSPrismarine/JSPrismarine/commit/2d461cbe0f493a6482b19ba298df277fb95cf4bb), [`4d92994`](https://github.com/JSPrismarine/JSPrismarine/commit/4d929943617a9cd77d55fb8b2cdd6343665152b4), [`c1f1339`](https://github.com/JSPrismarine/JSPrismarine/commit/c1f1339aea746b7a86016ba68739517049d8967e), [`b29c5de`](https://github.com/JSPrismarine/JSPrismarine/commit/b29c5deca0848f515161b10344af46b7a2d8b430), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0
  - @jsprismarine/brigadier@0.23.0
  - @jsprismarine/minecraft@0.23.0
  - @jsprismarine/mapping@0.23.0

## 0.22.0

### Patch Changes

- [`af72b29`](https://github.com/JSPrismarine/JSPrismarine/commit/af72b2965f9f430f47d31636ec623496c79d6356) Thanks [@filiphsps](https://github.com/filiphsps)! - Write chained subcommands the way a Bedrock Dedicated Server does. Each value pair in `buildAvailableCommands`'s `chainedSubcommands` now names the keyword's enum in `second` instead of repeating `first`, and a chained parameter's parse symbol is `Chained | Valid | index` instead of an enum's. `ParameterTypeFlag.Chained` and `chainedParseSymbol` build that word.

- [`31cb079`](https://github.com/JSPrismarine/JSPrismarine/commit/31cb0792a2e01450ae55bac5881c2c1df3bd1ff3) Thanks [@filiphsps](https://github.com/filiphsps)! - Mark every flattened overload that starts with one of its command's chained keywords as chaining, so `buildAvailableCommands` sends `/execute run <command>` as chaining, the way a Bedrock Dedicated Server does.

- [`49c8e60`](https://github.com/JSPrismarine/JSPrismarine/commit/49c8e60a1de3b304a78f2010a849ac9b2d5c6bd9) Thanks [@filiphsps](https://github.com/filiphsps)! - Give `CODEBUILDERARGS`, the command `/execute run` takes, the type id 90 a Bedrock Dedicated Server writes, not 92. `AvailableCommandsPacket` now decodes a real server's packet, which it rejected as carrying an unknown parse symbol.

- [`d50b18c`](https://github.com/JSPrismarine/JSPrismarine/commit/d50b18c84aa4094e2e3fe347dfc426b93f16727c) Thanks [@filiphsps](https://github.com/filiphsps)! - Accept a named time of day in `/time set`: `day`, `sunrise`, `noon`, `sunset`, `night` and `midnight`, with or without the `minecraft:` namespace. The command used to pass the name through as the time.
- Updated dependencies [[`546c624`](https://github.com/JSPrismarine/JSPrismarine/commit/546c624aaeeefec693909b9e3413819d3bb45f9f)]:
  - @jsprismarine/mapping@0.22.0
  - @jsprismarine/minecraft@0.22.0
  - @jsprismarine/brigadier@0.22.0

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6
- Updated dependencies [[`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c)]:
  - @jsprismarine/brigadier@0.21.0
  - @jsprismarine/mapping@0.21.0
  - @jsprismarine/minecraft@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`4871ae6`](https://github.com/JSPrismarine/JSPrismarine/commit/4871ae64bf290095e3af06a7d7e13206d2989d16)]:
  - @jsprismarine/minecraft@0.20.0
  - @jsprismarine/mapping@0.20.0
  - @jsprismarine/brigadier@0.20.0

## 0.19.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/brigadier@0.19.2
  - @jsprismarine/mapping@0.19.2
  - @jsprismarine/minecraft@0.19.2

## 0.19.1

### Patch Changes

- Updated dependencies [[`5129bc5`](https://github.com/JSPrismarine/JSPrismarine/commit/5129bc5166f8a781bd3f928e24b687744cdbd8c9)]:
  - @jsprismarine/mapping@0.19.1
  - @jsprismarine/brigadier@0.19.1
  - @jsprismarine/minecraft@0.19.1

## 0.19.0

### Patch Changes

- [`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Point the Discord link in each package README at the project's current invite.

- [`eb04946`](https://github.com/JSPrismarine/JSPrismarine/commit/eb04946cd703e5ff3734091a4998b8beee0fc75a) Thanks [@filiphsps](https://github.com/filiphsps)! - `/gamerule` now takes a rule's pre-1.21.11 camelCase name and Bedrock's lowercase name as well as its 1.21.11 id, so `gamerule doMobSpawning false` and `gamerule domobspawning false` set `minecraft:spawn_mobs`. Before, only the 1.21.11 id parsed, although the module header said the old names did.
- Updated dependencies [[`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e)]:
  - @jsprismarine/brigadier@0.19.0
  - @jsprismarine/minecraft@0.19.0
  - @jsprismarine/mapping@0.19.0

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5)]:
  - @jsprismarine/brigadier@0.18.0
  - @jsprismarine/mapping@0.18.0
  - @jsprismarine/minecraft@0.18.0

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

- [#2876](https://github.com/JSPrismarine/JSPrismarine/pull/2876) [`7468217`](https://github.com/JSPrismarine/JSPrismarine/commit/74682176453a6d9c76b6717be8406149c8e49a58) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Java's `/tick` command. `/tick rate <ticks per second>` sets the target tick rate, `/tick freeze` and `/tick unfreeze` hold the world and its functions still while the server keeps serving players, `/tick step [time]` runs a frozen world forward a few ticks, `/tick sprint <time>` runs ticks back to back, and `/tick query` reports the rate and how long a tick takes. `ServerCommandHost` gains a required `ticking` group for the command to drive the tick loop.

- [#2865](https://github.com/JSPrismarine/JSPrismarine/pull/2865) [`c36489a`](https://github.com/JSPrismarine/JSPrismarine/commit/c36489a66251a6f1b134ac4864d8722247a97dca) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep a bare block-state literal on the type Bedrock's grammar gives it: `=7` parses as an integer and `=true` as a boolean, with quoted values staying strings. The block catalog hashes a state with its types, so a `"7"` where an `int` property stands named no block and `/setblock minecraft:farmland ["moisturized_amount"=7]` reported success while placing nothing. `/testforblock` compares `true` and a stored `1` as the same byte.

### Patch Changes

- [`d84076a`](https://github.com/JSPrismarine/JSPrismarine/commit/d84076a845dc9be3e53ba9304ab7bfb05a4116a9) Thanks [@filiphsps](https://github.com/filiphsps)! - Make `/damage` follow Java 26.3: no source entity unless `by` names one, `from` for an indirect cause, `at` for a location, a single target, and the damage type read from the loaded datapacks, whose tags decide what the blow bypasses.

- [#2883](https://github.com/JSPrismarine/JSPrismarine/pull/2883) [`dde74e3`](https://github.com/JSPrismarine/JSPrismarine/commit/dde74e3d93602c66989dbab974281140090e821c) Thanks [@CloudCorpRecords](https://github.com/CloudCorpRecords)! - Report the matching item count for `/clear` with a max count of 0 instead of removing nothing and reporting 0.

- [#2865](https://github.com/JSPrismarine/JSPrismarine/pull/2865) [`dd31bb1`](https://github.com/JSPrismarine/JSPrismarine/commit/dd31bb11dba9ef22110fbd8f8c32b19fe8cfac58) Thanks [@filiphsps](https://github.com/filiphsps)! - Read a block state list in `/fill`, as `/setblock` already does. Both of Bedrock's and Java's grammars put one between the block and the handling mode, and without it every fill wrote the block's default state: a region of logs all pointed the same way and a region of leaves was always the kind that decays.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`f921837`](https://github.com/JSPrismarine/JSPrismarine/commit/f9218378b1ee52a0ed06b3bedf6a978577f0ace7) Thanks [@filiphsps](https://github.com/filiphsps)! - Build Java block and item resource parsers once per command tree.

- [#2876](https://github.com/JSPrismarine/JSPrismarine/pull/2876) [`aedeea4`](https://github.com/JSPrismarine/JSPrismarine/commit/aedeea48664db01e25e98a8a231bd1d6d7b2adcd) Thanks [@filiphsps](https://github.com/filiphsps)! - Report a failed `/summon` as "Unable to summon entity". It sent the error "Summoned new entity" when the pack did not declare the type, which read like a success.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`4912cd7`](https://github.com/JSPrismarine/JSPrismarine/commit/4912cd72747ddc6e65947f6ebeb412e68614b6ad) Thanks [@filiphsps](https://github.com/filiphsps)! - Cache Java command shapes and flattened command lists
- Updated dependencies [[`183e92c`](https://github.com/JSPrismarine/JSPrismarine/commit/183e92c7f577bc34608555a13aaa88fd64f61530), [`09d523c`](https://github.com/JSPrismarine/JSPrismarine/commit/09d523c5fbd04af60800bee5ad2b12f2a7619e02), [`2d68618`](https://github.com/JSPrismarine/JSPrismarine/commit/2d686188fff4b00ca1e6ce728cb73dbef23bebb9), [`a3c8477`](https://github.com/JSPrismarine/JSPrismarine/commit/a3c8477097570eb5920113ab13e02d8fbc2b1a2c), [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d)]:
  - @jsprismarine/minecraft@0.17.0
  - @jsprismarine/brigadier@0.17.0
  - @jsprismarine/mapping@0.17.0

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
