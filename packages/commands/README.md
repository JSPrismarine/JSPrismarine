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

| | Count |
| --- | --- |
| Commands | 84 |
| Overloads | 279 |
| Parameters | 1186 |
| Command enums | 236 |
| Enum values | 14281 |
| Basic parameter types | 26 |
| Soft enums | 4 |

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
cartesian expansion. Three shapes do not survive, and each produces a note instead of a silent
drop:

| Shape | What the client gets | Note |
| --- | --- | --- |
| A redirect back onto the current path, which is a cycle | One trailing chained-subcommand parameter, and the overload marked `isChaining` | `redirect-cycle` |
| A redirect to the dispatcher root | One `CODEBUILDERARGS` parameter, which the client will not autocomplete | `redirect-to-root` |
| An argument whose type Bedrock has no parameter type for | An `ID` string, unvalidated | `no-bedrock-type` |
| An argument type from outside this package | An `ID` string | `untyped-argument` |
| A node that is its own child | Nothing; the branch is cut | `self-child` |
| An expansion past the overload cap | Nothing past the cap | `overload-limit` |

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
wrote it. The dialect is a flag, not a merged grammar, because the two grammars share argument
names for `x`, `y`, `z`, `dx`, `dy`, `dz`, `scores`, `tag`, `name` and `type` and disagree on
everything else.

Java has 6 base selectors and the 21 arguments `EntitySelectorOptions` declares. Bedrock has 7 base
selectors, `@initiator` being the extra one, and its own argument set. The parser normalizes
Bedrock onto the Java spelling:

| Bedrock | Java |
| --- | --- |
| `r`, `rm` | `distance` |
| `l`, `lm` | `level` |
| `rx`, `rxm` | `x_rotation` |
| `ry`, `rym` | `y_rotation` |
| `m`, with the `s`/`0`, `c`/`1`, `a`/`2`, `d`/`5` shorthands | `gamemode` |
| `c`, signed, where a negative count means furthest first | `limit` plus `sort` |

Four Java arguments have no Bedrock expression (`advancements`, `nbt`, `predicate`, `team`) and
four Bedrock arguments have no Java expression (`family`, `hasitem`, `haspermission`,
`has_property`). `sort=arbitrary` is a fifth Java-side gap, a value rather than an argument.
Bedrock also allows `~` in `x`, `y` and `z` and a `!` inside `scores`, neither of which Java
accepts.

An argument from the other edition parses anyway and the result carries a note naming it. Dropping
it silently would change which entities a command hits, and a `/execute` body the server itself
built can legitimately carry a Java-only argument on a connection whose player is on Bedrock.
`SelectorSyntaxError` carries the offset the parse stopped at.
