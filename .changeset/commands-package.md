---
'@jsprismarine/commands': patch
---

Add `@jsprismarine/commands`, the data-driven command layer. Mojang publishes Bedrock's whole
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
