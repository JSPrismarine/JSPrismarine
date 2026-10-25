# @jsprismarine/mcfunction

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/mcfunction)](https://www.npmjs.com/package/@jsprismarine/mcfunction)

The Java Edition mcfunction runtime: it loads `.mcfunction` files and function tags from a pack
stack, compiles them once, and runs them against a command runner you supply. It parses the file
format, expands macro lines, resolves function tags, and bounds a run with the two gamerules that
Java bounds it with. It does not implement a single command.

```ts
import { FunctionExecutor, RecordingCommandRunner, loadFunctions } from '@jsprismarine/mcfunction';

const { functions, tags, diagnostics } = loadFunctions([{ name: 'my pack', files }]);
const runner = new RecordingCommandRunner();
const executor = new FunctionExecutor({ functions, tags, runner });

executor.runLoad({ source: console }); // once, after the packs load
executor.runTick({ source: console }); // once per server tick
```

## What this buys, and what it does not

Vanilla ships no functions. The Java 26.3 server jar has 9884 files under `data/minecraft/` and
zero of them are `.mcfunction`; it has 883 tag files and none of them tags the function registry.
Bedrock is the same: `Mojang/bedrock-samples` at 1.26.50.4 has 22258 files, no `.mcfunction` and
no `tick.json`. Both editions have a function runtime and neither uses it for vanilla gameplay.

So this package buys no vanilla parity on its own. What it buys is the ability to run a third-party
Java datapack, and a place to write server behavior as data rather than as TypeScript. Parity comes
from the commands a function calls into, which live elsewhere.

## The file format

One command per line, written without a leading slash. A line is a comment when its first
non-whitespace character is `#`, and blank lines are skipped. A line whose last non-whitespace
character is `\` continues into the next line, whose leading and trailing whitespace is stripped
before it is appended. A command may be at most 2000000 characters.

Two mistakes are rejected rather than guessed at, because Java rejects them by name: a line that
starts with `//`, which is not a comment marker here, and a line that starts with `/`. A file with
any error does not load at all, which is what the Java server does when
`CommandFunction.fromLines` throws.

A function id comes from its path. `data/pack/function/setup/stage.mcfunction` loads as
`pack:setup/stage`, using the singular `function` directory that 26.3 uses.

### Macro lines

A line whose first non-whitespace character is `$` is a macro line. It carries one or more
`$(variable)` substitutions, and the call must pass a compound holding an entry for each of them.
Extra entries in the compound are ignored, and a plain function called with a compound ignores it
entirely.

```mcfunction
say starting
$say hello $(name), you have $(count) items
```

A `$` is literal unless `(` follows it, which is the only escape the format has. A string argument
goes in raw, with no quoting and no escaping, so a value carrying a quote can produce a command
that no longer parses. Numbers go in without the type suffix they would carry in NBT, matching the
1.20.2 fix; a nested compound or list is rendered as SNBT, where suffixes are back because the text
is NBT again. A missing entry reports
`the macro arguments have no entry for '<name>'` and the whole call is skipped, the way Java skips
a call whose macro cannot be instantiated.

Macro lines are the one part of the format that costs something per call, because the substituted
text has to be parsed again. Each macro function keeps the 8 most recent argument sets, matching
`MAX_CACHE_ENTRIES` in Java's `MacroFunction`, and keys them on the values the macro actually
references, so extra compound entries do not split the cache.

## Function tags

A `function #namespace:tag` line runs every function the tag names, in order, with nested tags
expanded where they appear. A function named twice runs once. A cycle between tags is reported and
cut rather than followed.

Two tags are special, and they are the only two the Java server looks up by name:
`minecraft:load`, which runs once after the packs load, and `minecraft:tick`, which runs on every
server tick. `FunctionExecutor` exposes them as `runLoad` and `runTick`.

Tags merge across the stack rather than replacing. Two packs that both add to `minecraft:tick`
both run, unless the later one sets `"replace": true`. Functions are the opposite: a later pack
that declares the same id replaces the earlier file whole. `loadFunctions` applies both rules, and
`FunctionTagRegistry` is the lookup `FunctionExecutor` resolves tags through. The lookup is
injected, so a server that already holds its tags somewhere else can pass its own.

## The limits, and how sure we are of them

A run is bounded by the two gamerules Java bounds it with. Both were renamed in 1.21.11, so the
camelCase names you may have seen are stale.

| Rule | Counts | Default here |
| --- | --- | --- |
| `minecraft:max_command_sequence_length` (was `maxCommandChainLength`) | operations | 65536 |
| `minecraft:max_command_forks` (was `maxCommandForkCount`) | contexts | 65536 |

Mojang has never published either default. The figure 65536 has two independent secondary
confirmations, minecraft.wiki's gamerule page and Pumpkin's extraction from the real 26.3 server
jar, and 65536 is in the `GameRules` class constant pool, but no Mojang document attributes the
value to either rule. Treat it as a well-corroborated default rather than a confirmed one. Both are
configurable per executor:

```ts
new FunctionExecutor({ functions, runner, limits: { maxCommandSequenceLength: 10_000 } });
```

An operation here is one command line run or one function invoked, which is this runtime's reading
of the three kinds the 1.20.3 changelog enumerates. A context is whatever a command reports as
`forks`: `execute as @e` matching five entities reports 5, and the runner is what knows that, so
fork counting is only as accurate as the runner's reporting.

Reaching either limit stops the run, records the reason in `report.stopped`, and adds a diagnostic.
Nothing throws. Everything a call reaches shares one budget, so the report covers the whole tree
below the entry point.

Bedrock's equivalent is a smaller per-call cap, 10000 commands, exported as
`BEDROCK_MAX_COMMANDS_PER_FUNCTION`. This runtime runs Java functions and does not apply it; pass
it as `maxCommandSequenceLength` if you want Bedrock's ceiling.

## The command seam

This package implements no commands. Every line it does not handle itself goes to a
`CommandRunner`:

```ts
interface CommandRunner<TSource> {
    run(commandLine: string, context: CommandContext<TSource>): { result?: number; forks?: number };
}
```

The context carries the source you passed to the run, plus the function id and line number the
command came from, which is what diagnostics and logs need. The server's Brigadier dispatcher is
the real adapter at this seam - `packages/prismarine/src/command/function/` holds it, and routes
every line into the `@jsprismarine/commands` tree with the source made silent, as Java does.
`RecordingCommandRunner` is the other one, and it records what a function would run so a test or
a pack author can inspect it without a world.

A runner may throw. The executor reports the failure and continues with the next line, because one
failing command does not abort a Java function.

`/return` is split across the seam. The runner implements the command, because it is one, and
reports it back as `returned`; only the executor can act on it, because ending a function means
dropping a frame. A line that reports `returned` ends the function it came from, and the loop
carries on with whatever called it. `returned.value` is what the function returns, and a
`/return fail` or a `return run` whose command failed ends the function without one. The report
collects the values of the functions the entry point invoked directly, in `returnValues`, so
`#a:tag` whose three members returned 0, nothing and 5 reports `[0, 5]`. A `/return` deeper in the
call tree ends its own function and contributes nothing, which is Java's rule: `/return` returns
from one function, not from its caller.

The one exception is a `function` line, which the executor reads itself. A call is control flow
rather than a command, and handling it here is what keeps nesting on the queue. The line form is
`function <id>`, `function #<tag>`, or either of those followed by an argument compound. The
compound is read as JSON by default, because SNBT needs a parser this package does not own; pass
`parseArguments` to supply one. Java's `function <id> with block|entity|storage` forms need a world
to read from and are not supported yet.

## Why the executor uses a queue

Java rewrote function execution in 23w41a, moving the call stack onto the heap: `ExecutionContext`
holds a `Deque` of queued commands, a `commandQuota` and a `Frame` type carrying its own depth.
That rewrite is what lets the gamerules bound work and what closed MC-265805, where a
tail-recursive function consumed memory linearly with depth.

This executor has the same shape: an array of frames, one loop, and a counter charged per
operation. Nesting 20000 functions deep does not touch the JavaScript stack, and a call made from
the last line of a function replaces its frame instead of stacking on it, so a tail-recursive
function runs at constant depth until the operation limit stops it. Both are covered by tests.

## Reporting

Loading, compiling and running all report problems instead of throwing. Each diagnostic carries a
severity, a stable `code`, a message, and whichever of `functionId`, `line` and `pack` apply. A
broken file is left out of the registry and the rest of the stack still loads.

## Further reading

[The research note on commands, functions and datapack execution](../../docs/research/commands-functions-and-datapack-execution.md)
is where the facts above come from, including what was measured in Mojang's own files and what
could not be confirmed.
