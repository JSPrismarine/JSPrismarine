# What must this server build to run Java datapack behavior, and how do Java and Bedrock commands differ?

Researched 2026-10-24 against Mojang's own files: the Java Edition 26.3 server jar (unobfuscated, so its class and constant-pool names are read directly), Mojang's Java changelogs on minecraft.net, Mojang's Bedrock creator documentation on learn.microsoft.com, Mojang's `bedrock-protocol-docs` and `bedrock-samples` repositories, Mojang's `brigadier` repository, and this repository's `packages/brigadier` and `packages/prismarine` sources. The datapack format itself is covered in [java-datapacks.md](java-datapacks.md) and is not repeated.

## Summary

1. Vanilla Java ships **zero** mcfunction files and **zero** function tags. `data/minecraft/` in the 26.3 server jar has 9884 files across 44 top-level directories, and `function/`, `tags/function/` and `item_modifier/` are not among them. Vanilla gameplay is data through loot tables (1447), recipes (2042), advancements (1866), tags (883) and worldgen (1144), with exactly 3 standalone predicate files and no advancement in the pack carrying a `function` reward. The premise that vanilla gameplay runs on functions is wrong; functions are a content-creator mechanism, and the vanilla gameplay they would carry is in Java code.
2. Vanilla **Bedrock** also ships zero mcfunction files: `Mojang/bedrock-samples` at 1.26.50.4 has 22258 files and no `.mcfunction` and no `tick.json`. Both editions already have a function runtime; neither uses it for vanilla.
3. The function runtime the project has to build is small and well specified: a line-oriented file format, two lifecycle tags (`minecraft:tick` and `minecraft:load`, the only two the server looks up), a heap-queue executor with an operation quota rather than a recursive one, two gamerules, and `$(variable)` macro substitution with a parse cache of 8 entries. The expensive part is not the runtime, it is the 94 commands and 59 argument parsers the functions call into.
4. Gamerule names changed in 1.21.11. `maxCommandChainLength` is now `minecraft:max_command_sequence_length` and `maxCommandForkCount` is now `minecraft:max_command_forks`; 36 gamerules were renamed and 3 removed. Anything written against the camelCase names is stale.
5. Java 26.3 has 94 root commands. Its tree uses 59 distinct argument parsers; the newest published wire registry, at 26.1, has 57 ids (6 `brigadier:*`, 51 `minecraft:*`), and 26.3 uses 6 parsers that are not in it, so the current registry is at least 63. `/execute` has 14 subcommands, 13 `if`/`unless` conditions, 8 `on` relations and 5 `store` targets. Vanilla's command graph is 2475 nodes: 1 root, 1197 literal and 1277 argument.
6. Bedrock 1.26.50 has 84 commands, 279 overloads, 1186 parameters, 236 enums holding 14281 values, and **26** basic parameter types. Its `/execute` has 18 overloads covering 12 subcommands and 4 `if`/`unless` conditions. There is no `store`, no `on`, no `summon`, no NBT path, no item modifier, no predicate and no macro. 48 Java root command names have no Bedrock counterpart; 36 Bedrock names have no Java counterpart; 46 names are shared.
7. Bedrock's command tree is a flat list of overloads with no redirects, so Java's fork semantics (one `execute as @e` producing N contexts that each continue the chain) cannot be expressed in the packet. A Bedrock client can be shown `/execute as @e run say hi`, because Bedrock encodes that one shape with its chained-subcommand table, but it cannot be shown `execute store result score ...` or any command whose shape is a redirect cycle. Everything beyond the 26 parameter types has to be sent as a string or a soft enum and parsed server-side.
8. This repository already has a faithful Brigadier port (40 of upstream's 47 classes, fork and redirect wired through `CommandDispatcher.execute`) and an `AvailableCommandsPacket` matching Mojang's own schema field for field. It has 16 vanilla commands, 7 custom argument types, no mcfunction loader, no NBT path argument, and an `/execute` that is `execute <target> <command>` rather than a subcommand chain. Four specific defects block datapack work: the brigadier port's `redirect(target, modifier)` passes `undefined` to the modifier, it is missing upstream's MC-256419 fix so an empty fork reports "unknown command", its `CommandManager` tree flattener drops nested literals and does not follow redirects, and three parameter type ids are stale or wrong for protocol 2193.
9. No published measurement of per-tick function cost exists from Mojang or from PaperMC, and spark cannot attribute time to a datapack because its source lookup is class-loader based and datapack code runs on the server's own loader. Mojang's cost model replaces the measurement: it counts "operations" against `max_command_sequence_length` and contexts against `max_command_forks`, and Bedrock caps a single `/function` call at 10000 commands. The default for the two Java limits is reported as 65536 by two secondary sources and could not be confirmed from Mojang.

## 1. The mcfunction system

### The file format

`ServerFunctionLibrary` reads `data/<namespace>/function/**.mcfunction` (constant-pool strings `.mcfunction`, `function`, `fileToId`, `listMatchingResources`, `openAsReader`, `readLines` in `net/minecraft/server/ServerFunctionLibrary.class`). One command per line, no leading slash. `CommandFunction.fromLines` holds the parse rules, and its error strings name every rule it enforces:

- `Unknown or invalid command '%s' on line %d (did you mean '%s'? Do not use a preceding forwards slash.)`
- `Unknown or invalid command '%s' on line %d (if you intended to make a comment, use '#' not '//')`
- `Command too long: %d characters, contents: %s...` with the limit `2000000` as the only integer constant in `CommandFunction.class`
- `shouldConcatenateNextLine`, the line-continuation check

Line continuation was added in 1.20.2: "A single backslash `\` as the last non-whitespace character of a line now allows a command to be continued on the next line. Leading and trailing whitespace of the following line are stripped before appending" (https://www.minecraft.net/en-us/article/minecraft-java-edition-1-20-2).

Source: `python3 -I cpstrings.py net/minecraft/commands/functions/CommandFunction.class`, `python3 -I cpints.py` on the same file.

### Function tags, and the fact that vanilla ships none

`ServerFunctionManager.class` declares exactly two tag constants, `TICK_FUNCTION_TAG` and `LOAD_FUNCTION_TAG`, alongside the literals `tick` and `load`, `loadFunctionTag`, `executeTagFunctions`, `queueInitialFunctionCall` and `getGameLoopSender`. There is no third lifecycle tag in 26.3.

```
python3 -I cpstrings.py net/minecraft/server/ | grep -E 'FUNCTION_TAG|loadFunctionTag'
net/minecraft/server/ServerFunctionManager.class	LOAD_FUNCTION_TAG
net/minecraft/server/ServerFunctionManager.class	TICK_FUNCTION_TAG
```

`minecraft:tick` runs every server tick; `minecraft:load` is queued once after each datapack load (`queueInitialFunctionCall`). Both are function tags, so multiple packs contribute and the loaded tag is the union.

Vanilla provides neither file. The 26.3 jar has 883 tag files across the registries below and no `function` directory among them:

| Tag registry | Files |
|---|---|
| `block` | 297 |
| `item` (incl. `item/enchantable`, `item/sulfur_cube_archetype`) | 204 + 22 + 13 |
| `worldgen/*` (biome, structure, feature, presets) | 53 + 35 + 34 + 2 + 3 + 2 + 1 |
| `entity_type` | 50 |
| `damage_type` | 37 |
| `enchantment` (+ `exclusive_set`) | 16 + 8 |
| `villager_trade/*` | 89 |
| `fluid`, `potion`, `game_event`, `timeline`, `point_of_interest_type`, `instrument`, `dialog`, `painting_variant`, `banner_pattern*` | 11, 6, 6, 5, 4, 4, 3, 2, 13 |
| `function` | **0** |

Source: `unzip -l server-26.3.jar | awk '{print $4}' | grep '^data/minecraft/tags/'`.

### Execution order and the call stack

Mojang rewrote function execution for 1.20.3, in snapshot 23w41a. Mojang's published obfuscation maps date it exactly: the whole `net.minecraft.commands.execution` package is absent in 1.20.2 and 23w40a and present in 23w41a. Before the rewrite, `ServerFunctionManager$ExecutionContext` was an inner class with `int depth`, a `Deque commandQueue`, a `boolean abortCurrentDepth` and `int runTopCommand(...)`. After it, `ServerFunctionManager.execute` returns `void`.

In 26.3 the package holds 11 classes: `ChainModifiers`, `CommandQueueEntry`, `CustomCommandExecutor`, `CustomModifierExecutor`, `EntryAction`, `ExecutionContext`, `ExecutionControl`, `Frame`, `TraceCallbacks`, `UnboundEntryAction` and `package-info`, plus a `tasks/` subpackage (`BuildContexts`, `CallFunction`, `ContinuationTask`, `ExecuteCommand`, `FallthroughTask`, `IsolatedCall`). `ExecutionContext`'s members are an explicit heap queue and a quota:

```
int MAX_QUEUE_DEPTH;  int commandLimit;  int forkLimit;  int commandQuota;
boolean queueOverflow;  Deque commandQueue;  List newTopCommands;  int currentFrameDepth;
void queueInitialFunctionCall(...);  void handleQueueOverflow();  void queueNext(CommandQueueEntry);
void discardAtDepthOrHigher(int);  void runCommandQueue();  void incrementCost();
```

`Frame` carries `int depth`, a `CommandResultCallback returnValueConsumer` and a `FrameControl`: a call frame on the heap rather than on the JVM stack. 23w41a closed MC-143266 ("Nested function calls reevaluate maxCommandChainLength before queueing commands"), and 23w44a closed MC-265805 ("Executing a tail-recursive function consumes memory resources linearly with recursion depth"), which is the closest Mojang comes to saying the new engine eliminates tail calls. Mojang never describes the rewrite as removing recursion; the structure and those two bug closures are the evidence.

This is the single most important design decision to copy. A naive implementation that recurses per `/function` call, as Pumpkin's does (section 9), cannot bound work the way the gamerules describe and will exhaust the host stack on a tail-recursive pack.

The 1.20.3 changelog states the resulting rules (https://www.minecraft.net/en-us/article/minecraft-java-edition-1-20-3):

- "Functions no longer have any result unless they use `return` or there was error during lookup or instantiation." The error conditions are "Calling a non-existent function", "Calling an empty function tag", "Macro instantiation failures".
- "A single call to `function` will now store at most once (zero times if `return` was not called)."
- "For function tags with multiple entries, function results will be accumulated, but partial results will be stored at the end of every function."
- "Limits now apply even for commands run from the server console or chat input (so it will now always behave as if they were placed in a function)." "Executions from command blocks still count as separate ones."

### The two limits

`maxCommandChainLength` counts "operations", which the changelog enumerates as "execution of command for a single context", "execution of a stage in `execute` (no matter how many contexts were modified)", and "invocation of function". `maxCommandForkCount` "restricts the total amount of contexts that can be created by single state of functions like `execute`. For example: if there are 5 entities in world, `execute as @e` creates 5 contexts, while `execute as @e at @e` creates 5*5 = 25 contexts" (1.20.3 changelog).

**Both were renamed in 1.21.11.** Gamerules moved into a registry and all of them went from camelCase to namespaced snake_case (https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-11):

> Game rules have been moved into a registry. With that, all game rules have been renamed from their previous camel case names to namespaced IDs in snake case.

> `maxCommandChainLength` -> `minecraft:max_command_sequence_length`
> `maxCommandForkCount` -> `minecraft:max_command_forks`

The same release added value limits: `minecraft:max_command_forks` minimum 1, `minecraft:max_command_sequence_length` minimum 0, `minecraft:max_block_modifications` minimum 1. `commandModificationBlockLimit` became `minecraft:max_block_modifications` and `commandBlocksEnabled` became `minecraft:command_blocks_work`.

The 26.3 jar's `GameRules.class` carries the current names as string constants:

```
command_block_output  command_blocks_work  log_admin_commands
max_command_forks  max_command_sequence_length  send_command_feedback
```

and `net/minecraft/util/datafix/fixes/GameRuleRegistryFix.class` carries the old ones, which is Mojang's own old-to-new map. Its string table includes `maxCommandChainLength`, `maxCommandForkCount`, `commandModificationBlockLimit`, `commandBlocksEnabled`, and in the removal branch `entitiesWithPassengersCanUsePortals` and `gameLoopFunction`.

The default for both limits is reported as 65536, and for `minecraft:max_block_modifications` as 32768. Mojang has never stated any of the three, including in 17w16b which introduced the original rule. `GameRules.class` has exactly three integer constants in its pool, `[32768, 65536, 2147483647]`, consistent with those figures but not attributing a value to a rule. Two independent secondary sources give the same numbers: minecraft.wiki's gamerule page, and `assets/game_rules.json` in Pumpkin, which `Pumpkin-MC/Extractor` extracted from the real 26.3 server jar (`max_command_sequence_length` default 65536 min 0, `max_command_forks` default 65536, `max_block_modifications` default 32768 min 1). Treat the numbers as well-corroborated but not primary; see "Open questions".

Sources: `python3 -I cpstrings.py net/minecraft/world/level/gamerules/GameRules.class`, `python3 -I cpints.py` on the same file, `python3 -I cpstrings.py net/minecraft/util/datafix/fixes/GameRuleRegistryFix.class`, the 1.21.11 and 1.20.3 changelogs.

### Permission level

Functions run at a fixed permission level, not the caller's. `ServerFunctionManager.class` references `net/minecraft/server/permissions/LevelBasedPermissionSet` and the constant `GAMEMASTER`, and `DedicatedServerProperties.class` carries the key `function-permission-level` alongside `op-permission-level`. In 26.3 the levels are a named enum: `PermissionLevel.class` declares `ALL`/`all`, `MODERATORS`/`moderators`, `GAMEMASTERS`/`gamemasters`, `ADMINS`/`admins`, `OWNERS`/`owners`, with `getSerializedName`, `byId` and `isEqualOrHigherThan`. `ServerFunctionManager` also uses `withSuppressedOutput`, so function output does not reach chat.

Source: `python3 -I cpstrings.py` on `net/minecraft/server/permissions/PermissionLevel.class`, `net/minecraft/server/ServerFunctionManager.class`, `net/minecraft/server/dedicated/DedicatedServerProperties.class`.

### Macros

Macros arrived in 1.20.2. The changelog gives the full rule set:

> Any line beginning with `$` (as the first non-space character) marks a macro line. A macro line also contains one or more substitutions in the form of `$(variable)`. When calling a function macro a compound with data for all argument variables must be provided.

> The compound must contain one entry for each variable used in the macro. More data may be present in the compound and if so is ignored. Calling a non-macro function with a data compound is silently ignored.

> Any syntax errors in the lines resulting from variable substitution result in the entire function call being skipped.

1.20.2 also fixed number formatting: "Numbers used as macro arguments are now always inserted without suffixes, regardless of numeric type."

`MacroFunction.class` and `StringTemplate.class` carry the implementation rules as constants:

- `isValidVariableName`, built from `isLetterOrDigit` plus the literal `_`; failure raises `Invalid macro variable name '%s'`
- `Unterminated macro variable` for a `$(` with no `)`
- `No variables in macro` for a `$` line with no substitution
- `DECIMAL_FORMAT` with `setMaximumFractionDigits` and `Locale.ROOT`, which is how a double becomes a string
- `substituteAndParse`, `lookupValues`, `indicesToSelect`, `selectedValuesOutput`
- `MAX_CACHE_ENTRIES`, whose value is the sole integer constant in `MacroFunction.class`: **8**

Mojang states the cost directly: "Using a macro means commands must be re-evaluated after variable substitution ... Only commands with variable substitutions in them are parsed when a macro is called and the game will attempt to cache the result of a certain parameter set being used in a call. This makes repeated calls with the same parameter set cheaper than new calls with different parameters ... only the values referenced by macro as parameters are included in this cache, so any extra data in the provided compound is ignored." The cache holds 8 parameter sets per macro function.

The call forms, from the 26.3 command tree:

```
/function <name:minecraft:function>
/function <name> <arguments:minecraft:nbt_compound_tag>
/function <name> with block <source:block_pos> [<path:nbt_path>]
/function <name> with entity <source:entity(single)> [<path:nbt_path>]
/function <name> with storage <source:resource_location> [<path:nbt_path>]
```

`minecraft:function` accepts a function id or a `#tag`. `FunctionCommand.class` carries `commands.function.error.argument_not_compound` and `commands.function.scheduled.no_functions`.

Sources: the 1.20.2 changelog; `python3 -I cpstrings.py net/minecraft/commands/functions/`; `python3 -I cpints.py net/minecraft/commands/functions/MacroFunction.class`; the command tree (section 2).

### Bedrock's equivalent

Bedrock has the same file extension and a different everything else. Mojang's docs (https://learn.microsoft.com/en-us/minecraft/creator/documents/functionsintroduction):

> Function files have a .mcfunction extension and they live in the `functions` folder of your behavior pack.

> **Minecraft: Bedrock Edition cannot run more than 10,000 commands in one function call.**

> When working with commands in a .mcfunction file, you do not need to start commands with the leading slash `/`.

Functions are addressed by path, not by namespaced id: "if you have another folder inside your functions folder called `init` ... you would run it like this: `/function init/ouch`". The parameter type is `PATHCOMMAND`, which is Bedrock's filepath type.

There are no function tags. The lifecycle hook is a single file, `functions/tick.json` (https://learn.microsoft.com/en-us/minecraft/creator/documents/tickjsonintroduction):

```json
{
  "values": [
    "function_say_one", "function_say_two"
  ]
}
```

> The `tick.json` file uses only the `values` key, and the values are the names of the functions to run, without the .mcfunction extension.

> `tick.json` files are additive and multiple will run if they exist in multiple behavior packs.

> Unlike repeating command blocks, `tick.json` will execute commands before the world has fully loaded in.

There is no `load` equivalent, no `with`, no macro syntax and no `return`.

## 2. The command system as a composability tool

Java 26.3 has **94 root commands**. The list, from Mojang's generated command tree:

```
advancement attribute ban ban-ip banlist bossbar clear clone compute damage data datapack
debug defaultgamemode deop dialog difficulty effect enchant execute experience fetchprofile
fill fillbiome forceload function gamemode gamerule give help item jfr kick kill list locate
loot me msg op pardon pardon-ip particle perf place playsound posteffect publish random recipe
reload return ride rotate save-all save-off save-on say schedule scoreboard seed setblock
setidletimeout setworldspawn spawnpoint spectate spreadplayers stop stopsound stopwatch summon
swing tag team teammsg teleport tell tellraw test tick time title tm tp transfer trigger
unpublish version w waypoint weather whitelist worldborder xp
```

This is cross-checked against the jar: `net/minecraft/server/commands/` holds 109 non-nested classes, plus `data/DataCommands`, `item/ItemCommands` and `net/minecraft/gametest/framework/TestCommand`. Every root name above that was added recently (`compute`, `stopwatch`, `waypoint`, `dialog`, `rotate`, `swing`, `fetchprofile`, `posteffect`, `unpublish`, `version`) has a matching class in the 26.3 jar.

The tree itself is 2475 nodes: 1 root, 1197 literal and 1277 argument, using 59 distinct parsers.

Sources: `misode/mcmeta` tag `26.3-summary`, `commands/data.json` (Mojang's `reports/commands.json`, republished; sha256 `9e14a839e32dbcaae044aeb987f1d9c4a4a3c8f7f3a8a3a87dc055e61fa8a84a`); `unzip -l server-26.3.jar`.

### /execute

14 subcommands, every one of which redirects back to `execute`:

| Subcommand | Forms |
|---|---|
| `align` | `<axes:swizzle>` |
| `anchored` | `<anchor:entity_anchor>` (`eyes`, `feet`) |
| `as` | `<targets:entity>`, which forks one context per matched entity |
| `at` | `<targets:entity>`, which forks the same way |
| `facing` | `<pos:vec3>`, `entity <targets> <anchor>` |
| `if` / `unless` | 13 conditions, below |
| `in` | `<dimension>` |
| `on` | `attacker controller leasher origin owner passengers target vehicle` |
| `positioned` | `<pos:vec3>`, `as <targets>`, `over <heightmap>` |
| `rotated` | `<rot:rotation>`, `as <targets>` |
| `run` | the terminal, redirects to the command root |
| `store` | `result`/`success` into `block`, `bossbar`, `entity`, `score`, `storage` |
| `summon` | `<entity:resource(entity_type)>` |

The 13 `if`/`unless` conditions: `biome`, `block`, `blocks`, `data` (block/entity/storage + nbt path), `dimension`, `entity`, `function`, `items` (block/entity), `loaded`, `predicate`, `score`, `slots` (block/entity), `stopwatch`.

`execute if function` is the only way a condition can run arbitrary behavior; the 1.20.3 changelog defines its matching: "At least one of the functions must succeed for the match to succeed. A successful call is defined as a function that uses the `return` command to return a value [and] the return value is not 0. If no functions exited with `return`, neither `if` or `unless` will run."

`execute if stopwatch <id> <range:float_range>` is new in 26.x and pairs with `/stopwatch create|remove|query|restart`.

What this makes expressible without code: iteration (`as @e`), spatial transforms (`at`, `positioned`, `rotated`, `align`, `anchored`, `facing`), the entity relationship graph (`on`), conditionals over blocks, NBT, scores, biomes, loot predicates and inventory contents, and the only general-purpose way to capture a value into storage or a score (`store`). Nothing else in the command set provides control flow.

### /data

`get`, `merge`, `modify`, `remove`, each over `block <block_pos>`, `entity <entity(single)>` and `storage <resource_location>`. `get` takes an optional `<scale:double>`. `modify` has 5 operations (`append`, `insert <index>`, `merge`, `prepend`, `set`), each with 4 sources:

- `value <nbt_tag>`
- `from <block|entity|storage> <source> [<sourcePath>]`
- `string <block|entity|storage> <source> <sourcePath> [<start> [<end>]]`
- `compute <block <pos>|entity <target>|default> <float|integer> <provider>`, new in 26.3, reading the `context_float_provider` and `context_int_provider` registries

`minecraft:nbt_path` is the second most used parser in the tree (114 occurrences). `/data` plus `execute store` is how datapacks hold state, because `storage` is a server-side NBT namespace with no world representation.

### /item and item modifiers

4 subcommands (`fill`, `modify`, `override`, `replace`), each over `block <pos>` and `entity <targets>`, each taking `<slots:minecraft:slot_source>` (a registry new in 26.3 that replaced the older `item_slot`/`item_slots` arguments), and each ending in either:

- `<modifier:minecraft:loot_modifier>`, a standalone item modifier file
- `with <item:item_stack> [<count:1..99>]`
- `from <block|entity> <source> <sourceSlots> [<modifier>]`

The argument is `minecraft:loot_modifier`, renamed from `minecraft:item_modifier`, and `execute if predicate` takes `minecraft:loot_predicate`, renamed from `minecraft:predicate`. The 26.3 loot schema matches: loot tables now spell functions as `modifier` and conditions as `condition`.

An item modifier is a list of loot functions applied outside a loot table. Vanilla ships 0 of them and 3 predicates (`block/fast_cooking`, `tool/can_shear`, `tool/can_silk_touch`).

### /loot

4 destinations (`give <players>`, `insert <targetPos>`, `spawn <targetPos>`, `replace block|entity <slot> [<count>]`) crossed with 4 sources (`fish <loot_table> <pos> [<tool>]`, `kill <target>`, `loot <loot_table>`, `mine <pos> [<tool>]`). This is the only command that runs the loot system on demand, which makes a loot table usable as a general randomized-output function.

Vanilla's 1447 loot tables use 20 distinct modifier types and 15 condition types, measured over the 26.3 data:

```
set_count(947) explosion_decay(190) enchanted_count_increase(80) copy_components(71)
set_potion(52) enchant_randomly(52) enchant_with_levels(34) apply_bonus(32) set_damage(28)
furnace_smelt(19) exploration_map(18) filtered(18) set_enchantments(11) copy_state(10)
set_name(8) limit_count(6) set_components(6) set_stew_effect(3)
set_ominous_bottle_amplifier(3) set_instrument(1)

survives_explosion(894) match_block(281) entity_properties(49) any_of(42) all_of(42)
inverted(25) table_bonus(20) random_chance(15) killed_by_player(12)
damage_source_properties(5) location_check(2) match_tool(1)
random_chance_with_enchanted_bonus(1)
```

plus 123 references to `minecraft:tool/can_silk_touch` and 14 to `minecraft:tool/can_shear`, the standalone predicate files. Entry types: `item` (2556), `alternatives` (87), `loot_table` (57), `empty` (39), `dynamic` (1), `tag` (1).

### /scoreboard, /tag, /trigger

`/scoreboard objectives` has `add <name> <criteria> [<displayName>]`, `list`, `modify <obj> displayname|rendertype|displayautoupdate|numberformat`, `remove`, `setdisplay <slot> [<obj>]`. `/scoreboard players` has `add`, `display name|numberformat`, `enable`, `get`, `list`, `operation`, `remove`, `reset`, `set`. The number formats are `blank`, `fixed <component>` and `styled <style>` (`ScoreboardCommand.class` string constants `blank`, `fixed`, `styled`, `numberformat`, `displayautoupdate`).

`/tag <targets> add|remove <word>` and `/tag <targets> list` give entities arbitrary string labels, selectable with `tag=`. This is the cheapest state a datapack has.

`/trigger <objective> [add|set <value>]` is the one command a non-operator can run; it writes to an objective with the `trigger` criterion that `/scoreboard players enable` has armed.

### /attribute, /ride, /random, /return

`/attribute <target> <attribute> base get|reset|set`, `get [<scale>]`, `modifier add <id> <value> <operation>` / `remove <id>` / `value get <id> [<scale>]`. The 3 operations are `add_value`, `add_multiplied_base`, `add_multiplied_total`.

`/ride <target> mount <vehicle>` / `dismount`. `RideCommand.class` carries the refusals: `cant_ride_players`, `loop`, `wrong_dimension`, `already_riding`.

`/random value|roll <range:int_range> [<sequence>]` and `/random reset *|<sequence> [<seed> [<includeWorldSeed> [<includeSequenceId>]]]`. The 1.20.2 changelog notes "`random value|roll <range>` used without a sequence id is available to non-operator players". Named sequences give a datapack reproducible randomness tied to the world seed.

`/return <value>`, `/return fail`, `/return run <command>`. This is what makes `execute if function` a predicate and `execute store result ... run function` a value-returning call.

### The newer commands

| Command | What it adds | Evidence |
|---|---|---|
| `/compute` | evaluates a `context_int_provider`/`context_float_provider` and prints or stores it | `ComputeCommand.class`, messages `command.compute.result.named.exact/rounded/invalid` |
| `/stopwatch` | `create`/`remove`/`query`/`restart` named server timers, readable by `execute if stopwatch` | `StopwatchCommand.class` |
| `/waypoint` | `list`, `modify <entity> color hex\|rgb\|reset`, `style`, the locator-bar markers | `WaypointCommand.class` |
| `/dialog` | `show <targets> <dialog>`, `clear <targets>`, server-driven UI from the `dialog` registry | `DialogCommand.class`, `minecraft:dialog` parser |
| `/rotate`, `/swing`, `/posteffect`, `/fetchprofile`, `/version`, `/unpublish` | entity rotation, hand animation, shader post effects, profile lookup, version query, stop LAN publishing | classes in `net/minecraft/server/commands/` |
| `/tick` | `freeze`, `unfreeze`, `step [<time>\|stop]`, `sprint <time>\|stop`, `rate <1..10000>`, `query` | command tree |
| `/datapack` | `create`, `enable [before\|after\|first\|last]`, `disable`, `list [available\|enabled]` | command tree |
| `/schedule` | `function <function> <time> [append\|replace]`, `clear <function>` | command tree |

## 3. How much vanilla Java gameplay ships as datapack functions

None of it. The measured contents of `data/minecraft/` in the 26.3 server jar, 9884 files:

| Directory | Files |
|---|---|
| `recipe` | 2042 |
| `advancement` | 1866 (1740 under `recipes/`) |
| `structure` | 1511 |
| `loot_table` | 1447 |
| `worldgen` | 1144 |
| `tags` | 883 |
| `villager_trade` | 391 |
| `datapacks` (3 built-in packs) | 106 |
| `trade_set` | 68 |
| `damage_type`, `painting_variant` | 51 each |
| `banner_pattern`, `enchantment` | 43 each |
| `trial_spawner` | 28 |
| `context_int_provider` | 26 |
| `decorated_pot_pattern`, `jukebox_song`, `trim_pattern` | 23, 22, 18 |
| `sulfur_cube_archetype`, `cat_variant`, `trim_material` | 12, 11, 11 |
| `wolf_variant`, `instrument`, `chat_type`, `enchantment_provider`, `wolf_sound_variant` | 9, 8, 7, 7, 7 |
| `context_float_provider`, `dimension_type`, `timeline` | 4 each |
| `block_transformer`, `chicken_variant`, `cow_variant`, `dialog`, `frog_variant`, `pig_*_variant`, `predicate` | 3 each |
| `cat_sound_variant`, `chicken_sound_variant`, `cow_sound_variant`, `world_clock`, `zombie_nautilus_variant` | 2 each |
| `test_environment`, `test_instance` | 1 each |
| **`function`** | **0** |
| **`item_modifier`** | **0** |

```
unzip -l server-26.3.jar | grep -c '\.mcfunction$'   # 0
unzip -l server-26.3.jar | grep -c 'tags/function'   # 0
```

The three built-in packs (`trade_rebalance` 104 files, `minecart_improvements` 1, `redstone_experiments` 1) contain no functions either.

No advancement in the pack rewards a function. Walking all 1866 advancements, the only `rewards` keys present are `recipes` (1739) and `experience` (23); `function` appears zero times. Advancement criteria use 54 distinct trigger types, of which `minecraft:inventory_changed` (1914 criteria) and `minecraft:recipe_unlocked` (1739) are almost all of the volume, with `player_killed_entity` (89), `location` (67), `consume_item` (41), `recipe_crafted` (27) and `bred_animals` (27) next. 49 trigger implementation classes exist in `net/minecraft/advancements/triggers/`.

So the systems that are data in vanilla Java are: item drops and container contents (loot tables), crafting and brewing (recipes), progression and recipe unlocks (advancements), group membership for blocks, items, entities, fluids, damage types, enchantments, biomes, structures and villager trades (tags), enchantment effects, damage types, villager trades, worldgen in full, and the 26.x additions (timelines, world clocks, dialogs, block transformers, context providers, trial spawners, sulfur cube archetypes). The systems that are not data are entity behavior, block behavior, item behavior, the trigger implementations, the loot function and condition implementations, and all of the above read by Java code.

The practical consequence for this project: implementing an mcfunction runtime buys zero vanilla parity on its own. It buys the ability to run third-party datapacks, and it buys a place to express behavior that would otherwise be TypeScript. Parity with vanilla comes from implementing the 94 commands, the loot/recipe/advancement/tag readers, and the engine the data parameterizes.

Sources: `unzip -l`, and the counting scripts in "Reproduction".

## 4. Brigadier

Mojang's dispatcher lives at https://github.com/Mojang/brigadier under the **MIT license** (`LICENSE`, "Copyright (c) Microsoft Corporation. All rights reserved."). The repo is not archived; `master` is at `9ba4f13c0fe82b07c08c2dc2d8043f075ffd0d98` ("Add test for contextual arguments"), author date 2024-12-08, pushed 2026-07-17. 186 commits since 2014-09-15.

The version 26.3 actually ships is **1.3.11**: `META-INF/libraries.list` inside the server jar reads `com.mojang:brigadier:1.3.11`, and the 26.3 piston-meta manifest lists the same artifact with sha1 `3373d1e7bf00c8b99bed1ea4efb8c47344e4a887`. Note that `https://libraries.minecraft.net/com/mojang/brigadier/maven-metadata.xml` is stale (it still says `1.0.500`, `lastUpdated 20180702095736`) and brigadier is not on Maven Central (`repo1.maven.org/.../com/mojang/brigadier/maven-metadata.xml` returns 404). Probing `libraries.minecraft.net` directly: 1.3.10 and 1.3.11 return 200, 1.3.12 and 1.4.0 return 404.

### API surface

47 source files on `master`; the 1.3.11 jar has 54 class entries of which 47 are top-level, so the published artifact matches `master`'s surface.

- Root (11 types): `CommandDispatcher`, `Command`, `ParseResults`, `StringReader`, `ImmutableStringReader`, `Message`, `LiteralMessage`, `RedirectModifier`, `SingleRedirectModifier`, `ResultConsumer`, `AmbiguityConsumer`. There is no `Predicate` type; requirements use `java.util.function.Predicate<S>` through `ArgumentBuilder.requires` and `CommandNode.canUse`.
- `arguments` (7): `ArgumentType<T>`, `BoolArgumentType`, `DoubleArgumentType`, `FloatArgumentType`, `IntegerArgumentType`, `LongArgumentType`, `StringArgumentType` with `StringType` = `SINGLE_WORD`, `QUOTABLE_PHRASE`, `GREEDY_PHRASE`. That is the whole built-in type set; everything else in Minecraft is a game-side `ArgumentType` implementation.
- `builder` (3): `ArgumentBuilder`, `LiteralArgumentBuilder`, `RequiredArgumentBuilder`.
- `tree` (4): `CommandNode`, `RootCommandNode`, `LiteralCommandNode`, `ArgumentCommandNode`.
- `context` (7): `CommandContext`, `CommandContextBuilder`, `ContextChain` (with `Stage` = `MODIFY`, `EXECUTE`), `ParsedArgument`, `ParsedCommandNode`, `StringRange`, `SuggestionContext`.
- `suggestion` (5): `SuggestionProvider`, `Suggestion`, `IntegerSuggestion`, `Suggestions`, `SuggestionsBuilder`.
- `exceptions` (10): `CommandSyntaxException`, `CommandExceptionType`, `BuiltInExceptionProvider` (27 factory methods), `BuiltInExceptions`, `SimpleCommandExceptionType`, `DynamicCommandExceptionType`, `Dynamic2`/`Dynamic3`/`Dynamic4`/`DynamicN CommandExceptionType`.

`CommandDispatcher`'s public methods: `register`, `setConsumer`, `execute`, `parse`, `getAllUsage`, `getSmartUsage`, `getCompletionSuggestions`, `getRoot`, `getPath`, `findNode`, `findAmbiguities`.

### Fork semantics

Since commit `b92c420` (2023-10-09), `CommandDispatcher.execute(ParseResults)` delegates to `ContextChain`:

```java
final Optional<ContextChain<S>> flatContext = ContextChain.tryFlatten(original);
if (!flatContext.isPresent()) { consumer.onCommandComplete(original, false, 0); throw ...dispatcherUnknownCommand()...; }
return flatContext.get().executeAll(original.getSource(), consumer);
```

`ContextChain.executeAll` holds `List<S> currentSources`, starting as `singletonList(source)`. Each modifier stage runs once per current source; `runModifier` returns `singleton(source)` when the node has no `RedirectModifier`, otherwise `modifier.apply(context.copyFor(source))`, a collection whose size is the fan-out. `forkedMode |= modifier.isForked()` is sticky: once any stage forks, every later stage runs forked. An empty fan-out short-circuits with `return 0` rather than an exception. The return value is `forkedMode ? 1 : result` per branch, summed, so a forked command returns the count of branches that executed without throwing, not the sum of their results. A `CommandSyntaxException` inside a forked branch is caught, reported to the `ResultConsumer` with result 0, and drops that branch; other branches continue. Unforked, it propagates and aborts.

This is exactly the semantics `max_command_forks` bounds.

### The network format

The Java client receives the tree in `ClientboundCommandsPacket` (`declare_commands`, play, clientbound, id `0x10` in 26.1): a VarInt-prefixed array of nodes, then a VarInt root index. A node is `flags` (u8), `children` (VarInt-prefixed VarInt indices), `redirectNode` (VarInt, conditional), then type-dependent data.

| Mask | Meaning |
|---|---|
| `0x03` | node type: 0 root, 1 literal, 2 argument, 3 unused |
| `0x04` | is executable |
| `0x08` | has redirect |
| `0x10` | has suggestions type |
| `0x20` | is restricted (node requires permission above 0) |
| `0xC0` | unused |

`0x20` is new: it was part of the unused bits through 1.21.5 and became `allows_restricted` in 1.21.6. A literal node carries `{name}`; an argument node carries `{name, parser, properties, suggestionType}`, where `suggestionType` is an identifier present only when `0x10` is set (vanilla values: `minecraft:ask_server`, `minecraft:all_recipes`, `minecraft:available_sounds`, `minecraft:summonable_entities`).

Argument types were string identifiers before 1.19 and are VarInt registry IDs from 1.19 on. The registry had 48 entries in 1.19 and **57** at 26.1 (ids 0 to 56, contiguous). A client that meets an unknown parser id must abandon the packet, because the following properties field is variable-length.

26.1 is as far as the published wire data goes: `minecraft-data`'s newest Java version is 26.1, and Mojang stopped shipping obfuscation maps after 1.21.11, so nothing public gives 26.3's id assignment. The 26.3 command tree uses **59** distinct parsers, of which 6 are not in the 26.1 id list at all (`minecraft:context_float_provider`, `minecraft:context_int_provider`, `minecraft:feature`, `minecraft:slot_source`, `minecraft:swing_animation`, `minecraft:team_color`), so the 26.3 registry has at least 63 entries and the ids have almost certainly shifted. Four 26.1 entries are registered but unused by the 26.3 tree: `brigadier:long`, `minecraft:angle`, `minecraft:color` and `minecraft:item_slots`.

At 26.1, the 6 `brigadier:*` parsers are ids 0 to 5 (`bool`, `float`, `double`, `integer`, `long`, `string`) and the 51 `minecraft:*` parsers are ids 6 to 56:

```
entity game_profile block_pos column_pos vec3 vec2 block_state block_predicate item_stack
item_predicate color hex_color component style message nbt_compound_tag nbt_tag nbt_path
objective objective_criteria operation particle angle rotation scoreboard_slot score_holder
swizzle team item_slot item_slots resource_location function entity_anchor int_range
float_range dimension gamemode time resource_or_tag resource_or_tag_key resource resource_key
resource_selector template_mirror template_rotation heightmap loot_table loot_predicate
loot_modifier dialog uuid
```

Between 1.19 and 26.1, 12 were added (`dialog`, `gamemode`, `heightmap`, `hex_color`, `item_slots`, `loot_modifier`, `loot_predicate`, `loot_table`, `resource_key`, `resource_or_tag_key`, `resource_selector`, `style`) and 3 removed (`entity_summon`, `item_enchantment`, `mob_effect`).

Properties encodings worth noting: integer and float parsers write a flags byte (`0x01` min present, `0x02` max present) then the present bounds; `brigadier:string` writes a VarInt matching `StringType`'s ordinals; `minecraft:entity` writes a bitfield (`0x01` entities only, `0x02` players only); `minecraft:score_holder` writes `0x01` for "allow multiple"; the `resource*` parsers write a registry identifier string.

Source for this section: the brigadier repo (`git clone --depth 1`, `git ls-remote`); `META-INF/libraries.list` in the 26.3 jar; `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/26.1/protocol.json` (type `command_node`), cross-checked against https://minecraft.wiki/w/Java_Edition_protocol/Command_data. `minecraft-data`'s newest published Java version is 26.1, so the wire numbers above are 26.1-derived; the 26.3 parser list from `reports/commands.json` agrees on names.

### What `packages/brigadier` already supports

`@jsprismarine/brigadier@0.15.2`, MIT, 5065 lines across `src/**/*.ts`, 22 test files. The README credits remtori's `node-brigadier` as the origin. It covers **40 of upstream's 47 classes**, with three files of its own (`Predicate.ts`, `index.ts`, `util/isEqual.ts`).

Present and working: `CommandDispatcher` with all 12 public methods including `getAllUsage`, `getSmartUsage` and `findAmbiguities`; the whole `tree`, `builder`, `context` (minus `ContextChain`), `suggestion` and `StringReader` surface; `ParseResults`; `AmbiguityConsumer`. `ArgumentType.parse(reader, context)` already carries upstream's 2024 source-context overload, typed as `ArgumentParseContext<S> = Pick<CommandContextBuilder<S>, 'getSource'>`.

Redirect and fork are wired end to end, not stubbed: `ArgumentBuilder.redirect/fork/forward/isFork`, `CommandNode` with `redirect`/`modifier`/`forks` fields, `CommandContext.isForked()`/`getRedirectModifier()`, `CommandContextBuilder.withNode` copying `forks`, `CommandDispatcher.parseNodes` following redirects, and the breadth-first loop in `CommandDispatcher.execute`. That is the single most important thing the port already has, because it is what `/execute` needs.

Missing against upstream:

| Missing | Consequence |
|---|---|
| `DoubleArgumentType`, `LongArgumentType` | two of brigadier's six built-in types do not exist; `brigadier:double` and `brigadier:long` cannot be expressed |
| `ContextChain` | the port predates upstream commit `b92c420` (2023-10-09), so there is no staged execution, no `Stage`, no `nextStage()`, no public `runModifier`/`runExecutable` |
| `Dynamic2`/`Dynamic3`/`Dynamic4`/`DynamicN CommandExceptionType` | `BuiltInExceptionProvider` has 19 of upstream's 27 factories; the 8 missing are all double and long related, and `floatTooLow`/`floatTooHigh`/`integerTooLow`/`integerTooHigh` take one argument where upstream takes two, so range errors do not report the bound they violated |

Three defects in the fork and redirect path, all verified by reading the source:

1. **`redirect(target, singleRedirectModifier)` passes `undefined` to the modifier.** `src/builder/ArgumentBuilder.ts:58` is

   ```ts
   return this.forward(target, modifier == null ? null : (o: CommandContext<S>) => [modifier.apply(o)], false);
   ```

   An arrow function is assigned where `RedirectModifier<S> = { apply(context): S[] }` is expected. It typechecks only because `Function.prototype.apply` is structurally compatible with the interface method. At runtime `CommandDispatcher.execute` calls `modifier.apply(context)`, which invokes `Function.prototype.apply` with `thisArg = context` and no argument array, so `o` is `undefined`. Plain `redirect(target)` and `fork(target, modifier)` are unaffected.
2. **The MC-256419 fix is absent.** Upstream added `else { foundCommand = true; }` when a redirect modifier returns an empty collection (commit `f20bede`, 2023-03-30). `CommandDispatcher.ts` has only `if (results.length !== 0) { ... }` with no `else`, so a fork whose modifier legitimately matches zero sources falls through to `if (!foundCommand) throw dispatcherUnknownCommand()` instead of succeeding with 0. A Java datapack doing `execute as @e[type=pig] run ...` in a world with no pigs would report an unknown command.
3. **`onCommandComplete` receives the exception where upstream passes `0`.** `this.consumer.onCommandComplete(context, false, ex);` with `ResultConsumer.onCommandComplete`'s result parameter widened to `any` to permit it.

One intentional divergence: `execute` returns `any[]`, one entry per executed branch, where upstream returns `forked ? successfulForks : result`. The port never computes a fork count. This matters directly for datapacks, because `execute store result ... run execute as @e run ...` stores that integer, and `max_command_forks` is defined in terms of the same counting. The signature is `execute(input, source: S | null = null)` guarded by `if (source) parse = this.parse(input, source)`, so a falsy source (`0`, `''`, `false`) leaves `parse` undefined and the next line dereferences it.

Test coverage for fork and redirect is thin: `CommandDispatcher.test.ts` has `testExecuteAmbiguiousParentSubcommandViaRedirect`, `testExecuteRedirectedMultipleTimes` and `testExecuteRedirected`, and `ArgumentBuilder.test.ts` has `testRedirect`, `testRedirect_withChild` and `testThen_withRedirect`. None drives `redirect(target, singleModifier)` through `execute`, which is why defect 1 is latent. Upstream has 25 test classes including `context/ContextChainTest.java`, with no port counterpart.

### What the rest of the repository has

`packages/prismarine/src/command/` registers 16 vanilla commands (`ban`, `deop`, `execute`, `gamemode`, `gamerule`, `help`, `kick`, `list`, `me`, `op`, `pardon`, `say`, `stop`, `summon`, `time`, `tp`) and 4 of its own (`debug`, `reload`, `tps`, `version`), against Java's 94. `CommandArguments.ts` defines 7 argument types (`Gamemode`, `Mob`, `Entity`, `Position`, `Command`, `Boolean`, `Player`), against the 59 parsers Java's tree uses and Bedrock's 26.

`/execute` is the pre-1.13 shape, `execute [<target>] <command> [<args...>]`, dispatching the tail string back through `CommandManager.dispatchCommand`. It has no subcommands, no redirect and no fork.

There is no mcfunction loader, no datapack reader, no NBT path argument, no loot or predicate runtime, no scoreboard objective registry and no `/data`. `packages/prismarine/src/entity/LootTables.ts` exists but is unrelated to the Java loot format.

The bridge from the brigadier tree to Bedrock overloads is `CommandManager.getCommandsList()`. Its `parseNode` begins:

```ts
// A nested literal has no argument type to list. The client is not told about it.
if (!(node instanceof ArgumentCommandNode)) return [];
```

That is the gap that has to close first. Vanilla Bedrock encodes every subcommand keyword as a one-value hard enum (`OPTION_AS = ['as']`, `OPTION_IF_UNLESS = ['if','unless']`, `SCOREBOARDCRITERIA = ['dummy']`), so a Java-shaped tree is representable to a Bedrock client as long as nested literals become enum parameters. The current flattener drops them, and it does not follow redirects at all, so a `/execute` built the Java way would reach the client as a single nameless overload.

## 5. Bedrock's command system

### AvailableCommandsPacket

Mojang publishes the schema. `docs/AvailableCommandsPacket.html` at `Mojang/bedrock-protocol-docs`, branch `r/26_u4_hotfix5` (Minecraft 1.26.50 family, protocol 2193), packet id **76**:

| # | Field | Type |
|---|---|---|
| 0 | Enum Values | `array<string>` |
| 1 | Chained Subcommand Values | `array<string>` |
| 2 | Post Fixes | `array<string>` |
| 3 | Enum Data | `array<EnumData>` = `{Name: string, Values: array<uint32>}` |
| 4 | Chained Subcommand Data | `array<{Name: string, SubCommand values: array<{first: varuint32, second: varuint32}>}>` |
| 5 | Commands | `array<CommandData>` |
| 6 | Soft Enums | `array<{Enum Name: string, Enum Options: array<string>}>` |
| 7 | Constraints | `array<{Enum Value Symbol: uint32, Enum Symbol: uint32, Constraint Indices: array<uint8>}>` |

`CommandData` is `Name` (string), `Description` (string), `Flags` (uint16), `Permission Level` (uint8), `Alias Enum` (int32), `CommandData Chained Subcommand Indexes` (`array<uint32>`), `Overloads` (`array<{isChaining: boolean, Parameter Data: array<ParamData>}>`). `ParamData` is `Name` (string), `Parse Symbol` (uint32), `Is Optional?` (boolean), `Options` (uint8).

`Permission Level` is the one field whose encoding the documentation does not settle. The HTML page renders it as `uint8` with the values `Any`(0), `GameDirectors`(1), `Admin`(2), `Host`(3), `Owner`(4), `Internal`(5). The JSON schema it `$ref`s, `json/CommandPermissionLevel.json`, says:

```json
{"type": "string", "enum": ["Any","GameDirectors","Admin","Host","Owner","Internal"],
 "x-underlying-type": "uint8"}
```

A JSON `type` of `string` with an `x-underlying-type` of `uint8`, which is exactly the ambiguity. This repository writes a lowercase string and documents the reasoning at `packages/prismarine/src/network/packet/AvailableCommandsPacket.ts:9-21`: the same `CommandPermissionLevel` is an enum-as-value in `AddPlayerPacket` and `UpdateAbilitiesPacket` but a string here, matching gophertunnel's `commandPermissionToString` at protocol 2193. The repo writes `['any','gamedirectors','admin','host','owner','internal'][level] ?? 'unknown'`. Note also that the schema files on branch `r/26_u4_hotfix5` still carry `x-minecraft-version: 1.26.40` and `x-protocol-version: 2169`, so the JSON lags the branch it is published on.

The enum index width also changed. `EnumData.Values` is `array<uint32>` in the current schema; before 1.21.130 the width followed the table size (1 byte under 256 values, 2 under 65536, else 4), which gophertunnel implemented as a `switch` on `len(ctx.EnumValues)` through protocol 859. Mojang's own protocol changelog gives the reason at protocol 880: "Converted AvailableCommandsPacket to Cereal" (https://mojang.github.io/bedrock-protocol-docs/changelog/). The repo's `writeEnum` writes fixed `uint32` and documents the change at `AvailableCommandsPacket.ts:151-158`.

Chained subcommands arrived at 1.20.10, protocol 594, not 1.19.60. Mojang's protocol changelog for 594 lists four additions together: `mChainedSubcommandValues`, `mChainedSubcommands`, `CommandData.chainedSubcommandIndexes` and `OverloadData.isChaining`. They exist for `/execute` and nothing else; Mojang's own command metadata uses a single chained type, `EXECUTECHAINEDOPTION_0`, in 17 places.

`UpdateSoftEnumPacket` is id **114**: `Enum Name` (string), `Values` (`array<string>`), `Update Type` (uint8: `Add`=0, `Remove`=1, `Replace`=2). Mojang's own description: "This is used for the scoreboard and tag systems (overwhelmingly used by 3rd party content). This allows someone to sync between server and client tags and enums on mobs or on the level."

`CommandRequestPacket` is id **77**: `Command` (string), `Origin` (`CommandOriginData` = type `Player`/`DevConsole`/`Test`/`AutomationPlayer`, a `mce::UUID`, `RequestId`, `PlayerId`), `IsInternal` (boolean), `Version` (int32).

### Parameter types, enums and soft enums

Mojang publishes the whole Bedrock command set as machine-readable data: `metadata/command_modules/mojang-commands.json` in `Mojang/bedrock-samples` (1.21 MB, 1.26.50.4). It contains **84 commands**, **279 overloads**, **1186 parameters** and **236 command enums** holding **14281 values**.

Of the 262 distinct parameter type names, 236 are enums and **26 are basic types**:

| Type | Uses |
|---|---|
| `SELECTION` (target) | 147 |
| `VAL` (value) | 86 |
| `INT` | 84 |
| `ID` (string) | 54 |
| `POSITION_FLOAT` (float position) | 52 |
| `POSITION` (block position) | 45 |
| `RVAL` (relative value) | 31 |
| `EXECUTECHAINEDOPTION_0` (chained subcommand) | 17 |
| `PATHCOMMAND` (filepath) | 13 |
| `WILDCARDSELECTION` (wildcard target) | 9 |
| `BLOCK_STATE_ARRAY` | 8 |
| `JSON_OBJECT` | 7 |
| `MESSAGE_ROOT` (message) | 6 |
| `WILDCARDINT` | 2 |
| `COMPAREOPERATOR`, `OPERATOR`, `FULLINTEGERRANGE`, `CODEBUILDERARGS` (command), `RAWTEXT`, `POI_TYPE`, `POI_TAG`, `CLOCK_TIMEMARKER_NAME`, `POSTFIX_T`, `POSTFIX_S`, `POSTFIX_D`, `POSTFIX_L` | 1 each |

That is 26 against the 59 parsers Java's 26.3 tree uses. The largest enums show where the packet's weight is: `UnlockableRecipeValues` (4202 values), `Item` (3411), `Block` (2648), `Tool` (2079), `EntityEvents` (479), `features` (286), `EntityType` (229), `featureRules` (170).

Exactly **four enums are soft** (declared with an empty `values` array, filled at runtime over `UpdateSoftEnumPacket`): `ScoreboardObjectives`, `TagValues`, `GameTestName`, `GameTestTag`. That is the complete vanilla soft-enum set. This repository adds a fifth of its own, a soft enum named `Player` carrying online player names (`packages/prismarine/src/network/PlayerSession.ts:902-913`).

The parse symbol is a 32-bit word. From `packages/prismarine/src/network/type/CommandParameter.ts:11-16`, matching gophertunnel's `protocol/command.go` at protocol 2193:

```
Valid    = 0x100000
Enum     = 0x200000
Postfix  = 0x1000000
SoftEnum = 0x4000000
```

A basic parameter is `Valid | <type id>`; an enum parameter is `Enum | Valid | <index into Enum Data>`; a soft enum parameter is `SoftEnum | Valid | <index into Soft Enums>`; a postfixed integer is `Postfix | <index into Post Fixes>`. Hard and soft enums are numbered in separate tables. The type ids this repository implements, from the same file:

```
Int 1, Float 3, Value 4, WildcardInt 5, Operator 6, CompareOperator 7, Target 8,
String 56, BlockPosition 64, Position 65, Message 67, RawText 70, Json 74, Command 87
```

A postfixed parameter is the one case with no `Valid` bit. PocketMine states the rule: "This flag is set on all types EXCEPT the POSTFIX type."

The `Options` byte is `CommandParameterOption`: `None = 0`, `EnumAutocompleteExpansion = 1`, `HasSemanticConstraint = 2`, `EnumAsChainedCommand = 4`. This repository has the first two under different names (`FORCE_COLLAPSE_ENUM`, `FLAG_HAS_ENUM_CONSTRAINT`) and not the third.

**The numeric type ids shifted between 1.26.40 and 1.26.50.** `PoiTag` and `PoiType` were inserted at 87 and 88, which moved everything above them. The ids at protocol 2193, with Mojang's own metadata name:

| Mojang metadata name | id at 2193 | common library name |
|---|---|---|
| `INT` | 1 | int |
| `VAL` | 3 | float |
| `RVAL` | 4 | value |
| `WILDCARDINT` | 5 | wildcard int |
| `OPERATOR` | 6 | operator |
| `COMPAREOPERATOR` | 7 | compare operator |
| `SELECTION` | 8 | target |
| `WILDCARDSELECTION` | 10 | wildcard target |
| `PATHCOMMAND` | 17 | filepath |
| `FULLINTEGERRANGE` | 23 | integer range |
| `EQUIPMENTSLOTENUM` | 47 | equipment slot |
| `ID` | 56 | string |
| `POSITION` | 64 | block position |
| `POSITION_FLOAT` | 65 | position |
| `MESSAGE_ROOT` | 68 | message |
| `RAWTEXT` | 70 | raw text |
| `JSON_OBJECT` | 74 | json |
| `BLOCK_STATE_ARRAY` | 84 | block states |
| `CLOCK_TIMEMARKER_NAME` | 86 | |
| `POI_TAG` | 87 | new in 1.26.50 |
| `POI_TYPE` | 88 | new in 1.26.50 |
| (`Command`) | 89 | |
| (`SlashCommand`) | 90 | |
| `CODEBUILDERARGS` | 92 | command |

Ids 0 through 86 are unchanged from 1.26.40. The id source is LeviLamina's `CommandRegistry.h` at tag `v26.51.8`, which is a reverse-engineered header rather than a Mojang publication; the shift is corroborated by `POI_TAG` and `POI_TYPE` appearing in Mojang's own 1.26.50.4 metadata as parameter types that did not exist before.

`CommandData.Flags` is a `uint16` that Mojang documents only as "The command flags". The bit layout, from LeviLamina's `CommandFlag.h`:

```
UsageTest 0x001, HiddenFromCommandBlockOrigin 0x002, HiddenFromPlayerOrigin 0x004,
HiddenFromAutomationOrigin 0x008, SyncLocal 0x010, ExecuteDisallowed 0x020,
TypeMessage 0x040, NotCheat 0x080, Async 0x100, NoEditor 0x200
```

with `Hidden = 0x006` and `Removed = 0x00E` as the named combinations. The three `HiddenFrom*` bits suppress a command per command-origin kind (player chat UI, command block UI, automation websocket), `ExecuteDisallowed` blocks it from `/execute`, and `NotCheat` exempts it from the cheats gate. This repository always writes `flags = 0`, which is the safe default.

Mojang's schema names the constraint fields but not the index values. `CommandRegistry` keeps `std::vector<SemanticConstraint> mSemanticConstraints` and `using SemanticConstraintID = uchar`, so the on-wire bytes are indices into a registration-ordered vector, not the game's internal bitfield. gophertunnel, Cloudburst and minecraft-data all agree the order is `0` cheats enabled, `1` operator permissions, `2` host permissions, `3` allow aliases. PocketMine writes the bitfield values (`1<<0` through `1<<3`) instead, which cannot both be right; see "Open questions". A constraint attaches to one value of one hard enum and hides or rejects that single value unless the condition holds. `packages/prismarine/src/network/type/CommandEnumConstraint.ts` stores them as an opaque `number[]`, which sidesteps the disagreement.

### Three concrete defects in this repository's parameter table

1. **`CommandArgumentType.Command = 87` is stale for protocol 2193.** 87 is now `PoiTag`. Vanilla does not use `Command` (89) for a command-valued parameter either: Mojang's own metadata spells `/execute run <command: CODEBUILDERARGS>`, which is 92. `packages/prismarine/src/network/type/CommandParameter.test.ts:30` pins the stale value.
2. **`CommandArgumentType.Message = 67` is probably wrong.** `MESSAGE_ROOT` (68) is the only message type that appears anywhere in Mojang's 1.26.50.4 metadata; 66 and 67 are inner grammar rules. The repository already picks the root rule correctly everywhere else (`JsonObject` 74 over `JsonValue` 72, `BlockStateArray` 84 over `BlockState` 80, `PositionFloat` 65 over `CoordXFloat` 61).
3. **`CommandArgumentCommand.getParameters()` advertises a position.** `packages/prismarine/src/command/CommandArguments.ts:370` sets `paramType: CommandParameterType.Position` on a command-valued argument, directly below `CommandArgumentPosition`, which is where the value came from. The `/execute` command's trailing argument is therefore sent to the client as a float position.

Everything else in the packet layer checks out against Mojang's 1.26.51 documentation: field order, fixed-`uint32` enum indices, the lowercase permission string, the `int32 -1` alias index, separate hard and soft enum index spaces, packet ids `0x4c` and `0x72`, and the `UpdateSoftEnumPacket` field order. Unimplemented but specified: chained subcommands (the repo writes `0`, `0` and `isChaining = false` placeholders), `CommandData.flags`, and `CommandParameterOption.EnumAsChainedCommand`.

### Permission model

Bedrock has two independent ladders, both generated in this repository from `Mojang/bedrock-protocol-docs` v1.26.51 (protocol 2193):

```ts
// packages/minecraft/src/generated/CommandPermissionLevel.ts
ANY = 0, GAME_DIRECTORS = 1, ADMIN = 2, HOST = 3, OWNER = 4, INTERNAL = 5
// packages/minecraft/src/generated/PlayerPermissionLevel.ts
VISITOR = 0, MEMBER = 1, OPERATOR = 2, CUSTOM = 3
```

`CommandPermissionLevel` is what `AvailableCommandsPacket` writes per command; `PlayerPermissionLevel` is what the player carries. Across Mojang's 84 commands the distribution is level 1 (`GameDirectors`) 61 commands, level 4 (`Owner`) 10, level 2 (`Admin`) 7, level 0 (`Any`) 5, level 3 (`Host`) 1. Each command also carries `requires_cheats`.

Java's ladder in 26.3 is the named `PermissionLevel` enum (`all`, `moderators`, `gamemasters`, `admins`, `owners`), with `op-permission-level` and `function-permission-level` in `server.properties`, and the client is told only a single bit per node (`allows_restricted`, mask `0x20`).

The filtering strategy differs. Java sends every player a tree already filtered by `CommandNode.canUse`. Bedrock does the same thing structurally, and this repository implements it: `PlayerSession.sendAvailableCommands` skips any command the player lacks permission for before building its `CommandData` (`PlayerSession.ts:924`).

### Syntax differences

| Area | Java 26.3 | Bedrock 1.26.50 |
|---|---|---|
| Command tree shape | nodes with children, redirects and forks | flat list of overloads per command, plus "chained subcommand" data for `/execute` only |
| Namespaces | `minecraft:` optional in commands, required in data ids | not used in commands |
| Block states | `stone_stairs[facing=north]` | `stone_stairs["facing"="north"]`, a `BLOCK_STATE_ARRAY` parameter |
| Items | `minecraft:stick[custom_name='...']`, the component syntax | item name plus integer data value; no component syntax |
| NBT | `minecraft:nbt_path`, `nbt_tag`, `nbt_compound_tag` parsers; `/data` | no NBT path type, no `/data` |
| Functions | namespaced id or `#tag`, with `with` and macros | filepath, no tags, no arguments |
| Structures | `/place structure\|feature\|jigsaw\|template` | `/structure save\|load\|delete` and `/place` |
| Conditionals | `execute if` with 13 conditions | `execute if` with 4, plus the legacy `/testfor`, `/testforblock`, `/testforblocks` |
| Clone/fill modes | `replace\|masked\|filtered` + `force\|move\|normal` | `CLONEMODE` and `FILLMODE`/`MASKMODE` enums with the same shape |
| Text output | `/tellraw <targets> <component>` | `/tellraw <targets> <RAWTEXT>` plus `/titleraw` |
| Gamerule names | `minecraft:send_command_feedback` | `sendcommandfeedback`, lowercase and unnamespaced |

Mojang's own Bedrock gamerule examples confirm the last row: "commandblockoutput", "sendcommandfeedback", "commandblocksenabled", "dodaylightcycle", "doweathercycle" (https://learn.microsoft.com/en-us/minecraft/creator/documents/commandsnewexecute).

### Bedrock's /execute

Bedrock gained the Java-shaped `/execute` in 1.19.50. Mojang's metadata gives the exact current shape: 18 overloads, permission level 1, `requires_cheats: true`.

```
as <origin: SELECTION> <chainedCommand>
at <origin: SELECTION> <chainedCommand>
in <dimension: overworld|nether|the_end> <chainedCommand>
positioned <position: POSITION_FLOAT> <chainedCommand>
positioned as <origin: SELECTION> <chainedCommand>
rotated <yaw: RVAL> <pitch: RVAL> <chainedCommand>
rotated as <origin: SELECTION> <chainedCommand>
facing <position: POSITION_FLOAT> <chainedCommand>
facing entity <origin: SELECTION> <anchor: eyes|feet> <chainedCommand>
align <axes: ID> <chainedCommand>
anchored <anchored: eyes|feet> <chainedCommand>
if|unless block <position: POSITION> <block: Block[2648]> [<chainedCommand>]
if|unless block <position> <block> <blockStates: BLOCK_STATE_ARRAY> [<chainedCommand>]
if|unless blocks <begin> <end> <destination> <scan mode: masked|all> [<chainedCommand>]
if|unless entity <target: SELECTION> [<chainedCommand>]
if|unless score <target> <objective> <operation: COMPAREOPERATOR> <source> <objective> [<chainedCommand>]
if|unless score <target> <objective> matches <range: FULLINTEGERRANGE> [<chainedCommand>]
run <command: CODEBUILDERARGS>
```

Against Java's 14 subcommands, Bedrock is missing `on`, `store` and `summon` entirely, and `positioned over <heightmap>`. Against Java's 13 `if`/`unless` conditions it has 4; missing are `biome`, `data`, `dimension`, `function`, `items`, `loaded`, `predicate`, `slots` and `stopwatch`.

The missing `store` is the structurally important one. Without it a Bedrock client cannot express "capture this command's result into a score or NBT path", which is the backbone of most Java datapack logic.

### Which Java commands have no Bedrock client representation

Comparing Mojang's Bedrock command list (82 pages in `commands/toc.json`, 84 entries in `mojang-commands.json`, the extra two being `editor-allowlist` and `serveridentity`) against Java's 94 roots:

**46 names in both**: `clear clone damage deop difficulty effect enchant execute fill function gamemode gamerule give help kick kill list locate loot me op particle place playsound recipe reload ride say schedule scoreboard setblock setworldspawn spawnpoint spreadplayers stop stopsound summon tag teleport tell tellraw time title transfer weather xp`

**48 Java-only names**: `advancement attribute ban ban-ip banlist bossbar compute data datapack debug defaultgamemode dialog experience fetchprofile fillbiome forceload item jfr msg pardon pardon-ip perf posteffect publish random return rotate save-all save-off save-on seed setidletimeout spectate stopwatch swing team teammsg test tick tm tp trigger unpublish version w waypoint whitelist worldborder`

Some of those are aliases (`tp`, `msg`, `w`, `tm`) or server administration with a differently named Bedrock equivalent (`ban*`/`pardon*`/`whitelist` versus `allowlist`; `save-all`/`save-off`/`save-on` versus `save`). The ones that are genuinely inexpressible on a Bedrock client, and why:

| Java command | Why Bedrock cannot show it |
|---|---|
| `/data` | no `nbt_path`, `nbt_tag` or `nbt_compound_tag` parameter type |
| `/item ... <modifier>` | no `loot_modifier` type; `/replaceitem` is the closest and takes a literal item |
| `/function <id> with ...` | `/function` takes a `PATHCOMMAND` and nothing else |
| `/attribute` | no attribute registry parameter type |
| `/bossbar`, `/team`, `/teammsg` | no command at all; the boss bar exists at the protocol level, teams do not exist |
| `/advancement` | advancements do not exist in Bedrock |
| `/datapack` | pack management is `/packstack`, with different semantics |
| `/return` | function results do not exist |
| `/trigger` | no `trigger` scoreboard criterion (Bedrock has only `dummy`) |
| `/random` | no command; `/scoreboard players random` is the nearest |
| `/forceload` | `/tickingarea` is the nearest, with different arguments |
| `/execute store`, `execute on`, `execute if predicate\|data\|items\|slots\|function\|biome\|loaded\|dimension` | subcommands absent from the 18 overloads |
| `/worldborder` | no world border |
| `/waypoint`, `/dialog`, `/compute`, `/stopwatch`, `/posteffect`, `/swing`, `/rotate` | 26.x Java additions with no Bedrock analogue |

**36 Bedrock-only names**: `aimassist allowlist camera camerashake changesetting clearspawnpoint controlscheme daylock dialogue event fog gametest hud inputpermission mobevent music packstack permission playanimation project reloadconfig reloadpacketlimitconfig replaceitem save script scriptevent sendshowstoreoffer setmaxplayers structure testfor testforblock testforblocks tickingarea titleraw toggledownfall wsserver`

The practical rule for a server that serves Bedrock clients: anything outside the 26 parameter types has to reach the server as `ID` (a plain string), `MESSAGE_ROOT`, `JSON_OBJECT` or a soft enum, and be parsed server-side. The client will not validate it, will not autocomplete it, and will not reject a malformed argument before sending.

Sources: `Mojang/bedrock-samples` `metadata/command_modules/mojang-commands.json` at `46ba6ea985fb5a92d79a9419198f10dda14c199d` (version.json `latest: 1.26.50.4`); `https://learn.microsoft.com/en-us/minecraft/creator/commands/toc.json?view=minecraft-bedrock-stable`; `Mojang/bedrock-protocol-docs` branch `r/26_u4_hotfix5`; this repository's `packages/prismarine/src/network/` and `packages/minecraft/src/generated/`.

## 6. Selectors

### Java 26.3

The 26.3 jar names the six base selectors as string constants in `net/minecraft/commands/arguments/selector/EntitySelectorParser.class`:

```
@a  @e  @n  @p  @r  @s
```

`@n` is the newest. The 1.21 release notes (24w21a) introduce it: "Added @n entity selector, selecting the nearest entity. This functions as `@e[sort=nearest,limit=1]`. Additional requirements may still be provided; for example: `@n[type=pig]` will select the closest Pig" (https://launchercontent.mojang.com/v2/javaPatchNotes.json). Java has no `@initiator`.

`net/minecraft/commands/arguments/selector/options/EntitySelectorOptions.class` names **21 options** and the error keys that constrain them:

| Option | Value | Notes |
|---|---|---|
| `x`, `y`, `z` | double | selector origin |
| `dx`, `dy`, `dz` | signed double | cuboid volume, hitbox intersection |
| `distance` | `float_range` | `ERROR_RANGE_NEGATIVE` rejects negatives |
| `level` | `int_range` | players only; `ERROR_LEVEL_NEGATIVE` |
| `limit` | positive int | `ERROR_LIMIT_TOO_SMALL` |
| `sort` | `nearest`, `furthest`, `random`, `arbitrary` | the class holds `ORDER_NEAREST`, `ORDER_FURTHEST`, `ORDER_RANDOM`, `ORDER_ARBITRARY` and `ERROR_SORT_UNKNOWN` |
| `gamemode` | gamemode name | `ERROR_GAME_MODE_INVALID` |
| `name` | string | |
| `x_rotation`, `y_rotation` | `float_range` | |
| `type` | entity id or `#tag` | `ERROR_ENTITY_TYPE_INVALID`; `limitToType` |
| `tag` | string | |
| `team` | team name | |
| `scores` | `{objective=int_range, ...}` | |
| `advancements` | `{id=bool}` or `{id={criterion=bool}}` | |
| `nbt` | SNBT compound | `compareNbt` |
| `predicate` | predicate id | `addPredicate`, `PREDICATE` |

Two classes encode repeatability directly. `SetOnceOptionState` has `canParse`/`markParsed`/`hasValue` and is the single-use case. `InvertableSetOptionState` has `canParsePositiveElement`, `canParseNegativeElement`, `canParseTag`, `canParseAny`, `canParseAnyTag`, `canLimitToSingle`, `canLimitToMultiple` and a nested `Limitation` enum with `NONE`, `SINGLE`, `MULTIPLE`. That is the mechanism behind "one positive `type=`, many negative `type=!`".

Range syntax is `a..b`, `a..`, `..b` and bare `a`, backed by `minecraft:int_range` and `minecraft:float_range` (4 and 2 uses in the 26.3 command tree). Default `limit`/`sort` per base selector are `@p` 1/nearest, `@r` 1/random, `@n` 1/nearest, `@a` unlimited/arbitrary, `@e` unlimited/arbitrary; only `@n`'s is stated by Mojang (the 1.21 note above), the rest are from https://minecraft.wiki/w/Target_selectors and are secondary.

Recent changes, from Mojang's patch-note feed:

- 1.21.2 (24w33a): "Invalid selector patterns in Chat Components will now cause commands to fail to parse, instead of resolving to an empty string".
- 26.1 (26.1-snapshot-8): the `minecraft:selector` component's `selector` field "no longer accepts trailing data after a selector"; same for `minecraft:nbt`'s `entity` field.
- 26.2: MC-307125 fixed, duplicate `team` arguments parsed inconsistently depending on argument order.
- 26.3: nothing selector-related.

No selector argument has been removed since 1.13.

### Bedrock 1.26.x

Mojang's own selector page (https://learn.microsoft.com/en-us/minecraft/creator/documents/targetselectors, last updated 2023-09-20) still says "There are 6 base selectors" and lists `@p @a @r @e @s @initiator`. It is stale: `@n` was added in 1.21.100 ("Added @n target selector which returns the single closest entity", https://feedback.minecraft.net/), and the page omits `hasitem`, `haspermission` and `has_property` entirely. The newer argument-type page (https://learn.microsoft.com/en-us/minecraft/creator/reference/content/commandsreference/examples/commandtypes/type_selection, updated 2026-03-05) lists `hasitem` but omits `@n`, `@initiator`, `haspermission` and `has_property`. Mojang publishes no complete Bedrock selector reference.

Base selectors: `@p @a @r @e @s @initiator @n`. Arguments:

| Argument | Syntax | Java counterpart |
|---|---|---|
| `x`, `y`, `z` | double, `~` allowed; integers are center-corrected unless a distance or volume argument is present | `x`, `y`, `z` (no center correction, no tilde) |
| `r`, `rm` | two scalars, max and min | one `distance` range |
| `dx`, `dy`, `dz` | signed | same |
| `l`, `lm` | two scalars | one `level` range |
| `rx`, `rxm` | two scalars, pitch | one `x_rotation` range |
| `ry`, `rym` | two scalars, yaw | one `y_rotation` range |
| `m` | gamemode, with shorthands `s`/`0`, `c`/`1`, `a`/`2`, `d`/`5` | `gamemode`, long names only |
| `c` | count; **negative reverses order** | `limit` plus `sort` |
| `name`, `tag`, `type`, `scores` | as Java, except `scores` accepts `!` inside the object | Java's `scores` has no inner `!` |
| `family` | `minecraft:type_family` component value | none |
| `hasitem` | `{item,data,quantity,location,slot}` or a list of those | none |
| `haspermission` | `{camera=enabled, movement=disabled, ...}` | none |
| `has_property` | `{<prop>=<value>}`, `{property=<prop>}`, with `!` | none |

Bedrock-only argument history, from Mojang's own Bedrock changelogs on feedback.minecraft.net: `hasitem` in beta 1.18.20.21 ("Added the 'hasitem' filter for target selector of entities"), `haspermission` in 1.19.80.21, `has_property` in 1.20.70.21, granular input permissions added to `haspermission` in 1.21.50.20, `@n` in 1.21.100.

### The gaps

Syntactic only, mechanically convertible both ways:

- `distance=a..b` becomes `rm=a,r=b`; `level`, `x_rotation` and `y_rotation` decompose the same way.
- `gamemode` maps onto `m`.
- `sort=furthest` maps onto a negative `c`.

Semantic, with no conversion:

- `sort=arbitrary` has no Bedrock expression. Bedrock's `c` always orders.
- `team` has no Bedrock expression because Bedrock has no teams.
- `advancements` has no Bedrock expression because Bedrock has no advancements.
- `predicate` has no Bedrock expression. This is the largest gap: Java's `predicate` is an open extension point backed by a datapack registry; Bedrock has nothing comparable at the selector level.
- `nbt` has no Bedrock expression. `hasitem` and `has_property` cover narrow slices.
- `type=#tag` has no Bedrock expression; `family` is per-entity data, not a registry tag.
- Going the other way, `family`, `hasitem`, `haspermission`, `has_property` and `@initiator` have no Java expression, and Bedrock's `scores={obj=!5}` needs `execute unless entity @s[scores={obj=5}]` in Java.

For a server that accepts Bedrock clients and runs Java datapack logic, the consequence is that the selector string arriving in `CommandRequestPacket` must be parsed by the server against the Java grammar when it came from a function, and against the Bedrock grammar when it came from a player. The two grammars share argument names for `x`, `y`, `z`, `dx`, `dy`, `dz`, `scores`, `tag`, `name` and `type` and disagree on everything else, so a single parser needs a dialect flag rather than a merged grammar.

## 7. Scoreboards, teams, boss bars and text components

### Scoreboard criteria

Java's `net/minecraft/world/scores/` classes carry the base criteria as constants: `dummy`, `trigger`, `health`, `food`, `air`, `armor`, `level`, `xp`, plus the kill and death counters, plus statistic criteria of the form `minecraft.custom:<stat>`, `minecraft.used:<item>`, `minecraft.mined:<block>`, `minecraft.crafted:`, `minecraft.broken:`, `minecraft.picked_up:`, `minecraft.dropped:`, `minecraft.killed:` and `minecraft.killed_by:`, and the team-color compounds `teamkill.<color>` and `killedByTeam.<color>`.

Bedrock supports exactly one criterion. Mojang's own `mojang-commands.json` settles it: the enum `ScoreboardCriteria` has a single value.

```
python3 -I -c '...' mojang-commands.json   # SCOREBOARDCRITERIA = ['dummy']
```

Mojang's prose agrees: "Because the objectives we're tracking don't already exist in the game, you should give them the type 'dummy'" (https://learn.microsoft.com/en-us/minecraft/creator/documents/scoreboardintroduction).

### Display slots

Java has `list`, `sidebar`, `below_name` and 16 `sidebar.team.<color>` slots, all present as string constants in `net/minecraft/world/scores/`:

```
list sidebar below_name sidebar.team.{black,dark_blue,dark_green,dark_aqua,dark_red,
dark_purple,gold,gray,dark_gray,blue,green,aqua,red,light_purple,yellow,white}
```

`belowName` was renamed to `below_name` in 1.20.2 (23w31a): "Renamed `belowName` value in display slot argument in scoreboard command to `below_name`".

Bedrock has three: `list`, `sidebar`, `belowname`, with no team variants, and adds an `ascending|descending` sort order to the two sortable slots (`ScoreboardDisplaySlotSortable` and `ScoreboardDisplaySlotNonSortable` in Mojang's metadata).

### Objective and score formatting

Java 1.20.3 (23w46a) added number formatting, which Bedrock has no equivalent of:

> Scores in numeric form can now be formatted. Formats can be set for both objectives and individual scores. Scores with set formats will render the same in all context (sidebar, under player name, etc.) ... `styled <style>` - the score will be displayed with selected style (like `{"bold":true}`); `fixed <text component>` - the score will be replaced with the text component; `blank` - the score will not be displayed.

The same release added `displayautoupdate` and `/scoreboard players display name|numberformat`. `ScoreboardCommand.class` in 26.3 carries all of it: `blank`, `fixed`, `styled`, `numberformat`, `displayautoupdate`, `displayname`, `rendertype`, and the message keys `commands.scoreboard.players.display.name.set.success.*` and `.clear.success.*`. 1.21.5 (25w02a) changed `styled`'s argument from JSON to SNBT and made text component arguments to `/bossbar`, `/scoreboard` and `/team` resolve against `@s` before use.

Bedrock's whole `/scoreboard` is 11 overloads in Mojang's metadata: `objectives add|remove|list|setdisplay` and `players list|reset|test|random|set|add|remove|operation`. There is no `modify`, no `displayname`, no `rendertype`, no `displayautoupdate`, no `numberformat` and no `players display`. Bedrock does have `players test` and `players random`, which Java lacks. The only way to color a Bedrock score holder is a section-sign code inside a fake-player name.

### Teams

Java's `/team` has `list`, `add`, `remove`, `empty`, `join`, `leave` and `modify` with 9 options: `displayName`, `color`, `friendlyFire`, `seeFriendlyInvisibles`, `nametagVisibility` (`always`/`never`/`hideForOtherTeams`/`hideForOwnTeam`), `deathMessageVisibility` (same four), `collisionRule` (`always`/`never`/`pushOtherTeams`/`pushOwnTeam`), `prefix`, `suffix`. 26.3 changed the result: "The result of the `team join` and `team leave` subcommands now reflects the exact count of entities that have joined or left".

**Bedrock has no `/team`.** It is absent from Mojang's 84-command metadata and from the 82-page command TOC. The partial substitutes are `/tag` for membership (no color, no visibility rules, no collision rule, no prefix or suffix, no friendly-fire control) and section-sign codes in entity custom names for color. Nothing covers `friendlyFire`, `seeFriendlyInvisibles`, `nametagVisibility`, `deathMessageVisibility` or `collisionRule`.

This matters for datapack parity because `team=` is a selector argument and `/team modify ... prefix|suffix` is how a large share of Java map content labels entities.

### Boss bars

Java's `/bossbar` has `add`, `get` (`max`/`players`/`value`/`visible`), `list`, `remove` and `set` (`color` from 7, `max`, `name`, `players`, `style` from 5, `value`, `visible`). Bars persist in `level.dat` under `CustomBossEvents`.

**Bedrock has no `/bossbar` command**, but the packet exists. This repository implements it at `packages/prismarine/src/network/packet/BossEventPacket.ts`, citing `https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/boss-event-packet/`:

- `BossEventUpdateType`: `Add=0, PlayerAdded=1, Remove=2, PlayerRemoved=3, UpdatePercent=4, UpdateName=5, UpdateProperties=6, UpdateStyle=7, Query=8`
- `BossBarColor`: `Pink=0, Blue=1, Red=2, Green=3, Yellow=4, Purple=5, RebeccaPurple=6, White=7`
- `BossBarOverlay`: `Progress=0, Notched6=1, Notched10=2, Notched12=3, Notched20=4`

The colors and overlays map one for one onto Java's `color` and `style`, with `RebeccaPurple` extra on the Bedrock side. The structural difference is ownership: Bedrock's bar is bound to a target actor whose health and name tag the client reads, Java's is a free-standing named object with an explicit `players` audience. A server implementing `/bossbar` for Bedrock clients has to synthesize that actor or drive the packet fields directly.

### Text components

Java moved text components off JSON twice. 1.20.3 (23w40a): "Plain-text chat components ... are now always serialized as strings ... Chat components now serialize to NBT when sent over network. Chat components now have an optional `type` value (allowed values: text, translatable, score, nbt, keybind, selector)". 1.21.5 (25w02a): "Text Components are no longer stored as JSON wrapped by a string ... For example, `/tellraw @s {"text":"Hello world"}` may become `/tellraw @s {text:'Hello world'}`."

Content types in 26.3: `text`; `translatable` (`translate`, `with`, `fallback`, the last added 1.19.3); `score` (`{name, objective}`); `selector` (`selector`, `separator`, the latter added 1.17); `keybind`; `nbt` (`nbt`, `source` = `entity`/`block`/`storage`, `interpret`, `separator`, and `plain`, new in 26.1); and `object`, new in 1.21.9, which renders an 8x8 sprite from an atlas or a player head and gained an optional `fallback` in 26.1.

Style fields: `color` (16 names or `#RRGGBB`), `font`, `bold`, `italic`, `underlined`, `strikethrough`, `obfuscated`, `insertion`, `shadow_color` (added 1.21.4, "A packed integer ARGB value (e.g. -1); An array of RGBA values (e.g. [1, 1, 1, 1]). If specified as 0, the shadow will never be displayed"), `click_event`, `hover_event`, `extra`.

1.21.5 renamed the event fields and restructured their payloads. `hoverEvent` became `hover_event`: `show_text`'s `contents` became `value`, `show_item`'s `contents` object was inlined to `id`/`count`/`components`, `show_entity`'s was inlined with `id` becoming `uuid` and `type` becoming `id`. `clickEvent` became `click_event`: `open_url`'s `value` became `url`, `open_file`'s became `path`, `run_command` and `suggest_command`'s became `command`, `change_page`'s became a positive integer `page`, and only `copy_to_clipboard` kept `value`. 1.21.6 added two click actions, `minecraft:custom` (`id` plus an NBT `payload`) and `minecraft:show_dialog`. 26.3 capped `/tellraw`: "The `nbt` component in a raw chat message will only be resolved up to 64k times."

Bedrock's `rawtext` is four node types and nothing else (https://learn.microsoft.com/en-us/minecraft/creator/reference/content/rawmessagejson):

```json
{"rawtext": [
  {"text": "..."},
  {"translate": "key", "with": ["a"] },
  {"score": {"name": "@s", "objective": "obj"}},
  {"selector": "@e[type=pig]"}
]}
```

Translation slots are `%%1`, `%%2` where Java uses `%s` and `%1$s`. There is no `extra`, no style object, no `keybind`, no `nbt`, no `object`, no `separator`, no `fallback`, no `insertion`, no `font`, no click event and no hover event. Styling is inline section-sign codes, which are positional and do not nest. Mojang's published code table runs `§0` to `§u` plus `§k`/`§l`/`§o`/`§r`, including Bedrock-only material colors (`§g` gold, `§h` warm light gray, `§i` cool light gray, `§j` dark brown, `§m` dark red, `§n` brown, `§p` gold, `§q` dark green, `§s` aqua, `§t` dark teal, `§u` purple), and lists `§v` to `§z` as having no effect. **Bedrock has no hex color**: Mojang's table is a closed set with no `§#RRGGBB` or `§x` form.

The Java component features with no Bedrock representation at all: every hover event, every click event, `insertion`, `font`, hex `color`, `shadow_color`, `keybind`, `nbt`, `object`, `separator`, `fallback`, and nested `extra` with style inheritance.

`TextPacket` in this repository (`packages/prismarine/src/network/packet/TextPacket.ts`, protocol 2193) has 12 types: `Raw=0, Chat=1, Translate=2, Popup=3, JukeboxPopup=4, Tip=5, SystemMessage=6, Whisper=7, Announcement=8, TextObjectWhisper=9, TextObject=10, TextObjectAnnouncement=11`. The three `TextObject*` types are the ones that carry `rawtext`.

### Titles

Java has one `/title` taking a text component for every form. Bedrock splits it: `/title <player> title|subtitle|actionbar <message_root>` takes plain text, and `/titleraw <player> title|subtitle|actionbar <json>` takes `rawtext`. The split exists at the protocol level too: `TitleType` in `packages/minecraft/src/generated/TitleType.ts` (generated from `Mojang/bedrock-protocol-docs` v1.26.51) is `CLEAR=0, RESET=1, TITLE=2, SUBTITLE=3, ACTIONBAR=4, TIMES=5, TITLE_TEXT_OBJECT=6, SUBTITLE_TEXT_OBJECT=7, ACTIONBAR_TEXT_OBJECT=8`, where the `*_TEXT_OBJECT` members carry what `/titleraw` builds. The same split applies to `/tell` versus `/tellraw`.

## 8. Performance

### There are no published figures, and the cost model replaces them

Mojang publishes no measurement of function execution cost. What it publishes is a budget, and the budget is the thing to design against.

Per "command chain state" (one tick's worth of function work from one entry point), Java counts operations against `minecraft:max_command_sequence_length` and contexts against `minecraft:max_command_forks`. The 1.20.3 changelog defines an operation as one of:

- "execution of command for a single context"
- "execution of a stage in `execute` (no matter how many contexts were modified)"
- "invocation of function"

and a context as a fork product: "if there are 5 entities in world, `execute as @e` creates 5 contexts, while `execute as @e at @e` creates 5*5 = 25 contexts". Both limits are 65536 by default. A pack that respects them runs at most 65536 command executions per entry point per tick, and chat and console commands now count against the same budget ("Limits now apply even for commands run from the server console or chat input").

Bedrock's cap is per call and an order of magnitude smaller: "Minecraft: Bedrock Edition cannot run more than 10,000 commands in one function call" (https://learn.microsoft.com/en-us/minecraft/creator/documents/functionsintroduction). Mojang's `tick.json` page adds the only perf guidance it gives: "Be cautious not to run too many commands every tick, as it could affect performance, especially in low-end devices."

Vanilla's own per-tick function cost in both editions is **zero**, because neither ships a tick function (section 3). Any figure for "what vanilla costs per tick in functions" is zero commands.

PaperMC publishes nothing either. Searching its repository for `maxCommandChainLength` returns no code hits, and `max_command_sequence_length` returns three, all in gamerule constant classes rather than configuration. The only command-adjacent performance issue, PaperMC/Paper#3154, is about Brigadier tree sorting on login, not execution.

### Profiling cannot see datapacks

spark, the profiler most Minecraft servers use, cannot attribute time to a datapack. Its Sources View maps a stack frame to a plugin or mod by class loader (`ClassSourceLookup.ByClassLoader` and `ByCodeSource`; `PaperClassSourceLookup` reflects `PluginClassLoader#plugin`), and `SourceMetadata`'s javadoc says "A 'source' is a plugin or mod". Datapack commands run inside vanilla classes on the server's own loader, so they are structurally unattributable. Datapacks appear in spark only as inventory metadata (`WorldStatistics.DataPack` in `spark.proto`). Open requests confirm the gap (spark#383, spark#551).

spark's own curated info point for `ServerFunctionManager.tick()` sends you elsewhere: "Deals with functions from datapacks that are executed repeatedly. To find out which datapacks or functions are expensive, you may use the `/perf` command from Minecraft" (https://github.com/lucko/spark-infopoints/blob/master/minecraft-server.yaml). Vanilla's `/perf` is the tool, and `PerfCommand` is one of the 109 classes in `net/minecraft/server/commands/`.

The only published per-command numbers are community benchmarks reported as a percentage of a tick, comparable only within one test. Misode's set (https://gist.github.com/misode/7361ea08fea000fc67c0cb623ce85cc6, undated, version unstated) shows the shape of the cost: `execute as @e[nbt={OnGround:1b}]` at 39.85 percent of a tick against `execute as @e if entity @s[nbt={...}]` at 50.14, and for predicates `as @e[predicate=foo]` 15.49 < `as @e if predicate foo` 20.45 < `as @e if entity @s[predicate=foo]` 23.32 < `as @e at @s if predicate foo` 25.22. The lesson is that cost is dominated by which command runs, not how many: selector width and NBT or predicate evaluation per entity, not dispatch.

That gives a sanity check on the budget. 65536 operations inside a 50 ms tick implies 760 ns per operation sustained, which is far below what anything touching a selector costs. `max_command_sequence_length` is an anti-runaway guard, not a performance budget; real packs hit wall clock long before they hit it. This is an inference from the two numbers, not a Mojang statement.

### What a function-heavy pack actually costs an implementation

The per-command work splits three ways, and only the first is avoidable by caching:

1. **Parsing.** Non-macro lines are parsed once at datapack load and held as a `ParseResults` chain. Macro lines are reparsed per distinct argument set, with a cache of 8 sets per macro function (`MAX_CACHE_ENTRIES` in `MacroFunction.class`). Mojang states the tradeoff: "an overhead still remains compared to regular functions".
2. **Selector resolution.** `@e` and `@a` run once per `execute as`/`at`/`if entity` stage. This is the term that grows as the fork product, and it is what `max_command_forks` exists to bound.
3. **Command execution.** One dispatch into the game per context.

For this project the dominant cost is likely to be none of those. It is the 302 KiB `AvailableCommandsPacket` that a Bedrock client needs before it can type anything. Encoding Mojang's own 84-command Bedrock tree with the wire layout from section 5 gives roughly 302 KiB: 224627 bytes for 9180 unique enum value strings, 61047 bytes for 236 enum tables at 4 bytes per index, and 23672 bytes for the 84 commands and their 279 overloads. Adding Java's 94 commands and their 59 argument parsers on top, flattened into Bedrock overloads, grows the enum tables rather than the command list, because every `resource` and `resource_or_tag` argument becomes a hard enum of registry contents. The packet is sent once per player per permission change, so it is a join-time cost, but it is the largest single packet the server will send.

### How other implementations run functions

| Project | Language | License | Last commit | Runs mcfunction |
|---|---|---|---|---|
| PaperMC/Paper | Java | mixed GPL and MIT | 2026-10-24 | yes, vanilla's own system unpatched |
| Pumpkin-MC/Pumpkin | Rust | GPL-3.0 | 2026-10-24 | yes, including `#minecraft:tick` |
| GlowstoneMC/Glowstone | Java | MIT | 2026-05-18 | yes, pre-1.13 layout, `/function` only |
| Minestom/Minestom | Java | Apache-2.0 | 2026-10-18 | no |
| cuberite/cuberite | C++ | Apache-2.0 | 2026-04-25 | no, it targets 1.8 to 1.12.2 |
| valence-rs/valence | Rust | MIT | 2026-06-15 | no |
| GeyserMC/Geyser | Java | MIT | 2026-10-23 | no, the Java server runs them |
| PocketMine-MP, Nukkit, Endstone | PHP, Java, C++ | LGPL-3.0, GPL-3.0, Apache-2.0 | archived 2026-07-09, 2026-09-19, 2026-10-23 | none of the three |

**Paper embeds vanilla's system unmodified.** Its patch files show `private final ServerFunctionManager functionManager;`, the `profiler.push("commandFunctions"); this.getFunctions().tick();` block, and `ThreadLocal<ExecutionContext<CommandSourceStack>> CURRENT_EXECUTION_CONTEXT` in `Commands.java.patch`, all as unmodified context lines. Paper's only divergence is per-world scheduled-event timers, per-world gamerules, and a one-line tag-loader note (`// Paper - command function tags are not implemented yet`). Paper exposes **no** configuration knob for the command budget; `max_command_sequence_length` appears in its source only inside gamerule constant classes. Paper's `GameRule.java` independently confirms the rename:

```java
@Deprecated(forRemoval = true, since = "1.21.11")
public static final GameRule<Integer> MAX_COMMAND_CHAIN_LENGTH = GameRules.MAX_COMMAND_SEQUENCE_LENGTH;
@Deprecated(forRemoval = true, since = "1.21.11")
public static final GameRule<Integer> MAX_COMMAND_FORK_COUNT = GameRules.MAX_COMMAND_FORKS;
```

**Pumpkin is the closest existing analogue to what this project would build**, and its execution model is a warning. `crates/pumpkin-core/src/data/datapack/function_loader.rs` walks `.mcfunction` files into a `HashMap<String, Vec<String>>` of function id to raw command lines, stripping comments and leading slashes, and loads tags from both `tags/function/` and `tags/functions/`. `crates/pumpkin-core/src/server/mod.rs:1190`, inside `tick_worlds()`:

```rust
let _ = self.datapack_manager.execute_function(self, &source, "#minecraft:tick");
```

`execute_function` then hands each raw line to `server.command_dispatcher.handle_command(source, line)`. That means it reparses every command line on every execution, where vanilla pre-parses non-macro lines once at load. Nested `/function` recurses through `handle_command` rather than queueing, so there is no flat execution context and no tail-call elimination. Grepping its datapack module for `depth|recursion|MAX_|limit` returns nothing: `max_command_sequence_length` and `max_command_forks` exist in its generated gamerule table and are never read. A recursive function exhausts the native stack.

Pumpkin also serves Bedrock clients and builds `AvailableCommandsPacket` natively from its own command tree (`crates/pumpkin-protocol/src/bedrock/client/available_commands.rs`, `crates/pumpkin-core/src/command/client_suggestions.rs::send_bedrock_commands_packet`), vendoring Geyser's mappings under `assets/bedrock/`. It is GPL-3.0, so readable as prior art but not copyable into this repository.

**Glowstone** reads `.mcfunction` and runs each line through `Bukkit.dispatchCommand`, but uses the pre-1.13 `<world>/data/functions/<namespace>/` layout rather than datapacks, and has no `#minecraft:tick`.

**Minestom** has no Brigadier dependency. Its only brigadier artifact is a generated `ArgumentParserType` enum mirroring the wire parser ids; its command API is its own `CommandManager` plus `Graph`/`GraphConverter`. There are zero `mcfunction` references in the repository.

## 9. Prior art for running Java datapack functions outside Mojang's server

### Runtimes that actually execute mcfunction

| Project | Language | License | Activity | Completeness |
|---|---|---|---|---|
| Pumpkin-MC/Pumpkin | Rust | GPL-3.0 | 2026-10-24, 12617 stars | a production server that runs `#minecraft:tick` and `#minecraft:load`, with no budget, no depth guard and no parse cache |
| Alumopper/DatapackSandbox | Kotlin on the JVM | MIT | created 2026-06-27, 4 stars | the most ambitious standalone runtime: full `execute` (`as/at/on/positioned/align/anchored/facing/in/rotated/store/if/unless/run`), `/data` over storage, entity and block, loot tables, predicates, advancements, macros, `/random` with deterministic sequences, version profiles 1.20.4 to 26.2, a per-command support matrix, a CLI, a TeaVM browser build and a Jupyter kernel. Four months old, one author, no external adoption, behavior unverified. |
| AnCarsenat/Datapack-Emulator | Python | GPL-3.0 | created 2026-09-15, 0 stars | claims per-version tick ordering 1.13 to 26.3, selectors, macros, schedules, loot, predicates, advancements, a profiler and a call DAG. One month old, no release, not on PyPI. |
| vanilla-technologies/mcfunction-debugger | Rust | GPL-3.0 | Codeberg, 2026-09-24 | parses but does not execute. It rewrites a datapack into an instrumented one that vanilla then runs. Bundles a 271 KB Mojang `commands.json` and has real argument sub-parsers under `src/parser/command/argument/`. Pinned to roughly 1.20. |
| clang-mc/McfInterp | Python | Apache-2.0 | 2026-08-30, 1 star | toy. `data`, `scoreboard`, `execute`, `function`, `return` and macros over a storage-only store; everything else goes to a `host.external(cmd)` callback. |

Nothing in Go, C# or JavaScript executes mcfunction, except `@datapack-sandbox/vitepress-playground`, which wraps the TeaVM build of the Kotlin engine.

### Spyglass is the TypeScript answer for parsing

`SpyglassMC/Spyglass`, TypeScript, MIT ("Copyright (c) 2019-2025 SPGoding and SpyglassMC contributors"), 478 stars, last commit 2026-10-13. It is the only TypeScript project with a Brigadier-equivalent tree and a complete argument parser set.

`packages/mcfunction/src/tree/type.ts` is Mojang's `commands.json` schema, with the comment "The following properties are provided in `commands.json` created by the data generator":

```ts
interface BaseTreeNode { type: string; children?: {...}; executable?: boolean;
  redirect?: readonly string[]; /** custom */ permission?: 0|1|2|3|4 }
interface ArgumentTreeNode extends BaseTreeNode { type: 'argument'; parser: string;
  properties?: Record<string, unknown> }
```

The tree comes from misode/mcmeta's summary branch, the same republished generator output used in section 2. `packages/java-edition/src/mcfunction/parser/argument.ts` is 1969 lines implementing all 6 `brigadier:*` parsers and 57 `minecraft:*` parsers, and `tree/patch.ts` is 1266 lines of version-conditional tree patches. The split is clean: `@spyglassmc/mcfunction` exports a generic `mcfunction(commandTree, argumentGetter, options)` factory that handles comments, `$` macro lines and line continuation, and `@spyglassmc/java-edition` supplies the Minecraft-specific parsers. The caveat is `@spyglassmc/core`, which carries a full language-server virtual filesystem and symbol table, so taking the parser means taking that architecture.

All packages are MIT and were published 2026-10-13: `core@0.4.57`, `java-edition@0.3.70`, `mcfunction@0.2.60`, `mcdoc@0.3.61`, `nbt@0.3.63`, `json@0.3.61`. Its NBT schemas come from `SpyglassMC/vanilla-mcdoc`.

### Compilers and toolchains, which are prior art for the language rather than the runtime

The important distinction is whether a project **parses** mcfunction or only **generates** it. Only two parse.

| Project | Language | License | Parses or generates |
|---|---|---|---|
| mecha | Python | MIT | **parses**, the reference implementation |
| bolt | Python | MIT | parses, by extending mecha |
| Trident-Language | Java | MIT | parses, via 77 hand-written `*CommandDefinition.java` files, frozen at roughly 1.17 |
| beet | Python | MIT | generates and manages packs; parsing is mecha's job |
| Sandstone | TypeScript | MIT | generates only; a typed command-builder DSL. The only parser in its tree is for SNBT. It cannot ingest a `.mcfunction` file. |
| JMC | Python | MIT | generates only; its `vanilla_command.py` is a flat set of about 100 root command names, not a tree |
| Kore | Kotlin | GPL-3.0 | generates only, most actively version-tracked non-Python option |
| MCFPP | Kotlin | GPL-3.0 | generates only |
| Debris | Rust | MIT | generates only, abandoned 2023 |
| CBScript | Python | no LICENSE file | generates only, 1202 stars, dormant; treat as all rights reserved |
| mcscript (Stevertus) | JavaScript | MIT | generates only, dormant |

**mecha is the design reference.** `mecha/config.py::CommandTree` is a Pydantic model of Mojang's command report, and its `resources/` directory holds 48 version trees from `1_14.json` through `26_3.json`, current with today's release. `spec.py::generate_prototypes()` flattens the tree into `CommandPrototype`s keyed like `execute:as:targets:subcommand`, which is how it handles `execute` chaining and `redirect`. `parse.py` is 2177 lines dispatching on `command:argument:<parser-id>` with real sub-parsers for SNBT, NBT paths, JSON, selectors including `scores`, `advancements` and `predicate`, coordinates with `~` and `^`, and item components including `[!minecraft:x]` removal. The output is an immutable hashable AST with source locations.

If this project builds a TypeScript parser, mecha's tree flattening and Spyglass's parser set are the two things worth copying, and Spyglass is the one with a compatible license.

### Reusable npm packages

| Package | Version | License | Relevance |
|---|---|---|---|
| `prismarine-nbt` | 2.8.0 | MIT | NBT and SNBT, the layer under a command parser |
| `minecraft-data` | 3.117.0 | MIT | Java and Bedrock data dumps; carries the protocol `command_node` type but no command tree |
| `mc-datapack-loader` | 0.6.1 | MIT | loads datapack structure from a zip, a `FileList` or the File System Access API; does not parse mcfunction |
| `deepslate` | 0.27.2 | MIT | emulates worldgen, not commands |
| `@bbfh/tree-sitter-mcfunction` | 0.4.0 | ISC | a tree-sitter grammar with macro support, "tested on >146k lines". Generic: it cannot tell you an argument's `minecraft:*` parser type. |

### Geyser, and the Java-to-Bedrock argument mapping

`GeyserMC/Geyser`, Java, MIT, 5928 stars, last commit 2026-10-23. Geyser does not execute functions: it is a Bedrock-client-to-Java-server proxy, so Java's functions run on the Java server. `BedrockCommandRequestTranslator` normalizes the text, requires a leading slash, and forwards the raw string. There are zero `mcfunction` references in the repository.

What Geyser does do is exactly the translation this project needs, in `core/src/main/java/org/geysermc/geyser/translator/protocol/java/JavaCommandsTranslator.java` (646 lines). The mapping in `mapCommandType`:

```java
case FLOAT, ROTATION, DOUBLE             -> CommandParam.FLOAT;
case INTEGER, LONG                       -> CommandParam.INT;
case ENTITY, GAME_PROFILE                -> CommandParam.TARGET;
case BLOCK_POS                           -> CommandParam.BLOCK_POSITION;
case COLUMN_POS, VEC3                    -> CommandParam.POSITION;
case MESSAGE                             -> CommandParam.MESSAGE;
case NBT_COMPOUND_TAG, NBT_TAG, NBT_PATH -> CommandParam.JSON;   // "TODO NBT was removed"
case RESOURCE_LOCATION, FUNCTION         -> CommandParam.FILE_PATH;
case BOOL                                -> ENUM_BOOLEAN;        // soft enum {"true","false"}
case OPERATION                           -> CommandParam.OPERATOR;
case BLOCK_STATE                         -> ALL_BLOCK_NAMES.get();
case ITEM_STACK                          -> context.getItemNames();
case TEAM_COLOR                          -> VALID_COLORS;
case SCOREBOARD_SLOT                     -> VALID_SCOREBOARD_SLOTS;
case RESOURCE                            -> handleResource(ctx, registryKey, false);
case RESOURCE_OR_TAG                     -> handleResource(ctx, registryKey, true);
case DIMENSION                           -> context.session.getLevels();
case TEAM                                -> context.getTeams();
default                                  -> CommandParam.STRING;
```

`handleResource` special-cases five registries (`minecraft:attribute`, `enchantment`, `entity_type`, `mob_effect`, `worldgen/biome`) and sends everything else as `STRING`. MCProtocolLib's `CommandParser` enum has 63 values and Geyser maps about 22, so roughly 41 parsers silently degrade to `STRING`: `VEC2`, `BLOCK_PREDICATE`, `ITEM_PREDICATE`, `HEX_COLOR`, `COMPONENT`, `STYLE`, `OBJECTIVE`, `OBJECTIVE_CRITERIA`, `PARTICLE`, `ANGLE`, `SCORE_HOLDER`, `SWIZZLE`, `ITEM_SLOT`, `ITEM_SLOTS`, `ENTITY_ANCHOR`, `INT_RANGE`, `FLOAT_RANGE`, `GAMEMODE`, `TIME`, `RESOURCE_KEY`, `RESOURCE_SELECTOR`, the `TEMPLATE_*` pair, `HEIGHTMAP`, the `LOOT_*` trio, the `CONTEXT_*_PROVIDER` pair, `SLOT_SOURCE`, `DIALOG`, `FEATURE`, `SWING_ANIMATION` and `UUID`. The Bedrock client therefore does no validation at all on those arguments.

The graph-to-overload flattening is `ParamInfo.buildChildren` plus `getTree()`, a recursive cartesian expansion, with `getParams` resolving `redirect` by jumping to the target node. `isCompatible()` decides whether two literal siblings merge into one enum or need separate overloads, the documented case being `gamerule doDaylightCycle <bool>` against `gamerule randomTickSpeed <int>`. One guard is worth copying verbatim:

```java
if (paramNode == this.paramNode) continue; // Fixes a StackOverflowError when an argument has itself as a child
```

Identical-shape commands are deduplicated into alias enums via a custom `Hash.Strategy`, with `help` excluded. Descriptions are truncated to 950 characters.

Pumpkin's equivalent mapping in `client_suggestions.rs` is coarser and uses raw wire constants; notably it maps `Bool` to the int type where Geyser uses a two-value enum.

### The gap

**Nobody has translated Java datapacks to Bedrock behavior packs.** Searches for datapack-to-behavior-pack converters return only resource-pack texture converters and two abandoned toys. No Bedrock server implements Java mcfunction: PocketMine-MP (archived 2026-07-09 with an end-of-support notice), Nukkit and Endstone all have zero `mcfunction` code hits.

That is the position this project would be taking: running Java datapack functions on a server that speaks Bedrock to its clients. Pumpkin is the only project doing both halves, under GPL-3.0, with a naive executor.

## Open questions

- The default values of `minecraft:max_command_sequence_length` and `minecraft:max_command_forks` could not be confirmed from a Mojang primary source. No changelog states them, including 17w16b which introduced the original rule. The figure 65536 for both has two independent secondary confirmations: minecraft.wiki's gamerule page, and Pumpkin's `assets/game_rules.json`, which `Pumpkin-MC/Extractor` extracted from the real 26.3 server jar. `GameRules.class`'s integer constant pool in 26.3 is `[32768, 65536, 2147483647]`, consistent with 65536 for both and 32768 for `max_block_modifications`, but constant-pool membership does not attribute a value to a rule. The two secondary sources also disagree on one bound: the 1.21.11 changelog says `max_command_forks` has a minimum of 1, the 26.3 extraction says 0. Running the data generator, or starting a server and reading `level.dat`, would settle both.
- Whether each `#minecraft:tick` function gets its own operation budget or they share a per-tick pool. `Commands.executeCommandInContext` is per-call and the 1.20.3 changelog says "Executions from command blocks still count as separate ones", which implies per-entry-point, but Mojang never states it.
- The values of `ExecutionContext.MAX_QUEUE_DEPTH` and the queue-overflow behavior. The field names are primary (`net/minecraft/commands/execution/ExecutionContext.class`); the values need bytecode analysis this pass did not do.
- The 26.3 brigadier argument-type registry ids are unknown. `minecraft-data` publishes up to 26.1 (57 ids) and the 26.3 tree uses 6 parsers that are not in that list, so the ids have shifted by an unknown amount. Anything writing a `ClientboundCommandsPacket` for 26.3 needs the real registry, which means running Mojang's data generator or capturing a real server's packet.
- Mojang stopped publishing obfuscation mappings. The 26.2 and 26.3 version manifests expose only `client` and `server`, with `client_mappings` and `server_mappings` gone. 1.21.11 is the newest version with published maps. The 26.3 jar happens to be unobfuscated, which is why this note could read class names at all, but whether that is deliberate or a build accident is unknown and should not be relied on for future versions.
- The 26.3 command tree here came from misode/mcmeta's `26.3-summary` tag rather than from running Mojang's data generator, because the brief ruled out executing the jar. Every root command name and argument parser in it was cross-checked against classes in the jar and they agree, but a generator run would make the tree itself primary.
- Mojang documents `CommandData.Flags` as a `uint16` and never enumerates the bits. The 10 bit names and meanings in section 5 come from LeviLamina's `CommandFlag.h` at BDS 1.26.51, which is a reverse-engineered header, and from Cloudburst's enum. This repository always writes `flags = 0`, which is safe, so nothing depends on the list being right.
- Bedrock's `CommandEnumConstraint` index values (0 cheats enabled, 1 elevated permissions, 2 host permissions, 3 allow aliases) are agreed on by gophertunnel, Cloudburst and minecraft-data but are not in Mojang's schema, which names the field "Constraint Indices" and stops. PocketMine encodes the game's internal bitfield (`1<<0` through `1<<3`) instead of the index, so one of the two is wrong on the wire.
- The behavioral accuracy of DatapackSandbox, Datapack-Emulator and McfInterp was not tested. Their source and documentation were read; none was built or run.
- Whether vanilla Bedrock's own behavior packs ship mcfunction anywhere outside `Mojang/bedrock-samples` was not checked. The samples repository at 1.26.50.4 has zero, but it is a curated publication rather than the shipping server's pack set. The Bedrock Dedicated Server zip would settle it.
- Mojang's Bedrock selector documentation is stale enough that `haspermission` and `has_property` syntax could only be taken from minecraft.wiki. Their existence and introduction versions are primary, from Mojang's Bedrock changelogs on feedback.minecraft.net.
- Mojang's Bedrock `CommandPermissionLevel` schema declares JSON `type: "string"` with `x-underlying-type: "uint8"`. Two shipping implementations write lowercase strings and Mojang's docs page prints CamelCase member names. Which casing the client actually accepts was not tested against a real client.

## Reproduction

Everything downloaded here was treated as untrusted data. The 26.3 server jar was never executed: no data generator run, no `-jar`, no `-DbundlerMainClass`. Class files were read by parsing the constant pool in Python, run with `-I` from a scripts directory separate from the extracted data.

```sh
mkdir -p /tmp/cmdres/{jar,inner,tools,out,classes,data,bedrockcmds,bedrockdocs,bpdocs,changelogs,bsamples}

# --- The Java 26.3 server jar -------------------------------------------------
curl -sS https://piston-meta.mojang.com/mc/game/version_manifest_v2.json \
  -o /tmp/cmdres/tools/version_manifest_v2.json
python3 -I -c 'import json;m=json.load(open("/tmp/cmdres/tools/version_manifest_v2.json"));print(m["latest"])'
#   {'release': '26.3', 'snapshot': '26.4-snapshot-5'}
curl -sS https://piston-meta.mojang.com/v1/packages/61fff1316bd50312624a858bbb5eb18fa45208ed/26.3.json \
  -o /tmp/cmdres/tools/26.3.json
curl -sS -L -o /tmp/cmdres/jar/server.jar \
  https://piston-data.mojang.com/v1/objects/33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c/server.jar
shasum -a 1   /tmp/cmdres/jar/server.jar   # 33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c
shasum -a 256 /tmp/cmdres/jar/server.jar   # d052f14d7a173734fba553711e5b570162e2f2a313267ee31a21b975a679be64
#   62294556 bytes. 26.3.json lists no server_mappings download; only client and server.

unzip -p /tmp/cmdres/jar/server.jar version.json
#   protocol_version 777, world_version 5023, pack_version data 121.0, java_version 25
unzip -p /tmp/cmdres/jar/server.jar META-INF/libraries.list | grep brigadier
#   com.mojang:brigadier:1.3.11

# The bundler holds the real jar. Extract it, do not run it.
unzip -o -q -j /tmp/cmdres/jar/server.jar 'META-INF/versions/26.3/server-26.3.jar' -d /tmp/cmdres/inner
shasum -a 1 /tmp/cmdres/inner/server-26.3.jar   # cc3964451a3b32a0488110d5e3e6ad8d75fe6a66
#   26652008 bytes. Class names are NOT obfuscated in this release.

# --- Counting the vanilla datapack inside the jar -----------------------------
cd /tmp/cmdres/inner
unzip -l server-26.3.jar | grep -c '\.mcfunction$'        # 0
unzip -l server-26.3.jar | grep -c 'tags/function'        # 0
unzip -l server-26.3.jar | awk '{print $4}' | grep -c '^net/minecraft/'   # 8073

unzip -l server-26.3.jar | awk 'NF>=4 && $4 ~ /^data\// && $4 !~ /\/$/ {print $4}' \
  > /tmp/cmdres/out/data-files.txt
wc -l < /tmp/cmdres/out/data-files.txt    # 9884
python3 -I -c '
import sys, collections
p=[l.strip() for l in open("/tmp/cmdres/out/data-files.txt")]
c=collections.Counter(x.split("/")[2] for x in p if len(x.split("/"))>=3)
[print(v,k) for k,v in sorted(c.items(), key=lambda x:-x[1])]
for n in ("function","item_modifier","predicate"):
    print(n, sum(1 for x in p if f"/{n}/" in x))'
#   recipe 2042, advancement 1866, structure 1511, loot_table 1447, worldgen 1144,
#   tags 883, villager_trade 391, datapacks 106, ... predicate 3, function 0, item_modifier 0

unzip -l server-26.3.jar | awk '{print $4}' | grep '^data/minecraft/tags/' \
  | sed 's#^data/minecraft/tags/\(.*\)/[^/]*$#\1#' | sort | uniq -c | sort -rn

# Advancement triggers and rewards, and loot modifier/condition usage
mkdir -p /tmp/cmdres/data && cd /tmp/cmdres/data
unzip -o -q /tmp/cmdres/inner/server-26.3.jar \
  'data/minecraft/advancement/*' 'data/minecraft/loot_table/*' \
  'data/minecraft/predicate/*' 'data/minecraft/tags/*'
# (counting scripts: walk criteria[].trigger, rewards keys, and in 26.3 loot schema the
#  keys are "modifier" and "condition", NOT the pre-26.3 "functions" and "conditions")

# --- Reading class constant pools without executing anything ------------------
# /tmp/cmdres/tools/cpstrings.py parses CONSTANT_Utf8 entries; cpints.py parses CONSTANT_Integer.
mkdir -p /tmp/cmdres/classes && cd /tmp/cmdres/classes
unzip -o -q /tmp/cmdres/inner/server-26.3.jar \
  'net/minecraft/commands/*' 'net/minecraft/server/commands/*' \
  'net/minecraft/world/level/gamerules/*' 'net/minecraft/server/permissions/*' \
  'net/minecraft/server/ServerFunction*' 'net/minecraft/util/datafix/fixes/GameRuleRegistryFix*' \
  'net/minecraft/server/dedicated/DedicatedServerProperties*' \
  'net/minecraft/commands/arguments/selector/*' 'net/minecraft/world/scores/*'

python3 -I /tmp/cmdres/tools/cpstrings.py net/minecraft/world/level/gamerules/GameRules.class \
  | grep -E 'max_command|command_block'
python3 -I /tmp/cmdres/tools/cpints.py net/minecraft/world/level/gamerules/GameRules.class
#   [32768, 65536, 2147483647]
python3 -I /tmp/cmdres/tools/cpstrings.py net/minecraft/util/datafix/fixes/GameRuleRegistryFix.class
#   contains maxCommandChainLength, maxCommandForkCount, commandModificationBlockLimit, ...
python3 -I /tmp/cmdres/tools/cpstrings.py net/minecraft/server/ | grep -E 'FUNCTION_TAG'
#   ServerFunctionManager.class  LOAD_FUNCTION_TAG / TICK_FUNCTION_TAG  (no others)
python3 -I /tmp/cmdres/tools/cpints.py net/minecraft/commands/functions/MacroFunction.class   # [8]
python3 -I /tmp/cmdres/tools/cpints.py net/minecraft/commands/functions/CommandFunction.class # [2000000]
python3 -I /tmp/cmdres/tools/cpstrings.py net/minecraft/commands/arguments/selector/EntitySelectorParser.class \
  | grep -E '@[aenprs]$'
python3 -I /tmp/cmdres/tools/cpstrings.py \
  net/minecraft/commands/arguments/selector/options/EntitySelectorOptions.class \
  | grep 'argument.entity.options'

# Command class inventory
cd /tmp/cmdres/inner
for d in commands/execution commands/functions commands/arguments server/commands; do
  unzip -l server-26.3.jar | awk '{print $4}' \
    | grep "^net/minecraft/$d/[^/]*\.class$" | grep -v '\$' | wc -l; done
unzip -l server-26.3.jar | awk '{print $4}' | grep -E 'Commands?\.class$' | grep -v '\$'
#   .../server/commands/data/DataCommands.class, .../server/commands/item/ItemCommands.class,
#   .../gametest/framework/TestCommand.class

# --- The Java command tree ----------------------------------------------------
# Mojang's reports/commands.json needs the data generator, which this pass did not run.
# misode/mcmeta republishes the generator output; the 26.3-summary tag is pinned.
git ls-remote --tags https://github.com/misode/mcmeta | grep '26\.3-summary$'
#   d96c75fec200c4580dd75e033a76341521165461
curl -sS -L -o /tmp/cmdres/out/mcmeta-commands.json \
  https://raw.githubusercontent.com/misode/mcmeta/26.3-summary/commands/data.json
shasum -a 256 /tmp/cmdres/out/mcmeta-commands.json
#   9e14a839e32dbcaae044aeb987f1d9c4a4a3c8f7f3a8a3a87dc055e61fa8a84a   (583587 bytes)
python3 -I -c '
import json, collections
d=json.load(open("/tmp/cmdres/out/mcmeta-commands.json"))
print(len(d["children"]), "roots"); print(" ".join(sorted(d["children"])))
t=collections.Counter()
def w(n):
    for v in n.get("children",{}).values():
        if v.get("type")=="argument": t[v.get("parser")]+=1
        w(v)
w(d); print(len(t),"parsers"); [print(v,k) for k,v in t.most_common()]'
#   94 roots, 59 parsers in use across the whole tree
# Cross-check: every newly added root (compute, stopwatch, waypoint, dialog, rotate, swing,
# fetchprofile, posteffect, unpublish, version) has a matching class in the 26.3 jar.

# --- Mojang's Bedrock command metadata ---------------------------------------
cd /tmp/cmdres/bsamples && git init -q
git remote add o https://github.com/Mojang/bedrock-samples
git fetch -q --depth 1 o main
git log -1 --format='%H %ad' FETCH_HEAD
#   46ba6ea985fb5a92d79a9419198f10dda14c199d  Wed Sep 16 00:27:23 2026 -0400
git show FETCH_HEAD:version.json | head -3     # latest 1.26.50.4, 15-09-2026
git ls-tree -r --name-only FETCH_HEAD | wc -l           # 22258
git ls-tree -r --name-only FETCH_HEAD | grep -c '\.mcfunction$'   # 0
git ls-tree -r --name-only FETCH_HEAD | grep -c 'tick\.json$'     # 0
git show FETCH_HEAD:metadata/command_modules/mojang-commands.json \
  > /tmp/cmdres/bedrockcmds/mojang-commands.json     # 1211836 bytes

python3 -I -c '
import json, collections
d=json.load(open("/tmp/cmdres/bedrockcmds/mojang-commands.json"))
en={e["name"].upper():[v["value"] for v in e["values"]] for e in d["command_enums"]}
t=collections.Counter(); ov=pr=0
for c in d["commands"]:
    for o in c["overloads"]:
        ov+=1
        for p in o["params"]: pr+=1; t[p["type"]["name"].upper()]+=1
print(len(d["commands"]),"commands",ov,"overloads",pr,"params",len(en),"enums",
      sum(len(v) for v in en.values()),"enum values")
basic={k:v for k,v in t.items() if k not in en}
print(len(basic),"basic types:", sorted(basic, key=lambda k:-basic[k]))
print("soft enums:", [k for k,v in en.items() if not v])
print("SCOREBOARDCRITERIA =", en["SCOREBOARDCRITERIA"])
print("team?", any(c["name"]=="team" for c in d["commands"]),
      "bossbar?", any(c["name"]=="bossbar" for c in d["commands"]))'
#   84 commands, 279 overloads, 1186 params, 236 enums, 14281 enum values
#   26 basic types; soft enums SCOREBOARDOBJECTIVES, GAMETESTNAME, GAMETESTTAG, TAGVALUES
#   SCOREBOARDCRITERIA = ['dummy']; team? False  bossbar? False

# AvailableCommandsPacket size estimate (section 8), encoding Mojang's own tree
# with the wire layout from Mojang's AvailableCommandsPacket schema:
#   9180 unique enum value strings -> 224627 B; 236 enum tables -> 61047 B;
#   84 commands / 279 overloads    ->  23672 B;  total ~309346 B = 302 KiB.

# --- Mojang's Bedrock protocol docs ------------------------------------------
cd /tmp/cmdres/bpdocs && mkdir -p repo && cd repo && git init -q
git remote add o https://github.com/Mojang/bedrock-protocol-docs
git fetch -q --depth 1 o r/26_u4_hotfix5
git show FETCH_HEAD:docs/AvailableCommandsPacket.html   # packet 76, full field table
git show FETCH_HEAD:docs/UpdateSoftEnumPacket.html      # packet 114, Add/Remove/Replace
git show FETCH_HEAD:docs/CommandRequestPacket.html      # packet 77, CommandOriginData
git show FETCH_HEAD:json/AvailableCommandsPacketConstrainedValueData.json

# --- Mojang's Bedrock creator docs -------------------------------------------
curl -sS -L -A "Mozilla/5.0" -o /tmp/cmdres/bedrockdocs/toc.json \
  "https://learn.microsoft.com/en-us/minecraft/creator/commands/toc.json?view=minecraft-bedrock-stable"
#   82 command pages. Individual pages live at .../creator/commands/commands/<name>
for p in execute function scoreboard tag loot ride; do
  curl -sS -L -A "Mozilla/5.0" -o "/tmp/cmdres/bedrockdocs/b-$p.html" \
    "https://learn.microsoft.com/en-us/minecraft/creator/commands/commands/$p"; done
curl -sS -L -A "Mozilla/5.0" -o /tmp/cmdres/bedrockdocs/functions.html \
  "https://learn.microsoft.com/en-us/minecraft/creator/documents/functionsintroduction"
curl -sS -L -A "Mozilla/5.0" -o /tmp/cmdres/bedrockdocs/tickjson.html \
  "https://learn.microsoft.com/en-us/minecraft/creator/documents/tickjsonintroduction"
curl -sS -L -A "Mozilla/5.0" -o /tmp/cmdres/bedrockdocs/targetselectors.html \
  "https://learn.microsoft.com/en-us/minecraft/creator/documents/targetselectors"
curl -sS -L -A "Mozilla/5.0" -o /tmp/cmdres/bedrockdocs/rawmessagejson.html \
  "https://learn.microsoft.com/en-us/minecraft/creator/reference/content/rawmessagejson"

# --- Java changelogs ----------------------------------------------------------
# Served as HTML; strip tags and grep. The launcher feed is the same text as JSON.
for a in minecraft-java-edition-1-20-2 minecraft-java-edition-1-20-3 minecraft-java-edition-1-21-9 \
         minecraft-java-edition-1-21-11 minecraft-java-edition-26-1 minecraft-java-edition-26-2 \
         minecraft-java-edition-26-3; do
  curl -sS -L -A "Mozilla/5.0" -o "/tmp/cmdres/changelogs/$a.html" \
    "https://www.minecraft.net/en-us/article/$a"; done
curl -sS https://launchercontent.mojang.com/v2/javaPatchNotes.json -o /tmp/cmdres/changelogs/java.json

# --- Mojang's brigadier -------------------------------------------------------
git ls-remote https://github.com/Mojang/brigadier
#   master 9ba4f13c0fe82b07c08c2dc2d8043f075ffd0d98
git clone --depth 1 https://github.com/Mojang/brigadier /tmp/cmdres-brigadier/brigadier
find /tmp/cmdres-brigadier/brigadier/src/main/java -name '*.java' | wc -l   # 47
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://libraries.minecraft.net/com/mojang/brigadier/1.3.11/brigadier-1.3.11.jar   # 200
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://libraries.minecraft.net/com/mojang/brigadier/1.3.12/brigadier-1.3.12.jar   # 404

# --- Java command tree wire format -------------------------------------------
curl -sS -L -o /tmp/cmdres/out/protocol-26.1.json \
  https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/26.1/protocol.json
#   type "command_node"; parser is a varint mapper with 57 entries at 26.1 (48 at 1.19)

# --- This repository ----------------------------------------------------------
cd <repo>
wc -l packages/prismarine/src/network/packet/AvailableCommandsPacket.ts \
      packages/prismarine/src/network/type/CommandParameter.ts \
      packages/prismarine/src/command/CommandManager.ts \
      packages/brigadier/src/CommandDispatcher.ts
ls packages/prismarine/src/command/vanilla/ | grep -v test | wc -l   # 16
find packages/brigadier/src -name '*.ts' | wc -l
cat packages/minecraft/src/generated/CommandPermissionLevel.ts \
    packages/minecraft/src/generated/PlayerPermissionLevel.ts
grep -n 'A nested literal has no argument type' packages/prismarine/src/command/CommandManager.ts
```

### The constant-pool reader

Written in `/tmp/cmdres/tools/`, which is not the directory the jar was extracted into, and run with `python3 -I` so neither the current directory nor the script's directory can shadow a stdlib import.

```python
# cpstrings.py - print every CONSTANT_Utf8 entry of every .class under the given paths
import sys, struct, os
SZ={3:4,4:4,5:8,6:8,7:2,8:2,9:4,10:4,11:4,12:4,15:3,16:2,17:4,18:4,19:2,20:2}
def utf8s(b):
    if b[:4]!=b'\xca\xfe\xba\xbe': return []
    n=struct.unpack_from('>H',b,8)[0]; off=10; i=1; out=[]
    while i<n:
        tag=b[off]; off+=1
        if tag==1:
            ln=struct.unpack_from('>H',b,off)[0]; off+=2
            out.append(b[off:off+ln].decode('utf-8','replace')); off+=ln
        else:
            off+=SZ.get(tag,0)
            if tag in (5,6): i+=1
        i+=1
    return out
for p in sys.argv[1:]:
    paths=[os.path.join(r,f) for r,_,fs in os.walk(p) for f in sorted(fs) if f.endswith('.class')] \
          if os.path.isdir(p) else [p]
    for fp in paths:
        for s in utf8s(open(fp,'rb').read()): print(f"{fp}\t{s}")
```

`cpints.py` is the same walk with `tag==3` collected as `struct.unpack_from('>i', b, off)[0]`.
