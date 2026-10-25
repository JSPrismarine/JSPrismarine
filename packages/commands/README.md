# @jsprismarine/commands

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/commands)](https://www.npmjs.com/package/@jsprismarine/commands)

The command layer: Mojang's published Bedrock command table, a Java-shaped command tree the
Brigadier port dispatches, the flattener that turns that tree into an `AvailableCommandsPacket`
payload, and the target selector grammars for both editions.

## The data source

Mojang publishes Bedrock's whole command set as machine-readable data. The table under
`src/tables/bedrockCommands.json` is generated from
`metadata/command_modules/mojang-commands.json` in `Mojang/bedrock-samples`, pinned by
`packages/bedrock-data/sources.json` to tag `v1.26.50.4`, commit
`46ba6ea985fb5a92d79a9419198f10dda14c199d`.

The generator measures what it emits, and `src/bedrockTable.test.ts` asserts the counts:

|                       | Count |
| --------------------- | ----- |
| Commands              | 84    |
| Overloads             | 279   |
| Parameters            | 1186  |
| Command enums         | 236   |
| Enum values           | 14281 |
| Basic parameter types | 26    |
| Soft enums            | 4     |

Nothing in the table is hand-written. A game version bump is a re-fetch and a re-run:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
pnpm --filter @jsprismarine/commands run generate:bedrock-commands
```

The generator refuses to emit when the source is missing, when two command enums collide on the
upper-case name a parameter refers to them by, or when a command, overload or enum list comes back
empty. The fetched metadata is an extracted game file, so it is parsed and validated, never
executed.

Read the table through `src/bedrockTable.ts`, which casts the parsed JSON once and exposes
`bedrockCommandTable`, `bedrockCommand`, `bedrockCommandEnum`, `isBedrockSoftEnum` and
`isBedrockBasicType`.

The enums are also what a Java registry argument completes from. `resourceArgument('minecraft:item')`
sends Mojang's own `Item` enum, all 3411 values of it, rather than an unvalidated string, and the
same holds for `minecraft:block`, `minecraft:entity_type`, `minecraft:mob_effect`,
`minecraft:enchantment`, `minecraft:damage_type` and `minecraft:biome`. Mojang's lists are
unnamespaced where Java's commands take a full id, so both spellings parse and a command body is
always handed the id. A registry Bedrock publishes no enum for still degrades to a string.

Mojang's list is frozen at the version the table was generated from, which makes it the wrong
thing to validate against on its own once content packs are loaded: `/summon mypack:dragon` would
be refused at parse for an entity the host can spawn. A caller that can enumerate its own
registries passes them as `CommandRegistryOptions.content`, and the two lists are accepted
together. Added rather than substituted, for two reasons: a host whose build omits a vanilla id
should not make that id unspellable, and Mojang's list is what a Bedrock client completes from.
The client is offered the union, so a pack's own ids autocomplete too.

`ContentRegistryIds` names the four registries this applies to: entity types, blocks, items and
enchantments. They are the registries a host verb resolves an id against and a pack can extend.
`minecraft:damage_type` and `minecraft:mob_effect` stay pinned to Mojang's enum because no host
here keeps a registry for either, and `minecraft:attribute`, `minecraft:particle_type` and
`minecraft:worldgen/biome` are unvalidated already, Bedrock publishing no enum for any of them.

## The command tree, and what flattening it costs

`CommandRegistry` holds the Brigadier port's own tree, unchanged: literals, arguments, redirects
and forks, dispatched by `CommandDispatcher.execute`. Java semantics run server-side. What the
registry adds is the per-command data `AvailableCommandsPacket` carries and Brigadier has no place
for, a description, an alias list, a permission level and a flags word. An alias is registered as a
literal that redirects to the real root and shares its executor, so `/tp` and `/teleport` parse the
same arguments and run the same code.

`buildAvailableCommands(registry, options)` returns the packet's eight fields as values plus the
flattener's report. Pass `source` to filter by `CommandNode.canUse` the way Java does, so a player
is only told about the commands they may run.

Bedrock's tree is a flat overload list per command with no redirects, so Java's graph becomes a
cartesian expansion. Six shapes do not survive it unchanged, and each produces a note instead of a
silent drop:

| Shape                                                    | What the client gets                                                            | Note               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------ |
| A redirect back onto the current path, which is a cycle  | One trailing chained-subcommand parameter, and the overload marked `isChaining` | `redirect-cycle`   |
| A redirect to the dispatcher root                        | One `CODEBUILDERARGS` parameter, which the client will not autocomplete         | `redirect-to-root` |
| An argument whose type Bedrock has no parameter type for | An `ID` string, unvalidated                                                     | `no-bedrock-type`  |
| An argument type from outside this package               | An `ID` string                                                                  | `untyped-argument` |
| A node that is its own child                             | Nothing; the branch is cut                                                      | `self-child`       |
| An expansion past the overload cap                       | Nothing past the cap                                                            | `overload-limit`   |

A fork flattens normally and is noted anyway. A Bedrock client can be shown
`/execute as @e run say hi`; what it cannot do is run the fan-out, which happens in
`CommandDispatcher.execute`. The note tells a caller that the overload it is about to send has
semantics the client does not share. Nothing else about Java's fork reaches the wire, which is why
`execute store result score ...` cannot be shown at all: no chained subcommand, no parameter type
and no redirect express it.

Sibling literals whose continuations are identical collapse into one enum, which is how `if` and
`unless` become `OPTION_IF_UNLESS`. That is Mojang's own encoding: in `mojang-commands.json` every
`/execute` subcommand keyword is a one-value hard enum (`OPTION_AS`, `OPTION_AT`) and the tail is
`EXECUTECHAINEDOPTION_0`. Flattening a Java `/execute` built with redirects produces the same
shape.

Two details of the packet are worth stating because Mojang's schema does not settle them:

- `Chained Subcommand Data` entries carry value pairs Mojang names `first` and `second` and defines
  neither. The only datum a chained table has per entry is the keyword, so this package writes its
  index into `Chained Subcommand Values` in both members.
- `CommandData.Flags` is a `uint16` Mojang documents as "the command flags" without enumerating the
  bits, so the default here is 0, as it is everywhere else in this repository.

The parameter type ids are version-pinned. `PoiTag` and `PoiType` were inserted at 87 and 88 in
1.26.50, which moved everything above them; the table in `src/parameterTypes.ts` is the one for
protocol 2193, keyed by Mojang's own metadata name so the numbers and the data join on a published
key.

This package does not depend on `@jsprismarine/protocol` or `@jsprismarine/prismarine`. It produces
the payload and the network layer writes it, so the command layer stays free of the server. The
round trip in `src/packet.test.ts` asserts every field fits the width the packet encodes it at
(uint16 flags, uint8 permission level and options, int32 alias index, uint32 parse symbols and
indices) and that every parse symbol decodes back to the table it points at.

## Selectors

`parseSelector(input, dialect)` reads one target selector and returns one model whichever edition
wrote it, and `matchSelector(selector, source, { candidates, facts })` resolves that model against a
list of candidates the caller supplies. The split is deliberate: the grammar belongs to the edition
the string was typed in, and the matching belongs to Java's `EntitySelector`, which both dialects
normalize onto. The order Java applies is kept because it is observable - filter, then sort, then
cut to the limit - so a `@p` in a crowd is the nearest match of the filtered set rather than the
nearest candidate that happens to pass. The facts an `EntityRef` does not carry (game mode,
experience level, tags, scores, Bedrock's type families) arrive through an optional `SelectorFacts`,
and a fact left out never matches a test that reads it. The dialect is a flag, not a merged grammar, because the two grammars share argument
names for `x`, `y`, `z`, `dx`, `dy`, `dz`, `scores`, `tag`, `name` and `type` and disagree on
everything else.

Java has 6 base selectors and the 21 arguments `EntitySelectorOptions` declares. Bedrock has 7 base
selectors, `@initiator` being the extra one, and its own argument set. The parser normalizes
Bedrock onto the Java spelling:

| Bedrock                                                     | Java                |
| ----------------------------------------------------------- | ------------------- |
| `r`, `rm`                                                   | `distance`          |
| `l`, `lm`                                                   | `level`             |
| `rx`, `rxm`                                                 | `x_rotation`        |
| `ry`, `rym`                                                 | `y_rotation`        |
| `m`, with the `s`/`0`, `c`/`1`, `a`/`2`, `d`/`5` shorthands | `gamemode`          |
| `c`, signed, where a negative count means furthest first    | `limit` plus `sort` |

Four Java arguments have no Bedrock expression (`advancements`, `nbt`, `predicate`, `team`) and
four Bedrock arguments have no Java expression (`family`, `hasitem`, `haspermission`,
`has_property`). `sort=arbitrary` is a fifth Java-side gap, a value rather than an argument.
Bedrock also allows `~` in `x`, `y` and `z` and a `!` inside `scores`, neither of which Java
accepts.

An argument from the other edition parses anyway and the result carries a note naming it. Dropping
it silently would change which entities a command hits, and a `/execute` body the server itself
built can legitimately carry a Java-only argument on a connection whose player is on Bedrock.
`SelectorSyntaxError` carries the offset the parse stopped at.

## The command set

`registerVanillaCommands()` returns a `CommandRegistry` holding 60 commands: the 46 names Java 26.3
and Bedrock 1.26.50 share, plus `/data`, `/item`, `/attribute`, `/random` and `/return`, which are
Java-only and which the datapack runtime cannot work without, plus nine of Bedrock's own. Aliases
are registered as redirects, so `/tp`, `/msg`, `/w` and `/experience` parse and run as their
owners.

```
clear clone damage deop difficulty effect enchant execute fill function gamemode gamerule give
help kick kill list locate loot me op particle place playsound recipe reload ride say schedule
scoreboard setblock setworldspawn spawnpoint spreadplayers stop stopsound summon tag teleport
tell tellraw time title transfer weather xp
attribute data item random return
camerashake daylock fog playanimation replaceitem testfor testforblock testforblocks titleraw
```

Four of the Bedrock nine are older spellings of something Java says differently, and they run the
same host verbs rather than a second implementation: `/testfor` is `execute if entity`,
`/testforblock` is `execute if block`, `/testforblocks` is `execute if blocks`, and `/daylock` is
`gamerule doDaylightCycle` with the sense inverted. `/replaceitem` is the `/item replace` Java
renamed in 1.17 and Bedrock kept, and `/titleraw` is `/title` over a `rawtext` object, built from
the same tree so a `times` form cannot exist on one and not the other. `/camerashake`, `/fog` and
`/playanimation` have no gameplay rule behind them at all: each asks the client to draw something
and the server's whole part is the packet, which is why nothing about them is approximated.

A registry can also be asked to hold only part of the set. `new CommandRegistry({ include })` turns
a name away, and an excluded command is built but never registered, so nothing can parse it, no
alias is registered for it, and the flattener never puts it in the packet. That is for a host that
cannot answer every verb: a command whose body does nothing is worse than one the client was never
offered. `getExcludedNames()` reports the difference.

`/execute` is a real subcommand chain, not `execute <target> <command>`. It has Java's 14
subcommands, each redirecting back to the `execute` node; 13 `if`/`unless` conditions; 8 `on`
relations; and 5 `store` targets. `as`, `at`, `on`, `positioned as`, `rotated as` and
`facing entity` fork, so one line runs once per matched entity, and the Brigadier port's
breadth-first loop in `CommandDispatcher.execute` does the fan-out.

`execute store` needs the value a later command returns. Upstream Brigadier carries that on the
source as a `CommandResultCallback`, which arrived with `ContextChain` in 2023; the port predates
it. `storeCommandResults(dispatcher)` installs a `ResultConsumer` instead, which sees the same
thing, one call per executed context, and feeds the sinks that `withStore` attached to the derived
source. `registerVanillaCommands` wires it.

`/return run <command>` is built on the same machinery, because it asks the same question: Java
hangs a `CommandResultCallback` off the source, and here the redirect to the dispatcher root
attaches a `withStore` sink that reads what the command produced. The sink fires once per executed
context, so a forked body calls it more than once and the first call is the one taken.

## What a function returns, and what `execute if function` matches

A function returns a value only through `/return`. A function that reaches its last line returns
nothing, and 1.20.3's rule is that nothing does not match, so `execute if function` is false for
it however many lines it ran. `DataCommandHost.runFunction` therefore answers a `FunctionOutcome`
rather than a number: `result` is what `/function` reports, which is the `/return` value when
there was one and the number of command lines run when there was not, and `matched` is the
condition's own answer. Neither derives from the other. A tag whose members return 1 and -1 sums
to 0 and still matches, because Java matches a tag when any member did.

`/return` outside a function is an error, which is the host's call to make: nothing in this
package knows whether a function is running.

## The CommandHost seam

A command in this package is a Brigadier tree plus one or more calls into `CommandHost`. Nothing
here imports the server, reads a world, or knows what an entity is beyond the seven fields
`EntityRef` declares. The interface is five groups, `entities`, `world`, `scoreboard`, `data` and
`server`, and `testCommandHost(overrides)` builds one whose every verb reports that nothing
happened, so a test names the two or three methods the command under test calls and still gets a
fully typed host rather than a cast.

`CommandSource` is Java's `CommandSourceStack`: the entity, position, rotation, dimension, anchor,
permission level and silence a command runs with. Every `with*` method returns a copy, because a
forked `execute as @e` runs the rest of the chain once per source and sharing mutable state
between branches would make the result depend on evaluation order.

A command's return value is the count `execute store result` captures, so `/fill` returns the
number of blocks it changed rather than a success flag.

`/scoreboard players`, `execute if score` and `execute store ... score` take a score holder rather
than an entity, which is Java's `ScoreHolderArgument`: a selector, a bare name, or `*`. The bare
name is the point. A scoreboard scores a name, and a name no entity has - a "fake player" - is how
a datapack keeps a counter that is not about anybody, so reading those three arguments as entity
selectors would have made the normal idiom unparseable.

## Gamerules

1.21.11 moved gamerules into a registry and renamed every one of them from camelCase to a
namespaced snake_case id. The mcfunction runtime reads two of them,
`minecraft:max_command_sequence_length` and `minecraft:max_command_forks`, so anything written
against `maxCommandChainLength` or `maxCommandForkCount` is stale.

`JAVA_GAME_RULES` holds the 59 rules Mojang's own `minecraft:game_rule` registry report lists for
26.3, 47 boolean and 12 integer. `gameRule(name)` resolves a current id, a bare id, a pre-1.21.11
camelCase name or Bedrock's lowercase name onto the same rule, and `renamedGameRule(legacy)`
answers only the rename question.

The measured shape of the rename differs from the figure in
[the research note](../../docs/research/commands-functions-and-datapack-execution.md), which says
36 renamed. Mojang's own old-to-new map, the constant pool of `GameRuleRegistryFix.class` in the
26.3 jar, carries 59 legacy names over 58 current ones, of which 27 change more than case. Both
`enableCommandBlocks` and `commandBlocksEnabled` become `minecraft:command_blocks_work`, which is
why 59 names reach 58 ids. The 59th current rule,
`minecraft:fire_spread_radius_around_player`, is not a rename at all: the fix folds the old
booleans `doFireTick` and `allowFireTicksAwayFromPlayer` into one integer radius. The 3 removals
the note reports do match, and `REMOVED_GAME_RULES` names them.

Defaults are stated for three rules only. Mojang has never published any gamerule default;
`GameRules.class` in the 26.3 jar has exactly three integer constants in its pool,
`[32768, 65536, 2147483647]`, and minecraft.wiki and `Pumpkin-MC/Extractor` independently report
65536 for both command limits and 32768 for `minecraft:max_block_modifications`. The minimums come
from the 1.21.11 changelog, which does state them. Every other default belongs to the world, not to
this package.

Bedrock's names come from Mojang's own `BoolGameRule` and `IntGameRule` enums in the generated
command table, so there is no second copy to keep in step. Bedrock has 32 boolean and 5 integer
rules, 8 of which Java has no counterpart for, and it still spells the command limit
`maxcommandchainlength`.

## What is not wired yet

- `Constraints` is always empty. Mojang's schema names the field and stops, and gophertunnel,
  Cloudburst and PocketMine do not agree on what the indices mean, so nothing is written rather
  than guessing.
- The selector argument reads with the Java grammar unless a caller passes `dialect: 'bedrock'`.
  Wiring the dialect to the connection a `CommandRequestPacket` arrived on belongs to the server.
  In practice both dialects parse either way: a Bedrock-only argument in a Java-dialect string is
  normalized and noted rather than refused, so `@e[r=5,c=1]` reads as `distance=..5, limit=1, sort=nearest`.
- `execute if stopwatch` parses and always answers false. `/stopwatch` is a 26.x Java command with
  no timer behind it here yet.
- 29 of Bedrock's commands are not implemented. `/allowlist`, `/save`, `/setmaxplayers`,
  `/mobevent`, `/tickingarea`, `/structure`, `/clearspawnpoint` and `/toggledownfall` each need a
  subsystem no server here has. `/structure` is the closest of the eight:
  `@jsprismarine/structures` reads and writes the NBT template format, and what is still missing
  is somewhere for a player-made template to be saved to and read back from.
  `/camera`, `/hud`, `/music`, `/dialogue`, `/inputpermission`,
  `/controlscheme`, `/aimassist`, `/project` and `/sendshowstoreoffer` each need a packet this
  repository does not write yet; and `/script`, `/scriptevent`, `/gametest`, `/editor-allowlist`,
  `/wsserver`, `/changesetting`, `/packstack`, `/permission`, `/event`, `/reloadconfig`,
  `/reloadpacketlimitconfig` and `/serveridentity` are editor, telemetry and Script API surfaces
  that are out of scope by [the plan](../../docs/plans/data-driven-vanilla.md) section 12.
