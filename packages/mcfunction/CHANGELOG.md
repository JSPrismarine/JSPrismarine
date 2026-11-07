# @jsprismarine/mcfunction

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

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

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a751da2`](https://github.com/JSPrismarine/JSPrismarine/commit/a751da28fed5879c5d941bc1cebd369560271dfb) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/mcfunction`, the Java Edition function runtime. It loads `.mcfunction` files and
  function tags from a pack stack, compiles each file once, and runs it against an injected
  `CommandRunner`, so the package implements no commands of its own. It parses the line format
  including `#` comments, `\` continuation and `$` macro lines, substitutes `$(variable)` from an
  argument compound with Java's no-suffix number rules and an 8-entry parse cache per macro function,
  resolves `#namespace:tag` references including nested tags and the two lifecycle tags
  `minecraft:load` and `minecraft:tick`, and executes through an explicit frame queue that bounds a
  run with `maxCommandSequenceLength` and `maxCommandForks` (both defaulting to 65536, a figure
  Mojang has never published) and reports a tripped limit instead of throwing. Nesting 20000 calls
  deep does not touch the JavaScript stack, and a tail call replaces its frame rather than stacking
  on it.
