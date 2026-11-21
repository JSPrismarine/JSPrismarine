# Numeric kernel options on Node.js, Bun and scriptc

Researched 2026-11-21. Scope: which ways of writing the terrain generator's numeric kernel (noise, density functions, aquifer, surface rules, climate search) run on all three of the project's target runtimes, and what each costs. The runtimes are Node.js, Bun including `bun build --compile`, and scriptc, the ahead-of-time compiler behind `pnpm run package:scriptc`. The strategies are plain TypeScript, WebAssembly, WebAssembly with SIMD, a C library bound through each runtime's FFI, and a Node-API addon. The question comes from a planned rearchitecture whose goal is to beat PumpkinMC and Bedrock Dedicated Server per chunk. This note does not measure the generator itself; [parallel-chunk-generation-in-node.md](parallel-chunk-generation-in-node.md) and [ADR 0002](../adr/0002-chunk-generation-architecture.md) cover that.

Versions: Node.js v26.12.1 with V8 14.6.202.34-node.40 (`.nvmrc` is `26.x`); Bun 1.4.4 with WebKit `d6375c72affe0f70222cdcb45012b10f0bf3a9d5`; scriptc 0.4.14 (root `package.json`), whose backend is an LLVM 22 helper; Apple clang 21.0.0; rustc 1.100.0. The scriptc.dev documentation is as served on 2026-11-21 (`lastUpdated: 2026-11-20` in [llms.txt](https://scriptc.dev/llms.txt)). Host: Apple M1 Pro, 8 cores, 16 GiB, darwin arm64 27.2.0.

Each claim is marked as read (from the cited source) or run (from an experiment in [Reproduction](#reproduction)).

**On the timings.** AGENTS.md rules out wall-clock figures as evidence. Every nanosecond figure below is indicative only. Each was the best of 9 to 40 rounds, on a machine shared with another agent's benchmark, with the load average recorded beside the run: 9.1 to 13.4 for the first pass and 3.1 to 5.4 for the second, and the tables quote the second. Use them for orders of magnitude and ratios on one host, never as proof that one design is faster. Section 6 proposes deterministic proxies the rearchitecture should measure instead.

## Summary

- **One strategy runs everywhere with full speed in the kernel: a C library with a flat C ABI, bound through `node:ffi`, `bun:ffi` and scriptc's FFI.** This is the repository's existing pattern ([ADR 0006](../adr/0006-libdatachannel-for-nethernet-server.md), [ADR 0023](../adr/0023-quickjs-through-one-c-layer-and-ffi.md)). A scalar call cost about 0.9 ns under scriptc, 3.5 ns under `node:ffi` and 5.8 ns under `bun:ffi`, and all three worked from four worker threads. (Run.)
- **WebAssembly loads on all three runtimes, but scriptc cuts it down hard.** scriptc translates a `.wasm` module to native code at build time. It refuses SIMD, threads and shared memories, refuses bytes it did not see at build time, and never frees an instance ([scriptc limitations](https://scriptc.dev/docs/limitations)). A translated scalar kernel ran as fast as the same C linked natively (6.8 against 7.0 ns per sample), but each call from TypeScript into it cost about 58 ns, against 2.7 ns on Node.js. (Read and run.)
- **WebAssembly SIMD and shared memory work on Node.js and Bun only.** Both validated and ran `f32x4` and relaxed SIMD modules, and both passed one shared `WebAssembly.Memory` and one compiled module to two workers. scriptc rejected the SIMD module and threw on the shared memory. A WASM+SIMD kernel therefore needs a second, scalar build for scriptc. (Run.)
- **Plain TypeScript is available everywhere, and its speed depends on the runtime more than on the code.** For a fused 95-operation expression, scriptc ran 6.5 ns per sample, Bun 15.6 and Node.js 22.8. For the same expression as 31 closures composed at run time, the shape `packages/worldgen/src/density/compile.ts` builds, scriptc ran 63.5, Bun 48.0 and Node.js 16.3. An ahead-of-time compiler cannot inline a call graph that only exists at run time, so scriptc is the slowest of the three on the closure tree. (Run.)
- **scriptc turns the repository's `f32` alias into a call.** `packages/worldgen/src/math.ts:13` defines `export const f32 = Math.fround`. Under scriptc, a call through that alias compiles to a guarded closure call, and the fused kernel slowed from 6.5 to 37.9 ns per sample. A direct `Math.fround` call compiles to `fptrunc` and `fpext`, which LLVM then narrowed to single-precision `fmul s` and `fadd s`. (Run.)
- **`Math.fround` chains cost differently per engine.** JavaScriptCore's `B3ReduceDoubleToFloat` phase rewrites double arithmetic between `fround`s into float arithmetic, and Bun's FTL output showed `MulFloat` and `AddFloat`. V8 lowers `Math.fround` to a float64-to-float32 truncation, and its reducers narrow comparisons of two converted floats to float32 but leave arithmetic in float64, so every `fround` stays two conversions. (Read and run.)
- **Code generated from strings is out on scriptc.** `eval` and `new Function` throw `EvalError` there, as under `node --disallow-code-generation-from-strings`, and a TypeScript source that calls `new Function` fails to build with SC2020 ([limitations](https://scriptc.dev/docs/limitations)). The density codegen in `compile.ts:725` falls back to closures. Generating TypeScript source at build time works on all three. (Read and run.)
- **WebAssembly's scalar `f32` arithmetic matches Java's `float` arithmetic.** Both round every operation to nearest, ties to even, and Java has done so unconditionally since Java SE 17. The differences to manage are NaN payloads, `Math.log` and other transcendental functions, which Java's `Math` does not pin to the bit, and fused multiply-add. Relaxed SIMD's `relaxed_madd` may fuse or not, by platform. Apple clang contracted `a * b + c` into `fmadd` by default on arm64, and `-ffp-contract=off` stopped it; rustc did not contract. (Read and run.)
- **Hard blockers.** scriptc has no WebAssembly SIMD, no shared WebAssembly memory, no `eval`, no run-time `dlopen` and no Node-API. `node:ffi` and `bun:ffi` are both marked experimental. `node:ffi` loses its fast path when a typed array is passed beside a float argument: a buffer-and-int call cost 102 ns. Bun documents `bun:ffi` as not for production. (Read and run.)
- **Recommendation.** If the rearchitecture moves the kernel out of TypeScript, make it a C library with a C ABI. Keep its calls coarse, about one per chunk section or cell column rather than one per sample, and pass integer handles to buffers registered once. Build it with `-ffp-contract=off`. Use SIMD inside the C code, where it works on every runtime. If the kernel stays in TypeScript, call `Math.fround` directly and generate code from the vanilla density graph at build time, which works without `eval` on all three runtimes. In both cases, evaluate a node over a batch of positions rather than a whole tree per sample.

## 1. scriptc

### What it compiles to

scriptc parses and type-checks with the TypeScript compiler, lowers to a typed IR in which "generic functions are specialized, unions use tags, and closures have explicit captures", emits LLVM IR, and generates code with "the matching LLVM 22 helper". The output is a native executable or, for `wasm32-wasi`, a WebAssembly module ([How it works, compiler pipeline](https://scriptc.dev/docs/how-it-works)). The runtime uses reference counting with a cycle collector, and "Values use JavaScript's double-precision representation" ([How it works, native runtime](https://scriptc.dev/docs/how-it-works)). `--optimization speed` "trades larger executables and longer builds for faster programs (runtime inlining, inline reference counting...)" (`scriptc build --help`). (Read.)

The documentation makes no numeric performance claims. Its tool for performance-sensitive code is contract types: `Int32`, `Int32[]`, `NoThrow<T>`, `Immutable<T>`, `Acyclic` and `ProgramLifetime`, which scriptc proves at build time and then uses "to generate faster code or use less memory" ([Contract types](https://scriptc.dev/docs/contracts)). There is no float32 contract. (Read.)

### `Math.fround`

The documentation does not mention `Math.fround`. Compiling a small kernel showed two different lowerings. (Run.)

- A direct `Math.fround(x)` lowers to `fptrunc double to float` followed by `fpext float to double`. In the optimized arm64 output, LLVM narrowed `fround(fround(fround(a * b) + c) * a)` to `fmul s2, s1, s11`, `fadd s2, s2, s12` and `fmul s1, s2, s1`, which is single-precision arithmetic, and inlined the function into its caller.
- A call through `const f = Math.fround` lowers to a closure call. Each one loads the closure, compares its code pointer with the built-in `fround`, branches, and keeps an indirect fallback that pushes and pops a dynamic `this`. A module-level binding also gets a temporal dead zone check. The arithmetic between the calls stayed in double precision (`fmul d9, d8, d9`).

The worldgen package uses the second form everywhere: `export const f32 = Math.fround` in `packages/worldgen/src/math.ts:13`. With the fused kernel from section 6 importing `f32` from a separate module, scriptc ran 37.9 ns per sample, against 6.5 ns with `Math.fround` written out. Node.js and Bun showed no such difference (22.8 against 23.5, and 15.6 against 15.9). (Run.)

### Typed arrays, closures and dispatch

Typed arrays compile to native storage: "Fixed-length ArrayBuffers support shared typed-array and DataView storage" ([limitations](https://scriptc.dev/docs/limitations)). A closure is a `%ScrClosure` record holding a code pointer, and a call through a function value is an indirect call (`--emit=llvm` output, run). Nothing in the documentation describes devirtualization or inlining through function values. For a tree of 31 closures built at run time, scriptc ran 63.5 ns per sample against 6.5 ns for the same operations in one function. (Read and run.)

### `eval` and `new Function`

"`eval`, indirect `eval`, `new Function`, and `Function` behave as they do under `node --disallow-code-generation-from-strings`, a deliberate difference from default Node.js: every call throws a catchable `EvalError`" ([limitations](https://scriptc.dev/docs/limitations)). A TypeScript source that calls `new Function` fails to build: "error SC2020: 'Function' is part of the standard library types but has no scriptc lowering yet". `scriptc coverage packages/worldgen/src/density/compile.ts` lists the factory at `compile.ts:725` under "in unreached code (never lowered, cannot fail a build)", and reports the module as 99% static, with its blockers in `packages/errors`. [ADR 0007](../adr/0007-own-nethernet-protocol.md) already records that the scriptc build needs code without `eval`. (Read and run.)

### WebAssembly

"scriptc translates WebAssembly modules to native code when it builds the program; there is no interpreter or JIT in the executable." It translates modules whose bytes it can see at build time: resolvable file paths, base64 or byte-array literals, `.wasm` files shipped by packages, and files listed under `scriptc.wasm` in `package.json`. "Bytes the build did not see, including bytes produced at run time, reject with a `CompileError`." Translated modules can use the WebAssembly 2.0 feature set. "Modules that use SIMD, threads, exception handling, tail calls, typed function references or GC, memory64, or multiple memories are not translated." Shared memories throw a `TypeError`. "Instances are never freed, together with their memories, imports and exports." "NaN payloads may differ." ([limitations, WebAssembly modules](https://scriptc.dev/docs/limitations)). (Read.)

All of it held on this machine (run):

- A byte-literal SIMD module made `WebAssembly.validate` return `false`, and `new WebAssembly.Module` threw "this module was found when the program was built but not translated (it uses simd, outside the translated WebAssembly feature set)".
- `new WebAssembly.Memory({ shared: true, ... })` threw "shared memories are not supported yet (scriptc does not translate WebAssembly threads)".
- A scalar module built by clang from the fused kernel in C ran at 6.81 ns per sample once translated, and the same C linked through FFI ran at 6.99 ns. The translation is as good as native code.
- Calling an exported `(f64, f64) -> f64` add from TypeScript cost 57.6 ns per call. `scriptc coverage` places those calls in the "dynamic tier", because `instance.exports` is typed only at run time. A kernel called through WebAssembly under scriptc must cross the boundary rarely.

scriptc can also compile TypeScript into a WebAssembly reactor with `SCRIPTC_TARGET=wasm32-wasi scriptc build --lib --profile`, which needs zig ([WebAssembly modules](https://scriptc.dev/docs/wasm)). That would let one TypeScript kernel source become a `.wasm` for Node.js and Bun. It was not tried here, because zig is not installed. (Read.)

### FFI

[scriptc-libdatachannel.md](scriptc-libdatachannel.md#2-the-ffi) covers the manifest, ABI classes and callbacks. For a synchronous kernel, what matters is this:

- "Only direct calls to that exact declaration become native calls." There is no run-time `dlopen`. Libraries link statically from archives listed in the manifest ([FFI](https://scriptc.dev/docs/ffi)). (Read.)
- A scalar `(f64, f64) -> f64` call cost 0.93 ns. A call passing a 16-float buffer as `bytes` (a pointer and a length, borrowed for the call) cost 4.16 ns. (Run.)
- A declared native function was callable from four worker threads, each making 1,000,000 calls with correct results. (Run.)
- Workers share one heap: "A compiled program has one heap for every thread" ([limitations, native worker threads](https://scriptc.dev/docs/limitations)). `@scriptc/threads`' `publish(value)` makes an object graph immutable so workers can read it by reference ([threads](https://scriptc.dev/docs/threads)). SharedArrayBuffers work, with fixed length and integer-only `Atomics`. A native kernel can also keep read-only tables in C memory, which every thread in the process sees. (Read.)

## 2. Bun

### `bun build --compile` is not ahead-of-time compilation

"Bun bundles all imported files and packages into the executable, along with a copy of the Bun runtime" ([executables](https://github.com/oven-sh/bun/blob/bun-v1.4.4/docs/bundler/executables.mdx)). `--bytecode` "moves that parsing work from runtime to bundle time, which shortens startup". The bytecode is "not portable across Bun versions", and "Architecture-specific optimizations happen during JIT compilation at runtime, not in the cached bytecode" ([bytecode](https://github.com/oven-sh/bun/blob/bun-v1.4.4/docs/bundler/bytecode.mdx)). `--compile-jit-policy` scales JavaScriptCore's tier-up thresholds. (Read.)

The closure tree benchmark built with `bun build --compile --bytecode` was an 87,355,634-byte executable, against 168,968 bytes from scriptc. With `BUN_JSC_reportFTLCompileTimes=true`, it reported 9 functions compiled by the FTL tier while it ran. "Bun AOT" ships JavaScriptCore and JIT-compiles at run time. Its steady-state speed is Bun's, and the fused kernel measured 15.3 ns per sample either way. (Read and run.)

### `Math.fround` in JavaScriptCore

JavaScriptCore's B3 backend has a `reduceDoubleToFloat` phase ([`B3ReduceDoubleToFloat.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/b3/B3ReduceDoubleToFloat.cpp)). For `Add`, `Sub`, `Mul` and `Div` whose operands both come from `FloatToDouble` or are constants exactly representable as floats, and for `Abs`, `Ceil`, `Floor`, `FTrunc`, `Neg` and `Sqrt` over such an operand, it changes the operation to float, provided the result is not used as a double. (Read.)

With concurrent JIT off and `BUN_JSC_dumpFTLDisassembly=true`, a function computing `fround(fround(fround(a * b) + c) * a)` over `fround`ed arguments compiled to `MulFloat`, `AddFloat`, `MulFloat` and one final `ConvertFloatToDouble`. When an operand was a plain double argument, the chain kept `MulDouble` with a `ConvertDoubleToFloat` and `ConvertFloatToDouble` pair after it. JavaScriptCore therefore runs a fully `fround`ed chain in single precision. (Run.)

### `bun:ffi`

"`bun:ffi` is **experimental**, with known bugs and limitations. Do not rely on it in production." JavaScriptCore "implements `dlopen`, `linkSymbols`, `CFunction`, and `JSCallback` natively... Hot call sites compile down through the DFG/FTL JIT tiers into direct native calls with no per-argument JavaScript shim." TinyCC is used only for `cc()`. Thread-safe `JSCallback`s are experimental, and their return value is ignored ([FFI](https://bun.com/docs/runtime/ffi.md)). (Read.)

A scalar call cost 5.80 ns, and a call passing a 16-float typed array and an `i32` cost 3.85 ns, or 3.32 ns with a pointer taken once with `ptr()`. `dlopen` and calls from four workers worked. (Run.)

### Node-API and WebAssembly

"Bun implements this interface from scratch, so most existing Node-API extensions work with Bun out of the box" ([Node-API](https://bun.com/docs/runtime/node-api.md)), and `.node` files can be embedded in `--compile` executables ([executables](https://github.com/oven-sh/bun/blob/bun-v1.4.4/docs/bundler/executables.mdx)). A Node-API `add` cost 40.2 ns per call. (Read and run.)

Bun's documentation has no WebAssembly page at v1.4.4. On this machine Bun validated and ran an `f32x4` SIMD module and a relaxed SIMD `f32x4.relaxed_madd` module, created a shared `WebAssembly.Memory` whose buffer is a `SharedArrayBuffer`, and passed one module and one shared memory to two workers that wrote into the same table. A JavaScript-to-WebAssembly scalar call cost 5.59 ns. (Run.)

## 3. Node.js

### `node:ffi`

`node:ffi` was added in v26.1.0 at "Stability: 1 - Experimental". "This module is only available under the `node:` scheme in builds with FFI support. It can be disabled with the `--no-experimental-ffi` flag." It is on by default in v26.12.1 and prints an `ExperimentalWarning` on first use. Under the permission model it needs `--allow-ffi` ([ffi](https://nodejs.org/docs/v26.12.1/api/ffi.md)). (Read and run.)

It has three call paths: a V8 Fast API path through "a small native trampoline that Node.js generates for the exact signature", a shared-buffer path, and a generic `libffi` path. The fast path takes "at most 8 total arguments" and needs executable memory. On AArch64 and x86-64 System V it does not support a typed array argument together with a floating-point argument ("Buffer-shaped + FP together: Not supported"). Only "signatures with a single `pointer`, `buffer`, or `arraybuffer` argument" get an entry point that takes a typed array directly; otherwise a typed array is converted to a pointer `bigint` in JavaScript on every call ([ffi, call paths](https://nodejs.org/docs/v26.12.1/api/ffi.md)). (Read.)

Measured per call (run):

| Signature | ns per call |
| --- | --- |
| `(f64, f64) -> f64` | 3.45 |
| `(buffer, i32) -> f64`, 16-float typed array | 102.0 |
| `(pointer, i32) -> f64`, pointer from `ffi.getRawPointer` cached as a `bigint` | 63.6 |
| `(buffer) -> f64`, the single-buffer entry point | 38.8 |

The useful kernel signature on Node.js is scalars only. A C layer should register its buffers once and take integer handles and coordinates afterwards. Calls from four workers worked. (Run.)

### Node-API

A Node-API `add` cost 22.6 ns per call (run). Addons that load in more than one thread "need to clean up any resources" per instance to support workers ([addons, worker support](https://nodejs.org/docs/v26.12.1/api/addons.md)) (read). scriptc rejects Node-API addons ([limitations, native addons](https://scriptc.dev/docs/limitations)) (read), so a Node-API kernel would be a second binding beside the one scriptc needs.

### `Math.fround` in V8

Simplified lowering gives `NumberFround` a `kFloat32` output representation with a truncating float64 input (`src/compiler/simplified-lowering.cc`, `case IrOpcode::kNumberFround`, at tag [14.6.202.34](https://github.com/v8/v8/blob/14.6.202.34/src/compiler/simplified-lowering.cc)). TurboFan's `machine-operator-reducer.cc` and Turboshaft's `machine-optimization-reducer.h` narrow a float64 comparison of two converted float32 values to a float32 comparison (`IsFloat32ConvertedToFloat64` at line 1501 of the latter). No rule in either narrows float64 addition, subtraction or multiplication the same way. A chain of `fround`ed operations therefore runs in float64 with a float64-to-float32-to-float64 conversion pair at each `fround`. `node --print-opt-code` prints nothing in a release build, so this is from the source, not from disassembly. (Read and run.)

### WebAssembly and workers

V8 14.6 validated and ran the same SIMD and relaxed SIMD modules as Bun, and created a shared `WebAssembly.Memory` (run). `--turbo-inline-js-wasm-calls` defaults to true in 14.6. It inlines "JS-to-Wasm wrappers and then the body of the Wasm function, if applicable" (`src/flags/flag-definitions.h`, [14.6.202.34](https://github.com/v8/v8/blob/14.6.202.34/src/flags/flag-definitions.h); `node --v8-options`). The [V8 9.0 release notes](https://v8.dev/blog/v8-release-90) introduced wrapper inlining because calls "from JavaScript to WebAssembly were not as fast as calls from JavaScript to JavaScript" (read). A scalar call into WebAssembly cost 2.72 ns, against 0.93 ns for an inlined JavaScript function (run).

`postMessage` and `workerData` may carry `WebAssembly.Module` instances and `SharedArrayBuffer`s ([worker_threads](https://nodejs.org/docs/v26.12.1/api/worker_threads.md)). One module and one shared memory posted to two workers produced one table both had written (run).

## 4. WebAssembly as the portable kernel target

### Float semantics against Java

The WebAssembly core specification says "Floating-point arithmetic follows the IEEE 754 standard" and "All operators use round-to-nearest ties-to-even, except where otherwise specified." When an operation produces a NaN from non-canonical inputs, "the payload is picked non-deterministically among all arithmetic NaNs", and the sign is non-deterministic too ([numerics](https://webassembly.github.io/spec/core/exec/numerics.html)). (Read.)

Java has required this since Java SE 17: "In Java SE 17 and later, the Java SE Platform always requires strict evaluation of floating-point expressions", and "every floating-point operator rounds its floating-point result to the result precision" with round to nearest ([JLS 25, 15.4](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html)). So `f32.add`, `f32.sub`, `f32.mul`, `f32.div` and `f32.sqrt` in WebAssembly give Java's `float` results bit for bit, NaN payloads aside. The same holds for scalar C or Rust `float` code compiled without contraction or fast-math flags. (Read.)

The cases to watch:

- **Fused multiply-add.** Java never fuses `a * b + c` on its own. WebAssembly's numerics chapter defines `fma`, and relaxed SIMD's `relaxed_madd` uses it: "the intermediate `a * b` is be rounded first, and the final result rounded again (for a total of 2 roundings), or... the entire expression evaluated with higher precision and then only rounded once (if supported by hardware)". The proposal says "two calls to the same instruction can return different results" across environments ([relaxed SIMD overview](https://github.com/WebAssembly/relaxed-simd/blob/main/proposals/relaxed-simd/Overview.md)). A kernel that must match Java uses plain `f32x4.mul` and `f32x4.add`, never relaxed SIMD. (Read.)
- **C compilers contract by default.** Apple clang 21 compiled `float f(float a, float b, float c) { return a * b + c; }` to `fmadd s0, s0, s1, s2` at `-O2` on arm64, and to `fmul` and `fadd` with `-ffp-contract=off`. rustc 1.100 emitted `fmul` and `fadd` by default. scriptc's output for the fused kernel kept `fmul s` and `fadd s` separate. The earlier note's warning that "`-ffp-contract=off` or its equivalent is mandatory" ([parallel-chunk-generation-in-node.md](parallel-chunk-generation-in-node.md)) holds on this toolchain. (Run.)
- **Transcendental functions.** WebAssembly has no `log`, `sin` or `pow`. Java's `Math` is not bit-exact: "all implementations of the equivalent functions of class `Math` are not defined to return the bit-for-bit same results", and `Math.log` "must be within 1 ulp" ([`java.lang.Math`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Math.html)). Worldgen calls `Math.log` for the density `log` operation (`compile.ts:126`, `778` and `1441`). Java's own trigonometry in carvers is a table (`packages/worldgen/src/carver/trig.ts`, "Java's `Mth.sin`: a table lookup"). A kernel has to bring its own `log`, and the same one on every platform, or call back to the host for it. Which `log` HotSpot uses on a given platform is a parity question this note does not answer. (Read.)
- **Rounding a sum of products once.** JavaScript evaluates `f32(a * b + c * d)` in double and rounds once. Java's `float` expression rounds each product and the sum. They agree only when the products are exact in float. In `packages/worldgen/src/noise/PerlinNoise.ts` the gradient components are -1, 0 or 1, so the products are exact and the code matches Java. A port has to round each step the way Java does, not the way the JavaScript happens to. (Read.)
- **Operation order.** The earlier WebAssembly experiment differed from JavaScript in the last digits until its expression tree matched term by term ([parallel-chunk-generation-in-node.md](parallel-chunk-generation-in-node.md)). The fused kernel here, generated in C from the same tree as the TypeScript, gave the same checksum, `11431143.1902506`, on every runtime and build. (Read and run.)

### SIMD

`f32x4` arithmetic is lane-wise IEEE, the same as the scalar operations, apart from NaN payloads and the relaxed instructions above. Node.js and Bun ran both kinds of module, and scriptc refuses SIMD. Recompiling the scalar C kernel with `-msimd128`, which lets clang auto-vectorize, ran slower on both Node.js (21.4 against 13.7 ns per sample) and Bun (17.4 against 13.7). A SIMD kernel has to be designed around 4-wide batches, not left to the auto-vectorizer. (Run.)

### Sharing a noise table across workers

On Node.js and Bun, one `WebAssembly.Memory({ shared: true })` and one compiled `WebAssembly.Module` can go to every worker, and each worker instantiates the module against the shared memory (run). Permutation tables and other per-seed tables can be written once and read by every instance. scriptc cannot do this: it throws on shared memories, and each instance owns its memory (read and run). Under scriptc the alternatives are a table in C memory behind the FFI, or a `@scriptc/threads` published graph read by TypeScript.

### Toolchains

- C through clang: Apple clang 21 built a `wasm32` module with `--target=wasm32 -nostdlib -Wl,--no-entry -Wl,--export=chunk_sum`, linked by Homebrew's `wasm-ld`. (Run.)
- Rust: `wasm32-unknown-unknown` is in `rustc --print target-list`, and `wasm32-wasip2` is installed here. `wasip2` emits a component, which `WebAssembly.instantiate` does not load. Rust was not built to WebAssembly here. (Run.)
- AssemblyScript and Zig also target `wasm32`. They were not tried.
- scriptc itself, from TypeScript, in library mode with zig (section 1). Not tried.

### Can scriptc load WebAssembly?

Yes, with limits. It loads scalar WebAssembly 2.0 modules whose bytes it sees at build time and runs them as native code. It cannot load SIMD or threaded modules, cannot share their memory, and calls into them from TypeScript are dynamic and slow (57.6 ns). The scriptc alternative for a fast kernel is its FFI to a statically linked C library, at 0.93 ns per scalar call. (Read and run.)

## 5. Native code through the C ABI

### The pattern this repository already has

ADR 0006 and ADR 0023 bind one C layer through `node:ffi`, `bun:ffi` and scriptc's FFI. The package carries a manifest of per-platform builds with SHA-256 digests, and a `postinstall` downloads the one the machine needs. CI builds each platform on a native runner (musl in an Alpine container), and the scriptc build links static archives instead. The platform list is macOS on Apple Silicon, Windows x64, and Linux x64 and arm64 against glibc and musl, with Windows arm64 dropped because scriptc has no build for it ([ADR 0006](../adr/0006-libdatachannel-for-nethernet-server.md#platforms-and-distribution)). The research for it is [scriptc-libdatachannel.md](scriptc-libdatachannel.md). (Read.)

### What a kernel library would need

- **Builds.** The same CI matrix and manifest as ADR 0006: shared libraries for `node:ffi` and `bun:ffi`, and static archives for scriptc. A pure compute library with no dependencies is far smaller than libdatachannel. Each platform needs `-ffp-contract=off` and no fast-math flags, and a parity test should compare the per-platform builds' outputs bit for bit.
- **SIMD.** NEON on arm64 and SSE or AVX on x86-64, chosen at build or run time. The scalar code path stays the reference that the parity test checks the vector paths against.
- **Threads.** No callbacks and no threads of its own. Each worker thread calls the kernel directly, which worked on all three runtimes (section 1 to 3). Per-call state lives in buffers the caller registers. Read-only tables built once per seed can live in C memory, which all threads see. They need initializing before the workers read them, or under a once-guard.
- **Signatures.** Scalars only on the hot calls, because `node:ffi` loses its fast path with a typed array beside a float. Buffers are registered once and named by integer handles afterwards.
- **Granularity.** One crossing per unit of work that is large next to 3 to 6 ns: a chunk section, a cell column, or a batch of positions. Never one per density sample.

### Per-call overhead on this machine

The best of 9 rounds of 1,000,000 calls to a scalar `(f64, f64) -> f64` add. Load average 3.30 before the pass and 3.12 after it. Indicative only. (Run.)

| Path | Node.js 26.12.1 | Bun 1.4.4 | scriptc 0.4.14 |
| --- | --- | --- | --- |
| Plain function (inlinable) | 0.93 ns | 0.98 ns | below timer resolution; LLVM collapsed the loop |
| WebAssembly export | 2.72 ns | 5.59 ns | 57.58 ns |
| FFI, scalars | 3.45 ns (`node:ffi`) | 5.80 ns (`bun:ffi`) | 0.93 ns |
| FFI, 16-float buffer | 38.8 to 102.0 ns | 3.32 to 3.85 ns | 4.16 ns |
| Node-API addon | 22.64 ns | 40.15 ns | not supported |

## 6. What ahead-of-time compilation would and would not fix

### The current design

`DensityCompiler.build` in `packages/worldgen/src/density/compile.ts` turns each density node into a closure that calls its children's closures with `(context, x, y, z)`, and `buildGenerated` concatenates pure arithmetic into a `new Function` source when the host allows it (`compile.ts:701-745`). Every arithmetic result passes through `f32`, the `Math.fround` alias. `PerlinNoise.sampleAndLerp` spells out its eight gradient dot products and seven interpolations with an `f32` on each step (`packages/worldgen/src/noise/PerlinNoise.ts:49-132`). A sample is a walk of the tree, with an indirect call per node that is not inlined into its parent, and a scalar evaluation per position. (Read.)

### The experiment

A generator writes one expression tree of depth 4: 16 leaves, each a small `fround`ed linear function of `x`, `y` and `z`, joined by 15 `add`, `mul` and `max` operators, about 95 operations. It evaluates the tree at one chunk's 98,304 positions in two ways: as 31 closures composed at run time, in `compile.ts`'s shape, and as one generated function with the same operations in the same order. Both gave the same checksum on every runtime. Load average 3.30 before the pass. (Run.)

| Runtime | Closure tree | Fused function | Fused, `fround` through an imported alias |
| --- | --- | --- | --- |
| Node.js 26.12.1 | 16.25 ns/sample | 22.83 | 23.49 |
| Bun 1.4.4 | 48.01 | 15.57 | 15.86 |
| Bun 1.4.4, `--compile --bytecode` | 57.11 | 15.30 | not run |
| scriptc 0.4.14 | 63.51 | 6.50 | 37.85 |
| C, scalar WebAssembly, on Node.js / Bun | | 13.71 / 13.67 | |
| C, scalar WebAssembly translated by scriptc | | 6.81 | |
| C through scriptc's FFI | | 6.99 | |

Node.js ran the closure tree faster than the fused function. This note did not find out why, and release Node.js cannot print its optimized code to check. Treat that row as "V8 handles this tree well", not as a rule.

### What an ahead-of-time compiler can remove

- **Per-operation costs whose answer is in the source.** A direct `Math.fround` became single-precision arithmetic under LLVM. Typed array access became native loads, and the fused function ran 2.4 to 3.5 times as fast as under either JIT here.
- **Startup and warm-up.** There is no tier-up, and no deoptimization when a call site sees a new shape.

### What it cannot remove

- **Dispatch over a graph that is data.** The density graph comes from datapack JSON when the server starts. A compiler that runs before the program does cannot inline or specialize calls whose targets it never sees. Under scriptc, the 31-closure tree cost 9.8 times the fused function, about 1.8 ns per closure call. A JIT can inline the targets it observes at run time, which is why the tree costs Node.js less than it costs scriptc. Better compilation of the same design moves this number only a little. Changing the design moves it a lot.
- **Scalar evaluation.** One position per tree walk gives no compiler a loop to vectorize. JavaScript has no SIMD type, so only WebAssembly SIMD or C can use vector units, and only if the evaluator runs each node over a batch of positions.
- **Aliased built-ins.** `f32 = Math.fround` cost scriptc 5.8 times on the fused kernel. This one is a source change, but no compiler setting fixes it.

### What follows for the design

1. Evaluate by node over a batch of positions, not by tree per position. One dispatch per node per batch makes dispatch cost proportional to nodes rather than to samples. The inner loops become monomorphic loops over typed arrays, which every runtime compiles well and which C or WebAssembly can vectorize. `compile.ts` already has a volume plan (`CompiledDensityVolumeEvaluator`) of this kind.
2. For the vanilla graph, generate TypeScript at build time instead of `new Function` at run time. It works on all three runtimes, gives scriptc the fused function, and leaves the closure path for custom datapacks.
3. Call `Math.fround` directly in hot code. A lint rule could enforce it.
4. If the kernel moves to C, keep the boundary coarse and the signatures scalar, as section 5 describes.

### Deterministic proxies to measure instead of time

AGENTS.md asks for a proxy before work starts on a target written in time. For this rearchitecture, a test can count these on every machine:

- Indirect calls per density sample: the number of tree nodes not fused into their parent, read off the compiled plan.
- Boundary crossings per chunk into WebAssembly or FFI, counted by a wrapper in tests.
- `fround` operations per sample, and float operations per sample, counted by an instrumented evaluator or from the generated source.
- Positions per dispatch: samples evaluated per node visit, which batching raises from 1.

Assertions on these ("at most one crossing per section", "no more than N indirect calls per sample for the vanilla overworld") can gate CI. The timings in this note cannot.

## Comparison matrix

Support status and per-call overhead for a scalar `(f64, f64) -> f64` call, from section 5's table. "Kernel speed" is the fused kernel from section 6 where it was measured. All timings are indicative.

| Strategy | Node.js 26.12.1 | Bun 1.4.4 (also `--compile`) | scriptc 0.4.14 |
| --- | --- | --- | --- |
| Plain TypeScript | Yes. Call 0.93 ns. Fused kernel 22.8 ns/sample, closure tree 16.3. `fround` stays float64 with conversions. `new Function` works. | Yes. Call 0.98 ns. Fused 15.6, tree 48.0. `fround` chains narrowed to float. `new Function` works. | Yes. Fused 6.5, tree 63.5. Direct `Math.fround` narrowed to float; an alias costs a guarded call. No `eval` or `new Function`. |
| WebAssembly (scalar) | Yes. Call 2.72 ns, wrapper and body inlined by TurboFan. Kernel 13.7 ns/sample. | Yes. Call 5.59 ns. Kernel 13.7 ns/sample. | Partly. Only bytes seen at build time, WebAssembly 2.0 features, instances never freed. Call 57.6 ns (dynamic). Kernel 6.8 ns/sample, equal to native. |
| WebAssembly SIMD | Yes, including relaxed SIMD. Shared memory and modules posted to workers work. | Yes, including relaxed SIMD. Shared memory and modules posted to workers work. | No. SIMD modules are not translated, and shared memories throw a `TypeError`. |
| C ABI through FFI | Yes, `node:ffi`, experimental, on by default. Scalars 3.45 ns. A typed array costs 39 to 102 ns. Works in workers. | Yes, `bun:ffi`, experimental, "not for production". Scalars 5.80 ns, typed array 3.3 to 3.9 ns. Works in workers. | Yes, static link only, direct calls only. Scalars 0.93 ns, `bytes` 4.16 ns. Works in workers. Kernel 7.0 ns/sample. |
| Node-API | Yes. 22.6 ns. | Yes, reimplemented by Bun. 40.2 ns. | No. Addons are rejected. A Node island runs one in a Node.js inside the process, at the cost of shipping libnode. |

## Reproduction

The scratch files live outside the repository. Recreate them under any empty directory, `$EXP` below. Record `uptime` before each run and report the figures as indicative.

### scriptc in this worktree

`pnpm exec scriptc build` failed here with "SC3004: TypeScript server startup: Permission denied". The bundled `tsc` and `tsc-ts` binaries under `node_modules/.pnpm/@scriptc+cli-darwin-arm64@0.4.14/.../dist/lib/` had no execute bit, although scriptc's `postinstall` (`scripts/install-native.mjs`) runs `chmodSync(..., 0o755)` on them. To leave `node_modules` alone, the experiments used a copy of the toolchain:

```sh
W=$(git rev-parse --show-toplevel); P=$W/node_modules/.pnpm; SC=$EXP/sc
mkdir -p $SC/bin $SC/ts7 $SC/tscts
cp $P/scriptc@0.4.14/node_modules/scriptc/bin/scriptc.exe $SC/bin/
cp -R $P/@scriptc+cli-darwin-arm64@0.4.14/node_modules/@scriptc/cli-darwin-arm64/dist/lib/typescript/lib/. $SC/ts7/
cp -R $P/@scriptc+cli-darwin-arm64@0.4.14/node_modules/@scriptc/cli-darwin-arm64/dist/lib/tsc-ts/lib/. $SC/tscts/
chmod +x $SC/ts7/tsc $SC/tscts/tsc-ts
# Rewrite the manifest's relative paths as absolute ones and point ts7 and tsc_ts at the copies.
node -e '
const fs=require("fs"),path=require("path");const [src,dst,ts7,tscts]=process.argv.slice(1);
const m=JSON.parse(fs.readFileSync(src));const base=path.dirname(src);
for(const k of Object.keys(m)) if(typeof m[k]==="string"&&m[k].startsWith("../")) m[k]=path.resolve(base,m[k]);
m.runtime_packs=m.runtime_packs.map(r=>({...r,path:path.resolve(base,r.path)}));m.ts7=ts7;m.tsc_ts=tscts;
fs.writeFileSync(dst,JSON.stringify(m,null,2));' \
  $P/scriptc@0.4.14/node_modules/scriptc/bin/scriptc.exe.json $SC/bin/scriptc.exe.json $SC/ts7/tsc $SC/tscts/tsc-ts
alias scriptc=$SC/bin/scriptc.exe
```

### Documentation and engine sources

```sh
curl -sL https://scriptc.dev/llms.txt -o llms.txt                        # How it works, FFI, limitations, threads, wasm
curl -sL https://nodejs.org/docs/v26.12.1/api/ffi.md -o node-ffi.md
curl -sL https://raw.githubusercontent.com/oven-sh/bun/bun-v1.4.4/docs/bundler/executables.mdx -o executables.mdx
curl -sL https://raw.githubusercontent.com/oven-sh/bun/bun-v1.4.4/docs/bundler/bytecode.mdx -o bytecode.mdx
curl -sL https://bun.com/docs/runtime/ffi.md -o bun-ffi.md
curl -sL https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/b3/B3ReduceDoubleToFloat.cpp -o B3ReduceDoubleToFloat.cpp
for f in src/compiler/simplified-lowering.cc src/compiler/machine-operator-reducer.cc \
         src/compiler/turboshaft/machine-optimization-reducer.h src/flags/flag-definitions.h; do
  curl -sL "https://raw.githubusercontent.com/v8/v8/14.6.202.34/$f" -o "$(basename $f)"; done
grep -n "kNumberFround" -A4 simplified-lowering.cc
grep -n "IsFloat32ConvertedToFloat64" machine-optimization-reducer.h
grep -n "turbo_inline_js_wasm_calls, true" flag-definitions.h
```

### `fround` lowering

```sh
cat > fround-asm2.mjs <<'EOF'
const f = Math.fround;
function k(a0, b0, c0) { const a = f(a0), b = f(b0), c = f(c0); return f(f(f(a * b) + c) * a); }
let s = 0;
for (let i = 0; i < 2e6; i++) s += k(i * 0.001, 0.5, 0.25);
console.log(s);
EOF
BUN_JSC_useConcurrentJIT=false BUN_JSC_dumpFTLDisassembly=true bun fround-asm2.mjs 2>&1 \
  | awk '/Generated FTL code for k#/,/Generated FTL code for \//' | grep '^Air' | grep -E 'Float|Double'
# expect MulFloat, AddFloat, MulFloat

cat > fround.ts <<'EOF'
const f = Math.fround;
function k(a0: number, b0: number, c0: number): number { const a = f(a0), b = f(b0), c = f(c0); return f(f(f(a * b) + c) * a); }
function k2(a0: number, b0: number, c0: number): number {
    const a = Math.fround(a0), b = Math.fround(b0), c = Math.fround(c0);
    return Math.fround(Math.fround(Math.fround(a * b) + c) * a);
}
let s = 0;
const n = Number(process.argv[2] ?? "2000000");
for (let i = 0; i < n; i++) s += k(i * 0.001, 0.5, 0.25) + k2(i * 0.002, 0.5, 0.25);
console.log(s);
EOF
scriptc build fround.ts --emit=llvm && grep -n -A30 'define internal double @sc_f_k2' .scriptc/fround.ll   # fptrunc/fpext
scriptc build fround.ts --emit=asm && grep -nE 'fmul|fadd|fcvt' .scriptc/fround.s                         # fmul s / fadd s for k2
printf 'float f(float a, float b, float c) { return a * b + c; }\n' > fma.c
clang -O2 -S -o - fma.c | grep -E 'fmadd|fmul|fadd'                    # fmadd
clang -O2 -ffp-contract=off -S -o - fma.c | grep -E 'fmadd|fmul|fadd'  # fmul, fadd
```

### Call overhead

```c
// add.c
double native_add(double a, double b) { return a + b; }
double native_sum_f32_i(const unsigned char *bytes, int count) {
    const float *data = (const float *)bytes; double s = 0;
    for (int i = 0; i < count; i++) s += data[i];
    return s;
}
double native_sum_f32_bytes(const unsigned char *bytes, unsigned long length) { return native_sum_f32_i(bytes, (int)(length / 4)); }
double native_sum16(const float *data) { double s = 0; for (int i = 0; i < 16; i++) s += data[i]; return s; }
```

```c
// napi_add.c
#include <node_api.h>
static napi_value Add(napi_env env, napi_callback_info info) {
    size_t argc = 2; napi_value args[2]; double a, b; napi_value out;
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    napi_get_value_double(env, args[0], &a); napi_get_value_double(env, args[1], &b);
    napi_create_double(env, a + b, &out); return out;
}
NAPI_MODULE_INIT() { napi_value fn; napi_create_function(env, "add", NAPI_AUTO_LENGTH, Add, NULL, &fn);
    napi_set_named_property(env, exports, "add", fn); return exports; }
```

```sh
INC=$(dirname $(readlink -f $(which node)))/../include/node
clang -O2 -shared -fPIC add.c -o libadd.dylib
clang -O2 -c add.c -o add.o && ar rcs libadd.a add.o
clang -O2 -shared -fPIC -undefined dynamic_lookup -I$INC napi_add.c -o napi_add.node
```

```js
// bench-common.mjs
export const N = 1_000_000;
export const ROUNDS = 9;
// (f64, f64) -> f64 add, exported as "add".
export const WASM_ADD = new Uint8Array([0x00,0x61,0x73,0x6d,0x01,0x00,0x00,0x00, 0x01,0x07,0x01,0x60,0x02,0x7c,0x7c,0x01,0x7c,
  0x03,0x02,0x01,0x00, 0x07,0x07,0x01,0x03,0x61,0x64,0x64,0x00,0x00, 0x0a,0x09,0x01,0x07,0x00,0x20,0x00,0x20,0x01,0xa0,0x0b]);
export function report(name, loop) {
    let best = Infinity, check = 0;
    for (let r = 0; r < ROUNDS; r++) { const t0 = performance.now(); check = loop(); const dt = performance.now() - t0; if (dt < best) best = dt; }
    console.log(`${name.padEnd(22)} ${(best * 1e6 / N).toFixed(2).padStart(8)} ns/call  (checksum ${check})`);
}
```

```js
// calls-node.mjs; calls-bun.mjs is the same with bun:ffi's dlopen(path, { native_add: { args: ['f64','f64'], returns: 'f64' } }).symbols
import { createRequire } from 'node:module';
import ffi from 'node:ffi';
import { N, WASM_ADD, report } from './bench-common.mjs';
const require = createRequire(import.meta.url);
function jsAdd(a, b) { return a + b; }
const wasm = (await WebAssembly.instantiate(WASM_ADD)).instance.exports;
const ffiAdd = ffi.dlopen(new URL('./libadd.dylib', import.meta.url).pathname,
  { native_add: { arguments: ['f64', 'f64'], return: 'f64' } }).functions.native_add;
const napi = require('./napi_add.node');
report('plain JS (inlinable)', () => { let s = 0; for (let i = 0; i < N; i++) s = jsAdd(s, 0.5); return s; });
report('WebAssembly export', () => { let s = 0; for (let i = 0; i < N; i++) s = wasm.add(s, 0.5); return s; });
report('node:ffi', () => { let s = 0; for (let i = 0; i < N; i++) s = ffiAdd(s, 0.5); return s; });
report('N-API addon', () => { let s = 0; for (let i = 0; i < N; i++) s = napi.add(s, 0.5); return s; });
```

The scriptc version (`calls.ts`) declares `declare function nativeAdd(a: number, b: number): number;`, builds the same module with `new WebAssembly.Instance(new WebAssembly.Module(WASM_ADD), {})`, reads an increment from `process.argv.length` so the loop is not constant, and uses this manifest:

```json
{ "ffi_format": 1, "functions": [ { "name": "nativeAdd", "symbol": "native_add", "params": ["f64", "f64"], "returns": "f64" } ],
  "libraries": ["../libadd.a"], "system_libraries": [] }
```

```sh
uptime; node --no-warnings calls-node.mjs; bun calls-bun.mjs
scriptc build calls.ts --ffi ffi.json -o calls && ./calls
scriptc coverage calls.ts --ffi ffi.json    # "in dynamic tier 3"
```

The buffer rows pass `new Uint8Array(new Float32Array(16).fill(0.5).buffer)` to `native_sum_f32_i` as `['buffer', 'i32']` and as `['pointer', 'i32']` with `ffi.getRawPointer(bytes)`, to `native_sum16` as `['buffer']` on Node.js, to `native_sum_f32_i` as `[FFIType.ptr, FFIType.i32]` with and without `ptr(bytes)` on Bun, and to `native_sum_f32_bytes` as `"params": ["bytes"]` on scriptc.

### Workers

```sh
# node:ffi and bun:ffi: four workers each dlopen libadd.dylib and make 1,000,000 calls; expect "500000" four times.
node --no-warnings worker-ffi-node.mjs; bun worker-ffi-node.mjs
# scriptc: worker-ffi.ts creates new Worker(new URL(import.meta.url)) four times; each calls nativeAdd 1,000,000 times.
scriptc build worker-ffi.ts --ffi ffi.json -o worker-ffi && ./worker-ffi
# shared-mem.mjs: one WebAssembly.Memory({ initial: 1, maximum: 1, shared: true }) and one module importing env.mem,
# posted as workerData to two workers that each f32.store four values.
node shared-mem.mjs; bun shared-mem.mjs
```

### WebAssembly features

```js
// wasm-features.mjs: validate one module per feature on Node.js and Bun.
const hdr = [0x00,0x61,0x73,0x6d,0x01,0x00,0x00,0x00];
const f32f32 = [0x01,0x06,0x01,0x60,0x01,0x7d,0x01,0x7d, 0x03,0x02,0x01,0x00];
const simd128 = [...hdr, ...f32f32, 0x0a,0x0b,0x01,0x09,0x00,0x20,0x00,0xfd,0x13,0xfd,0x1f,0x00,0x0b];          // f32x4.splat, extract_lane 0
const relaxed = [...hdr, ...f32f32, 0x0a,0x16,0x01,0x14,0x00,0x20,0x00,0xfd,0x13,0x20,0x00,0xfd,0x13,0x20,0x00,0xfd,0x13,
                 0xfd,0x85,0x02,0xfd,0x1f,0x00,0x0b];                                                                  // f32x4.relaxed_madd
const shared = [...hdr, 0x05,0x04,0x01,0x03,0x01,0x01];                                                                // shared memory 1..1
for (const [n, b] of Object.entries({ simd128, relaxed, shared })) console.log(n, WebAssembly.validate(new Uint8Array(b)));
```

The scriptc probe (`features.ts`) builds `simd128` and `shared` as `Uint8Array` literals, prints `WebAssembly.validate` for each, and wraps `new WebAssembly.Module(SIMD)` in a `try`. A second file calling `new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true })` builds and throws at run time.

### The closure tree and the fused kernel

```js
// tree/gen.mjs writes tree.ts
const OPS = ['add', 'mul', 'max'];
let leafId = 0;
function fused(d) {
    if (d === 0) { const k = ++leafId; return `Math.fround(Math.fround(x * ${(0.01 * k).toFixed(2)}) + Math.fround(z * ${(0.02 * k).toFixed(2)}) - y * 0.001)`; }
    const op = OPS[d % 3]; const l = fused(d - 1), r = fused(d - 1);
    if (op === 'add') return `Math.fround(${l} + ${r})`;
    if (op === 'mul') return `Math.fround(${l} * ${r})`;
    return `Math.max(${l}, ${r})`;
}
const body = fused(4);
const src = `type Sampler = (x: number, y: number, z: number) => number;
function leaf(k: number): Sampler {
    const a = 0.01 * k, b = 0.02 * k;
    const fa = Number(a.toFixed(2)), fb = Number(b.toFixed(2));
    return (x, y, z) => Math.fround(Math.fround(x * fa) + Math.fround(z * fb) - y * 0.001);
}
function add(l: Sampler, r: Sampler): Sampler { return (x, y, z) => Math.fround(l(x, y, z) + r(x, y, z)); }
function mul(l: Sampler, r: Sampler): Sampler { return (x, y, z) => Math.fround(l(x, y, z) * r(x, y, z)); }
function max(l: Sampler, r: Sampler): Sampler { return (x, y, z) => Math.max(l(x, y, z), r(x, y, z)); }
const OPS = [add, mul, max];
let next = 0;
function build(d: number): Sampler { if (d === 0) return leaf(++next); const op = OPS[d % 3]!; const l = build(d - 1); const r = build(d - 1); return op(l, r); }
function fusedSample(x: number, y: number, z: number): number { return ${body}; }
const tree = build(4);
const SAMPLES = 16 * 16 * 384;
function runTree(): number { let s = 0; for (let i = 0; i < SAMPLES; i++) s += tree(i & 15, i >> 8, (i >> 4) & 15); return s; }
function runFused(): number { let s = 0; for (let i = 0; i < SAMPLES; i++) s += fusedSample(i & 15, i >> 8, (i >> 4) & 15); return s; }
function report(name: string, run: () => number): void {
    let best = Infinity; let check = 0;
    for (let r = 0; r < 40; r++) { const t0 = performance.now(); check = run(); const dt = performance.now() - t0; if (dt < best) best = dt; }
    console.log(name.padEnd(28) + (best * 1e6 / SAMPLES).toFixed(2).padStart(8) + ' ns/sample  checksum ' + check);
}
report('closure tree (31 closures)', runTree);
report('fused function', runFused);
`;
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./tree.ts', import.meta.url), src);
```

```sh
node tree/gen.mjs && cd tree
uptime; node --no-warnings tree.ts; bun tree.ts
bun build --compile --bytecode tree.ts --outfile tree-bun && ./tree-bun
BUN_JSC_reportFTLCompileTimes=true ./tree-bun 2>&1 | grep -c 'using FTL'
scriptc build tree.ts -o tree && ./tree
# The alias variant: the same file with every Math.fround replaced by f32, imported from math.ts.
echo 'export const f32 = Math.fround;' > math.ts
{ echo "import { f32 } from './math.ts';"; sed 's/Math\.fround/f32/g' tree.ts; } > tree-alias.ts
scriptc build tree-alias.ts -o tree-alias && ./tree-alias; node --no-warnings tree-alias.ts; bun tree-alias.ts
```

### The kernel in C, as WebAssembly and native

`kern/gen.mjs` emits the same tree in C, rounding each step the way the TypeScript does: a leaf is `(float)((double)(float)(x * a) + (double)(float)(z * b) - y * 0.001)`, `add` and `mul` operate on two `float`s, and `max` is `a > b ? a : b`. `chunk_sum()` loops over the 98,304 positions and returns the `double` sum.

```sh
node kern/gen.mjs && cd kern
clang --target=wasm32 -O2 -ffp-contract=off -nostdlib -Wl,--no-entry -Wl,--export=chunk_sum -o scalar.wasm kernel.c
clang --target=wasm32 -O2 -msimd128 -ffp-contract=off -nostdlib -Wl,--no-entry -Wl,--export=chunk_sum -o simd.wasm kernel.c
clang -O2 -ffp-contract=off -c kernel.c -o kernel.o && ar rcs libkernel.a kernel.o
node run.mjs; bun run.mjs     # instantiate each .wasm from readFileSync, time chunk_sum() 40 times
# run-sc.ts loads scalar.wasm with readFileSync(new URL('./scalar.wasm', import.meta.url)) and declares chunkSum()
scriptc build run-sc.ts --ffi ffi.json -o run-sc && ./run-sc
```

### Density compiler coverage

```sh
scriptc coverage packages/worldgen/src/density/compile.ts   # 99% static; new Function at compile.ts:725 under "in unreached code"
```
