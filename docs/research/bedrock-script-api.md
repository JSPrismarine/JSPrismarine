# Hosting `@minecraft/server` scripts outside Bedrock Dedicated Server

Researched 2026-11-16. Scope: the facts a third-party host needs to run unmodified behavior pack scripts written against `@minecraft/server`, which [docs/plans/script-api-host.md](../plans/script-api-host.md) plans and ADRs [0020](../adr/0020-scripts-run-in-quickjs-on-the-world-thread.md) to [0023](../adr/0023-quickjs-through-one-c-layer-and-ffi.md) decide. It covers the engine BDS embeds and the language level packs see, the modules and versions and how BDS resolves them, what the binding metadata encodes for a generator, native module dependencies and `optional`, the tick and startup timing, BDS's script configuration, the watchdog, the on-disk format of dynamic properties, the debugger protocol, the engine and binding options, prior art, and candidate add-ons for a corpus.

Section 6 of [bedrock-addons-and-custom-content.md](bedrock-addons-and-custom-content.md#6-the-script-api) already covers where scripts run, custom components and why the API is large. This note does not repeat that. One count there is out of date: the pinned `bedrock-samples` now has 31 stable `@minecraft/server` versions, not 28 (section 2).

Versions:

- Bedrock Dedicated Server 1.26.51.1 for Linux, protocol 2193, build 51061372, branch `r/26_u5`, commit `0559ac59aa24e42d30e238bc55cdb306232a6507`, as `packages/bedrock-data/sources.json` pins it (`defaultProtocolVersion` 2193) and the server printed at startup.
- `Mojang/bedrock-samples` tag v1.26.50.4, commit `46ba6ea985fb5a92d79a9419198f10dda14c199d`, also pinned in `sources.json`. Its `version.json` dates it 15-09-2026.
- quickjs-ng v0.18.0, published 2026-11-01, commit `d7215b0ad3fc2c562e8317fd9bca058fd4863804` (`QJS_VERSION_MINOR 18` in `quickjs.h`).
- scriptc 0.4.14 in this worktree's `node_modules` and 0.4.11 in the primary checkout. The scriptc.dev documentation is quoted from `llms.txt` as served on 2026-11-16.
- Node.js 26.13.0, with its `doc/api/ffi.md` at tag v26.13.0.
- `MicrosoftDocs/minecraft-creator` at commit `a9fd1c066560313eefb96715e8abf201890abd81` (2026-11-10), for the Microsoft Learn pages, cited as `docs:<path under creator/>`.
- `Mojang/minecraft-debugger` v1.61.0, commit `ac0b5899d6a845dd893ebded7f6d39ec23702103`.

Host: Ubuntu, x86-64, glibc, gcc. Each claim is marked as read (from a cited source) or run (from an experiment in the [reproduction](#reproduction) section). BDS was run four times with small test packs, each run under two minutes.

## Summary

- BDS runs scripts on QuickJS from Fabrice Bellard's line, not quickjs-ng. Its language level is about ES2023: no `Intl`, no iterator helpers, no `Float16Array`, no `Set` methods, no regular expression `v` flag. `eval` is not defined and `new Function("...")` throws `Function from string is not supported`. A stock quickjs-ng v0.18.0 context exposes 12 globals BDS does not have, so a pack that feature-tests would see a different engine on JSP unless the host removes them. (Read and run.)
- A pack that declares `@minecraft/server` 2.0.0 gets the 2.10.0 surface on the pinned BDS: its namespace has 536 exports, exactly the 2.10.0 metadata's count, and its `startup` event carries `customCommandRegistry`, which 2.0.0 does not have. A pack that declares 1.0.0 gets 354 exports, the 1.19.0 count. BDS serves the newest stable minor of the declared major, so there are two stable surfaces to implement per BDS version, not 31. (Run.)
- **`optional` does not let a pack name a module BDS does not know.** A pack declaring `@jsprismarine/server` with `"optional": true` does not load on BDS at all, with or without `@jsprismarine/server` in `allowed_modules`, and with manifest `format_version` 2 or 3. Without the allowlist entry BDS logs `requesting dependency on module [@jsprismarine/server] but it is not configured to use it`; with it, `depends on unknown module [@jsprismarine/server - 1.0.0]` and `failed to create context`. A pack that does not declare the module and calls `import('@jsprismarine/server')` loads, and the promise rejects with `Module [@jsprismarine/server] is unrecognized`. That undeclared dynamic import is the pattern that runs on both servers. (Run.)
- `optional` works for a module BDS knows: a pack with an optional `@minecraft/server-ui` loaded it both with a static `import` and with `import()`. The `Static import failed, optional module '%s' must be imported dynamically` message in the binary did not appear, so it presumably fires only when an optional module is unavailable on the host. (Run.)
- The observed tick order matches Microsoft's documented flush loop: promise jobs run after each after-event and each system task, and a `system.run` queued from inside an after-event runs in the same tick. Version 2 code runs at early execution, before the world loads, and world access there throws `ReferenceError: Native function [World::getDimension] cannot be used in early execution.` Version 1 code starts after the world loads and can read the world at its top level. `/reload` reruns every pack's top level, `startup` and `worldLoad`, and keeps dynamic properties. (Read and run.)
- The metadata encodes everything a generator needs for the shape: types with `valid_range`, argument `details` with `min_value`, `max_value` and `default_value`, `error_types` on returns, `call_privilege` on methods, `get_privilege` and `set_privilege` on properties, and a `call_privilege` on every callback type that says the privilege the callback runs under. 30 callback signatures in 2.10.0 run restricted and 2 run in early execution. `CustomCommandRegistry.registerCommand`'s callback has no privilege in the metadata, although the documentation and BDS run it restricted. (Read.)
- Dynamic properties are stored under the LevelDB key `DynamicProperties` as one little-endian NBT compound with one child compound per pack header UUID (not script module UUID). A number is a `TAG_Double`, a boolean a `TAG_Byte`, a string a `TAG_String` of UTF-8, and a `Vector3` a `TAG_List` of three `TAG_Float`s, so vector components lose precision to float32. NaN, Infinity and BigInt are rejected; strings over 32767 are rejected. (Run.)
- The BDS watchdog runs on the wall clock: a 3-second loop with `script-watchdog-hang-threshold=1000` was stopped after `1001 ms` by an uncatchable `InternalError: interrupted`. A caught stack overflow still counts as a critical watchdog exception and, by default, shuts the server down. (Run.)
- quickjs-ng polls its interrupt handler on a counter of 10000 polls, decremented at backward branches and calls. With a budget counted in handler calls, the same program used exactly 400 polls on every run, and a budget of 50 stopped `while (true)` at poll 51 with an uncatchable error, on the main thread and in a worker thread, through `node:ffi`. (Read and run.)
- The VS Code extension speaks a JSON protocol over TCP with an 8-hex-digit length prefix, at protocol version 11, derived from koush's QuickJS debugger. The runtime answers `stackTrace`, `scopes`, `variables`, `evaluate`, stepping and breakpoints. BDS has its own `Scripting::QuickJS::Debugger`. quickjs-ng v0.18.0 has no debugger API; an unmerged upstream pull request (#1421, +620 lines) proposes one. koush's patch to Bellard's QuickJS was about 1,130 new lines plus about 450 in `quickjs.c`. (Read.)
- scriptc vendors quickjs-ng 0.15.1, but only for its compile-time evaluator: "Compiled user programs never link it". JSP has to build and link its own quickjs-ng in both runtimes. scriptc's format 7 manifests can compile `node:ffi` `dlopen` and `registerCallback` calls statically, so one TypeScript binding written against `node:ffi` could serve both. (Read; the scriptc rebuild could not run here, see section 10.)
- Prior art exists after all: Wyze3306/AddonBridge runs `@minecraft/server` scripts on PowerNukkitX in GraalJS, partially, with no license. EndstoneMC/scripting-nodejs replaces BDS's engine with Node.js and is closed source. No Endstone roadmap item to reimplement the API was found. (Read.)

## 1. The engine BDS embeds

### QuickJS, from Bellard's line

The binary names its engine. `strings` on `bedrock_server` finds the classes `Scripting::QuickJS::QuickJSRuntime`, `Scripting::QuickJS::Debugger`, `Scripting::QuickJS::Watchdog`, `Scripting::QuickJS::ObjectInspector` and `Scripting::QuickJS::ContextScopeListener`, and the method `QuickJSRuntime::enableDebugger(IDebuggerTransport&, IBreakpointValidator&)`. (Read.)

Two strings place it on Bellard's line rather than quickjs-ng. The memory dump header reads `QuickJS memory usage -- Win32 version, %d-bit, malloc limit: %ld`, which is Bellard's format with `CONFIG_VERSION` set to `Win32`; quickjs-ng's v0.18.0 source prints `QuickJS-ng memory usage -- %s version` (`quickjs.c`). And the engine's class-name atom table in the binary runs `... DataView BigInt WeakRef FinalizationRegistry WeakMap WeakSet Map Iterator Set Iterator Array Iterator String Iterator RegExp String Iterator Generator Promise ...`, with no `Float16Array`, `Iterator Helper` or `Iterator Wrap`, which both Bellard's 2025 releases and quickjs-ng have. The Unicode script table does include the Unicode 16 scripts (`Garay`, `Gurung_Khema`, `Kirat_Rai`, `Ol_Onal`, `Sunuwar`), so Mojang's copy has newer Unicode data than its language features suggest. Which Bellard release it started from is not identifiable from strings. (Read.)

### What scripts see

A probe pack printed `typeof` for each global and feature below on BDS 1.26.51.1, and the same checks ran in a bare quickjs-ng v0.18.0 context through the spike in section 10. (Run.)

| Check | BDS 1.26.51.1 | quickjs-ng v0.18.0, bare context |
| --- | --- | --- |
| `Intl` | undefined | undefined |
| `eval` | undefined (`'eval' is not defined`) | function |
| `new Function("return 2")` | throws `Function from string is not supported` | 2 |
| `Iterator`, `Iterator.from` | undefined | function |
| `Float16Array` | undefined | function |
| `Atomics` | undefined | object |
| `SharedArrayBuffer`, `WeakRef`, `FinalizationRegistry`, `Proxy` | function | function |
| `queueMicrotask`, `performance`, `atob`, `btoa` | undefined | defined |
| `DisposableStack`, `AsyncDisposableStack`, `SuppressedError`, `DOMException` | undefined | function |
| `setTimeout`, `structuredClone`, `TextEncoder`, `WebAssembly`, `fetch` | undefined | undefined |
| `console` | object | undefined |
| `print` | function; `print('x')` logs at INFO as `[Scripting] x` | undefined |
| `Error.captureStackTrace` | undefined | function |
| `Promise.try`, `RegExp.escape`, `Math.sumPrecise`, `Error.isError`, `Array.fromAsync`, `Set.prototype.union` | undefined | function |
| `Object.groupBy`, `Promise.withResolvers`, `Array.prototype.toSorted` | function | function |
| `/[\p{L}--[a-z]]/v` | `SyntaxError: invalid regular expression flags`, which fails the whole file at parse time | true |
| Unbounded recursion | `InternalError: stack overflow` | `RangeError: Maximum call stack size exceeded` |
| `new Error().stack` | `    at <anonymous> (main.js)` lines, file name without the pack path | not compared |

BDS's global object has 60 own names. The quickjs-ng context has 71, including the spike's own `__host`. The other 12 that BDS lacks are `AsyncDisposableStack`, `Atomics`, `DOMException`, `DisposableStack`, `Float16Array`, `Iterator`, `SuppressedError`, `atob`, `btoa`, `eval`, `performance` and `queueMicrotask`. BDS has `console` and `print`, which the host adds. (Run.)

`Date` and `Math.random` both work on BDS. `new Date(0).toString()` printed `Thu Jan 01 1970 00:00:00 GMT+0000` and `getTimezoneOffset()` returned 0 on a host whose clock is UTC, so whether BDS follows the host time zone is not settled here. `(1234.5).toLocaleString()` returned `1234.5`, with no grouping. (Run.)

For parity, the host has two choices for each extra: remove it from the global object, or keep it and accept that a pack can tell JSP from BDS. The regular expression `v` flag and the error classes for stack overflow are inside the engine and cannot be removed by deleting a global.

## 2. Modules, versions and how BDS resolves them

### What the metadata holds

`metadata/script_modules/@minecraft/` has two files per public module version. `server_2.10.0.json` is a 291-byte stub that names the module, its UUID `b26a4d4c-afdf-4690-88f8-931846312678` (the same for every version), a `parentModule` of `@minecraft/server-bindings` 2.10.0, and a `wrapper_module`. The API itself is in `server-bindings_2.10.0.json`, whose own UUID is `0196a2fa-8fb5-79a7-b29e-ce3cbc644f82`. The wrapper is `@minecraft/server-bindings-v1-wrapper` for 1.x, `@minecraft/server-bindings-v2-wrapper` for 2.0.0 to 2.10.0, and `@minecraft/server-bindings-wrapper` for 2.11.0-beta. `server-ui` follows the same pattern (UUID `2BD50A27-AB5F-4F40-A596-3641627C635E`). The binary contains the string `@minecraft/server-bindings` but no readable wrapper source, so what the wrappers do is not known. (Read.)

Modules and versions in the pinned checkout (read):

| Module | Versions |
| --- | --- |
| `@minecraft/server` | 1.0.0 to 1.19.0 (20), 2.0.0 to 2.10.0 (11), 2.11.0-beta |
| `@minecraft/server-ui` | 1.0.0 to 1.3.0, 2.0.0 to 2.2.0, 2.3.0-beta |
| `@minecraft/common` | 1.0.0 to 1.3.0 |
| `@minecraft/server-graphics` | 1.0.0, 1.1.0-beta |
| `@minecraft/server-admin`, `server-gametest`, `server-net`, `debug-utilities`, `diagnostics` | 1.0.0-beta only |

`@minecraft/server-editor` has no metadata file, although BDS's default `allowed_modules` lists it. `@minecraft/vanilla-data` 1.20.70 appears only as a peer dependency of `server-bindings` from 1.18.0 on. (Read.)

### Size per version

Counts from each `server-bindings_<version>.json`. Runtime exports are classes, enums, errors, objects, constants and functions, the names a script's `import * as mc` sees; interfaces have no runtime value. (Read.)

| Version | Classes | Methods | Properties | Interfaces | Enums | Errors | Runtime exports |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1.0.0 | 7 | 5 | 5 | 0 | 0 | 3 | 12 |
| 1.1.0 | 9 | 21 | 15 | 6 | 1 | 5 | 17 |
| 1.2.0 | 57 | 52 | 46 | 11 | 3 | 6 | 68 |
| 1.3.0 | 81 | 79 | 78 | 14 | 3 | 7 | 93 |
| 1.4.0 | 128 | 160 | 169 | 25 | 9 | 7 | 146 |
| 1.5.0 | 134 | 176 | 181 | 29 | 10 | 7 | 153 |
| 1.6.0 | 151 | 213 | 226 | 40 | 14 | 7 | 175 |
| 1.7.0 | 165 | 251 | 250 | 40 | 14 | 7 | 190 |
| 1.8.0 | 172 | 262 | 259 | 42 | 15 | 7 | 198 |
| 1.9.0 | 187 | 312 | 291 | 45 | 18 | 8 | 217 |
| 1.10.0 | 197 | 334 | 312 | 48 | 25 | 9 | 235 |
| 1.11.0 | 225 | 388 | 410 | 49 | 30 | 12 | 273 |
| 1.12.0 | 262 | 411 | 482 | 51 | 32 | 22 | 322 |
| 1.13.0 | 264 | 414 | 491 | 52 | 32 | 22 | 324 |
| 1.14.0 | 268 | 423 | 495 | 60 | 32 | 22 | 328 |
| 1.15.0 | 271 | 431 | 514 | 60 | 33 | 23 | 333 |
| 1.16.0 | 275 | 438 | 522 | 61 | 35 | 24 | 340 |
| 1.17.0 | 279 | 443 | 531 | 61 | 36 | 24 | 345 |
| 1.18.0 | 281 | 458 | 535 | 62 | 40 | 25 | 352 |
| 1.19.0 | 281 | 467 | 535 | 65 | 41 | 26 | 354 |
| 2.0.0 | 279 | 453 | 548 | 65 | 45 | 26 | 357 |
| 2.1.0 | 288 | 464 | 572 | 70 | 52 | 28 | 375 |
| 2.2.0 | 290 | 480 | 578 | 71 | 53 | 31 | 381 |
| 2.3.0 | 292 | 490 | 583 | 72 | 54 | 31 | 384 |
| 2.4.0 | 349 | 506 | 656 | 74 | 56 | 34 | 446 |
| 2.5.0 | 351 | 508 | 660 | 75 | 58 | 34 | 450 |
| 2.6.0 | 375 | 577 | 716 | 90 | 62 | 35 | 479 |
| 2.7.0 | 376 | 582 | 716 | 90 | 62 | 36 | 481 |
| 2.8.0 | 397 | 615 | 764 | 99 | 64 | 44 | 512 |
| 2.9.0 | 401 | 622 | 776 | 101 | 65 | 44 | 517 |
| 2.10.0 | 417 | 655 | 801 | 109 | 67 | 45 | 536 |
| 2.11.0-beta | 452 | 731 | 884 | 116 | 70 | 55 | 584 |

The 1.0.0 file is far smaller than the module Mojang shipped with Minecraft 1.19.70, so the 1.x files may describe what each version means to this BDS rather than the historical module. That does not matter for hosting, because BDS never serves 1.0.0 as written (below).

The other modules, at their newest version: `server-ui` 2.2.0 has 14 classes with 69 methods, `server-gametest` 1.0.0-beta 8 classes with 136 methods, `server-graphics` 1.0.0 4 classes with 104 methods, `server-net` 1.0.0-beta 16 classes with 22 methods and an enum set of 303 constants, `server-admin` 1.0.0-beta 10 classes with 21 methods, `debug-utilities` 1.0.0-beta 15 classes with 26 methods, and `common` 1.3.0 7 errors. (Read.)

### Resolution on the pinned BDS

A pack that declared `@minecraft/server` 2.0.0 printed `Object.keys(await import('@minecraft/server')).length` as 536, the 2.10.0 count (2.0.0 has 357), had `CustomCommandRegistry` and `WorldLoadAfterEvent`, and its `startup` event's prototype listed `blockComponentRegistry`, `itemComponentRegistry`, `customCommandRegistry` and `dimensionRegistry`. The 2.0.0 metadata's `StartupEvent` has only the first two. A pack that declared 1.0.0 in the same world printed 354 exports, the 1.19.0 count, with `WorldInitializeAfterEvent` and without `WorldLoadAfterEvent`, and still had `Dimension.prototype.runCommandAsync`, which 2.0.0 removed. (Run.)

So BDS resolves a stable dependency to the newest stable minor of its major that it ships, which is the caret rule `docs:Documents/scripting/versioning.md` describes: "if a script module has a dependency on version `1.3.0` of the `@minecraft/server` API, it may actually have that dependency fulfilled with `1.8.0`". The same page says "Minecraft may support multiple major versions of APIs in the future", and the run confirms 1.x and 2.x packs load side by side. (Read and run.)

The consequence for a generator: on a given BDS, every 2.x pack sees one surface and every 1.x pack sees another. The intermediate files still matter as history, for example to know which members a 2.3.0 pack can rely on, but a pack depending on 2.3.0 on BDS can also call a 2.10.0 member.

Beta versions do not follow semver: "even minor version increments can include backwards-compatibility breaking changes", and they need the "Beta APIs" experiment (`docs:Documents/scripting/versioning.md`). BDS's message for a missing experiment is `Plugin [{}] - requesting dependency on beta APIs [{}], but the Beta APIs experiment is not enabled.`, and for internal versions `requesting dependency on internal APIs [{}], but does not have permission to access them.` (Read.)

Runs on 2026-11-17 against the same BDS settle what a beta resolves to. (Run.)

- The Beta APIs experiment is the `gametest` toggle in `level.dat`'s `experiments` compound, beside `experiments_ever_used` and `saved_with_toggled_experiments`. A staged world whose `level.dat` holds only that compound and `Generator` loads with the experiment on.
- With the experiment on, a pack that declares `@minecraft/server` 2.11.0-beta, or the version `beta`, gets the 2.11.0-beta API: 584 exports, with `WorldBeforeEvents.chatSend` and `SystemBeforeEvents.watchdogTerminate`. 2.12.0-beta, 2.9.0-beta, 3.0.0-beta and 1.17.0-beta do not load. The pack gets `Plugin [<name> - <version>] - failed to create context.`, then a message of several lines that names the version it asked for, the one beta BDS ships and the versions it ships, and later `run failed, no runtime or context available.`:

  ```text
  Plugin [probe newer] - module [probe newer - 1.0.0] requested invalid version [2.12.0-beta] of [@minecraft/server].

  Current [beta] version is [2.11.0-beta].

  Available versions:
  0.1.0
  1.19.0
  2.10.0
  2.11.0-beta
  3.0.0-alpha
  ```

- A stable version BDS does not ship, 2.11.0 or 4.0.0, gets the same message without the `Current [beta]` line, with or without the experiment. `@minecraft/server-ui` 2.4.0-beta lists `0.1.0`, `1.3.0`, `2.2.0`, `2.3.0-beta` and `3.0.0-alpha`, and `@minecraft/server-gametest` 2.2.0-beta lists `0.1.0`, `1.0.0-beta` and `2.0.0-alpha`. The `0.1.0` and `-alpha` versions have no metadata.
- An allowed module BDS does not know gets `Plugin [<name>] - module [<name> - <version>] depends on unknown module [<module> - <version>].` between the same two lines.
- Without the experiment, every beta, shipped or not and of any module, gets the experiment message, with the word `beta` written as the shipped version: `Plugin [probe word - 1.0.0] - requesting dependency on beta APIs [@minecraft/server - 2.11.0-beta], but the Beta APIs experiment is not enabled.` `3.0.0-alpha` loads without the experiment and has 586 exports.
- A GameTest simulated player's `chat` raises `world.beforeEvents.chatSend` inside the call, with the player as `sender` and `targets` undefined. A cancel stops the line, and `world.afterEvents.chatSend` gets only the other line, in the flush. The test needs a structure file under `structures/<namespace>/<name>.mcstructure` even with `structureLocation`.
- `system.beforeEvents.watchdogTerminate` comes after the `hang detected` or `Stack overflow detected` line, with `terminateReason` `Hang` or `StackOverflow`. When a script cancels it, nothing more is logged and the server keeps running.

### Module versions and game versions

The Microsoft Learn table (`docs:Documents/scripting/versioning.md`, `ms.date` 01/29/2025) maps `@minecraft/server` 1.0.0 to 1.19.70, 1.1.0 to 1.19.80, 1.2.0 to 1.20.0, 1.3.0 to 1.20.10, 1.4.0 to 1.20.20, 1.5.0 to 1.20.30, 1.6.0 to 1.20.40, 1.7.0 to 1.20.50, 1.8.0 to 1.20.60, 1.9.0 to 1.20.70, 1.10.0 to 1.20.80, 1.11.0 to 1.21.0, 1.13.0 to 1.21.20, 1.14.0 to 1.21.30, 1.15.0 to 1.21.40, 1.16.0 to 1.21.50 and 1.17.0 to 1.21.60. It has no 1.12.0 row and stops at 1.17.0. The same page says 2.0.0-beta started with the 1.21.70 previews. `docs:ScriptAPI/minecraft/server/minecraft-server.md` calls 2.11.0 "the latest as of version 1.26.70-beta.24", while the pinned 1.26.50.4 metadata still has 2.11.0 as beta and BDS 1.26.51.1 serves 2.10.0. Nothing published maps 1.18.0 to 2.10.0 to a game version. (Read.)

### Which modules a world may use

BDS ships `config/default/permissions.json` with `allowed_modules` set to `@minecraft/server-gametest`, `@minecraft/server`, `@minecraft/server-ui`, `@minecraft/server-admin`, `@minecraft/server-editor` and `@minecraft/debug-utilities`. `@minecraft/server-net` is not in it, so it needs a per-module `permissions.json` (section 6). The Microsoft Learn page lists the same set without `debug-utilities` (`docs:Documents/BedrockServer/scripting.md`). A module outside the list fails with `requesting dependency on module [...] but it is not configured to use it.`, and the binary also has `Import failed, can not load restricted module '%s' from '%s'.` (Read and run.)

## 3. What the metadata encodes for a generator

The plan generates the API's shape from these files ([ADR 0022](../adr/0022-the-script-api-surface-is-generated.md)), so this section lists what is in them, from `server-bindings_2.10.0.json`. (Read.)

A module has `classes`, `interfaces`, `enums`, `errors`, `objects` (`world` and `system`), `constants`, `functions`, `type_aliases`, `dependencies` and `peer_dependencies`. A class has `base_types`, `functions`, `properties` and `constants`. A function has `arguments`, `return_type`, `is_constructor`, `is_static` and `call_privilege`. A property has `type`, `is_read_only`, `is_static`, `is_baked`, `get_privilege` and, when writable, `set_privilege`.

Every type is an object with a `name`, `is_bind_type` (a class or interface of the API) and `is_errorable`. Compound types name themselves `optional` (with `optional_type`), `variant` (`variant_types`), `array` (`element_type`), `map` (`key_type`, `value_type`), `closure` (`closure_type` with `argument_types`, `return_type` and its own `call_privilege`), `promise` (`promise_type`) and `generator` (`generator_type`, `next_type`, `yield_type`). A type from another module carries `from_module` with the module's name, UUID and version.

Validation lives in two places:

- Numeric types carry `valid_range` with `min` and `max`. It is not always meaningful: the `double` and `float` members of the dynamic property variant carry the int32 range, `-2147483648` to `2147483647`, which BDS does not enforce (a `1e300` stored fine, section 8).
- Arguments carry `details`, which is `null` or an object with `default_value`, `min_value` and `max_value`. 2.10.0 has 19 arguments with a bound, for example `Container.getItem`'s `slot` with `min_value: 0` and `Block.getItemStack`'s `amount` with `default_value: 1`, `min_value: 1` and `max_value: 255`. `default_value` is sometimes the string `"null"`.

Errors are listed on a return type as `error_types`, each a bound type that may come from `@minecraft/common` (`ArgumentOutOfBoundsError`, `EngineError`, `PropertyOutOfBoundsError`, ...). Error classes are entries of `errors` with their own `properties`, for example `BookError.reason`. BDS's actual messages are not in the metadata. Two observed ones: `ArgumentOutOfBoundsError: Unsupported or out of bounds value passed to function argument [0]: String length for dynamic property 'jsp:longstr', Value: 40000, Argument max: 32767`, and `TypeError: Native variant type conversion failed.` for a value no variant member accepts. (Run.)

Privilege is a list of names: `default`, `restricted_execution` and `early_execution`. The binary's internal names are `Scripting::Privilege::Default`, `RestrictedExecAllowed` and `EarlyExecAllowed`. A member tagged `restricted_execution` may be used in restricted execution as well as normal execution, and one tagged only `default` may not. Counts in 2.10.0:

| What | `default` | `restricted_execution` | `early_execution` | both restricted and early |
| --- | ---: | ---: | ---: | ---: |
| Methods (`call_privilege`) | 197 | 287 | 158 | 13 |
| Read-only properties (`get_privilege`) | | 586 | | 89 |
| Writable properties, get / set | | 87 restricted / default, 39 restricted / restricted | | |
| Callback types (`closure_type.call_privilege`) | 127 | 30 | 2 | |

The 30 restricted callbacks are the before-event signals' `subscribe` and `unsubscribe` (`EffectAddBeforeEventSignal`, `EntityHurtBeforeEventSignal`, ...). The 2 early ones are `StartupBeforeEventSignal`'s. `CustomCommandRegistry.registerCommand`'s callback has no `call_privilege`, so a generator needs one hand-written override there: `docs:Documents/scripting/execution-privilege.md` says "Both `before` event and custom command callback closures are run in restricted execution". (Read.)

Smaller items a generator meets:

- 12 members carry `is_script_generated: true` and `raw_script_text`, a TypeScript signature such as `getComponent<T extends string>(componentId: T): BlockComponentReturnType<T> | undefined;`, with `generic_function_types`. These are generic helpers whose types the metadata cannot express any other way.
- `type_aliases` of `alias_type: "type_map"` map component ids to classes, for example `minecraft:inventory` to `BlockInventoryComponent` in `BlockComponentTypeMap`.
- `constants` hold literal values: `TicksPerDay` 24000, `TicksPerSecond` 20, `MoonPhaseCount` 8, `HudElementsCount` 13, `HudVisibilityCount` 2.
- 90 properties have `is_baked: true`, for example `Block.x`, `BiomeType.id` and `World.seed`. The name suggests a value fixed when the object is created. The metadata does not define it.

## 4. Native module dependencies and `optional`

The manifest schema has a `NativeModuleDependency` with `module_name`, `version` (a relaxed semver or one of `alpha`, `beta`, `internal`) and `optional`, a boolean that defaults to false (`metadata/json_schemas/client_server/packaging/3.0.0/NativeModuleDependency.json`). Only a 3.0.0 schema is published. (Read.)

Two strings in the binary concern optional modules: `Static import failed, optional module '%s' must be imported dynamically, use import() instead.` and `Plugin [{}] - module [{}] depends on unknown module [{}].` (Read.)

Four packs tested what they mean on BDS 1.26.51.1, each with a `@minecraft/server` 2.0.0 dependency (run):

| Pack | `allowed_modules` | Result |
| --- | --- | --- |
| `@jsprismarine/server` optional, `import()` inside the script; manifest format 2, then format 3 | shipped list | Not loaded: `Plugin [jsp probe - 1.0.0] - requesting dependency on module [@jsprismarine/server] but it is not configured to use it.` No line of the script ran. |
| The same, required, plain `import` | shipped list | Not loaded, same message |
| `@jsprismarine/server` optional, static `import` | shipped list | Not loaded, same message |
| All three again | shipped list plus `@jsprismarine/server` | Not loaded: `failed to create context.`, `module [jsp probe - 1.0.0] depends on unknown module [@jsprismarine/server - 1.0.0].`, `run failed, no runtime or context available.` |
| `@minecraft/server-ui` 2.0.0 optional, `import()` | shipped list | Loaded; the import resolved with 26 exports |
| `@minecraft/server-ui` 2.0.0 optional, static `import` | shipped list | Loaded; the static import worked, with 26 exports |
| No dependency on the module; `import('@jsprismarine/server')` | shipped list | Loaded; the promise rejected with `Module [@jsprismarine/server] is unrecognized. If this is a Native module, did you remember to add it to your manifest.json?` |
| No dependency; `import('@minecraft/server-ui')` | shipped list | Loaded; rejected with the same message for `@minecraft/server-ui` |

So `optional` lets a pack tolerate the absence of a module BDS knows of, for example a module a client host does not provide, which is presumably where the static import message applies. It does not let a pack mention a module BDS has never heard of. A failed pack fails silently to players: the world loads, the pack's other content loads, and only the content log shows the error.

For `@jsprismarine/server` to work in a pack that also runs on BDS, the pack has to leave it out of `manifest.json` and import it with `import()` inside `try` or `.catch()`. On BDS the import rejects with the message above. On JSP the host can resolve it, which departs from BDS's rule that a native module must be declared. Because BDS refuses undeclared imports of its own modules too, a JSP host that resolves an undeclared `@jsprismarine/server` makes the only difference a pack can observe that one module name.

`packages/packs/src/manifest.ts` currently skips native module dependencies ("Native module dependencies ({module_name, version}) matter to a client, not to this loader; only pack dependencies are kept.") and keeps only `type`, `uuid` and `version` of each module, not `entry` or `language`. `packages/minecraft/src/BehaviorPack.ts` has a `scripting: boolean` flag for the resource pack stack. The pack loader the plan describes needs all three. (Read.)

## 5. Timing and lifecycle

### The flush loop

`docs:Documents/scripting/v2-overview.md` (`ms.date` 07/11/2025) describes the end of a tick (read):

> - Resolve V1 promises once at the end of the tick
> - Flush until no more work needs to be done
>   - Resolve V2 promises
>   - Run system tasks (V1 and V2)
>     - After each task that executes, resolve v2 promises
>   - Run after events (V1 and V2)
>     - After each event type that executes, resolve v2 promises

It also says "promises are resolved once in early execution to allow for asynchronous imports to resolve before early execution is finished." `docs:Documents/scripting/system-run-guide.md` says `system.run` "cannot call itself infinitely within a single tick, which would trigger a watchdog shutdown event" and that `runInterval` with `0` ticks behaves like `1`. (Read.)

### The order BDS produced

One version 2 pack (2.0.0) logged a sequence number and `system.currentTick` from each callback (run):

1. Module top level, tick 0, during world creation.
2. A promise job queued at top level.
3. The dynamic imports queued at top level settled.
4. `system.beforeEvents.startup`, tick 0. About 3 seconds of world loading followed.
5. A promise job queued inside `startup`. It ran after the world loaded, not during early execution.
6. `system.run` queued at top level, then `runTimeout(…, 0)` from top level, then `system.run` queued in `startup`, all at tick 0.
7. `world.afterEvents.worldLoad`, tick 0.
8. A promise job queued in `worldLoad`, then a `system.run` queued in `worldLoad`, both still at tick 0.
9. `runTimeout(…, 1)` from top level, at tick 1.

A `/scriptevent` issued by `dimension.runCommand` inside a `runTimeout` callback was delivered as `system.afterEvents.scriptEventReceive` in the same tick, after that callback returned, and a promise job and a `system.run` queued in the after-event both ran in the same tick too. The same event from the server console arrived 16 ms later in a single tick. (Run.)

### Version 1 and version 2

The documented startup flow is: version 2 scripts load and run in early execution, their promises resolve, they receive `system.beforeEvents.startup`; the world finishes loading; version 1 scripts load and run and receive `world.beforeEvents.worldInitialize`; the first tick runs; and at its end all scripts receive `world.afterEvents.worldLoad`, which version 1 calls `worldInitialize` (`docs:Documents/scripting/v2-overview.md`). (Read.)

A 1.0.0 pack beside the 2.0.0 pack matched that. Its top level ran 2 seconds after the version 2 pack's, at "Server started", and could call `world.getDimension('overworld')` there. It then received `world.beforeEvents.worldInitialize`, its `system.run` ran, the version 2 pack received `worldLoad`, and the 1.0.0 pack received `world.afterEvents.worldInitialize`, all at tick 0. (Run.)

### Early and restricted execution

At early execution, from a version 2 pack's top level and from `startup`, `world.getDimension` threw `ReferenceError: Native function [World::getDimension] cannot be used in early execution.` and `world.setDynamicProperty` threw the same for `World::setDynamicProperty`. Subscribing to events worked. (Run.)

`docs:Documents/scripting/execution-privilege.md` (`ms.date` 12/05/2025) says "Before events use restricted execution, which prevents modification of world state", gives `e.player.setGameMode(GameMode.Creative); // this throws an error` in a before-event, and says the first load, `startup` callbacks and custom component registration use early execution, while "Coroutines and `after` events" run with the default privilege. It names no error class or message for restricted execution. The pages say "This function can't be called in restricted-execution mode." on each member. (Read.)

A custom command run from the BDS console called `world.setDynamicProperty` in its callback without error. That is consistent with restricted execution, because `setDynamicProperty` is tagged `restricted_execution`. This run did not try a method tagged only `default` in a restricted callback, so the restricted error text was not captured. A `system.run` queued in the callback ran in the same tick. (Run.)

### `/reload`

`/reload` logged `Function and script files have been reloaded.` and reran each pack's top level, its `startup` subscription and its `worldLoad` subscription, at the current tick (495 in one run). `system.beforeEvents.shutdown` fired first. The world's dynamic properties survived. `/help reload` describes it as "Reloads all function and script files from all behavior packs, or optionally reloads the world and all resource and behavior packs", and Microsoft Learn's command reference says `/reload all` "causes players to quit the world and rejoin". (Read and run.)

## 6. Configuration

### `config/`

BDS keeps script configuration in `config/` beside the executable (`docs:Documents/BedrockServer/scripting.md`, `ms.date` 06/04/2025):

- `config/default/permissions.json` holds `allowed_modules` for every pack.
- A folder named after a script module's UUID, `config/<module uuid>/`, holds that module's `permissions.json`. The UUID is the one on the `type: "script"` entry of `modules`, not the pack header's.
- `variables.json` goes in `default` or a module folder and is read with `variables.get(name)` from `@minecraft/server-admin`.
- `secrets.json` goes in the same places. `secrets.get(name)` returns a `SecretString`, "a placeholder... not made available to the script environment", which some APIs, such as `HttpHeader` in `@minecraft/server-net`, resolve at run time.

The page gives no precedence or merge rule between `default` and a module folder. `@minecraft/server-admin` is 1.0.0-beta only, so `variables` and `secrets` need the Beta APIs experiment, and this note did not run them. The binary contains `permissions.json`, `variables.json`, `secrets.json` and `allowed_modules`. (Read.)

### `server.properties`

The keys BDS 1.26.51.1 ships, with their comments abridged (read):

| Key | Shipped value or default | Comment in the file |
| --- | --- | --- |
| `allow-outbound-script-debugging` | `false` | Allows `/script debugger connect` and `script-debugger-auto-attach=connect` |
| `allow-inbound-script-debugging` | `false` | Allows `/script debugger listen` and `auto-attach=listen` |
| `force-inbound-debug-port` | commented, 19144 | Locks the listen port |
| `script-debugger-listen-address` | commented, `127.0.0.1` | Non-loopback addresses require `script-debugger-passcode` |
| `script-debugger-auto-attach` | `disabled` | `disabled`, `connect` or `listen` at level load |
| `script-debugger-auto-attach-connect-address` | commented, `localhost:19144` | |
| `script-debugger-auto-attach-timeout` | commented, 0 | "Amount of time to wait at world load for debugger to attach" |
| `script-debugger-passcode` | commented, empty | "VSCode will prompt user for passcode to connect" |
| `script-watchdog-enable` | true | |
| `script-watchdog-enable-exception-handling` | true | "via the events.beforeWatchdogTerminate event" |
| `script-watchdog-enable-shutdown` | true | "server shutdown in the case of an unhandled watchdog exception" |
| `script-watchdog-hang-exception` | true | "Throws a critical exception when a hang occurs, interrupting script execution" |
| `script-watchdog-hang-threshold` | 10000 | "single tick hangs (default = 10000 ms)" |
| `script-watchdog-spike-threshold` | commented, 100 | "single tick spikes. Warning is disabled if property left unset." |
| `script-watchdog-slow-threshold` | commented, 10 | "slow scripts over multiple ticks. Warning is disabled if property left unset." |
| `script-watchdog-memory-warning` | 100 | Megabytes, 0 disables, max 2000 |
| `script-watchdog-memory-limit` | 250 | "Saves and shuts down the world when the combined script memory usage exceeds the given threshold (in megabytes)", 0 disables, max 2000 |

Only the hang threshold's comment states a unit. The spike and slow warnings print milliseconds (section 7), so they are milliseconds too. The binary also contains `disableWatchdogTimingWarnings`, which `@minecraft/debug-utilities` exposes. (Read and run.)

### Commands

`/help` on BDS 1.26.51.1 printed (run):

```text
- /script debugger close
- /script debugger connect [host: string] [port: int]
- /script debugger listen <port: int>
- /script diagnostics startcapture
- /script diagnostics stopcapture
- /script profiler start
- /script profiler stop
- /scriptevent <messageId: string> <message: message>
- /reload [all: reload_all]
```

`/script debugger listen 19144` with inbound debugging off printed `Inbound connections are disabled`. `/script profiler start` printed `Profiler started`; Microsoft Learn's script performance page says the profiler writes a `.cpuprofile` to the log folder, and its command reference says a `/scriptevent` message "may not exceed 2048 characters". (Read and run.)

## 7. The watchdog

### What BDS does

With `script-watchdog-hang-threshold=1000` and `script-watchdog-enable-shutdown=false`, a callback that spun for 3 seconds of wall clock inside `try` was stopped after one second. The `catch` did not run. BDS logged `[jsp ctrl] InternalError: interrupted at <anonymous> (main.js:46)`, `[Watchdog] 1001 ms hang detected in 'jsp ctrl'` and `[Watchdog] Unhandled critical exception of type 'Hang' in behavior pack 'jsp ctrl'`. The pack's next `runTimeout` still ran 20 ticks later, so with shutdown off the runtime survives a hang. (Run.)

Unbounded recursion inside `try` was caught by the script as `InternalError: stack overflow`, yet BDS logged `[Watchdog] Stack overflow detected in 'jsp ctrl'` and `Unhandled critical exception of type 'StackOverflow'`. With the default `script-watchdog-enable-shutdown=true` it then logged `Watchdog shutting down server`, fired `system.beforeEvents.shutdown` and exited. (Run.)

A 300 ms busy loop with `script-watchdog-spike-threshold=100` produced `[Watchdog] Spike from 'jsp ctrl' (299ms)`. A `runCommand` that took 230 ms produced the same warning. The binary also has `[Watchdog] Spike in job queue from '%s' (%lldms)`, `[Watchdog] Slowdown from '%s' (%lldms average)`, `[Watchdog] Slowdown in job queue from '%s' (%lldms average over allotment)` and `[Watchdog] Out of memory exception in '{}'`. (Read and run.)

`WatchdogTerminateBeforeEvent` has `cancel` ("depending on server configuration settings, cancellation of the termination may not be allowed") and `terminateReason`, which is `Hang` or `StackOverflow`, and its callback runs restricted. It is documented only in the beta reference (`docs:ScriptAPI/minecraft/server/WatchdogTerminateBeforeEvent.md`). (Read.)

### What quickjs-ng offers

quickjs-ng counts down `ctx->interrupt_counter` from `JS_INTERRUPT_COUNTER_INIT` (10000) in `js_poll_interrupts`, which the interpreter calls at backward jumps, calls and a few loops in built-ins (`quickjs.c`, v0.18.0, 24 call sites). When the counter reaches zero it calls the handler set by `JS_SetInterruptHandler(rt, cb, opaque)`, whose signature takes a `JSContext *` since v0.18.0 (release notes, "Pass JSContext to JSInterruptHandler (#1802)"). A nonzero return throws an uncatchable `InternalError: interrupted`. (Read.)

The spike counted handler calls against a budget (run):

- A budget of 50 stopped `let i = 0; while (true) { i++ }` at the 51st poll with `InternalError: interrupted`, and the context stayed usable afterwards.
- `try { while (true) {} } catch (e) { caught = true }` was not caught.
- A loop of 2,000,000 iterations used exactly 400 polls in each of two runs, on the main thread and in a worker thread.

One poll is about 10,000 interpreter checks, so a step budget counted in handler calls has a granularity of one poll. A finer budget needs a smaller `JS_INTERRUPT_COUNTER_INIT`, which is a compile-time constant in `quickjs.c`, so a patch.

Memory has `JS_SetMemoryLimit(rt, limit)` per runtime. BDS's memory limit is for "the combined script memory usage" of all packs, which fits one runtime per world. (Read.)

## 8. Dynamic properties

### What the API accepts

The documented types are `boolean | number | string | Vector3 | undefined`, and `undefined` deletes (`docs:ScriptAPI/minecraft/server/World.md`). `world.clearDynamicProperties()` "Clears the set of dynamic properties declared for this behavior pack", so properties belong to a pack. The pages give no size limit. (Read.)

What BDS 1.26.51.1 did (run):

| Value set | Result |
| --- | --- |
| `1.5`, `42`, `1e300`, `true`, `"hello"`, `""`, `"å✓😀"`, `{ x: 1, y: 2.5, z: -3 }` | Stored |
| `-0` | Stored as negative zero (sign bit set on disk) |
| `2 ** 53 + 1` | Stored and read back as `9007199254740992` |
| `NaN`, `Infinity`, `5n`, `{ a: 1 }` | `TypeError: Native variant type conversion failed.` |
| A 32767-character string | Stored |
| A 40000-character string | `ArgumentOutOfBoundsError`, "Argument max: 32767" |
| `{ x: 0.1, y: 1e40, z: 16777217 }` | Threw `TypeError: Infinity value is not supported.`, **and was stored anyway**: on disk as `0.10000000149011612`, `inf`, `16777216` |
| A `Vector3` read back | `{ x: 0.1 }` read back as `0.10000000149011612`, so the in-memory value is already float32 |

`getDynamicPropertyIds()` returned ids in an order that is neither insertion nor alphabetical (`jsp:big`, `jsp:str`, `jsp:int`, `jsp:double`, `jsp:vec`, `jsp:neg0`, `jsp:bool`). (Run.)

`getDynamicPropertyTotalByteCount()` returned 112 for those seven properties, which is the sum of each key's UTF-8 length plus 8 per number, 1 per boolean, the string's length and 12 per vector. In a second world the formula predicted 32850 and BDS reported 32858; the 8 bytes are unexplained. (Run.)

### On disk

The world's properties are in the LevelDB record with key `DynamicProperties`. Its value is little-endian NBT, read here from the log file of a world BDS had just closed (run):

```text
TAG_Compound ""                                   root
  TAG_Compound "0d5e7c0a-0000-4000-8000-000000000004"   the pack header UUID
    TAG_Double "jsp:big"     1e300
    TAG_Byte   "jsp:bool"    1
    TAG_Double "jsp:double"  1.5
    TAG_Double "jsp:int"     42.0
    TAG_Double "jsp:neg0"    -0.0
    TAG_String "jsp:str"     "hello"
    TAG_List   "jsp:vec"     TAG_Float x3: 1.0, 2.5, -3.0
  TAG_End
TAG_End
```

The child compound is named by the pack's `header.uuid`, not by the script module's UUID, and its entries are in byte order of their names. Strings are a little-endian `u16` byte length and plain UTF-8: `"å✓😀"` is `09 00 c3 a5 e2 9c 93 f0 9f 98 80`, with the emoji as four bytes, not as a surrogate pair. Every number is a double, including integers. A boolean is one byte. A `Vector3` is a list of element type 5 (`TAG_Float`) and length 3. That is the format the repository's `packages/nbt` reads and writes in little-endian mode. (Run.)

Entity dynamic properties were not checked. `docs:ScriptAPI/minecraft/server/Entity.md` describes the same API, and "Block entity dynamic properties | 1 KB per block entity" is in [bedrock-addons-and-custom-content.md](bedrock-addons-and-custom-content.md) section 8. [storage-and-chunk-translation.md](storage-and-chunk-translation.md) already lists `DynamicProperties` among the database's keys.

## 9. The debugger

### The protocol

Mojang's VS Code extension is `Mojang/minecraft-debugger`, MIT, release v1.61.0 of 2026-11-10. Its `NOTICES.md` credits "QuickJS Debug Adapter for VS Code" from `koush/vscode-quickjs-debug`. (Read.)

- **Transport.** TCP in either direction. In `listen` mode VS Code is the server and Minecraft connects (`/script debugger connect`); in `connect` mode Minecraft listens (`/script debugger listen`) and VS Code connects and retries (`src/session.ts`). 19144 is the default port.
- **Framing.** Each message is 8 hexadecimal digits and `\n`, then that many bytes of JSON ending in `\n` (`Session.sendDebuggeeMessage`, "length prefix is 8 hex followed by newline = 012345678\n"; `src/message-stream-parser.ts`). koush's `protocol.md` has the same framing.
- **Runtime to extension.** Envelopes of `type` `event`, `response` (`{request_seq, body | error}`) or `debuggee-response` (protocol 7 and later). Events are `StoppedEvent` and `ThreadEvent` (`{reason, thread}`), `PrintEvent` and `NotificationEvent` (`{message, logLevel}`), `ProtocolEvent` (`{version, plugins: [{name, module_uuid}], require_passcode?}`), `StatEvent2`, `ProfilerCapture` and `SchemaEvent` (`src/protocol-events.ts`).
- **Extension to runtime.** `protocol` (`{version, target_module_uuid?, passcode?}`), `request` (`{request: {request_seq, command, args}}`), `breakpoints` (`{path, breakpoints}`), `stopOnException`, `resume`, `minecraftCommand`, `startProfiler`, `stopProfiler`, `debugger-request` and `diagnostics-set-active`. The forwarded Debug Adapter Protocol commands are `stackTrace`, `scopes`, `variables`, `evaluate`, `continue`, `pause`, `next`, `stepIn` and `stepOut`, with VS Code's `args` passed through unchanged. Only `threads` is answered by the extension itself.
- **Versions.** `DEBUGGER_PROTOCOL_VERSION` is 11. The history in `protocol-events.ts` runs from 1 ("initial version") through 2 (`targetModuleUuid`), 3 (plugin list), 4 (passcode), 5 (profiler captures), 6 ("breakpoints as request, MC can reject"), 7 (debugger requests), 8 (flat payloads, "New serialization tech (use Cereal)"), 9 and 10 (diagnostics schemas and tabs) to 11 (per-tab diagnostics activation). The runtime sends `ProtocolEvent` first, and the extension echoes the runtime's version if it is between 2 and 11, so a host can pick any version in that range and stay there.
- **Passcode and target.** With `require_passcode` the extension prompts and sends the passcode in plain text in its `protocol` reply. `targetModuleUuid` picks which plugin to debug and must be in `plugins`; BDS's error for a wrong one is `Debugger connection failed, no plugin found with targetModuleUUID [%s] (see launch.json).`
- **Source maps.** The extension maps them. It translates breakpoint paths to the generated JavaScript files before sending them and maps stack frames and `PrintEvent` locations back (`src/source-maps.ts`, `src/breakpoints.ts`). The runtime only ever sees generated JavaScript paths.

BDS's strings name the same pieces: `request_seq`, `ProtocolEvent`, `StoppedEvent`, `ThreadEvent`, `PrintEvent`, `NotificationEvent`, `StatEvent2`, `ProfilerCapture`, `require_passcode`, `variablesReference`, `frameId`, and the messages `Debugger connection failed, protocol version mismatch.`, `Debugger connection failed, passcode mismatch.` and `Refusing to start script debugger listener on non-loopback address [%s] without a passcode.` (Read.)

### What the engine needs

quickjs-ng v0.18.0 has no debugger interface. `quickjs.h` has no breakpoint, stepping, frame or scope API, and `quickjs.c` says "currently no debugger, so just skip the keyword" for `debugger`. It has `JS_GetScriptOrModuleName(ctx, n_stack_levels)` and the interrupt handler, neither of which can stop at a line. (Read.)

Upstream pull request #1421, "Add Debugging Interface", is open: +620 and -2 lines over 4 files, proposing a bytecode trace handler (`JS_SetOPChangedHandler`), `JS_GetStackDepth`, `JS_GetLocalVariablesAtLevel`, breakpoints and stepping. A maintainer asked for a compile-time switch, another thought it could be done at run time "without significant slowdowns", and the author's benchmark with debug opcodes always emitted measured a geometric mean of 1.245 against upstream's 1.363. The last activity found was a rebase request on 2026-05-18. Discussion #757 reports a port of koush's patch to quickjs-ng in which pausing and stepping worked and breakpoints failed on line numbers. (Read, from the pull request and a search result; the whole thread was not read.)

koush's fork of Bellard's QuickJS (`koush/quickjs`, `fe9aeaa703e3887866f3f32b217a27ee39b91268`, 2021) is the model the protocol came from. It adds `quickjs-debugger.c` (743 lines), `quickjs-debugger.h` (106) and two transports (154 and 130), and changes `quickjs.c` in about 450 lines: per-runtime and per-function debugger state, a per-opcode hook in `JS_CallInternal` that a second dispatch table enables only while a debugger is attached, an exception hook, and functions for the current location, the stack, local and closure variables and evaluation in a frame. (Read.)

A patch set on quickjs-ng v0.18.0 for the protocol above would need, from that inventory:

1. A per-instruction or per-line hook in `JS_CallInternal` that costs nothing without a debugger, as koush's dual dispatch table does.
2. Breakpoints as bytecode offsets resolved from each function's line table, rebuilt lazily when the breakpoint set changes.
3. Frame walking with function name, file, line and column for `stackTrace`.
4. Scope inspection: arguments, locals and closure variables per frame, for `scopes` and `variables`.
5. Evaluation in a chosen frame for `evaluate`.
6. An exception hook for `stopOnException`.
7. Pausing: the hook blocks the world thread while the transport talks to VS Code.

Items 1 to 6 are engine changes, about the size of koush's 450-line `quickjs.c` diff plus the 743-line debugger file, or the 620 lines of #1421 if it lands. Item 7 and the TCP framing belong in the host. Because a paused script blocks its world's tick, the plan's rule that "a paused script pauses its world's tick" ([ADR 0021](../adr/0021-the-script-watchdog-counts-steps.md)) is the behavior a world-thread engine gets without extra work.

## 10. Engines and bindings

### quickjs-ng

Releases: v0.18.0 on 2026-11-01, v0.17.0 on 2026-09-18, v0.16.2 on 2026-08-20, v0.16.1 on 2026-08-04 (`gh api repos/quickjs-ng/quickjs/releases`). (Read.)

GLSA 202608-19, released 2026-08-20, covers `dev-libs/quickjs-ng` before 0.12.0 for CVE-2026-0821, CVE-2026-1144 and CVE-2026-1145, rated high with arbitrary code execution as the worst case, fixed in 0.12.0. v0.18.0 is outside its range. The repository lists further advisories without CVE ids, for example GHSA-v647-xff9-jxf7, GHSA-crgj-9jv8-xfhq, GHSA-rxpx-wj25-jhqq and GHSA-52gx-967m-hxp3, fixed in 0.16.0, and GHSA-r6vf-p8wr-4vg9 (2026-06-04) with no patched version listed. Its `SECURITY.md` at v0.18.0 says "We no longer accept private security reports nor issue CVEs." and puts bytecode hardening out of scope. So security fixes will arrive as ordinary releases and advisories, not as CVEs a scanner can match. (Read.)

### scriptc's copy is not a runtime

scriptc 0.4.14 vendors quickjs-ng v0.15.1, commit `3c8f3d68953955950074c41c6e4d999562ae82a7`, with two `libregexp.c` changes. Its vendor README says: "The QuickJS-ng engine is used only by the compiler's `comptime` evaluator (`native/llvm-codegen/comptime`), which each LLVM helper package builds from this tree. Compiled user programs never link it." (`@scriptc/cli-linux-x64-gnu/dist/lib/runtime-sources/vendor/README.md`). A compiled JSP therefore has no engine to reuse and must link its own quickjs-ng build through the manifest's `libraries`, as `native-network` links libdatachannel ([scriptc-libdatachannel.md](scriptc-libdatachannel.md) section 3). (Read.)

### `node:ffi`

`node:ffi` loads on Node.js 26.13.0 without a flag and prints `ExperimentalWarning: FFI is an experimental feature`. Its documentation says it was "added: v26.1.0", is "Stability: 1 - Experimental", needs `--allow-ffi` under the permission model, and can be turned off with `--no-experimental-ffi` (`doc/api/ffi.md`). [packages/console/README.md](../../packages/console/README.md) says it shipped in 26.4 behind a flag and is on by default from 26.9; the two sources were not reconciled. (Read and run.)

Callbacks from `library.registerCallback(signature, fn)` "must be invoked on the same system thread where they were created", "must not throw exceptions", "must not return promises", and must not unregister themselves while running. Reentrant calls into the same native function from a callback are safe: "the native side copies the arguments out of the buffer before invoking the symbol". If a worker thread is stopped while a callback runs, the native caller receives a zero value. (Read.)

Those rules fit an engine owned by one world thread, and the host dispatch has to catch every JavaScript exception and turn it into a status code before returning to C.

The spike, a 40-line C layer over quickjs-ng v0.18.0 built as a shared library and driven from Node.js (run):

- `__host(1) + __host(2)` called a `registerCallback` function twice from inside `JS_Eval` and returned `30`, so a host call re-enters JavaScript synchronously.
- A host call from engine A evaluated a script in engine B, whose own host call ran at depth 2, and the result came back to A: nested engines on one thread work.
- The step budget, the uncatchable interrupt and the deterministic poll counts are in section 7.
- All of it ran the same on the main thread and inside a `worker_threads` worker, each with its own engines.

### scriptc's FFI

The binding rules for scriptc's own manifests are in [scriptc-libdatachannel.md](scriptc-libdatachannel.md) section 2. Two more points matter here, from the scriptc documentation (`llms.txt`, 2026-11-16; read):

- Callbacks default to `invoke: "script-thread"`, which are synchronous and may return a value. "If a script-thread callback throws, the adapter returns zero (or `void`) to native code and suppresses further script callback execution while the exception is pending. When the outer native function returns, the original exception resumes".
- "JavaScript packages that load `node:ffi` through `createRequire` can run unchanged with a format 7 manifest." Each function gets a `library` string matching the `dlopen` name, and `registerCallback` signatures go in a root `callbacks` array with a `capacity` of 1 to 256 (default 16). "These callbacks run on the registering script thread; calling one from a foreign thread is unsupported." Pointer arguments accept `ArrayBuffer`s, views and NUL-free strings.

So one TypeScript binding written against `node:ffi` could compile under scriptc with a manifest that lists the same symbols, instead of a second binding in scriptc's direct manifest form. The callback capacity is fixed at build time, so the number of host-dispatch callbacks registered at once must be bounded, for example one per engine with a known engine limit.

The earlier spike's scriptc executable, built with scriptc 0.4.11 over quickjs-ng 0.15.1, still runs: it prints `83` for two synchronous host calls, the host log, and `ERR InternalError: interrupted` for `while (true)` under a budget. Rebuilding it, or building the `node:ffi` variant above, failed in this session with `error SC3004: TypeScript server startup: Permission denied` from both installs, so the `node:ffi`-under-scriptc route is read, not run. (Run and read.)

scriptc translates WebAssembly only for modules whose bytes the build can see, rejects bytes produced at run time with a `CompileError`, and supports WebAssembly 2.0 without SIMD, threads, exceptions, tail calls, GC or memory64 (`llms.txt`, "WebAssembly modules"). (Read.)

### Other engines

| Option | Engine | Limits and stopping | Fit (read) |
| --- | --- | --- | --- |
| quickjs-ng through a C layer | quickjs-ng, native | `JS_SetMemoryLimit`, `JS_SetMaxStackSize`, interrupt handler on a poll counter | Runs synchronously on the world thread under both FFIs; we own the build and its fixes |
| `quickjs-emscripten` 0.32.0 (MIT, 2026-02-16) | Bellard QuickJS by default; quickjs-ng variants such as `@jitl/quickjs-ng-wasmfile-release-sync` | `runtime.setMemoryLimit`, `setMaxStackSize`, `setInterruptHandler`; the README's example stops "after 1024 calls to the interrupt handler" | WebAssembly; under scriptc only if every variant's bytes are visible at build time, and instances are never freed; its README says it "may switch to using quickjs-ng by default in the future" |
| `isolated-vm` 7.0.2 (ISC, 2026-10-30) | V8 isolates | `memoryLimit` is "more of a guideline instead of a strict limit", `timeout` in milliseconds of wall clock | A Node-API addon (`gypfile: true`), which scriptc cannot load; "currently in *maintenance mode*"; V8's language level is above BDS's |
| GraalJS | GraalVM | | What AddonBridge uses, on the JVM; not an option for Node.js |

## 11. Prior art

- **Wyze3306/AddonBridge** is a PowerNukkitX plugin that runs `@minecraft/server` scripts: "Run Minecraft Bedrock addons (`.mcaddon` / `.mcpack`) on a PowerNukkitX server… the `@minecraft/server` scripts, actually executed by an embedded JavaScript engine." It embeds GraalJS ("full ES2023 including ES modules… Scripts run on the main thread, like on Bedrock") and says "The API is not exhaustive. When a script reaches an unimplemented method, AddonBridge names it in the console on startup and through `/addons scripts`". It covers `world`, `system`, `Dimension`, `Entity`, `Player`, `Block`, `ItemStack`, about 15 components, about 16 events with cancelable before-events, custom block and item components and `@minecraft/server-ui` forms. It has no license file, 6 stars, and its last commit is `53a7376` of 2026-09-02. Its approach to unimplemented members, naming them at startup, is close to [ADR 0022](../adr/0022-the-script-api-surface-is-generated.md)'s. (Read.)
- **EndstoneMC/scripting-nodejs** is an Endstone plugin that "replaces Bedrock Dedicated Server's built-in script engine with Node.js. The behaviour packs you already run keep their `@minecraft/server` imports". It keeps Mojang's bindings and swaps only the engine, is closed source ("The plugin itself is closed source"; the public repository holds releases and docs, Apache-2.0), and is tied to BDS version ranges. (Read.)
- **EndstoneMC/endstone** loads into BDS, so scripts run on Mojang's implementation. Its issues about scripting concern interaction with it (#268, canceled events; #219, a crash on `reload_data()`; #194, custom commands). No roadmap entry to reimplement the Script API was found. (Read.)
- LiteLDev/LegacyScriptEngine runs LLSE's own API on LeviLamina, not `@minecraft/server`. PowerNukkitX itself, AllayMC/Allay, PocketMine-MP, dragonfly and Nukkit have nothing on the Script API. (Read.)
- Test mocks reimplement parts of the API's shape without behavior: `ForestOfLight/minecraft-vitest-mocks` (MIT, "not designed to be exhaustive"), `lpsmods/minecraft-mock` (no license), and hand-written module mocks in `LushWay/Scripts` (1,187 lines) and `SjnExe/AddonExe` (266 lines). (Read.)

## 12. Corpus candidates

Open-source scripted behavior packs with a permissive license and a `manifest.json` that declares `@minecraft/server`. Nothing here is pinned yet. Versions are as each manifest states them, sizes are lines of non-test, non-vendored JavaScript or TypeScript, and the commit is the one sized on 2026-11-16. (Read, from shallow clones and `gh api`.)

| Repository | License | Stars | `@minecraft/server`; other modules | Beta | Size | Commit | What it is |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| microsoft/minecraft-scripting-samples | MIT | 241 | 2.0.0 to 2.1.0; a gallery on 2.2.0-beta | mixed | ~12.1k lines TS across samples | `73a171fc8b` | Mojang's samples: how-to gallery, custom commands, starters |
| ForestOfLight/Canopy | MIT | 145 | 2.12.0-beta; server-ui 2.4.0-beta, debug-utilities, server-gametest | yes | ~23.4k lines JS | `36089a5313` | Technical survival commands, rules and HUD |
| ForestOfLight/Construct | MIT | 48 | 2.12.0-beta; server-ui 2.4.0-beta, debug-utilities | yes | ~8.4k lines plus ~74k of block-model data | `b720880d52` | Building helper |
| ForestOfLight/Understudy | MIT | 38 | 2.9.0-beta; server-gametest | yes | ~4k lines | `406f3c8680` | Simulated players through gametest |
| ForestOfLight/Statistic-Display | MIT | 14 | 2.8.0 | no | ~2.9k lines JS | `cd4c89e86f` | Statistics on a scoreboard |
| LushWay/Scripts | MIT | 7 | 2.11.0-beta; server-ui 2.3.0-beta, server-net, server-admin, server-gametest, debug-utilities | yes | ~50k lines TS | `ecc3e49bcf` | A whole server in scripts: lobby, claims, quests |
| CrzxaExe/UnRealm-Bedrock | MIT | 1 | 2.7.0-beta; server-ui 2.1.0-beta, server-gametest | yes | ~14.3k lines TS | `4565698900` | RPG overhaul |
| xigma0512/XBlockFire | Apache-2.0 | 0 | 2.8.0-beta; server-ui 2.1.0-beta | yes | ~6.2k lines TS | `4be06ec516` | Shooter minigame |
| SolightzZ/Protection-Area-Addon | MIT | 1 | 1.18.0-beta; server-ui 1.4.0-beta, server-gametest | yes | ~3.3k lines JS | `21f6803776` | Land claims with forms |
| gamelist1990/ChestLockAddon | MIT | 2 | 1.17.0-beta; server-ui 1.4.0-beta, server-admin; one pack on 2.0.0-alpha | yes | ~26.6k lines TS | `73f997a816` | Chest locks and admin tools |
| AresgettaGamer/Frame-and-Pane | MIT | 0 | 2.8.0 | no | ~1.1k lines JS | `2d4ba3b1f0` | Openable window frames through custom components |
| tepi-games/aerell-fasting | MIT | 1 | 2.3.0; server-ui 2.0.0 | no | ~580 lines TS | `d83e5c9090` | Fasting mechanic |
| woozystudio/ItemEditor | MIT | 0 | 2.1.0; server-ui 2.0.0 | no | ~500 lines TS | `e17b8bfcb4` | Item editor form |
| mcbe-mods/ChopPop | MIT | 3 | 1.18.0 | no | ~440 lines TS | `3872d0f0d2` | Tree felling |

Left out: Visual1mpact/Paradox_AntiCheat is GPL-3.0 (2.12.0-beta, about 28k lines). SjnExe/AddonExe (MIT, about 80k lines) generates its manifest at build time, so it would need a build step before counting. i-bexx/inside-the-cage-addon has no clear license.

Eight of the 14 depend on a beta `@minecraft/server`, and two of them (Canopy and Construct) depend on 2.12.0-beta, which is newer than anything the pinned BDS has. A corpus for the stable milestone has five stable packs plus Mojang's stable samples, all of them small. The beta packs measure what the beta slice would unlock.

## 13. Notes for the plan

These are facts from this research that touch decisions already made, stated here so the plan can cite them.

- The parity family's id must match `FAMILY_ID_PATTERN`, `/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/` (`packages/parity/src/families.ts`), so a bare `scripting` is not a valid id; it needs a domain, such as `scripting.lifecycle`. (Read.)
- [ADR 0021](../adr/0021-the-script-watchdog-counts-steps.md)'s reading that the hang, spike and slow thresholds are milliseconds matches the shipped comment for the hang threshold and the milliseconds BDS prints for spikes. (Read and run.)
- `packages/bedrock-data/utils/bedrock-dump/pack.ts` already writes a script pack and enables it through `world_behavior_packs.json`, and `server.ts` stages BDS and sets `content-log-console-output-enabled`, which is how a pack's `console.warn` reaches stdout. The experiments here did the same by hand in a scratch copy. A staged BDS needs `allow-list=false` when `online-mode=false`, or it stops with `Using an allowlist without online authentication can be dangerous and is not allowed.`, which `COMMON_PROPERTIES` already sets. (Read and run.)
- `packages/native-network/src/ffi.ts` binds `node:ffi` and `bun:ffi` with the comment "nothing calls back". The script host is the first binding in the repository that needs FFI callbacks. (Read.)

## Open questions

- What do the `-wrapper` modules named in the `server_*.json` stubs do, and does a wrapper change behavior between the versions it serves? The binary shows no wrapper source.
- Does BDS ever serve an older minor than the newest of a major, for example to a pack whose `min_engine_version` is old? Only `min_engine_version` 1.21.0 was tried.
- What message does BDS give for a `default`-only method called in a before-event or a custom command callback? The run did not capture it.
- Is BDS's `Date` in the host's time zone? The host ran in UTC.
- Are entity and block dynamic properties stored with the same NBT shape, inside the entity's or block entity's own NBT?
- What makes up the 8 bytes by which `getDynamicPropertyTotalByteCount()` exceeded the key-plus-value sum in the second world?
- Does the 32767 string limit count UTF-16 code units or UTF-8 bytes? Only ASCII hit the limit.
- How does BDS merge `variables.json` and `permissions.json` between `config/default` and a module's folder? `server-admin` is beta, and the experiment was not enabled in these runs.
- What has happened to quickjs-ng pull request #1421 since May 2026, and do CVE-2026-1144 and CVE-2026-1145 touch code still present in v0.18.0?
- Does the `node:ffi` binding compile under scriptc's format 7 static bindings with a callback that takes a pointer and returns an `i32`? The build tool failed to start in this session.
- Which Bellard release does BDS's QuickJS descend from, and does Mojang patch the engine beyond the debugger and the removed `eval`?
- Which game version did each of `@minecraft/server` 1.18.0 to 2.10.0 ship in? The published table stops at 1.17.0.

## Reproduction

Paths: `$C` is the shared cache, `node_modules/.cache/jsprismarine` in the primary checkout; `$M` is `$C/bedrock-samples/v1.26.50.4/unpacked/bedrock-samples-46ba6ea985fb5a92d79a9419198f10dda14c199d/metadata/script_modules/@minecraft`; `$S` is a scratch directory.

Versions and strings:

```sh
cat packages/bedrock-data/sources.json            # bds.versions.2193.serverVersion, bedrockSamples.tag
strings -n 6 "$C/bds/v2193/unpacked/bedrock_server" > "$S/bds-strings.txt"
grep -E 'QuickJS memory usage|Scripting::QuickJS::|unknown module|optional module|not configured to use it' "$S/bds-strings.txt"
grep -n 'groupBy' "$S/bds-strings.txt"            # then read the atom table around the class names
grep -n 'memory usage' quickjs-ng/quickjs.c       # "QuickJS-ng memory usage -- %s version"
```

Metadata counts, with Python reading each `server-bindings_<version>.json` and summing `len(classes)`, the `functions` and `properties` of every class, `len(interfaces)`, `len(enums)`, `len(errors)`, and runtime exports as classes plus enums plus errors plus `objects` plus `constants` plus `functions`. The privilege table counts the sorted `name`s of each `call_privilege`, `get_privilege` and `set_privilege` list, and each `closure_type.call_privilege` found by walking every argument type.

BDS runs. Copy the archive to a scratch directory, set `allow-list=false`, `online-mode=false`, `level-type=FLAT`, `transport=raknet`, `content-log-console-output-enabled=true`, `server-port=29132`, `server-portv6=29133`, and for the watchdog runs `script-watchdog-spike-threshold=100`, `script-watchdog-hang-threshold=1000` and `script-watchdog-enable-shutdown=false`. Put each pack in `development_behavior_packs/<name>/` and list its header UUID in `worlds/probe/world_behavior_packs.json`. A pack is a manifest such as:

```json
{ "format_version": 2,
  "header": { "name": "jsp probe", "description": "probe", "uuid": "0d5e7c0a-0000-4000-8000-000000000001",
              "version": [1, 0, 0], "min_engine_version": [1, 21, 0] },
  "modules": [ { "type": "script", "language": "javascript", "uuid": "0d5e7c0a-0000-4000-8000-0000000000a1",
                 "version": [1, 0, 0], "entry": "scripts/main.js" } ],
  "dependencies": [ { "module_name": "@minecraft/server", "version": "2.0.0" },
                    { "module_name": "@jsprismarine/server", "version": "1.0.0", "optional": true } ] }
```

and a `scripts/main.js` that logs with `console.warn`. The probe checks `typeof globalThis[name]` for each name in section 1, `Object.getOwnPropertyNames(globalThis)`, `Object.keys(await import('@minecraft/server')).length`, the order of callbacks in section 5 with `system.currentTick`, the dynamic property values in section 8, a 3-second busy loop and unbounded recursion. The server is driven over a FIFO on stdin:

```sh
mkfifo in.fifo
LD_LIBRARY_PATH=. ./bedrock_server < in.fifo > run.log 2>&1 &
exec 3>in.fifo
# after "Server started": one command every 12 seconds
for c in "jsp:probe" "scriptevent jsp:console hi" "reload" "script debugger listen 19144" \
         "script profiler start" "help script" "help scriptevent" "help reload" stop; do echo "$c" >&3; sleep 12; done
```

The `allowed_modules` run appends `@jsprismarine/server` to `config/default/permissions.json`; the format 3 run writes `"format_version": 3` with string versions (`"version": "1.0.0"`, `"min_engine_version": "1.21.0"`).

The `DynamicProperties` record was read straight from `worlds/probe/db/000003.log` after `stop`: find the key bytes, read the varint value length after them, and parse the value as little-endian NBT (a tag byte, a `u16` name length and name, then the payload).

The `node:ffi` spike. The C layer creates a runtime and context per engine, installs `__host(op, arg)` as a C function that calls one registered callback with the engine id, sets an interrupt handler that counts polls and fails once a budget is spent, and evaluates source into a caller buffer:

```sh
Q=quickjs-d7215b0ad3fc2c562e8317fd9bca058fd4863804   # from codeload.github.com/quickjs-ng/quickjs/tar.gz/<commit>
gcc -O2 -fPIC -shared -I"$Q" -o libjspqjs.so shim.c "$Q"/quickjs.c "$Q"/libregexp.c "$Q"/libunicode.c "$Q"/dtoa.c -lm -lpthread
node spike.mjs ./libjspqjs.so      # sum, nested engines, budget, polls, recursion; main thread and a worker
node globals.mjs ./libjspqjs.so    # the quickjs-ng column of the table in section 1
```

`spike.mjs` declares `jsp_new(pointer): int32`, `jsp_set_budget(int32, double): void`, `jsp_polls(int32): double` and `jsp_eval(int32, string, buffer, int32): int32` with `DynamicLibrary.getFunctions`, and the callback as `registerCallback({ arguments: ['int32', 'int32', 'pointer'], return: 'int32' }, fn)`.

Debugger, prior art and corpus sources:

```sh
git clone --depth 1 https://github.com/Mojang/minecraft-debugger       # src/session.ts, src/protocol-events.ts, NOTICES.md
git clone --depth 1 https://github.com/koush/quickjs                    # quickjs-debugger.c, quickjs.c
git clone --depth 1 --branch v0.18.0 https://github.com/quickjs-ng/quickjs
gh api repos/quickjs-ng/quickjs/releases --jq '.[0:4][] | [.tag_name, .published_at] | @tsv'
gh api repos/quickjs-ng/quickjs/pulls/1421
curl -sL https://security.gentoo.org/glsa/202608-19
curl -sL https://raw.githubusercontent.com/nodejs/node/v26.13.0/doc/api/ffi.md
npm view quickjs-emscripten version license; npm view isolated-vm version license gypfile
gh repo view Wyze3306/AddonBridge; gh repo view EndstoneMC/scripting-nodejs-release
# corpus: gh api repos/<owner>/<repo>/license, git clone --depth 1, then read manifest.json and count lines
```
