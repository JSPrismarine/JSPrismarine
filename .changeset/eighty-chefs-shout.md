---
'@jsprismarine/commands': minor
'@jsprismarine/mcfunction': minor
'@jsprismarine/prismarine': minor
---

Add `/return` and make `execute if function` read it.

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
