# @jsprismarine/script-host

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/script-host)](https://www.npmjs.com/package/@jsprismarine/script-host)

The engine JSPrismarine runs Bedrock behavior pack scripts in. It holds one native library, Fabrice
Bellard's [QuickJS](https://bellard.org/quickjs/) with a small C layer of our own, and the
TypeScript that binds it through `node:ffi`. Each world will own one engine and run it on its own
thread, as [ADR 0020](../../docs/adr/0020-scripts-run-in-quickjs-on-the-world-thread.md) decides.
The plan that builds the rest of the script host on top of this package is
[script-api-host.md](../../docs/plans/script-api-host.md).

This release has the engine, with evaluation, host calls, limits and the sandbox, and the shape of
the Script API: every module, class and member of `@minecraft/server` and the other stable modules,
generated from Mojang's metadata. It does not load packs yet, and no member has behavior yet.

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
source for its name.

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
`src/generated/script-modules/`. Each file keeps every stable version of its module as history. A
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
Dedicated Server, so a pack that declares 2.0.0 sees every 2.x member the pinned server ships.
`resolveDependency` does that resolution, and returns BDS's own content log message when it refuses
a module.

```ts
import { ScriptHostLibrary } from '@jsprismarine/script-host';
import { ScriptApiContext } from '@jsprismarine/script-host/shape/binding';
import { ScriptApiImplementations } from '@jsprismarine/script-host/shape/implementations';
import { resolveDependency } from '@jsprismarine/script-host/shape/resolve';

const resolution = resolveDependency(
    { module_name: '@minecraft/server', version: '2.0.0' },
    { pack: 'my pack - 1.0.0', allowedModules: ['@minecraft/server'] }
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
    if (resolution.ok) context.bind(resolution.shape); // the namespace a script's import sees
} finally {
    context.destroy();
    engine.destroy();
}
```

`ScriptApiContext` installs a module into a namespace object with every class, enum, constant and
error class the served version has. Every member is present, so `typeof world.sendMessage` and other
feature tests see what they see on BDS. Before anything else runs, a member checks its arguments
against the metadata and throws a `TypeError` or an `ArgumentOutOfBoundsError`. The research note
confirms BDS's wording for a variant that fails to convert and for an argument out of bounds. The
messages for a wrong type, a wrong argument count, a class with no constructor and a member called
on something that is not an instance follow the same style and are provisional until a
`scripting.engine` parity row checks them against BDS. Then it calls the implementation registered for its module, class and member. A member with none throws `NotImplementedError`, which names the module, the class
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
`declare module` is the pack's own and is not counted. The shape has no beta versions yet, so a beta
pack resolves against the newest stable version of its major version, and members only a beta
version has show up under "Not in the shape".

`scripts/corpus/corpus.test.mts` checks the counts against the corpus when every pinned repository
is already cached, and skips otherwise, so an ordinary test run needs no network. Set
`JSP_ADDON_CORPUS_TESTS=1` to fetch what is missing and run it anyway.

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
