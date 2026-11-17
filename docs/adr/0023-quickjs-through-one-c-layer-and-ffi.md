# Bind QuickJS through one C layer of our own, over FFI on every runtime

Status: accepted

The script runtime ([ADR 0020](0020-scripts-run-in-quickjs-on-the-world-thread.md)) must run
under Node.js today and in the scriptc build later. scriptc loads no Node-API addon, and its FFI
cannot pass or return a C struct by value. QuickJS's `JSValue` is a 16-byte struct on 64-bit
targets, and every QuickJS call takes or returns one.

The engine is Fabrice Bellard's QuickJS, at its latest release. BDS embeds an older release of the
same line: it lacks iterator helpers, `Float16Array`, the `Set` methods and the regular expression
`v` flag, and it has no `eval` and no `new Function` from a string. When the C layer creates a
context it removes the globals BDS does not have and disables `eval` and `Function` from a string.
A parity row compares the global object's keys with BDS's. Differences a context cannot hide, such
as the `v` flag being accepted by the parser, are recorded parity gaps unless a small patch closes
them.

We build QuickJS ourselves at a pinned version, with a C layer of our own on top, and bind that
layer through `node:ffi` on Node.js and through scriptc's FFI in the compiled build, the way
[ADR 0006](0006-libdatachannel-for-nethernet-server.md) binds libdatachannel. The C layer:

- keeps every `JSValue` in C and gives TypeScript integer handles to them,
- has one synchronous host-dispatch entry, a function id and an argument buffer in and a result
  out, that every script-to-host call goes through,
- owns the step budget in the interrupt handler and the allocation limit
  ([ADR 0021](0021-the-script-watchdog-counts-steps.md)),
- keeps its state for each engine instance, so each level's thread owns its own,
- carries the debugger patch. The VS Code extension's protocol comes from koush's debugger for
  Bellard's QuickJS, which changed about 450 lines of `quickjs.c` and added a debugger file of
  about 750 lines. We port that patch to the pinned release.

The C layer and its bindings live in `@jsprismarine/script-host`, the package that owns the
runtime. It ships its native builds the way ADR 0006 ships libdatachannel's: one manifest of
per-platform builds and a download at install.

Spikes on 2026-11-16 built quickjs-ng with a C layer of this shape, once under scriptc and once
through `node:ffi` on the main thread and in a worker. A host call from inside `JS_Eval` reached
TypeScript synchronously and returned, and a step budget in C stopped `while (true)` at the same
step on every run. Bellard's QuickJS has the same embedding calls for these. scriptc's own copy of
quickjs-ng runs only in its compiler and is never linked into a program, so we link our build in
both runtimes. The research note is [bedrock-script-api.md](../research/bedrock-script-api.md).

## Considered options

**quickjs-ng.** It is the more active fork, and the spikes ran on it. It exposes 12 globals BDS
lacks, parses syntax BDS rejects, and has no debugger API: an upstream pull request for one is
open and unmerged. The protocol's debugger patch was written for Bellard's line.

**Bellard's newest release without the features BDS lacks**, likely 2024-01-13. It needs the least
hiding and misses the security fixes since.

**quickjs-emscripten, as WebAssembly on both runtimes.** It is the least work to start. scriptc
translates WebAssembly to native code only for modules visible at build time, never frees an
instance, which a `/reload` would leak, and every host call would cross the WebAssembly boundary.

**WebAssembly on Node.js now and the C layer later for scriptc.** Two engines, with their bugs
found twice.

**A Node-API addon on Node.js.** It breaks the rule of one C layer for every runtime, and scriptc
rejects it. It stays the fallback if `node:ffi` cannot carry the host-dispatch callback.

## Consequences

- We own a native build of a JavaScript engine, its security fixes and a debugger patch that
  must keep applying. The pin updates with the other dependency updates.
- A host call is an FFI call and a copy of its arguments. The host counts these calls, and binding
  design keeps reads that are made often cheap, for example by batching a component's fields into
  one call.
