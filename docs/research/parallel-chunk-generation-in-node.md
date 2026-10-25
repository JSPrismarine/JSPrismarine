# Parallel chunk generation in Node

Researched 2026-10-25. Scope: what Node and TypeScript can do about chunk generation that is both too slow and blocking, measured on this machine rather than estimated. Covers the event loop freeze and why the existing `setImmediate` yields did not fix it, what `worker_threads` costs for chunk-shaped data, what can live in shared memory and what every worker must rebuild, the determinism hazards a multi-threaded generator has to rule out, prior art in JavaScript Minecraft servers and in Node generally, the throughput that is actually reachable on eight cores, and the alternatives to worker threads with their prices. A sibling note covers Java's own chunk status pipeline and threading model; this one does not repeat it.

Machine and versions for every number below: Apple M1 Pro, 6 performance cores plus 2 efficiency cores, 16 GiB, darwin/arm64 27.2.0; Node v26.12.1 with V8 14.6.202.34-node.40, which is what `.nvmrc` (`26.x`) selects and inside the `>=22.18.0` that the root `package.json` declares; deepslate 0.27.2 (MIT); piscina 5.3.2 (MIT); the Java 26.3 vanilla datapack and data generator reports from `node_modules/.cache/jsprismarine/`.

A warning that applies to every throughput number: this machine was not idle. Load average ranged from 36 to 158 across the session, with another JDK process at 207% CPU and concurrent Vitest runs. Micro-benchmarks that take microseconds survive that; parallel scaling measurements do not. Every scaling figure is the best of several repetitions, which is the closest approximation to an idle machine available, and the scaling section says where the number is probably pessimistic.

## Summary

- Ctrl+C cannot work during a blocked loop, by construction and in two independent ways. `packages/prismarine/src/Console.ts` calls `process.stdin.setRawMode(true)`, and Node's tty documentation says plainly: "Ctrl+C will no longer cause a SIGINT when in this mode." Measured under a pty: in raw mode Ctrl+C arrives as stdin byte 3 and no signal is raised; in cooked mode the same keypress raises SIGINT. So the only path to shutdown from a terminal runs through the event loop. Separately, `packages/server/src/Server.ts` installs a `process.on('SIGINT')` listener, and Node's process documentation says "If one of these signals has a listener installed, its default behavior will be removed". Measured: a process with no listener dies 2010 ms after `kill -INT` even mid-block; the same process with a listener ran its handler at 5303 ms, 3.3 seconds late, exactly when the block ended.
- Spamming Ctrl+C cannot force an exit from a terminal either. The force-exit escape (`forceExitTriggered` in `packages/server/src/Server.ts`) hangs off the SIGINT listener, which raw mode makes unreachable. The keypress path in `Console.ts` calls `server.shutdown()`, and `Server.shutdown` opens with `if (this.stopping) return;`, so the second Ctrl+C returns immediately and does nothing.
- One empty event loop turn costs 12.0 to 12.4 microseconds on this machine. Draining a batched immediate costs 0.05 to 0.25 microseconds and `process.nextTick` costs 0.07 to 0.12, so almost all of that 12 microseconds is the loop turn, not `setImmediate`. That explains the 14%-of-a-core measurement in this repository: duty cycle is `work / (work + 12.3 us)`, and 14% means about 2 microseconds of work between yields. The generator's current 4 ms time budget gives 99.7%.
- `setTimeout(fn, 0)` is not a cheap yield. Measured round trip: 1.32 milliseconds, 107 times the cost of `setImmediate`.
- A bare worker reaches `online` in 7.0 to 7.6 ms and sends its first message at 8.0 to 8.4 ms. Eight at once take 16 ms. Importing deepslate inside a worker adds 38 to 76 ms, and eight workers importing it concurrently take 133 ms.
- Sending a full 24-section column as one `Uint16Array` (192 KiB) costs 76 microseconds round trip when cloned and 18 microseconds when transferred, against a 14 microsecond floor for an empty message. The main thread spends 63 microseconds of CPU receiving a cloned column and 20 microseconds receiving a transferred one. The same column as a plain `number[]` of 98304 costs 1370 microseconds round trip and 1210 microseconds of main thread CPU, which is 65 times worse.
- Posting a fresh 192 KiB `SharedArrayBuffer` handle cost 42.5 microseconds against 42.4 for a 16-byte notification in the same run, so the handle itself is free. Writing 192 KiB into an already shared buffer costs 49 microseconds, about the same as transferring it. `SharedArrayBuffer` buys deterministic ownership, not speed, at this size.
- Registries do not have to be reparsed per worker from disk. Reading and parsing the 1514 documents per worker costs 430 to 573 ms each; handing every worker the same 2.66 MiB UTF-8 JSON bundle in a `SharedArrayBuffer` gets eight workers from spawn to parsed registries in 75 ms wall, 17 to 37 ms of parse each. `v8.deserialize` of a 3.01 MiB serialization took 163 ms for eight. Passing the parsed object graph through `workerData` is the worst option at 289 ms for eight, and that cost lands on the main thread because `workerData` is structured-cloned by the spawning thread.
- Compiled artifacts cannot be shared and must be rebuilt. In deepslate the rebuild is 358 ms: 102 ms to read and parse, 161 ms to build the multi-noise biome source from 7594 climate boxes, 88 ms for `new RandomState` (noise tables and router), 7 ms to register.
- Determinism across threads is not a problem in practice. Transcendental results, `a*b+c` without FMA contraction, object/Map/Set iteration order and `Array.prototype.sort` were bit-identical across the main thread and six workers, and identical again under `--no-opt`, `--jitless` and `--max-opt=0`. The real hazards are narrow and nameable: `Math.random` is seeded independently per isolate and differed in all seven, `localeCompare` orders identifiers differently from plain sort, and rewriting a kernel in another language reorders float operations.
- Peak aggregate throughput on this machine is about 4.7 times one thread, reached at 5 or 6 workers, and more workers do not help. Three runs agree: a float kernel peaked at 4.67 to 4.84 times, and real deepslate chunk generation reached 7.01 chunks/s with 6 workers against a clean single-thread 1.60 chunks/s, which is 4.4 times.
- The target is not reachable with workers alone. At 4.7 times, 50 chunks/s needs 94 ms per chunk per worker and 100 chunks/s needs 47 ms. deepslate takes 630 ms. That is a 6.7x to 13.4x algorithmic gap on top of parallelism. Once workers are in play the bottleneck is per-chunk CPU and nothing else: at 100 chunks/s the messaging costs 2 ms of main thread CPU per second, and task dispatch another 1.4 ms.
- WebAssembly ran the identical Perlin kernel 6.4 times faster than JavaScript and produced bit-identical results once the expression tree matched. The first attempt differed in the last two digits because the hand-written WAT computed `t*(t*(t*x))` where JavaScript computed `((t*t)*t)*x`. That reassociation is the entire determinism risk of a native or WASM rewrite.
- There is no prior art to copy. PrismarineJS has no `worker_threads`, `SharedArrayBuffer` or `Atomics` anywhere in flying-squid, prismarine-world or prismarine-chunk, and flying-squid's default generator is `diamond_square`, not Java parity. deepslate is a reference implementation, not a fast one: it looks corner values up in a `Map` keyed by a template string, which costs 108 ns per lookup against 3 ns for a flat `Float64Array` lattice, 85 ms versus 2 ms per chunk.

## 1. The event loop freeze

### Two separate reasons Ctrl+C does nothing

The server attaches a JavaScript listener to SIGINT. In `packages/server/src/Server.ts` (observed at commit `6fcceb243c`):

```ts
['SIGSEGV', 'SIGHUP', 'SIGINT', 'SIGTERM', 'uncaughtException'].forEach((signal) => {
    process.on(signal, async (error) => {
        if (forceExitTriggered) { process.exit(1); }
        forceExitTriggered = true;
        ...
        void server.shutdown({ crash: error === 'uncaughtException' });
    });
});
```

Node's process documentation (`nodejs.org/docs/latest-v26.x/api/process.json`, "Signal events") states the consequence: "'SIGTERM' and 'SIGINT' have default handlers on non-Windows platforms that reset the terminal mode before exiting with code 128 + signal number. If one of these signals has a listener installed, its default behavior will be removed. Signal events are emitted asynchronously".

Measured. A 5 second synchronous block, `kill -INT` at 2 seconds:

| Process | Result |
|---|---|
| no SIGINT listener | killed at 2010 ms, exit code 130 |
| `process.on('SIGINT', ...)` installed | handler ran at 5303 ms, 3303 ms after the signal |

Adding the listener traded a kernel-level kill for a userspace callback that cannot run while the loop is blocked.

The console makes it worse. `packages/prismarine/src/Console.ts` calls `process.stdin.setRawMode(true)` and then handles Ctrl+C as a readline keypress:

```ts
process.stdin.setRawMode(true);
...
this.cli.on('keypress', async (_, key) => {
    switch (key.name) {
        case 'c': { if (key.ctrl) { await this.server.shutdown(); } break; }
```

Node's tty documentation for `readStream.setRawMode(mode)` says: "all special processing of input characters by the terminal is disabled, including echoing input characters. Ctrl+C will no longer cause a SIGINT when in this mode." Verified under a real pty:

| Mode | What Ctrl+C produced |
|---|---|
| `setRawMode(true)` | `STDIN BYTES 3`. No signal. |
| default (cooked) | `^CGOT SIGINT`. The tty driver raised the signal. |

So when a terminal is attached, Ctrl+C is not a signal at all. It is one byte that the terminal hands to stdin, which libuv can only read on a poll phase, which a blocked loop never reaches. The kernel escape hatch that killed the listener-free process at 2010 ms above is switched off by `setRawMode`.

Spamming Ctrl+C does not help either, and this is a defect rather than a consequence. The `forceExitTriggered` branch that calls `process.exit(1)` on the second signal lives only on the SIGINT listener, which raw mode makes unreachable. The keypress path calls `server.shutdown()`, and `Server.shutdown` in `packages/prismarine/src/Server.ts` begins `if (this.stopping) return;`. Every Ctrl+C after the first returns immediately. If the first shutdown is itself waiting (it does `await this.console?.disable()` then `await this.disable()`, which saves worlds), the terminal has no remaining way to stop the process.

### Why the existing `setImmediate` yields did not fix it

An empty event loop turn is expensive on this machine. Measured three ways in the same process:

| Pattern | Cost |
|---|---|
| `setImmediate` chained, one per loop turn | 12 048 to 12 448 ns per turn |
| `setImmediate` x50000 scheduled at once, drained in one turn | 53 to 251 ns each |
| `process.nextTick` chained | 68 to 116 ns |
| same-thread `MessageChannel` ping-pong | 656 to 786 ns |
| `await Promise.resolve()` | 47 ns |
| `await new Promise(r => setTimeout(r, 0))` | 1 316 754 ns |

The batched number is 50 to 200 times cheaper than the chained one, so `setImmediate` itself is nearly free and the 12 microseconds is the loop turn around it: timers, pending callbacks, a kqueue poll, the check phase, close handles. Adding handles barely moves it. With a bound UDP socket, 20 idle TCP sockets, a resumed stdin and 5 repeating timers, the chained cost stayed between 13 036 and 15 261 ns.

That fixed 12.3 microsecond tax sets the duty cycle. If a loop does `W` microseconds of work between yields, it gets `W / (W + 12.3)` of a core:

| Work per yield | Measured duty cycle |
|---|---|
| 0.5 us, yield every unit | 3.6% |
| 50 us, yield every unit | 77.0% |
| 50 us, yield every 4 | 87.0% |
| 200 us, yield every 4 | 97.0% |
| 1000 us, yield every 4 | 99.1% |
| 50 us, yield every 100 | 98.7% |

The 14%-of-a-core result this repository already measured for a fill yielding every four columns sits on that curve at about 2 microseconds of work per yield, which is what four columns of a cheap fill costs. The comment now in `DataDrivenGenerator.ts` records the same conclusion and the current policy yields on a 4 ms time budget instead, which lands at 99.7% by the formula and 99.6% measured at 5 ms units.

So the yields are not the throughput problem any more. They are also not the responsiveness fix, for three reasons:

1. Yielding is per-phase, not per-generator. A yield inside the terrain column loop does nothing for the time spent in decoration, carvers, structure assembly or the chunk conversion, none of which yield. A 630 ms chunk that yields through its first 200 ms still blocks the loop for the other 430.
2. Generation is serialized behind one promise tail. Every chunk chains onto the previous one, so the queue drains at one chunk at a time no matter how often each chunk yields. 441 preload chunks at 630 ms is 4.6 minutes of tail regardless of yielding.
3. The shutdown path queues behind that same tail. A yield lets the keypress run, but the keypress calls `shutdown`, which awaits a world save, which is behind the generation queue. The console accepted the Ctrl+C and still appears dead.

### What actually fixes it

Moving the work to a worker fixes the loop immediately. Running the same 5 second block in a `Worker` instead of on the main thread kept the 100 ms liveness ticker on schedule throughout (gaps 99.7 to 102.8 ms) and the SIGINT handler ran at 1977.6 ms, 2 ms after the signal, against 3303 ms late for the synchronous case.

Stopping a busy worker is also fast. `worker.terminate()` interrupted a worker in a tight JavaScript loop in 2.1, 2.9 and 24.4 ms across three attempts. A `SharedArrayBuffer` cancel flag the worker polls every 10 000 iterations responded in 0.08 to 0.34 ms. Note that workers cannot receive signals: the worker_threads documentation states "Signals are not delivered through `process.on('...')`", so `terminate()` or a shared flag are the only two ways to stop one.

Independently of threading, two one-line changes are worth making. Give the raw-mode keypress handler the same force-exit escape the SIGINT listener has, so a second Ctrl+C can call `process.exit`. And leave a listener-free fallback so an external `kill -INT` still works.

## 2. What `worker_threads` costs for this workload

### Starting one

| What | to `online` | to first message |
|---|---|---|
| bare worker, sequential, 5 runs | 7.0 to 9.8 ms | 8.0 to 10.4 ms |
| 4 bare workers at once | | 9.2 ms wall |
| 8 bare workers at once | | 16.1 ms wall |
| 12 bare workers at once | | 21.6 ms wall |
| worker that imports deepslate, first | 7.2 ms | 84.2 ms (76.3 ms in the import) |
| worker that imports deepslate, warm | 6.7 to 7.0 ms | 46.1 to 46.5 ms (38 to 39 ms in the import) |
| 8 deepslate workers at once | | 132.7 ms wall |
| 12 deepslate workers at once | | 285.2 ms wall |

Setting `resourceLimits` did not change startup (`maxYoungGenerationSizeMb: 4` gave 7.3 ms, `maxOldGenerationSizeMb: 256` gave 7.1 ms, default 7.6 ms).

Eight idle workers added 40.8 MiB RSS, 5.1 MiB each. Eight workers each holding the full deepslate registries put the whole process at 668 MiB, about 80 MiB per worker.

Spawn cost is therefore irrelevant for a long-lived pool and matters only if the design respawns workers. It does not justify respawning per chunk, and it does not justify avoiding workers.

### Sending chunk-shaped data

A section is 4096 block entries, a column is 24 sections, so a column is 98 304 entries. As `Uint16Array` that is 8 KiB per section and 192 KiB per column, which is what `BlockStorage` already stores. Round trip means main to worker to main; the worker echoes the payload. Median of 100 to 2000 iterations.

| Payload | Round trip, structured clone | Round trip, transferred |
|---|---|---|
| empty message (one number) | 14.0 us | 15.5 us |
| one section, `Uint16Array` 8 KiB | 22.2 us | 14.0 us |
| one column, `Uint16Array` 192 KiB | 75.9 us | 17.8 us |
| one column as 24 separate `Uint16Array` views | 83.9 us | 45.5 us |
| one column packed at 4 bits per block, 48 KiB | 33.7 us | 14.5 us |
| one column as plain `number[]` of 98 304 | 1370.4 us | 1963.5 us |
| 24 `{y, palette[16], data}` objects | 293.1 us | 485.6 us |
| 1 MiB `Uint8Array` | 147.4 us | 38.0 us |
| 4 MiB `Uint8Array` | 376.9 us | 63.3 us |

Transfer is flat in size: 15 to 18 microseconds for 8 KiB and for 4 MiB, because only the backing store pointer moves. Cloning is linear: a 192 KiB column costs 62 microseconds above the empty-message floor, and 4 MiB costs 363.

What matters more than round trip is how much of that lands on the main thread, since that is what blocks the loop. Flooding one direction, worker to main, and measuring main thread CPU with `process.cpuUsage`:

| Payload | Main thread CPU per message | Sustained rate |
|---|---|---|
| column `Uint16Array` 192 KiB, cloned | 63 us | 22 420/s |
| column `Uint16Array` 192 KiB, transferred | 20 us | 75 621/s |
| column packed 4 bpb 48 KiB, cloned | 29 us | 57 385/s |
| column packed 4 bpb 48 KiB, transferred | 9 us | 185 085/s |
| 24 `{palette, data}` objects, cloned | 298 us | 4 927/s |
| column `number[]` of 98 304, cloned | 1210 us | 1 503/s |

At the 100 chunks/s target, transferred columns cost the main thread 2 ms of CPU per second, 0.2% of one core, or 100 microseconds out of each 50 ms tick. Cloned columns cost 6.3 ms/s. An object graph with per-section palettes costs 30 ms/s, 3%. A plain `number[]` costs 121 ms/s, 12%, and caps out at 1503 chunks/s before the main thread is saturated doing nothing but receiving.

The design consequence is narrow and clear. The worker must hand back flat typed arrays in a transfer list, and the palette must travel as something flat too (a single `Uint32Array` of runtime ids plus a length, not an array of objects). Node's documentation confirms what survives the trip: "non-enumerable properties, property accessors, and object prototypes are not preserved. In particular, `Buffer` objects will be read as plain `Uint8Array`s on the receiving side, and instances of JavaScript classes will be cloned as plain JavaScript objects." A `Chunk` or `SubChunk` instance cannot cross the boundary as itself.

### Structured clone against transfer against SharedArrayBuffer

In-process serialization costs, for reference, since they are the same machinery:

| Payload | `structuredClone` | `v8.serialize` | serialize + deserialize | `TypedArray.set` |
|---|---|---|---|---|
| section `Uint16Array` 8 KiB | 2.3 us | 3.1 us | 4.2 us | 0.13 us |
| column `Uint16Array` 192 KiB | 42.0 us | 16.9 us | 31.5 us | 5.15 us |
| column `number[]` 98 304 | 1347.5 us | 445.9 us | 1527.7 us | n/a |
| 1 MiB | 309.1 us | 172.6 us | 105.1 us | 22.12 us |

`SharedArrayBuffer` at this size does not pay for itself in copying terms. Measured in the same run: a 16-byte notification round trip cost 42.4 microseconds, posting a fresh 192 KiB `SharedArrayBuffer` handle cost 42.5, and writing 192 KiB into an already shared buffer with `.set` cost 49.3. Transferring an `ArrayBuffer` cost about the same. What `SharedArrayBuffer` actually buys is a different thing: a pre-allocated arena that neither side has to reallocate, and a place to put a work queue and a cancel flag that both threads can read without a message.

For that queue, wake-up latency:

| Mechanism | p50 | p10 | p90 |
|---|---|---|---|
| `Atomics.notify`, worker wakes, main sees the reply | 2.29 us | 2.13 us | 7.88 us |
| spin-waiting worker on a shared flag | 0.17 us | 0.13 us | 0.42 us |
| `postMessage` round trip, both event loops | 8.75 us | 8.00 us | 21.25 us |
| libuv thread pool round trip (`pbkdf2`, 1 round) | 10.63 us | 9.00 us | 18.75 us |

Node permits `Atomics.wait` on the main thread, unlike browsers (verified: `Atomics.wait(a, 0, 0, 50)` returned `timed-out` after 56 ms), and `Atomics.waitAsync` exists. Growable `SharedArrayBuffer` with `maxByteLength` also works. None of this matters at 100 chunks/s, where a 9 microsecond `postMessage` is already 0.09% of the per-chunk budget. It would matter for a design that crosses the boundary per section or per column rather than per chunk, and that design should not be built.

### Pool libraries

piscina 5.3.2 (MIT, no dependencies) built a pool of 6 in 17 ms and dispatched at 27.2 microseconds per task sequentially, 13.8 microseconds with 6 in flight, and 37.5 microseconds when the task returned a cloned 192 KiB `Uint16Array`. Against a 10 ms chunk that is 0.14% overhead. tinypool 2.2.0 is a fork of piscina with fewer features and is what Vitest uses. There is no throughput reason to hand-roll a pool.

## 3. What can be shared and what must be rebuilt

Nothing in a V8 heap can be shared between isolates. `SharedArrayBuffer` shares bytes, not objects, so the question for each input is whether a worker can rebuild it cheaply from shared bytes.

### The registries: share the bytes, parse per worker

The Java 26.3 data is 1514 documents across 17 registries, 5.2 MiB on disk for the worldgen tree plus `biome_parameters/overworld.json` (7594 climate boxes, 3.5 MiB on disk). Measured in fresh workers, with 1, 4 and 8 warming at once:

| How the worker gets the registries | 1 worker | 4 workers | 8 workers | parse inside the worker |
|---|---|---|---|---|
| `readFileSync` + `JSON.parse` per file | 616 ms | 363 ms | 540 ms | 320 to 573 ms |
| 2.66 MiB UTF-8 bundle in a `SharedArrayBuffer`, `TextDecoder` + `JSON.parse` | 30 ms | 60 ms | 75 ms | 17 to 37 ms |
| same bundle as a transferred `ArrayBuffer` | 30 ms | 67 ms | 84 ms | 16 to 40 ms |
| 3.01 MiB `v8.serialize` buffer, `v8.deserialize` | 29 ms | 54 ms | 163 ms | 19 to 79 ms |
| parsed object graph through `workerData` (structured clone) | 58 ms | 189 ms | 289 ms | 0 (the cost is in the spawn) |

Reading from disk per worker is the three-second problem the brief names, and it is avoidable. A single `SharedArrayBuffer` holding the concatenated JSON gets eight workers to parsed registries in 75 ms, 7.7 times faster than per-worker disk reads, and the bytes exist once in memory rather than eight times.

`v8.serialize` is slower here than JSON despite the folklore, and it produced a larger buffer (3.01 MiB against 2.66). Its advantage, preserving `Map` and `Set` instances, is not needed when the worker is going to compile the documents anyway.

Passing the parsed graph through `workerData` is the one option to avoid. The worker_threads documentation says `workerData` "is cloned as if using `postMessage()`, according to the HTML structured clone algorithm", and that clone runs on the spawning thread. At eight workers it cost 289 ms of main thread time, which is exactly the freeze the design is trying to remove.

Splitting the bundle is worth it if a worker does not need all of it. The 2.66 MiB bundle takes about 35 ms to parse; without `biome_parameters` it is 1.2 MiB and 9 ms, and `biome_parameters` alone is 1.4 MiB and 10 ms.

### The compiled artifacts: rebuild, and the rebuild is the real cost

Everything downstream of parsing is closures, typed arrays inside objects and prototype chains. None of it crosses an isolate boundary. Measured with deepslate against the same data:

| Step | Cost in one isolate |
|---|---|
| read and `JSON.parse` 243 worldgen documents plus the 7594 climate boxes | 90 to 102 ms |
| register noise, density function, material rule and material condition documents | 5 to 7 ms |
| `NoiseGeneratorSettings.fromJson(overworld)`, the density graph | under 1 ms |
| `MultiNoiseBiomeSource` from 7594 climate boxes | 145 to 345 ms |
| `new RandomState(settings, seed)`: noise tables and the router | 55 to 134 ms |
| `new NoiseChunkGenerator` | under 1 ms |
| total cold start | 296 to 857 ms |

Three facts follow.

The climate boxes are the single largest rebuild and the best candidate for sharing as bytes. 7594 entries of 7 numbers each is 53 158 doubles, 415 KiB as a `Float64Array` or 208 KiB as `Float32Array`, which a worker can map out of a `SharedArrayBuffer` with no parsing at all. Building the structure from JSON took 145 to 345 ms; mapping a typed array costs nothing. Whether the search structure over those boxes can also live in shared memory depends on its shape, which is an open question below.

`RandomState` is per seed, not per chunk, so its 55 to 134 ms is paid once per worker per world. A worker that serves one world pays it once at startup. A worker that must switch seeds pays it again, which argues for pinning workers to worlds.

The density function graph compiles to closures, which are per isolate by definition. Its parse is cheap (under 1 ms in deepslate); the expensive part is the noise tables that `RandomState` builds, already counted.

The block palette and the Java-to-Bedrock mapping tables were not measured here because the repository's versions were in flux during this session (see the open questions). Their shape makes the answer predictable: a flat `Uint32Array` of runtime ids indexed by a dense state id can live in a `SharedArrayBuffer` and be read by every worker with no rebuild; a `Map<string, number>` cannot and must be rebuilt, at a cost proportional to the number of entries.

### A worker warm-up budget that works

Putting the measured pieces together, a worker that receives shared registry bytes and shared climate boxes should reach its first chunk in roughly 8 ms to spawn, 40 ms to import the generator module graph, 35 ms to parse the shared bundle (less if split), and 90 to 140 ms to build `RandomState`, so about 200 ms. Eight such workers warming concurrently will take longer than one because they contend; the deepslate measurement says 133 ms for the import alone at eight. Call it 300 to 400 ms to a fully warm pool of six, paid once at server start, off the main thread. That is not a worker that is not worth having.

## 4. Determinism across workers

The project claims 1:1 Java parity and has a parity dashboard asserting it, so chunks must come out byte-identical regardless of thread count or scheduling order. Each hazard below was tested rather than reasoned about.

### What was measured and found safe

Hashing 200 000 iterations of `Math.sin`, `cos`, `pow`, `exp`, `log`, `atan2`, `cbrt`, `sqrt` and `tan` over an accumulating double, and hashing the raw bit patterns at every step:

| Hazard | Result |
|---|---|
| transcendental functions, main thread against 6 workers | identical |
| same, cold (interpreted) against hot (optimized) in one isolate | identical |
| same, `--no-opt`, `--jitless`, `--max-opt=0` against default | identical, all four hashes `44a7b95bbe531cf0...` |
| `a*b+c` repeated 200 000 times, main against 6 workers | identical, so V8 does not contract multiply-add into FMA |
| object, `Map` and `Set` iteration order, main against 6 workers | identical |
| `Array.prototype.sort` on namespaced ids, main against 6 workers | identical |
| deepslate chunk hashes for 24 positions generated under 1, 2, 4, 6, 8 and 10 workers | 0 mismatches |
| deepslate chunk hashes for 12 positions generated under 1, 2, 4, 6 and 8 workers | 0 mismatches |
| the 8-octave Perlin kernel accumulator across 1 to 12 workers, every configuration | identical in all runs |

V8 on one architecture with one build is deterministic for double arithmetic and for its fdlibm-derived transcendentals, and the optimization tier does not change results. Thread count does not change results. That removes the hazard class the brief was most worried about.

### What is actually dangerous

`Math.random` is seeded independently per isolate. The main thread and six workers produced seven distinct sequences, every one different. Any code path that reaches `Math.random` produces a different world depending on which worker ran it, and the difference is silent. This is the one hazard that must be mechanically excluded rather than tested for, because a test will pass until the day a decorator reaches for it. Two mechanisms are available. Shadow the global inside the worker entry point so a call throws instead of returning a number, and add a lint rule banning `Math.random` under the worldgen and generator packages. Everything random in Java worldgen is already a positional `Xoroshiro128++` or `LegacyRandom` derived from the seed, so there is nothing legitimate to break.

Collation differs from ordinal order. Measured on `['minecraft:Oak', 'minecraft:oak', 'minecraft:_oak', 'minecraft:oak_log', 'minecraft:oak-log']`:

```
plain sort:    minecraft:Oak | minecraft:_oak | minecraft:oak | minecraft:oak_log | minecraft:oak-log
localeCompare: minecraft:_oak | minecraft:oak | minecraft:Oak | minecraft:oak_log | minecraft:oak-log
```

Both are stable across threads, so this is not a threading bug. It becomes one when a registry built by sorting identifiers produces different palette indices in two places, and only a multi-threaded build will surface the mismatch. Sort identifiers with plain comparison, never `localeCompare`.

Integer-like keys jump the queue in objects. `Object.keys` on an object built in the order `['minecraft:stone', '10', 'b', '2', 'minecraft:air', '1', 'a']` returns `1, 2, 10, minecraft:stone, b, minecraft:air, a`. That is specified ES behavior, identical in every thread, and a trap only if ids are numeric strings. Use a `Map` where order carries meaning.

Reimplementing a kernel reorders float operations. The WebAssembly experiment in section 7 initially produced `427.9504238718113` where JavaScript produced `427.9504238718127`, a 1.4e-13 divergence after a million samples. The cause was one line: the WAT computed `t*(t*(t*x))` where the JavaScript computed `((t*t)*t)*x`. Floating-point multiplication is not associative. After matching the expression tree, both produced `427.9504238718127` exactly. Any port to WASM, Rust or C++ has to preserve operation order term by term, and the only way to know it did is a fixture test comparing bit patterns, not tolerances.

Shared mutable caches are a hazard the current design does not have but a worker design could acquire. deepslate's corner cache (`DensityFunction.Interpolated.values`, a `Map`) lives inside the function instance, so each worker's generator owns its own and no two threads touch one. That property must be preserved deliberately. A cache in a `SharedArrayBuffer` written by several workers would make results depend on arrival order unless every write is idempotent and every read is atomic, which is a lot of machinery for a cache. Keep caches thread-local and sized per chunk.

Chunk-position dependencies are the structural hazard. Anything that reads a neighboring chunk's state (carvers crossing boundaries, feature placement in a 3x3 region, structure pieces) makes the result depend on which chunks were generated first, and a worker pool makes that order non-deterministic by design. The fix is the one Java uses and the sibling note covers: a status pipeline where a chunk may only advance to a status when its neighbors have reached the status below, so each stage reads a frozen snapshot. That is a design requirement, not a measurement, and it is the main reason the worker boundary belongs around a status step rather than around "generate a chunk".

### How to prove it stays true

The cheapest regression test is the one used here: generate a fixed set of chunk positions under several worker counts and compare SHA-256 digests of the block states on a fixed lattice. It took 12 to 24 positions and under a minute to run, it found nothing because nothing was wrong, and it would have found anything on the list above except `Math.random` leakage in a code path the test does not reach. Pair it with a golden-chunk fixture that pins digests across commits, and the `Math.random` ban above.

## 5. Prior art

### JavaScript and TypeScript Minecraft implementations

PrismarineJS does not parallelize. A search of flying-squid (`fa02279`, 2026-03-31), prismarine-world (`f375ea9`, 2026-10-06) and prismarine-chunk (`a08dc2c`, 2026-10-06) for `worker_threads`, `new Worker(`, `SharedArrayBuffer`, `Atomics.`, `piscina` and `tinypool` returns nothing in any of them. prismarine-world's `src/world.js` is 3 files and its only concession to the event loop is `await Promise.resolve()` before `setLoadedColumn`. flying-squid defaults to `generation = { name: 'diamond_square', options: { worldHeight: 80 } }`, a toy heightmap generator, with `superflat` and `nether` as the alternatives. There is nothing here to copy for parallelism and nothing to copy for Java parity.

deepslate 0.27.2 is a correctness reference, not a performance one, and this note used it as the single-thread anchor precisely because it is a faithful port. Its cost structure is instructive. `NoiseChunkGenerator.doFill` computes `finalDensity` over the whole chunk volume and then walks all 98 304 blocks. The interpolation Java relies on is present but implemented like this:

```js
computeCorner(x, y, z) {
    return computeIfAbsent(this.values, `${x} ${y} ${z}`, () => {
        return this.input.compute(DensityFunction.context(x, y, z));
    });
}
```

Eight such lookups per block, each allocating a template string and hashing it into a `Map`, is 786 432 string-keyed lookups per chunk. Measured directly: 108 ns for the `Map` form against 3 ns for a flat `Float64Array` indexed by cell coordinates, 36.7 times, which is 85 ms against 2 ms per chunk. The 26.3 density function data has 13 `minecraft:interpolated` nodes and 32 `minecraft:cache` nodes, so the data is explicitly asking for a cell lattice and a per-column memo; deepslate implements the semantics and not the intent. A generator written for this repository should evaluate the interpolated subtree on the 5x5x49 corner lattice once and read it, not look corners up per block.

The existing note [cross-edition-worldgen-parity.md](cross-edition-worldgen-parity.md) reaches the same conclusion from the correctness side, and [storage-and-chunk-translation.md](storage-and-chunk-translation.md) already records that deepslate's `PalettedContainer` is a plain `number[]` of 4096 with a linear `findIndex` per write.

### Node projects that parallelize CPU-bound deterministic work

The pattern that recurs is a long-lived pool of workers over a task queue, with results returned as transferable buffers, and it is packaged rather than hand-rolled.

| Project | Mechanism | What is transferable to this problem |
|---|---|---|
| piscina 5.3.2 (MIT, zero dependencies) | `worker_threads` pool with a task queue and transfer support | Directly usable. 17 ms to build a pool of 6, 13.8 us dispatch at concurrency 6, measured above. |
| tinypool 2.2.0 (MIT), used by Vitest | a fork of piscina with fewer features | Same shape, smaller. Vitest itself defaults to `pool: 'forks'`, child processes, because test isolation matters more than startup cost. That reasoning does not apply here. |
| jest-worker 30.5.1 (MIT) | child processes by default, worker threads optional | The child-process default is about isolating user code that may leak state. Worldgen is this project's own code, so the heavier isolation is not worth its message costs. |
| workerpool 10.0.3 (Apache-2.0) | workers or child processes | Older API, no advantage over piscina here. |
| esbuild, SWC, Rolldown, Oxc | native binary or addon with its own thread pool (Go goroutines, Rust rayon), Node sees one async call | The relevant model for section 7's native option. Node's event loop is never involved in the parallelism. |
| sharp | libvips on the libuv thread pool, sized by `UV_THREADPOOL_SIZE` | The relevant model for a native addon that wants Node's existing pool. Measured floor for that round trip: 10.63 us p50. |

The gap between all of these and this problem is that none of them has a determinism requirement, and none of them has to share a 5 MiB parsed data set across workers. The first is a design constraint this note's section 4 covers. The second has no prior art in the Node ecosystem that this search found, because most CPU-bound Node work is per-file and stateless.

## 6. The honest ceiling

### Measured parallel scaling

An 8-octave improved Perlin kernel, the inner loop every density function is built from, allocation-free after setup, run in N workers simultaneously. Best of 9 repetitions of 1 000 000 samples per worker:

| Workers | Best wall | Aggregate M samples/s | Speedup | Results identical |
|---|---|---|---|---|
| 1 | 1036 ms | 0.97 | 1.00 | yes |
| 2 | 907 ms | 2.21 | 2.29 | yes |
| 4 | 997 ms | 4.01 | 4.15 | yes |
| 5 | 1071 ms | 4.67 | 4.84 | yes |
| 6 | 1291 ms | 4.65 | 4.81 | yes |
| 7 | 1609 ms | 4.35 | 4.51 | yes |
| 8 | 2072 ms | 3.86 | 4.00 | yes |
| 10 | 2131 ms | 4.69 | 4.86 | yes |

An earlier run at 4 000 000 samples and best of 5 gave the same shape: 1.00, 1.92, 2.85, 3.88, 4.37, 4.74 at six, then 4.70, 4.20 and a collapse at ten and twelve. Both runs put the peak at 4.7 to 4.9 times a single thread, reached at five or six workers, with nothing beyond.

The real workload agrees. deepslate `buildTerrain` for a fixed set of chunk positions, best of 2 per configuration:

| Workers | Best wall for 12 chunks | Chunks/s | Process RSS |
|---|---|---|---|
| 1 | 11 605 ms | 1.03 | 138 MiB |
| 2 | 7 654 ms | 1.57 | 227 MiB |
| 4 | 2 053 ms | 5.84 | 453 MiB |
| 6 | 1 712 ms | 7.01 | 677 MiB |
| 8 | 2 232 ms | 5.38 | 668 MiB |

The 1 and 2 worker rows of that table were hit by load spikes (per-chunk times of 1095 and 1263 ms against a clean 626 ms measured in-process), so the honest comparison is 7.01 chunks/s at six workers against the clean single-thread 1.60 chunks/s, which is 4.4 times. That matches the kernel's 4.7 within the noise of a machine at load average 87.

Why the peak is below eight. The M1 Pro has 6 performance cores and 2 efficiency cores, and the efficiency cores do a fraction of a performance core's work, so the arithmetic ceiling on an idle machine is closer to 6.5 to 7 than to 8. Each worker is also a full V8 isolate with its own garbage collector and compiler helper threads, so N workers ask for more than N threads. And this machine was carrying unrelated load throughout. The honest reading is that 4.7 is a floor for what the hardware can do and something near 6 is plausible on an idle machine, which does not change any conclusion below.

### Is 50 to 100 chunks/s reachable

Take 4.7 as the parallel factor and six as the pool size.

| Target | Aggregate ms/chunk | ms/chunk per worker | Against deepslate's 630 ms |
|---|---|---|---|
| 50 chunks/s | 20 ms | 94 ms | 6.7x faster needed |
| 100 chunks/s | 10 ms | 47 ms | 13.4x faster needed |

So no, workers alone do not get there, and the gap is not small. A pool of six turns 1.6 chunks/s into about 7. The remaining factor of 7 to 14 has to come from the generator itself.

What that factor would have to consist of, from this note's measurements, is at least:

- Evaluating the interpolated subtree on the 5x5x49 cell lattice once per chunk (1225 corner evaluations) rather than looking up 786 432 string-keyed cache entries. The lookup overhead alone is 85 ms against 2 ms, and the saving on the evaluations themselves is larger.
- Compiling the density graph to closures or to a flat instruction array, rather than walking an object tree per sample. The repository already has `density/compile.ts` doing exactly this, so this part is in hand.
- Keeping every per-chunk buffer as a typed array sized once, not a `Map` or an object graph.
- A WebAssembly noise kernel if that is not enough, worth 6.4 times on the arithmetic (section 7).

Whether that adds to 7x or 14x is the sibling agent's question, since it depends on where the per-chunk time actually goes. The arithmetic says 50 chunks/s is a reasonable target for workers plus a competent single-threaded rewrite, and 100 chunks/s needs the rewrite to be aggressive.

### What becomes the bottleneck once workers exist

Nothing except per-chunk CPU, at these rates. At 100 chunks/s:

| Cost | Per second | Share of one core |
|---|---|---|
| main thread receiving 100 transferred columns | 2.0 ms | 0.2% |
| piscina task dispatch, 100 tasks at concurrency 6 | 1.4 ms | 0.14% |
| worker wake-ups by `postMessage` | 0.9 ms | 0.09% |
| main thread receiving 100 cloned columns instead | 6.3 ms | 0.6% |
| main thread receiving 100 columns as `number[]` instead | 121 ms | 12% |

Per tick at 20 TPS, 100 chunks/s is 5 chunks, and receiving 5 transferred columns costs 100 microseconds out of 50 ms. The only way to make the boundary matter is to send the wrong shape, and the `number[]` row shows what that costs.

Two second-order limits are worth naming. Memory: six workers each holding registries cost about 80 MiB apiece on top of the shared bytes, so roughly 500 MiB, which is fine on 16 GiB and worth re-checking on a 2 GiB VPS. And `UV_THREADPOOL_SIZE`, default 4, is shared by file system and crypto work; it does not affect `worker_threads`, but it does affect anything the workers do with `fs`, so workers should be given their data rather than reading it.

## 7. Alternatives to worker threads

Each option below is priced against the same question: how much of the 7x to 14x gap does it close, and what does it cost to build.

### Make the single-threaded path 50 times faster

This is the option worth comparing everything against, because it is the only one that helps even with a pool of one, and because the measurements say a large part of the gap is implementation rather than algorithm.

What is on the table, from this note's numbers: the corner cache fix alone is 85 ms against 2 ms per chunk in deepslate's shape; a cell lattice instead of per-block density evaluation cuts the interpolated subtree from 98 304 evaluations to 1225; a compiled density graph removes an object-tree walk per sample; and typed-array scratch buffers remove allocation pressure. The repository already has `packages/worldgen/src/density/compile.ts` with a `DensitySampler` closure type, so the most valuable piece is already chosen.

The work is in code this project owns. It needs no new runtime, no new build step and no new failure mode, and every improvement multiplies with the worker pool rather than competing with it. The risk is that a rewrite of the hot path is exactly where float reassociation creeps in, so it needs the bit-exact fixture tests from section 4.

Do this regardless of what else is chosen. 50x is optimistic for the whole pipeline but 7x to 14x looks reachable, and it is the only option that makes the target achievable at all.

### WebAssembly

Measured, same 8-octave Perlin kernel, hand-written WAT compiled with wabt, 1 000 000 samples, best of 5:

| Implementation | Time | Rate | Ratio |
|---|---|---|---|
| JavaScript | 2002 ms | 0.50 M samples/s | 1.00 |
| WebAssembly | 312 ms | 3.21 M samples/s | 6.42 |

Both produced the accumulator `427.9504238718127` exactly, once the WAT's expression tree matched the JavaScript (see section 4). Compilation is not a startup problem: 874 bytes of wasm, `WebAssembly.compile` in 0.4 to 0.7 ms, `instantiate` in 0.04 to 0.09 ms, and `WebAssembly.Module` instances can travel through `postMessage` per the worker_threads documentation, so a module compiles once and every worker instantiates it.

The boundary is the constraint. One exported call costs 9.7 ns for a no-op taking and returning an `f64`, and 29.8 ns for a single-octave noise call. At 29.8 ns per call, calling into WASM per density sample would spend 2.9 ms per chunk on 98 304 calls before doing any work. The whole terrain pass has to live inside WASM, with linear memory as the chunk buffer, and JavaScript should cross the boundary once per chunk.

The price is a second implementation of the hot path in a language that compiles to WASM, a build step, and a parity obligation on every float expression. 6.4x on the arithmetic is a real number and it composes with workers. It is worth doing only after the single-threaded JavaScript path is competent, because a slow algorithm compiled to WASM is still slow.

### Native addons on a background thread pool

The model is sharp's: a C++ or Rust addon that does the work on a libuv thread pool thread and calls back. Measured floor for that round trip, using `crypto.pbkdf2` with one round as the proxy: 10.63 microseconds p50, with a real 192 KiB `deflateRaw` at 123 microseconds. That is the same order as `postMessage` (8.75 microseconds), so the boundary is not an argument either way.

A native addon buys SIMD without the WASM SIMD restrictions, real shared memory without `SharedArrayBuffer` ceremony, and a thread pool managed outside V8 so there are no extra isolates. It costs a compiled artifact per platform, prebuilds or a node-gyp dependency for consumers, and the same float-reassociation obligation as WASM but with a compiler that is allowed to contract multiply-add into FMA unless told not to. That last point is serious. `-ffp-contract=off` or its equivalent is mandatory, and getting it wrong produces a world that is subtly not Java's.

Given that the packages here are published to npm as a product, a mandatory native addon changes the install story for every consumer. That is a real cost, not a technical one, and it argues for WASM over native if a compiled kernel is needed.

### A persistent generation process

A separate Node (or non-Node) process with the generator, talking over a socket or a pipe. It gets the loop isolation that workers get, plus crash isolation and the ability to be written in another language entirely. It costs a serialization boundary that cannot use transferable `ArrayBuffer`, so every 192 KiB column is a real copy on both sides.

That is not fatal at these rates. The deflate measurement above moved 192 KiB through a pipe-shaped path in 123 microseconds, and 100 chunks/s would be 12 ms/s. But it buys nothing over `worker_threads` for this problem, since the generator is this project's own code and does not need crash isolation, and it loses `SharedArrayBuffer` for the registries, which was this note's largest single saving (75 ms against 540 for eight workers). Reach for it only if the generator ends up in a language that cannot be a worker.

### Restructure to amortize work across chunks

Not an alternative to the others but a multiplier on all of them, and the one the Java design already assumes. Work that is per column or per region (continentalness, erosion, the preliminary surface level, structure placement for a region) is being recomputed per chunk by any implementation that treats a chunk as the unit. The 32 `minecraft:cache` nodes in the 26.3 density function data are Mojang saying which of those should be memoized and at what granularity.

Generating in regions rather than chunks also fits the worker boundary better: a worker that owns a 4x4 chunk region computes the shared parts once, generates 16 chunks, and sends back 16 transferred buffers in one message. The messaging already measured as free, so the win here is purely the shared computation.

The price is a different unit of work throughout the pipeline, and a chunk status model that can express "this region is at status X". It is the largest design change on this list and probably the one that buys the most, which is why the sibling note's reading of Java's status pipeline matters.

## 8. What the measurements suggest

Stated as what the numbers support, not as a decision.

1. Fix Ctrl+C independently of everything else, because it is two small defects: the raw-mode keypress path has no force-exit escape, and `Server.shutdown`'s idempotence guard makes the second Ctrl+C a no-op. Neither needs the architecture to change.
2. Put the generator behind a long-lived pool of about six workers, built with piscina or an equivalent. The measured costs are all small: 17 ms to build the pool, 13.8 microseconds per dispatch, 20 microseconds of main thread CPU per transferred chunk. The freeze goes away at that point, and `worker.terminate()` stops a busy worker in 2 to 24 ms.
3. Give the workers the registries as a `SharedArrayBuffer` of UTF-8 JSON, not as files to read and not through `workerData`. 75 ms for eight workers against 540 for disk and 289 for `workerData`, with the `workerData` cost landing on the main thread.
4. Return chunks as flat typed arrays in a transfer list. Nothing with a per-section palette array, nothing with a `number[]`, nothing that is a class instance.
5. Ban `Math.random` under the worldgen packages mechanically, and keep the cross-worker digest test from section 4 as a regression test.
6. Expect the worker pool to buy about 4.4 to 4.7 times and no more, and plan the remaining 7x to 14x as single-threaded work: cell-lattice evaluation, compiled density graphs, typed-array scratch space, and region-level amortization. WASM is worth 6.4 times on the arithmetic after that, not before.

## Open questions

- The scaling numbers were taken on a machine at load average 36 to 158, with another JDK process at 207% CPU. The 4.7x peak is a floor; what an idle M1 Pro does was not measured.
- The repository's own generator was not benchmarked. The worktree was being modified by another session throughout this work (HEAD moved from `a6e22deeb3` to `63f31a0aac`, and `packages/prismarine/src/world/generators/datadriven/` was created and emptied mid-session), so deepslate was used as the single-thread anchor instead. deepslate's 630 ms per chunk is a faithful-but-slow implementation and is not this repository's number.
- Consequently the block palette and the Java-to-Bedrock mapping tables were not measured for shareability. Their shape predicts the answer (dense typed arrays share, string-keyed maps rebuild) but the rebuild cost is unknown.
- Whether the search structure over the 7594 climate boxes can live in a `SharedArrayBuffer` depends on whether it is a flat sorted array or a pointer-linked tree, which was not examined. The boxes themselves are 53 158 doubles and share trivially.
- The 12 microsecond empty loop turn is a darwin/arm64 measurement. Whether Linux, where most deployments run, pays the same was not measured, and it changes the duty-cycle arithmetic in section 1 if it differs.
- `v8.serialize` produced a larger buffer than `JSON.stringify` for this data (3.01 against 2.66 MiB) and deserialized slower at eight workers (163 against 75 ms). No cause was established.
- Whether V8's transcendental results are stable across V8 versions and across architectures was not tested. Within one build they are identical across threads and tiers, which is what a worker pool needs, but a parity dashboard that compares against a fixture generated on another machine may need more than that.
- WASM SIMD was not tested. The 6.4x is scalar `f64` against scalar JavaScript.

## Reproduction

Benchmarks were written to `/tmp/pcg-bench/` and run from there with the repository's pinned Node (v26.12.1). The Java 26.3 data comes from `node_modules/.cache/jsprismarine/vanilla-datapack/26.3/` and `node_modules/.cache/jsprismarine/java-reports/26.3/`, which `pnpm install` populates.

```sh
mkdir -p /tmp/pcg-bench && cd /tmp/pcg-bench
npm init -y && npm install deepslate@0.27.2 piscina@5.3.2 wabt
```

The yield cost (section 1), reduced to its load-bearing part:

```js
// one immediate per loop turn
const chain = (n) => new Promise((resolve) => {
    let i = 0;
    const t0 = process.hrtime.bigint();
    const step = () => (++i >= n ? resolve(Number(process.hrtime.bigint() - t0) / n) : setImmediate(step));
    setImmediate(step);
});
// n immediates drained in one loop turn
const batch = (n) => new Promise((resolve) => {
    let done = 0;
    const t0 = process.hrtime.bigint();
    const cb = () => { if (++done === n) resolve(Number(process.hrtime.bigint() - t0) / n); };
    for (let i = 0; i < n; i++) setImmediate(cb);
});
console.log(await chain(10000), await batch(50000)); // 12448 ns, 251 ns
```

SIGINT behind a synchronous block, and the raw-mode pty test:

```sh
# with a listener: handler runs 3.3 s late. Without one: killed at 2.0 s, exit 130.
node -e "
const t0=Number(process.hrtime.bigint());let sig=0;
process.on('SIGINT',()=>{sig=(Number(process.hrtime.bigint())-t0)/1e6});
setTimeout(()=>{const e=process.hrtime.bigint()+5000n*1000000n;let x=0;
 while(process.hrtime.bigint()<e)for(let i=0;i<1000;i++)x+=Math.sqrt(i);
 setImmediate(()=>{console.log('block ended',(Number(process.hrtime.bigint())-t0)/1e6,'SIGINT at',sig);process.exit(0)})},300)" &
sleep 2; kill -INT $!

# Ctrl+C under a pty: raw mode gives 'STDIN BYTES 3', cooked mode gives 'GOT SIGINT'
python3 -I /tmp/pcg-bench/ptytest.py raw
python3 -I /tmp/pcg-bench/ptytest.py cooked
```

Message costs (section 2): echo worker, median of 100 to 2000 round trips per payload, with a one-way flood measured by `process.cpuUsage()` on the main thread. Worker warm-up (section 3): the same registry loader run five ways in fresh workers at 1, 4 and 8 concurrency. Determinism (section 4): float, iteration-order and `Math.random` probes compared between the main thread and six workers, then re-run under `--no-opt`, `--jitless` and `--max-opt=0`.

```sh
node b1-yield-cost.mjs          # duty cycle table and per-turn cost under varying handles
node b1b-immediate-detail.mjs   # chain vs batch vs nextTick vs MessageChannel
node b4b-message-steady.mjs     # round trips and one-way main-thread CPU
node b6-worker-registries.mjs   # disk vs SAB vs transfer vs v8 vs workerData, 1/4/8 workers
node b10-determinism.mjs        # main vs 6 workers; then --no-opt, --jitless, --max-opt=0
node b11-wasm.mjs               # WAT vs JS, bit-exact after matching the expression tree
node b12-atomics-pool.mjs       # Atomics, spin, postMessage, libuv pool, worker RSS
node b13-piscina.mjs            # pool build time and dispatch cost
node b14-cache.mjs              # Map template-string key vs flat Float64Array lattice
node b15-terminate.mjs          # worker.terminate() vs a SharedArrayBuffer cancel flag
SAMPLES=1000000 REPS=9 NS=1,2,4,5,6,7,8,10 node b9-core-scaling.mjs
CHUNKS=12 REPS=2 NS=1,2,4,6,8 node --max-old-space-size=8192 b8-scaling.mjs
```

deepslate's corner cache and the interpolated nodes in the data:

```sh
sed -n '216,255p' /tmp/pcg-bench/node_modules/deepslate/lib/worldgen/DensityFunction.js
cd node_modules/.cache/jsprismarine/vanilla-datapack/26.3/data/minecraft/worldgen
python3 -I -c "
import json,os,collections
c=collections.Counter()
for root,_,fs in os.walk('density_function'):
    for f in fs:
        if not f.endswith('.json'): continue
        def walk(o):
            if isinstance(o,dict):
                if isinstance(o.get('type'),str): c[o['type']]+=1
                for v in o.values(): walk(v)
            elif isinstance(o,list):
                for v in o: walk(v)
        walk(json.load(open(os.path.join(root,f))))
print(c['minecraft:interpolated'], c['minecraft:cache'])"   # 13 32
```

Node documentation quoted above, fetched as JSON rather than HTML:

```sh
for d in process tty readline worker_threads timers; do
  curl -sS -o /tmp/nodedocs/$d.json "https://nodejs.org/docs/latest-v26.x/api/$d.json"
done
```

Prior art (read only):

```sh
git clone -q --depth 1 https://github.com/PrismarineJS/flying-squid
git clone -q --depth 1 https://github.com/PrismarineJS/prismarine-world
git clone -q --depth 1 https://github.com/PrismarineJS/prismarine-chunk
grep -rn "worker_threads\|new Worker(\|SharedArrayBuffer\|Atomics\.\|piscina\|tinypool" \
  flying-squid prismarine-world prismarine-chunk   # no matches
```
