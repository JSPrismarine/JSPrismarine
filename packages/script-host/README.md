# @jsprismarine/script-host

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/script-host)](https://www.npmjs.com/package/@jsprismarine/script-host)

The engine JSPrismarine runs Bedrock behavior pack scripts in. It holds one native library, Fabrice
Bellard's [QuickJS](https://bellard.org/quickjs/) with a small C layer of our own, and the
TypeScript that binds it through `node:ffi`. Each world will own one engine and run it on its own
thread, as [ADR 0020](../../docs/adr/0020-scripts-run-in-quickjs-on-the-world-thread.md) decides.
The plan that builds the rest of the script host on top of this package is
[script-api-host.md](../../docs/plans/script-api-host.md).

This release has the engine, with evaluation, host calls, limits and the sandbox; the shape of the
Script API, every module, class and member of `@minecraft/server` and the other modules, stable and
beta, generated from Mojang's metadata; and the runtime that loads a world's behavior packs and runs
their scripts, with the first members that have behavior.

## Running a script

```ts
import { ScriptHostLibrary } from '@jsprismarine/script-host';

const library = ScriptHostLibrary.load();
const engine = library.createEngine({ memoryLimit: 64 * 1024 * 1024 });

try {
    engine.defineGlobalFunction('add', (a, b) => Number(a) + Number(b));
    engine.evaluate('add(1, 2)'); // 3

    engine.setBudget({ perCallback: 1000 });
    engine.evaluate('while (true) {}'); // throws ScriptTerminatedError
} finally {
    engine.destroy();
}
```

An engine runs only on the thread that created it, and every call into it is synchronous. Engines
on different threads share nothing, so two worlds on two worker threads each run their own.

Primitive values cross between TypeScript and a script as copies. Objects and functions stay in
the engine, and the host holds a `ScriptHandle` to each one it receives. A handle that a call
returns belongs to the caller, who frees it with `engine.free`. A handle passed to a host function
lasts until that function returns; `engine.duplicate` makes one that outlives it.

## How it is called

The library has a flat C interface, `native/include/jsp_script_host.h`, with an ABI version the
binding checks when it loads. It passes only integers, doubles and pointers, so the same interface
fits `node:ffi` today and scriptc's FFI later
([ADR 0023](../../docs/adr/0023-quickjs-through-one-c-layer-and-ffi.md)).

Values cross as bytes in a transfer buffer, a `SharedArrayBuffer` that the engine writes and reads
in place. A host call from a script is one crossing: the engine writes the arguments into the
buffer and calls the engine's one `node:ffi` callback with the host function's id. The callback
runs the TypeScript function on the same thread and writes the result into the same buffer. A host
function may call back into the script it serves. The engine counts host calls and the bytes each
way, which `engine.stats()` reports.

Module imports go through the same callback: `createEngine({ loadModule })` returns a module's
source for its name, or an object whose own enumerable properties become the module's exports.

## Contexts

An engine can hold several contexts, each with a global object and built-ins of its own, so packs
in one world never share a `globalThis` while they share one runtime, one step budget and one
memory limit. `engine.createContext()` makes one, and `engine.inContext(id, run)` runs host code
with it current. While a script calls the host, the caller's context is current, and the module
loader is told which context imports. `engine.runJobs(id)` runs one context's promise jobs and
leaves the other contexts' jobs queued in their order, which the version 1 and version 2
lifecycles need.

## Limits

Every limit counts work, not time, so a script stops at the same point on every machine and in
every replay ([ADR 0021](../../docs/adr/0021-the-script-watchdog-counts-steps.md)).

- **Steps.** QuickJS polls for interrupts at backward jumps and calls, and calls its interrupt
  handler once every `JS_INTERRUPT_COUNTER_INIT` polls, a constant in `quickjs.c`. Each handler call
  is a step. `engine.setBudget` sets how many
  steps one call from the host may take, counting everything it calls, and how many one tick may
  take, counted from `engine.beginTick()`. The step past a budget throws an error no script can
  catch, and the call throws `ScriptTerminatedError`. Each call from the host counts its steps from
  zero, so earlier calls do not move where a later one stops.
- **Memory.** `memoryLimit` caps the bytes the engine allocates. An allocation past it fails, the
  engine counts the refusal, and an error that reaches the host throws `ScriptOutOfMemoryError`.
- **Stack.** `stackSize` sets the native stack a script may use, `DEFAULT_STACK_SIZE` unless set.
  Past it, the script gets `InternalError: stack overflow`, as on Bedrock Dedicated Server (BDS).
  The engine counts every overflow, including one a script catches, because BDS treats a caught
  overflow as critical too.

## The sandbox

A script sees only what the host gives it: no Node.js API, no filesystem and no network. Each new
context also matches the language that BDS's older QuickJS offers. The `globals` scenario of the
parity suite's `scripting.engine` family records that language on the pinned BDS: every global
name, the own keys of every built-in and its prototype, and the errors below. Its row compares the
engine with that record.

- The C layer deletes every global and member listed in `src/absentGlobals.ts`, such as `eval`,
  `Iterator` and its helpers, `Float16Array`, `Atomics`, the newer `Set` methods, resizable
  `ArrayBuffer`, the `Uint8Array` base64 and hex methods and `Map.prototype.getOrInsert`. The list
  holds exactly what the pinned QuickJS defines and BDS lacks. The native build writes it into a C
  header, so the list exists once.
- It adds `Object.__getClass` and `String.prototype.__quote`, which BDS's older QuickJS has.
- `eval` is not defined, so calling it throws `ReferenceError: 'eval' is not defined`.
- `Function`, and the generator and async function constructors, throw
  `TypeError: Function from string is not supported` instead of compiling a string.
- A regular expression with the `v` flag, a modifier group such as `(?i:a)` or a group name used
  twice throws the `SyntaxError` BDS throws, in a literal or through `RegExp`.

## The Script API's shape

The modules a pack imports, such as `@minecraft/server`, are generated rather than written by hand
([ADR 0022](../../docs/adr/0022-the-script-api-surface-is-generated.md)). `generate:shape` reads
`metadata/script_modules` from the `bedrock-samples` checkout that
`packages/bedrock-data/sources.json` pins, and writes one file per module to
`src/generated/script-modules/`. Each file keeps every version of its module as history, the beta
the pinned metadata ships included, such as `@minecraft/server` 2.11.0-beta. A
class or member is a list of segments, each with the first version it appears in and, once Mojang
removes or changes it, the last. A regeneration after a version bump therefore shows each added,
changed or removed member as its own line in the diff.

```sh
pnpm --filter @jsprismarine/script-host run generate:shape   # fetches the checkout if needed
pnpm --filter @jsprismarine/script-host run check:shape      # fails when src/generated is stale
```

The metadata has gaps, such as the privilege `CustomCommandRegistry.registerCommand`'s callback
runs under. `scripts/shape/overrides.mts` fills them, each with its evidence, and the generator fails
once the metadata records a value of its own, so a stale override cannot linger.

A pack gets the newest stable minor version of the major version it declares, as on Bedrock
Dedicated Server, so a pack that declares 2.0.0 sees every 2.x member the pinned server ships. Beta
versions do not follow semver. With the world's Beta APIs experiment on, a pack that declares a
beta gets it only when it is the one beta the pinned server ships, such as `@minecraft/server`
2.11.0-beta, and the version `beta` names that one. Any other version, beta or stable, is refused,
as `2.12.0-beta` is on BDS. `resolveDependency` does that resolution, and returns BDS's own content
log message when it refuses a module.

```ts
import { ScriptHostLibrary } from '@jsprismarine/script-host';
import { ScriptApiContext } from '@jsprismarine/script-host/shape/binding';
import { ScriptApiImplementations } from '@jsprismarine/script-host/shape/implementations';
import { resolveDependency } from '@jsprismarine/script-host/shape/resolve';

const resolution = resolveDependency(
    { module_name: '@minecraft/server', version: '2.0.0' },
    { pack: { name: 'my pack', version: '1.0.0' }, allowedModules: ['@minecraft/server'] }
);

const implementations = new ScriptApiImplementations().implement(
    '@minecraft/server',
    'World',
    'getDimension',
    (call) => `the ${call.args[0]} dimension`
);
const engine = ScriptHostLibrary.load().createEngine();
const context = new ScriptApiContext(engine, { pack: 'my pack - 1.0.0', implementations, logger: console });
try {
    // A namespace handle. A script's import reaches it only through the engine's `loadModule`.
    if (resolution.ok) context.bind(resolution.shape);
} finally {
    context.destroy();
    engine.destroy();
}
```

`ScriptApiContext` installs a module into a namespace object with every class, enum, constant and
error class the served version has. Every member is present, so `typeof world.sendMessage` and other
feature tests see what they see on BDS. Before anything else runs, a member checks its arguments
against the metadata and throws a `TypeError` or an `ArgumentOutOfBoundsError` worded the way BDS
words them, as the `argument-errors` scenario of the parity suite records them. An instance member
called on an object the host did not make throws BDS's `object bound to prototype does not exist`
error. With a `privilege` option, a member whose metadata does not list the privilege the running
script has, such as early or restricted execution, throws BDS's `cannot be used in` error. Then it calls the implementation registered for its module, class and member. A member with none throws `NotImplementedError`, which names the module, the class
and the member, and the context logs it the first time each pack uses it.

`implement` takes the names the generated `ScriptApiMembers` lists, so a misspelled member does not
compile, and the form a member needs: a function for a method or constructor, `{ get }` for a
read-only property and `{ get, set }` for a writable one. An implementation throws one of the API's
own error classes, such as `LocationInUnloadedChunkError`, by throwing a `ScriptApiError`.

## The add-on corpus

The order in which members get behavior comes from what real add-ons use. `corpus/packs.json` pins
open-source behavior packs with scripts: each repository by its GitHub URL, a full commit hash, the
sha256 of GitHub's zip of that commit, and its license. Only permissive licenses such as MIT and
Apache-2.0 are accepted, and `scripts/corpus/manifest.mts` lists them. The file also records the
candidates the corpus leaves out and why. The repository holds no copy of any add-on.

```sh
pnpm --filter @jsprismarine/script-host run count:corpus   # fetches what is missing, then counts
pnpm --filter @jsprismarine/script-host run check:corpus   # fails when the counts are stale
```

`count:corpus` downloads each pinned commit into `node_modules/.cache/jsprismarine/addon-corpus/`
through `@jsprismarine/bedrock-data`'s fetch, which checks the digest before unpacking anything, and
reuses the cached copy after that. A commit that no longer exists upstream fails with HTTP 404 and an
error naming the packs it holds. The counter then reads each pack's `manifest.json` for the modules
and versions it declares, and walks its scripts. It writes two files beside the manifest:
`corpus/usage.json`, every pack's uses with one key per line, and `corpus/ranking.md`, the modules,
declarations, events, members and interface fields ordered by how many packs use them, split by
whether the pack declares the module as stable or beta.

The counter reads a TypeScript pack from its TypeScript sources and never runs its build. A build
would mean installing the pack's npm dependencies and running its scripts, and the bundle it makes
mixes the pack's code with the libraries it bundles. The sources also carry type annotations, which
tell the counter what a value is. A pack's `build` field in the manifest says what its build step
would do. Libraries a pack bundles from npm, such as `@minecraft/math`, are not counted.

The counter parses each file with oxc and follows values through the generated shape: from an
import, through property types and method return types, `await`, array elements and destructuring,
into a callback whose parameters the shape types, and from `getComponent('minecraft:inventory')` to
`EntityInventoryComponent`. It counts a member on the class that declares it, so `player.kill()`
counts as `Entity.kill`. A value it cannot follow, such as one passed in from another file, goes
uncounted, so the counts are a lower bound. A member a pack adds to an API type through
`declare module` is the pack's own and is not counted. A beta pack resolves against the beta the
pinned server ships when that beta has the pack's major version, whichever beta the pack names,
since BDS serves only that one. A beta of another major version resolves against the newest
stable version of its own major version.

`scripts/corpus/corpus.test.mts` checks the counts against the corpus when every pinned repository
is already cached, and skips otherwise, so an ordinary test run needs no network. Set
`JSP_ADDON_CORPUS_TESTS=1` to fetch what is missing and run it anyway.

## The debugger

`engine.attachDebugger(listener)` attaches a debugger to an engine. From then on, every function
the engine enters reports each new line, and the engine stops the script at a breakpoint, after a
step, on a pause request, and, when asked, on every value the script throws. A stop calls
`listener.paused(reason)` on the engine's thread, inside the engine call that ran the script, so
that call, and the world tick that made it, stays blocked until the listener returns. Before it
returns, the listener reads the stopped script and calls `resume` with `continue`, `stepOver`,
`stepIn` or `stepOut`.

```ts
import { ScriptHandle } from '@jsprismarine/script-host/values';

const debug = engine.attachDebugger({
    paused(reason) {
        const [top] = debug.frames(); // { name, file, line, column }
        const locals = debug.scope(0, 'local');
        const { properties } = debug.properties(locals);
        try {
            console.log(reason, top, properties);
        } finally {
            // Each object among the values is a handle of its own, as the scope is.
            for (const { value } of properties) if (value instanceof ScriptHandle) engine.free(value);
            engine.free(locals);
        }
        debug.resume('stepOver');
        return 'resume';
    },
    poll() {} // read the debugger's messages without waiting
});
debug.setBreakpoints('main.js', [12]);
```

Nothing reads a clock. A script stops at the same line on every run, a running script calls
`poll` once every `pollLines` lines (`DEFAULT_POLL_LINES` unless set) so a debugger can pause a
loop that never ends, and stopping costs no steps. `evaluate(frame, source)` runs source with
a frame's variables in scope and writes through to them. It gets its own budget of
`JSH_DEBUG_EVALUATE_STEPS` steps, and the stopped script keeps its step counts. `describe` and
`properties` read values without running a getter or a proxy's handler. A replay never attaches
a debugger. Functions already running when a debugger attaches do not report lines, so attach
between calls into the engine.

### The VS Code extension's protocol

`src/debugger/` speaks the protocol of Mojang's Minecraft Bedrock Debugger for VS Code
(`Mojang/minecraft-debugger`), at version `DEBUGGER_PROTOCOL_VERSION`, so the extension attaches
to JSPrismarine as it attaches to Bedrock Dedicated Server (BDS). The work splits across two
threads, because a stopped script blocks the thread its engine runs on:

- On a thread with an event loop, `listenForDebugger` waits for the extension (the extension's
  `connect` mode, `/script debugger listen`) and `connectToDebugger` reaches one that listens
  (its `listen` mode, `/script debugger connect`). Both default to `DEFAULT_DEBUGGER_PORT`. A
  listener on an address other than loopback needs a passcode, and refuses to start without one
  with BDS's message. `DebuggerSocket` frames each message as its length in 8 hexadecimal digits,
  a newline, and the JSON with a newline after it. It closes a connection whose header states a
  body over `MAX_RECEIVED_FRAME_LENGTH`, before the body arrives.
- `DebuggerChannelBridge` hands the socket's messages to the engine's thread. There,
  `PortDebuggerChannel` reads them with `receiveMessageOnPort`, and waits on a shared counter
  while a script is stopped, since that thread's event loop does not run.
- `ScriptDebugSession` runs on the engine's thread. `handshake` offers the protocol, the
  passcode requirement and the packs, and refuses a wrong version, a wrong passcode or an unknown
  `targetModuleUUID` with BDS's messages. `attach` takes the engine and the context of the pack
  the extension picked, which `WorldScripts.debugTarget` finds, and handles its breakpoints until
  it sends `resume`. Only that context's scripts stop, so another pack's `scripts/main.js` never
  hits a breakpoint set for this one. While a script is stopped, the session answers
  `stackTrace`, `scopes`, `variables`, `evaluate`, `continue`, `next`, `stepIn`, `stepOut` and
  `pause`, and `poll` handles what arrives between ticks. When the connection closes, at any of
  these points, the session detaches from the engine, so a new debugger can attach.

```ts
// On the thread with the event loop:
const listener = await listenForDebugger({ port, address, passcode });
const bridge = new DebuggerChannelBridge();
listener.connection.then((socket) => bridge.connect(socket));
worldThread.postMessage({ debugger: bridge.endpoint }, [bridge.endpoint.port]);

// On the world's thread:
const session = new ScriptDebugSession(new PortDebuggerChannel(endpoint), { plugins, passcode });
const target = session.handshake(); // the script module UUID the extension picked
const picked = target === undefined ? undefined : worldScripts.debugTarget(target);
if (picked !== undefined) session.attach(picked.engine, picked.context);
// then session.poll() between ticks, and session.detach() for /script debugger detach
```

The host does not implement the extension's profiler, diagnostics or `debugger-request`
messages yet. It answers a `debugger-request` as refused.
## Running a world's scripts

`WorldScripts` is the script runtime of one world: one engine, a context for each pack, and the
lifecycle, system tasks, events and watchdog around them. It reaches the world only through
`ScriptWorld` (`@jsprismarine/script-host/host/world`), a narrow interface the server implements
with plain data: the dimensions, the players, `sendMessage`, the weather and its guard, the guard
on the players' chat, the changes the world committed, and the clock the tick admitted. The host
imports no world class.

```ts
import { readScriptConfig, readScriptPack } from '@jsprismarine/script-host/host/pack';
import { WorldScripts, watchdogSettings } from '@jsprismarine/script-host/host/WorldScripts';

const scripts = new WorldScripts({
    library,
    world, // a ScriptWorld
    packs: directories.map(readScriptPack).filter((pack) => pack !== undefined),
    config: readScriptConfig('config'), // BDS's config/ folder
    log: console,
    seed: worldSeed,
    watchdog: watchdogSettings({ 'script-watchdog-hang-threshold': '10000' }),
    onShutdown: (reason) => server.stop()
});
scripts.startEarly(); // version 2 packs: top level, promise jobs once, startup
scripts.startWorld(); // version 1 packs, once the world has loaded: top level, worldInitialize
// at the end of every tick, before its change log closes:
scripts.flush();
```

The order of everything matches the pinned BDS, as the `scripting.*` families of the parity suite
record it:

- **Packs.** `readScriptPack` reads a pack's manifest. A pack gets each native module it declares
  at the newest stable minor of the declared major version, when `config/default/permissions.json`
  or `config/<script module uuid>/permissions.json` allows the module, and otherwise logs BDS's
  message and does not load. A beta version loads only when the `betaApis` option says the world
  has the Beta APIs experiment on, as `resolveDependency` describes. For a module or version the
  pinned server does not ship, the runtime logs BDS's `failed to create context` and, once every
  pack of the lifecycle has loaded, `run failed`. A pack declaring `@minecraft/server` 1.x runs the version 1
  lifecycle, any other the version 2 one. Each pack runs in a context of its own. An `import()`
  of a module the manifest does not declare rejects as on BDS, except `@jsprismarine/server`,
  which resolves, so a pack can detect JSPrismarine and fall back on BDS.
- **The flush.** `flush` runs the version 1 promise jobs once, then until nothing is left: the
  version 2 promise jobs, the system tasks due, each followed by version 2 promise jobs, and the
  after-events, each type followed by version 2 promise jobs. A `system.run` that a running task
  queues waits for the next tick, which stops a task that queues itself from running for ever.
- **Privileges.** Top levels of version 2 packs, their first promise jobs and `startup` run in
  early execution, before-events in restricted execution, and the rest with the default
  privilege. A member whose metadata does not list the privilege throws BDS's error.
- **Inputs.** `Math.random` in each context draws from a generator seeded from the world's seed
  and the pack's place, and `Date` reads `ScriptWorld.clock()`, so a replay runs the same.
- **The watchdog.** A callback that takes more than its step budget stops with an error no script
  catches. `watchdogSettings` converts BDS's millisecond threshold at `STEPS_PER_MILLISECOND`. A
  hang, a stack overflow, even a caught one, and an allocation past the memory limit are critical:
  the runtime logs BDS's lines and, unless `script-watchdog-enable-shutdown` is `false`, stops and
  calls `onShutdown`. Before it shuts down for a hang or a stack overflow, it sends the beta
  `system.beforeEvents.watchdogTerminate`, and a script that cancels it keeps the server and its
  packs running, as on BDS.
- **Chat.** `world.beforeEvents.chatSend`, a beta event, is a guard the runtime adds to the
  world's chat action through `ScriptWorld.guardChat`. It runs in restricted execution while the
  line is sent, and a cancel drops the line before anyone gets it.
- **Coverage.** When a pack loads, the runtime logs how many of the members its scripts name are
  implemented, and which are not.
- **Reload.** `reload` sends `system.beforeEvents.shutdown`, then runs every pack again from its
  top level, as BDS's `/reload` does. `system.currentTick` carries on.

### Forms

A pack that declares `@minecraft/server-ui` gets `ActionFormData`, `ModalFormData`,
`MessageFormData`, their responses and `uiManager.closeAllForms`, in the version 1 and version 2
shapes and the beta. The data-driven `CustomForm`, `MessageBox` and observables throw
`NotImplementedError`. Forms reach the world through `ScriptWorld.forms`, a `ScriptFormChannel`
that sends a player a form, closes a player's forms, and hands back the answers the input step
admitted. A world without one sends no form.

The `scripting.ui` family of the parity suite records each rule below on the pinned BDS, and its
scenarios compare the form JSON a client receives byte for byte.

- **The JSON.** `src/host/formJson.ts` writes what BDS's JSON writer writes: keys in byte order,
  a newline at the end, only `"`, `\` and control characters escaped, and a slider's 32-bit
  float bounds in BDS's float format, so 0.5 is `0.50` and 0.1 is `0.1000000014901161`. A
  `RawMessage` becomes a `rawtext` list, and one that holds nothing throws BDS's
  `RawMessageError`. A builder call turns its arguments into JSON at once, so a script that
  changes a `RawMessage` afterwards does not change the form.
- **Where the state lives.** A form's parts and a response's data live beside the objects in the
  pack's realm, in a `WeakMap` the host reaches through `src/host/formKit.ts`, so a form a script
  drops goes with it. Reading an argument runs inside the engine, under the watchdog.
- **The answer.** `show()` returns a promise, and the client's answer settles it in the next
  script flush, before its promise jobs run. A cancel reason wins over JSON: 1 is `UserBusy` and
  any other byte `UserClosed`. An action form takes an integer, read as a 32-bit unsigned
  number, or a boolean; a modal form takes a flat list, with `null` read as `undefined` in
  version 2 only; a message form reads `true` as its first button in version 2 and as its
  second in version 1, whose JSON swaps the two buttons. Anything else rejects with
  `FormRejectError` and `MalformedResponse`. An answer for a form the player was not sent, or
  with neither JSON nor a reason, is dropped.
- **Leaving.** A player who leaves rejects each of their open forms with `PlayerQuit`, the
  newest first. `show()` for that player then throws `InvalidEntityError`, and `closeAllForms`
  throws `Error: Invalid Player handle.`. `closeAllForms` closes a player's forms and settles
  none of them.

## Building it

The package is private, and not published to npm, until each platform has a prebuilt library that
an install can fetch ([#3215](https://github.com/JSPrismarine/JSPrismarine/issues/3215)). Until
then it runs from a checkout. `pnpm --filter @jsprismarine/script-host run build:native`
builds the library for this machine into `prebuilds/<platform>-<arch>/`, and the binding loads it
from there. Set `JSP_SCRIPT_HOST_LIBRARY` to load another file instead.

The build needs a C compiler (`CC` names one; the default is `cc`), `tar` that reads `.tar.xz`, and
`git`. It runs on Linux for now. The script downloads the QuickJS release that
`native/sources.json` pins into `node_modules/.cache/jsprismarine/script-host`, checks its SHA-256,
applies `native/patches/quickjs-host-hooks.patch`, and compiles QuickJS with `native/src/engine.c`
into one shared library that exports only the `jsh_` interface.

CI builds the library on each Linux x64 runner that installs the repository, and runs this
package's tests against it.

## The QuickJS patch

The patch adds these functions to QuickJS. Nothing in QuickJS behaves differently until the C layer
calls one:

- `JS_DisableFunctionFromString`, which makes the four `Function` constructors throw instead of
  compiling a string.
- `JS_GetStackOverflowCount`, which counts the stack overflows a runtime throws, caught or not.
- `JS_ResetInterruptCounter`, which restarts the count of polls until the next interrupt handler
  call, so each call from the host counts its steps from zero.
- `JS_DisableNewRegExpSyntax`, which makes the regular expression compiler refuse the `v` flag,
  modifier groups and a group name used twice, as releases before them did.
- `JS_AddLegacyMembers`, which defines `Object.__getClass` and `String.prototype.__quote` as
  earlier releases defined them.
- `JS_ExecutePendingJobOf`, which runs the first pending promise job of one context and leaves the
  jobs of the others queued.

`native/patches/quickjs-debugger.patch` ports the debugger hooks of koush's QuickJS fork
(`koush/quickjs`, `quickjs-debugger.c` and its `quickjs.c` changes), which the VS Code extension's
protocol was written against. As koush's does, the interpreter keeps a second dispatch table whose
entries call the debugger before each instruction. A function uses it only when a line hook is
set as it starts, so with no debugger attached every instruction runs the usual table and does
no extra work. The patch adds:

- `JS_SetDebugHooks`, which sets a line hook and a throw hook. The line hook runs before the first
  instruction of each line, when a loop jumps back, and when a call returns to a line partway
  through. The throw hook runs once for each thrown value, before any handler.
- `JS_GetDebugStackDepth` and `JS_GetDebugFrame`, the stack with each frame's function, file,
  line and column.
- `JS_GetDebugLocals` and `JS_GetDebugClosure`, a frame's variables.
- `JS_DebugEvaluate`, which compiles source as a direct `eval` inside a frame with all of the
  frame's variables in scope. A variable no closure captures has no reference in its frame, so
  the evaluation borrows the variable's slot and leaves any closure it made with a copy.
- `JS_GetDebugClassName`, an object's class name without running script.
