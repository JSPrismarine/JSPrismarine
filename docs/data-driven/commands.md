---
title: Commands and functions
group: Documents
category: Guides
---

# Commands and functions

JSPrismarine dispatches commands through a Java-shaped Brigadier tree and publishes that tree to
Bedrock clients as the flat overload list their client expects. It also runs Java `.mcfunction`
files out of a datapack, with function tags, macros and `/schedule`.

This page is for a server operator or datapack author. It says which commands you can type today,
what the two editions disagree about and what that costs you, which commands the server leaves out
and why, and how to write a function and watch it run.

The code is in three places: `packages/commands/` holds the command set and the Bedrock table,
`packages/mcfunction/` holds the function runtime, and `packages/prismarine/src/command/` joins
both to the running server.

## Two command sets, one tree

Java 26.3 has 94 root commands. Its command graph is 2475 nodes, 1 root plus 1197 literal and 1277
argument nodes, built from 59 distinct argument parsers. The shape matters more than the size.
Java's nodes can redirect to one another, so `/execute as @e at @s run ...` is a chain that loops
back to the `execute` node after every subcommand, and `as` and `at` fork, running everything after
them once per matched entity.

Bedrock 1.26.50 publishes its whole command set as data rather than as code. The file is
`metadata/command_modules/mojang-commands.json` in `Mojang/bedrock-samples`, pinned by
`packages/bedrock-data/sources.json` to tag `v1.26.50.4`, and
`packages/commands/src/tables/bedrockCommands.json` is generated from it. Nothing in that table is
hand-written, and `packages/commands/src/bedrockTable.test.ts` asserts every count below:

| In Mojang's Bedrock table | Count |
| ------------------------- | ----: |
| Commands                  |    84 |
| Overloads                 |   279 |
| Parameters                |  1186 |
| Command enums             |   236 |
| Enum values               | 14281 |
| Basic parameter types     |    26 |
| Soft enums                |     4 |

46 command names appear in both editions. 48 Java root names have no Bedrock counterpart at all,
among them `/advancement`, `/bossbar`, `/team`, `/worldborder`, `/trigger` and `/datapack`. This
server registers `/return` anyway, because `execute if function` reads Java's rule and needs a
function to have a return value to read. A few of the 48 are only spelling differences, such as `/tp`, `/msg`, `/w` and `/tm`, or
server administration that Bedrock names differently, such as `/whitelist` against `/allowlist`.
Most of them describe a system Bedrock has no client-side model for.

### Bedrock's tree is flat, and that is what you feel with /execute

A Bedrock client's command tree is a list of overloads per command. There are no redirects in it,
so there is nowhere to express "after this subcommand, go back to the start", and nothing in the
packet says "run the rest of this line once per matched entity". Java's fork semantics cannot be
written into `AvailableCommandsPacket`.

The server still runs them. `CommandDispatcher.execute` does the fan-out server-side, so
`/execute as @e[type=pig] at @s run setblock ~ ~-1 ~ minecraft:gold_block` really does place one
block under every pig; `commandStartup.test.ts` runs exactly that line against a booted server.
What the client's tree decides is autocompletion and the red text while you type, not what happens
when you press enter. Your client sends the line as text and the server parses all of it.

So the practical effect is narrower than it sounds, and it splits three ways:

- A `/execute` chain the flattener can express as a chaining overload is suggested normally. The
  flattener turns the redirect cycle back onto `execute` into one trailing chained-subcommand
  parameter, which is the same encoding Mojang uses: in `mojang-commands.json` every `/execute`
  keyword is a one-value enum (`OPTION_AS`, `OPTION_AT`) and the tail is `EXECUTECHAINEDOPTION_0`.
- `execute store result score ...` is not in the client's tree at all. Bedrock has no `store`
  subcommand, no parameter type for it and no redirect, so there is no overload to send. Type it in
  full anyway and the server runs it. You just get no help from the client.
- An argument whose type Bedrock has no parameter type for goes out as a plain unvalidated string.
  The client will not autocomplete it and will not reject a malformed value before sending, so the
  server is the only thing that checks it.

The flattener reports each of these as a note rather than dropping anything silently; the table of
all six shapes is in [the commands package README](../../packages/commands/README.md).

## What you can actually type

`@jsprismarine/commands` implements 60 commands, and this server registers 53 of them:

```
clear clone damage deop difficulty enchant execute fill function gamemode gamerule give help kick
kill list loot me op particle playsound recipe reload say schedule scoreboard setblock
setworldspawn spawnpoint spreadplayers stop stopsound summon tag teleport tell tellraw time title
transfer weather xp random return camerashake daylock fog playanimation replaceitem testfor
testforblock testforblocks titleraw
```

The set does not vary. `/loot` and `/recipe` used to come and go with the pack stack, because both
read Java data the content build loads; every server builds that content now, so both are always
registered. Rolling a table or unlocking a recipe that nothing in the stack declared still refuses
by name, which is a different answer from the command not existing.

Four names are aliases, registered as redirects onto the real command so they parse the same
arguments and run the same code: `/tp` is `/teleport`, `/msg` and `/w` are `/tell`, and
`/experience` is `/xp`.

Six of the Bedrock-only commands are not a second implementation of anything. `/testfor` is
`execute if entity`, `/testforblock` is `execute if block`, `/testforblocks` is `execute if blocks`,
`/daylock` is `gamerule doDaylightCycle` inverted, `/replaceitem` is the `/item replace` that Java
renamed in 1.17 and Bedrock kept, and `/titleraw` is `/title` over a `rawtext` object, built from
the same tree so a `times` form cannot exist on one and not the other. Each calls the same host
verbs as its Java spelling. `/camerashake`, `/fog` and `/playanimation` have no gameplay rule
behind them at all. Each asks the client to draw something, and sending the packet is the server's
whole part.

Five more commands come from the older class-based dispatcher rather than from the vanilla set:
`/ban` and `/pardon`, which Java keeps outside the shared set and Bedrock spells differently, plus
`/version`, `/tps` and `/debug` in the `jsprismarine:` namespace.

### Who may run what

Two gates apply, and both have to pass.

The first is this server's named permissions, in `permissions.json`. A vanilla command's node is
`minecraft.command.<name>`, so `/teleport` needs `minecraft.command.teleport`. A fresh
`permissions.json` grants every player `minecraft.command.help`, `minecraft.command.list` and
`minecraft.command.me`, and grants every operator `*`. The command list each player receives is
filtered by these nodes, so a player who was granted nothing sees three Minecraft commands in their
client rather than all 53.

The second is the command's own permission level, which is Java's. The console runs at level 5, an
operator at 4 and everyone else at 0. Most of the set is declared at level 1, which is Java's
"needs cheats", so a non-operator cannot run them even if a permission node says otherwise. `/op`
and `/deop` sit higher still.

## What the server leaves out, and why

Six commands are deliberately not wired. The rule the project follows is worth stating plainly,
because it decides what you see when you type one: an unwired command is **not registered at all**.
Nothing parses it, no alias is registered for it, and it never reaches your client's command list.
Type `/effect give @s minecraft:speed` and you get `Unknown command. Type "/help" for help.` A
command that accepted your line and then quietly did nothing would be worse, because you would
retype it.

The list lives in `UNWIRED_COMMANDS` in
`packages/prismarine/src/command/vanillaCommands.ts`, keyed by command name with the reason beside
it, so the gap closes by deleting a row:

| Command      | What it would need                                                              |
| ------------ | ------------------------------------------------------------------------------- |
| `/attribute` | attribute modifiers; this server's `Attribute` holds one value and no stack     |
| `/data`      | reading and writing NBT by path                                                 |
| `/effect`    | a status effect system; `MobEffectPacket` is a wire type with nothing behind it |
| `/item`      | item modifiers and Java-addressable inventory slots                             |
| `/place`     | feature, jigsaw and structure placement outside the generator                   |
| `/ride`      | entity riding outside the data-driven entity runtime                            |

`vanillaCommands.test.ts` asserts that the registered set plus this table equals everything the
package implements, so a command cannot fall out of both.

`/locate` used to sit in this table and now runs, in two of its three forms. `/locate structure`
asks the generator where the nearest structure of a name starts, without building a chunk: the
data-driven generator lays its structure sets out against the bare noise, so it answers for any
structure it places in the dimension you are standing in, `minecraft:stronghold` and
`minecraft:ancient_city` from the Overworld, `minecraft:fortress` from the Nether,
`minecraft:end_city` from the End. The name is a Java id with or without its namespace, a
structure tag such as `#minecraft:village`, or Bedrock's family name, `village` or
`ruinedportal`. The search is Java's: a radius of 100 placement regions rather than chunks, and
every ring of the strongholds' concentric placement, so a stronghold two thousand blocks out is
found from spawn. The answer is Java's too, `The nearest minecraft:stronghold is at [-768, ~, 1840]
(1993 blocks away)`: the start chunk's corner, the height hidden because a structure has none, and
the flat distance, which is also the command's result. `/locate biome` walks the climate sampler
on Java's grid, 6400 blocks out at one column per 32 blocks and one sample per 64 blocks of
height, and prints the sampled height and a three-axis distance. `/locate poi` is refused with
`This server has no point of interest index yet`: Java answers it from a `PoiManager`, an index
of bed, job site and portal blocks kept per loaded chunk, and this server keeps no such index.

Separately, 29 of Bedrock's own commands are not implemented at all. They group by reason:

- Eight need a subsystem no server here has: `/allowlist`, `/save`, `/setmaxplayers`, `/mobevent`,
  `/tickingarea`, `/structure`, `/clearspawnpoint` and `/toggledownfall`. `/structure` is the
  closest to arriving, since `@jsprismarine/structures` already reads and writes the NBT template
  format; what is missing is somewhere to save a player-made template and read it back.
- Nine need a packet this repository does not write yet: `/camera`, `/hud`, `/music`, `/dialogue`,
  `/inputpermission`, `/controlscheme`, `/aimassist`, `/project` and `/sendshowstoreoffer`.
- Twelve are editor, telemetry and Script API surfaces that
  [the plan](../plans/data-driven-vanilla.md) puts out of scope in section 12: `/script`,
  `/scriptevent`, `/gametest`, `/editor-allowlist`, `/wsserver`, `/changesetting`, `/packstack`,
  `/permission`, `/event`, `/reloadconfig`, `/reloadpacketlimitconfig` and `/serveridentity`.

## Naming content a pack defines

An argument that names a registry entry — a block for `/setblock` and `/fill`, an item for
`/give`, an entity type for `/summon`, an enchantment for `/enchant` — accepts whatever the server
has loaded **in addition to** Mojang's published list, not instead of it. So `/summon mypack:dragon`
works once your pack defines it, and a vanilla name still works even on a build that happens not to
carry it. The client completes from the union.

Damage types stay pinned to Mojang's list because this server has no registry for them. Mob effects
use Mojang's published list because the host has no custom effect registry. Attributes, particles,
and biomes are validated by nobody in either direction, because Bedrock publishes no enum for them,
so those arguments take any string.

One consequence worth knowing: `/summon villager` gives you `minecraft:villager_v2`, Bedrock's
current villager, rather than the pre-1.11 entity whose name Mojang's enum still carries. The
command resolves through the same Java-to-Bedrock mapping the entity runtime uses, so the two
cannot disagree about which villager they mean — which matters, because the villager is the one
brain mob the editions spell differently.

## Selectors

`parseSelector(input, dialect)` reads one target selector in either edition's grammar and returns
one model, and `matchSelector` resolves that model against candidate entities. The matching half is
Java's `EntitySelector`, including the order it applies, which you can observe: filter, then sort,
then cut to the limit. A `@p` in a crowd is the nearest entity of the filtered set, not the nearest
candidate that happens to pass the filter afterwards.

Bedrock arguments normalize onto the Java spelling, so you can write either:

| Bedrock                                                     | Java                |
| ----------------------------------------------------------- | ------------------- |
| `r`, `rm`                                                   | `distance`          |
| `l`, `lm`                                                   | `level`             |
| `rx`, `rxm`                                                 | `x_rotation`        |
| `ry`, `rym`                                                 | `y_rotation`        |
| `m`, with the `s`/`0`, `c`/`1`, `a`/`2`, `d`/`5` shorthands | `gamemode`          |
| `c`, signed, where a negative count means furthest first    | `limit` plus `sort` |

An argument from the other edition parses rather than failing, and the result carries a note naming
it. Dropping it silently would change which entities a command hits, so `@e[r=5,c=1]` reads as
`distance=..5, limit=1, sort=nearest` either way.

A selector tests facts that an entity reference does not carry, and the server answers four of
them: `gamemode=`, `level=`, `tag=` and `scores=`. `scores=` works now that the scoreboard exists,
so `@a[scores={deaths=1..}]` selects the players with at least one death recorded on the `deaths`
objective. A fact the server cannot answer never matches, which is deliberate rather than
permissive: Bedrock's `family=` is left unanswered, so `@e[family=monster]` matches nothing instead
of matching everything. `advancements=`, `nbt=`, `predicate=` and `team=` have nothing behind them
either.

## The scoreboard

`/scoreboard` works, and so do the two `/execute` subcommands that read and write it.

Objectives are created with `scoreboard objectives add <name> <criterion> [display name]`. Only
`dummy` is meaningful, because nothing on this server increments a score by itself. Scores are read
and written through `scoreboard players get|set|add|remove|reset|list` and combined through
`scoreboard players operation`, which implements all nine of Java's operators, including `><` for
swap and Java's two edge cases: a division or modulo by zero leaves the target alone, and a modulo
result takes the sign of the divisor.

A score holder is a name rather than an entity. That is Java's `ScoreHolderArgument`, and it is
what makes a "fake player" work: `scoreboard players set #counter totals 0` tracks a number that is
not about anybody, which is the normal way a datapack keeps global state.

Three display slots are drawn, under the names Bedrock's `DisplaySlot` enum spells: `list`,
`sidebar` and `belowname`. `scoreboard objectives setdisplay sidebar <objective>` puts an objective
in a slot and the clients redraw it; a score change is only sent to clients while some slot is
drawing its objective, because a Bedrock client rejects a score entry for an objective it was never
given a header for.

Both scoreboard-reading `/execute` subcommands are wired:

```
execute if score @s deaths matches 3.. run say you have died a lot
execute store result score #blocks totals run fill 0 70 0 7 70 7 minecraft:stone
```

The second one captures `/fill`'s return value, which is the number of blocks it changed, so
`#blocks` ends up holding 64. Every command returns a count rather than a success flag, which is
what makes `execute store result` useful.

## The mcfunction runtime

`@jsprismarine/mcfunction` loads `.mcfunction` files and function tags from the pack stack,
compiles them once, and runs them against a command runner. It implements no commands at all; the
runner here is the vanilla dispatcher, joined to it in
`packages/prismarine/src/command/function/runtime.ts`.

Know one thing before you invest in it. Vanilla ships zero functions in either edition, so running
them buys no parity with either Minecraft. The Java 26.3 server jar has 9884 files under `data/minecraft/` and
none of them is an `.mcfunction`; it has 883 tag files and none tags the function registry.
`Mojang/bedrock-samples` at 1.26.50.4 has 22258 files, no `.mcfunction` and no `tick.json`. Both
editions have a function runtime and neither uses it for vanilla gameplay. This one exists because
datapack authors expect it, and because it is a place to write server behavior as data rather than
as TypeScript.

### The file format

One command per line, written without a leading slash. A line is a comment when its first
non-whitespace character is `#`, and blank lines are skipped. A line ending in `\` continues into
the next one. Two mistakes are rejected by name rather than guessed at, because Java rejects them:
a line starting with `//`, which is not a comment marker here, and a line starting with `/`. A file
with any error does not load at all, which is what the Java server does.

A function's id comes from its path, using the singular `function` directory that format 121 uses:
`data/greeter/function/setup/stage.mcfunction` loads as `greeter:setup/stage`.

### Macros

A line whose first non-whitespace character is `$` is a macro line. It carries one or more
`$(variable)` substitutions, and the caller has to pass a compound with an entry for each. Extra
entries are ignored; a missing one reports
`the macro arguments have no entry for '<name>'` and skips the whole call, as Java does.

Substitution is textual. A string value goes in raw, with no quoting and no escaping, so a value
carrying a quote can produce a line that no longer parses. Numbers go in without the NBT type
suffix; a nested compound or list is rendered as SNBT, where the suffixes come back because the
text is NBT again. Each macro function caches its 8 most recent argument sets, matching
`MAX_CACHE_ENTRIES` in Java's `MacroFunction`.

### Tags, /function and /schedule

`/function <id>` runs one function. `/function #<namespace>:<tag>` runs every function the tag
names, in order, with nested tags expanded in place; a function named twice runs once, and a cycle
between tags is reported and cut rather than followed. Either form takes an optional SNBT compound
for a macro's arguments.

Tags merge across the pack stack rather than replacing, so two packs that both add to
`#minecraft:tick` both run unless the later one sets `"replace": true`. Functions are the opposite:
a later pack declaring the same id replaces the earlier file whole.

Two tags are special, and they are the only two the server looks up by name. `#minecraft:load` runs
once after the packs load and the worlds are up, from `Server.bootstrap`. `#minecraft:tick` runs
every server tick, from the tick loop. Both run with the server's own command source: the default
world, every permission, and nobody to talk to, so output goes to the log rather than to a player.

`/schedule function <id> <delay> [append|replace]` queues a call, and `/schedule clear <id>` drops
every pending call of one name. This is Java's `TimerQueue`. `replace`, the default, keeps at most
one pending entry per name, so a function that reschedules itself every tick stays one entry
instead of growing a queue; `append` lets the same name wait several times over. Scheduled calls
run before `#minecraft:tick` on the tick they come due, which is Java's order, and a delay of zero
means the next tick rather than this one. Entries are keyed by the exact text you scheduled,
`#` and all, so scheduling `#my:tag` and then clearing `my:tag` clears nothing.

A `/schedule` of a function that does not exist is legal and returns success, because a later
reload may provide it before the call comes due.

### The limits

A run is bounded by the two gamerules Java bounds it with. Both were renamed in 1.21.11, so a guide
written against `maxCommandChainLength` or `maxCommandForkCount` is stale.

| Rule                                      | Counts     | Default here |
| ----------------------------------------- | ---------- | -----------: |
| `minecraft:max_command_sequence_length`   | operations |        65536 |
| `minecraft:max_command_forks`             | contexts   |        65536 |

An operation is one command line run or one function invoked. A context is what a command reports
as a fork, so `execute as @e` matching five entities counts 5. Reaching either limit stops the
run, records the reason and writes a diagnostic to the log. Nothing throws, and everything a call
reaches shares one budget, so the whole tree below your entry point is covered.

Mojang has never published either default. 65536 is corroborated by minecraft.wiki and by Pumpkin's
extraction from the real 26.3 server jar, and it is in the `GameRules` class constant pool, but no
Mojang document attributes it to either rule. Treat it as well corroborated rather than confirmed.

Nesting is on the heap rather than on the JavaScript stack, following Java's 23w41a rewrite, and a
call made from the last line of a function replaces its frame instead of stacking on it. So a
tail-recursive function runs at constant depth until the operation limit stops it, and nesting
20000 functions deep does not overflow anything.

One limit here has no Java counterpart. A `function` line inside a function is control flow the
executor reads itself, so it stays on the executor's own frame stack. `execute ... run function` is
a command rather than control flow, so it re-enters the runtime through a command body and costs
real JavaScript stack. `MAX_NESTED_FUNCTION_DISPATCH` caps that at 64 levels, which exists only to
stop a mutually recursive pack from overflowing the host before the operation limit can catch it.

Bedrock's equivalent ceiling is a smaller per-call cap of 10000 commands, exported as
`BEDROCK_MAX_COMMANDS_PER_FUNCTION`. This runtime runs Java functions and does not apply it.

## Writing a function

Here is the whole loop: a datapack on disk, a macro, a tag, and watching it run.

Functions come out of the pack stack, which every server builds, so the only setting involved is
the one naming your pack. The paths resolve from the directory you start the server in.

```json
{
    "content-datapacks": ["worlds/world/datapacks/greeter"]
}
```

Lay the pack out the way a Java datapack 121 is laid out:

```
worlds/world/datapacks/greeter/
    pack.mcmeta
    data/greeter/function/marker.mcfunction
    data/greeter/function/welcome.mcfunction
    data/greeter/function/heartbeat.mcfunction
    data/minecraft/tags/function/tick.json
```

`pack.mcmeta` declares the format range. Format 121 is what Java 26.3 declares and what this loader
targets:

```json
{ "pack": { "description": "greeter", "min_format": 121, "max_format": 121 } }
```

`marker.mcfunction` is a macro. Every line beginning with `$` is substituted before it is parsed,
and the caller supplies the compound:

```mcfunction
# Drops a gold block wherever it is told to, and announces it.
$setblock $(x) $(y) $(z) minecraft:gold_block
$say marked $(x) $(y) $(z)
```

`welcome.mcfunction` calls it and records something on the scoreboard. A `function` line inside a
function is read by the executor itself, so it nests without touching the command dispatcher:

```mcfunction
scoreboard objectives add greetings dummy
function greeter:marker {x:10, y:70, z:10}
scoreboard players add #greeted greetings 1
```

`heartbeat.mcfunction` is what the tick tag runs. Keep it cheap, because it runs twenty times a
second:

```mcfunction
execute if score #greeted greetings matches 1.. run scoreboard players add #ticks greetings 1
```

`data/minecraft/tags/function/tick.json` is what hooks it up:

```json
{ "values": ["greeter:heartbeat"] }
```

Start the server and run it from the console:

```
/function greeter:welcome
```

You should see a gold block at `10 70 10`, the `marked 10 70 10` line in chat from the macro, and
`/scoreboard players get #greeted greetings` answering 1. Run
`/scoreboard objectives setdisplay sidebar greetings` and the sidebar shows `#ticks` rising once a
tick, which is the tick tag at work.

Two things to know while you iterate. `/function` returns the number of command lines it ran, so
`/execute store result score #ran greetings run function greeter:welcome` records the size of the
run. And a failing line does not reach you in chat. A function's lines run with a silent source,
the way Java runs them, and a line that throws becomes a diagnostic rather than a message, logged
as `function: <message> (greeter:welcome:3)` with the function id and the line number. Watch the
server log, not the chat window.

Reloading is not incremental. The runtime is built per content build and dropped whole when the
content is replaced, which also drops anything `/schedule` had queued against functions that no
longer exist.

## Known limits

All of these are current in the code. Most of them parse and run, and then do something other than
what the command's name promises, which is why they are worth knowing before you build on them.

**A failing condition inside `/execute` tells you nothing.** `execute if score` reaches the
scoreboard properly, but naming an objective nobody created makes the host refuse, and `execute if`
is a fork. Java's `CommandDispatcher` swallows a fork's exception and answers 0, so you see the
command report failure with no message explaining why. This is Java's own rule rather than this
server's, and the fix on your side is to check the objective exists before you branch on it.

**`execute on <relation>` always refuses.** All 8 relations parse, but nothing tracks entity
relationships, so the host rejects the call.

**Anything that reads or writes NBT refuses.** That takes out `execute if data`, `execute if
items`, `execute if slots`, `execute store ... <nbt path>` and the NBT tag argument on `/summon`.
It is the same gap that keeps `/data` and `/item` unregistered.

**`execute if predicate` refuses.** The datapack predicate evaluator is not wired to the command
host, even though `@jsprismarine/predicates` compiles predicates for loot and advancements.

**`execute if stopwatch` parses and always answers false.** `/stopwatch` is a 26.x Java command
with no timer behind it here, and the command itself is not registered.

**`/fill` and `/clone` cap at 32768 blocks.** They refuse a larger region, which matches Java's
`minecraft:max_block_modifications` default.

**`scoreboard players enable` refuses.** It marks an objective as one a player may `/trigger`, and
there is no `/trigger` in this set, so recording the grant would set a flag nothing reads.

**The scoreboard does not survive a restart.** Java writes it to `scoreboard.dat`; this one lives
as long as the process. Everything a running server can observe works, including display slots and
a score surviving a player relogging.


**`/replaceitem` cannot write the slots no entity here holds.** It writes a player's named slots,
the ender chest, the indexed `slot.armor <n>` spelling, and container blocks through
`/replaceitem block <pos> slot.container <n>`. It refuses `slot.saddle`, `slot.chest`,
`slot.equippable` and `slot.armor.body`, because nothing in this server holds them.

**`Constraints` is always empty in the command packet.** Mojang's schema names the field without
defining it, and gophertunnel, Cloudburst and PocketMine disagree about what the indices mean, so
nothing is written rather than guessed.

## Further reading

- [The commands package README](../../packages/commands/README.md): the generated Bedrock table,
  the full flattener note table, the gamerule rename, and the `CommandHost` seam.
- [The mcfunction package README](../../packages/mcfunction/README.md): the file format in detail,
  the queue executor, and the diagnostics.
- [The research note on commands, functions and datapack execution](../research/commands-functions-and-datapack-execution.md):
  where every count on this page was measured, and what could not be confirmed.
- [gameplay-data.md](gameplay-data.md): what the pack stack loads at startup, and the rest of the
  Java data a datapack can replace.
