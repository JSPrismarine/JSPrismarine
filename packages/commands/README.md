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
