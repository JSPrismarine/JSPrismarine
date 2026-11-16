# Behavior pack scripts run in an embedded QuickJS on their world's thread

Status: accepted

JSPrismarine runs the scripts of unmodified Bedrock behavior packs, the `type: "script"` modules
that import `@minecraft/server`, and makes them its primary plugin format. Each JSP world owns one
script runtime: an embedded QuickJS engine that runs on that world's thread. The runtime holds
the scripts of every pack the world loads. Scripts in one world cannot reach another world, and
each world's `world` object is the one global that the Script API describes, with that world's
dimensions.

A script reaches the world only through the host's bindings. A binding reads through the world's
getters and writes through its setters, so [ADR 0011](0011-a-world-exchanges-only-plain-data.md)
still holds: a script's `Entity` or `Block` is a handle that carries an id, never the engine's
object. A handle whose entity is gone reports `isValid` as false and throws on use, as BDS does.

When script code runs:

- A before-event is a scripting guard in the action's pipeline
  ([ADR 0013](0013-vetoable-actions-are-staged.md)). It runs inline and synchronously, under
  restricted execution, and returns pass, veto or replacement values. A write to world state from
  a restricted context throws, which is the same rule the guard stage already has.
- After-events, `system.run` tasks and promise jobs flush in the script flush phase at the end of
  the tick ([ADR 0015](0015-a-tick-is-a-fixed-sequence-of-synchronous-phases.md)), in the loop
  BDS documents.
- Version 2 scripts also run early execution and `system.beforeEvents.startup` before the world
  finishes loading. Version 1 scripts start later and receive `worldInitialize`. The runtime picks
  the lifecycle from the `@minecraft/server` major version that each pack declares.

The runtime is a sandbox. Scripts have no Node.js API, no filesystem and no network outside
`@minecraft/server-net`. The host reads BDS's own configuration as it is:
`config/default/permissions.json` and `config/<script module UUID>/` with `permissions.json`,
`variables.json` and `secrets.json`, plus the `script-watchdog-*` and `script-debugger-*` server
properties under their BDS names. A server moved from BDS keeps its `config/` folder.

JSP-only features live in a native module, `@jsprismarine/server`. A pack does not declare it in
its manifest. It loads it with `await import('@jsprismarine/server')` inside `try`. BDS loads such
a pack and rejects the import with `Module [@jsprismarine/server] is unrecognized`, so the pack
takes its fallback path there. JSP resolves the import. This is the one place where JSP's rules
differ from BDS's: modules under `@jsprismarine/` need no manifest entry, and every
`@minecraft/` module still needs one.

A manifest entry with `"optional": true` does not work for this. BDS refuses to load a pack that
declares a module it does not know, optional or not
([research](../research/bedrock-script-api.md#4-native-module-dependencies-and-optional)).

## Considered options

**A worker per world, with a blocking bridge.** It isolates script work on another thread. The
cost is that every before-event and every read, such as `getBlock` or `entity.location`, crosses
threads through `Atomics.wait` and a plain-data copy. Real add-ons make hundreds of small reads a
tick. The watchdog already stops a runaway script
([ADR 0021](0021-the-script-watchdog-counts-steps.md)), so a separate thread adds no safety we
need.

**One runtime for the whole server**, with JSP worlds exposed as extra dimensions. It changes what
`world` and `world.getDimension` mean to a pack, and one script would run against several worlds'
threads.

**Node.js `vm`, isolated-vm or a JavaScript engine that is not QuickJS.** `vm` is not a security
boundary, by Node's own documentation. isolated-vm and V8 need Node.js. The scriptc build has no
Node.js runtime and loads no Node-API addon, and BDS itself embeds QuickJS from Fabrice Bellard's
line, so QuickJS gives packs the same language level, including no `Intl`. Which QuickJS, and how
it is bound, is [ADR 0023](0023-quickjs-through-one-c-layer-and-ffi.md).

**A JSPrismarine API modeled on `@minecraft/server`** that authors port to. It would not run the
packs people already have.

## Consequences

- Script time is world time. A slow script slows its own world's tick, never another world's.
- Every Script API member is a binding the host must write. The surface is generated
  ([ADR 0022](0022-the-script-api-surface-is-generated.md)), and the behavior is not.
- Scripts take part in replay ([ADR 0021](0021-the-script-watchdog-counts-steps.md)).
- The embedding API of `@jsprismarine/prismarine` stays, as the lower-level way to host the
  server. It is no longer the plugin format.
