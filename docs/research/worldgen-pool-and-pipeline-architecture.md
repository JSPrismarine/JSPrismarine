# World generation pools, sharing and pipelines

Researched 2026-11-08. Scope: how the systems that generate Java Edition worlds fast schedule, share and isolate their work, what Node can and cannot do about the same problems, and an architecture for this repository that scales across threads and machines, runs well on two cores, and keeps generation from hurting the players who are online. Algorithmic cost reduction (cheaper terrain, cheaper features, lazy sections) is out of scope here; this note is about the machinery around the generator. GPU acceleration is out of scope by request; nothing below precludes adding it later behind the same task interface.

Primary sources were read as source code, fetched with `gh api` on 2026-11-08: [Tuinity/Moonrise](https://github.com/Tuinity/Moonrise) branch `mc/26.3` (Paper's chunk system), [Spottedleaf/ConcurrentUtil](https://github.com/Spottedleaf/ConcurrentUtil), [RelativityMC/C2ME-fabric](https://github.com/RelativityMC/C2ME-fabric) branch `dev/26.3.0`, and [Pumpkin-MC/Pumpkin](https://github.com/Pumpkin-MC/Pumpkin) `master`. Kernel and library behavior comes from man7.org, docs.kernel.org and libuv's source. The three experiments were run on an Apple M1 Pro with Node v26.12.1; the machine carried other sessions' load (load average 6 to 18), so absolute numbers are indicative and the ratios are the finding. This repository's current numbers come from [ADR 0002](../adr/0002-chunk-generation-architecture.md) and [parallel-chunk-generation-in-node.md](parallel-chunk-generation-in-node.md); nothing here re-measured them.

## Summary

- Nobody isolates generation from the tick with one mechanism. Moonrise throttles with thread counts, a priority queue and per-player rate limiters. C2ME adds real OS thread priorities. Pumpkin uses a bounded in-flight count and a priority heap. Vanilla uses neither: a `ForkJoinPool` of cores minus one plus a single serial executor for features.
- No system preempts a running task. All of them bound the damage by keeping tasks short and by bounding how many run at once. For a Node server that rule is stricter, because JavaScript cannot be preempted at all.
- **Node cannot lower one worker thread's priority portably.** `os.setPriority` calls libuv, which calls `setpriority(PRIO_PROCESS, pid)` on Unix and `SetPriorityClass` on Windows. Both are per-process. Measured on macOS: a worker that called `os.setPriority(0, 10)` changed the main thread's nice value from 0 to 10. Only Linux's NPTL makes nice per-thread, the man page lists that under BUGS as a deviation from POSIX, and Node exposes no thread id to use it with. **The only portable priority boundary is a process boundary.**
- That reopens a decision ADR 0002 closed. It rejected "a separate generation process" because it lost `SharedArrayBuffer`. A generation host process that runs its own worker pool keeps `SharedArrayBuffer` between its workers and loses nothing the ADR measured, and it buys what thread pools in Node cannot: an OS priority class for all generation work, a separate heap and garbage collector, crash isolation, and a seam that can later point at another machine.
- On a pool whose dispatcher is the main thread, a busy tick starves the workers when tasks are short. Measured with 3 workers and a tick that holds the thread for 45 ms of every 50: 1 ms tasks took 1847 ms against 201 ms when workers claimed work from shared memory, and 10 ms tasks took 1017 ms against 201 ms. At 100 ms tasks the harness showed no effect. This repository's tasks are mostly long, so the cost today is small. It becomes the dominant cost the moment tasks get short enough to preempt well, which the isolation goal requires.
- A container's CPU quota is enforced per cgroup, not per thread. When a group spends its quota inside a period, all its threads are blocked until the next period, so a generator that burns the quota freezes the tick regardless of any priority setting. The throttle counters are readable, which makes them the right feedback signal for adaptive concurrency.
- Worker counts in the wild are conservative. Moonrise defaults to `cores / 2` halved again above four, so 8 cores give 2 workers and 16 give 4. Pumpkin uses `cores / 2` clamped to 2 to 16. ADR 0002 caps this repository's pool at 6 workers regardless of core count.
- I found no published chunks-per-second figure for Pumpkin or for vanilla in the sources searched. Any "beat both" claim needs a head-to-head run on one machine and one seed; Pumpkin's own statement that its terrain matches vanilla is not a speed claim.

## 1. What the reference systems do

| | Vanilla 26.3 | Moonrise (Paper) | C2ME | Pumpkin | This repository |
| --- | --- | --- | --- | --- | --- |
| Parallel statuses | `biomes`, `terrain` | Everything except `features`, `light`, `full`, `spawn` | Rewrites the chunk system and adds worldgen threading modules | Per-stage tasks over a DAG | Whole ladder in a worker |
| Features | Serial, one `ConsecutiveExecutor` | Serial, writes into neighbors | Not read | Per-stage task over a copied neighborhood | Parallel; patch merge, no shared writes |
| Pool | `ForkJoinPool`, cores - 1 | `BalancedPrioritisedThreadPool`, time-sliced groups | `ExecutorManager` from flowsched | `rayon`, cores / 2 clamped 2 to 16 | piscina, up to 6 isolates |
| Priority | Four-priority task dispatcher | Ten levels, CAS-raisable per holder | Level-derived, re-prioritized live | Heap keyed by ticket level | Three bands |
| Player isolation | None | Thread count, per-player rate limiters | Thread priority, SCHED_BATCH, efficiency cores | In-flight cap | Main-thread dispatch budget |

### Moonrise

- Pool group and slices. `MoonriseCommon` builds one `BalancedPrioritisedThreadPool` for work and one for I/O, each with a queue hold time (20 ms and 25 ms), and gives generation, loading, compression and saving separate executors inside the same group. `BalancedPrioritisedThreadPool.DEFAULT_GROUP_TIME_SLICE` is 15 ms. The point is that kinds of work share threads but cannot starve each other.
- Worker count. `adjustWorkerThreads` takes `totalCores / 2`; at 4 or fewer it picks 1 (3 or fewer) or 2, otherwise halves again. The source gives no reason, but the effect is that most cores stay free for everything else.
- Which statuses may run in parallel. `ChunkTaskScheduler` lists them with reasons: `STRUCTURE_STARTS` after fixing concurrency in stronghold and fortress starts, `STRUCTURE_REFERENCES` because neighbors' starts are stable by then, `BIOMES`, `TERRAIN`, `INITIALIZE_LIGHT`. `FEATURES` is excluded because it writes to neighbors; `LIGHT` is excluded; `FULL` runs on the main thread. This is the same dependency table ADR 0002 transcribed.
- Radius-aware scheduling. `AreaDependentQueue(parallelGenExecutor, 4)` groups work on a 16 by 16 chunk grid so tasks whose read or write areas overlap do not run at once. This is the lock-avoidance this repository gets for free from patches and a pure ladder.
- Priority is data on the holder. `PriorityHolder` packs the priority and two state bits into one `int` updated with `compareAndExchange`, so any thread can raise a queued task's priority and a task marked executing cannot be cancelled.
- Player-side admission control. `RegionizedPlayerChunkLoader` keeps separate heap queues for load, generate and send, and rate-limits each with a `StaggeredRateLimiter` over four windows: 4.0 times the rate over 100 ms, 2.0 over 500 ms, 1.25 over 1 s and 1.0 over 3 s, so bursts are allowed and the sustained rate is not. Concurrent loads and generates per player default to `max(5, area / 5)`, a fifth of the view distance's chunk count.

### C2ME

- `SchedulingManager` keeps a position-to-tasks map and re-prioritizes queued tasks when a ticket level changes. When the main thread blocks on a chunk, `setCurrentSyncLoad` boosts every task within Chebyshev distance 8 of it to a priority equal to its distance, so the work the tick is waiting on jumps the queue.
- `ThreadPriorityPresets` applies per-thread priorities through native bindings: `SCHED_BATCH` plus a nice value of 2, 5 or 12 on Linux, and a pthread priority on macOS, a thread priority on Windows, and an efficiency-core preference with power throttling for the lowest two presets.
- It treats the OS scheduler as part of the design. That is the lever Node does not expose per thread (section 3).

### Pumpkin

- `GenerationSchedule` owns a `DAG` of `(chunk, stage)` nodes with an in-degree and `in_queue` and `in_flight` flags, a `BinaryHeap` ordered by `TaskPriority`, and a dedicated scheduler thread. Stages are `Biomes`, `StructureStart`, `StructureReferences`, `Noise`, `Surface`, `Carvers`, `Features`, `Lighting`, `Spawn`, `Full`.
- Work goes to a `rayon` pool of `(cpus / 2).clamp(2, 16)` threads, with `max_in_flight = 2 * gen_threads`. I/O runs on separate `tokio` tasks.
- `calc_priority` subtracts 100 from the level of any chunk within the full-radius dependency cone of a `last_high_priority` position, which is how a chunk a player stands next to outranks the rest of the backlog.
- Each stage task receives a `Cache` of the `(2r + 1)` squared neighboring proto chunks, so data is moved or copied per stage rather than shared. The `mod.rs` header lists "better priority" and "add lifetime to loading ticket" as open TODOs.

### Vanilla

Condensed from [java-chunk-generation-pipeline.md](java-chunk-generation-pipeline.md), which read the jar: `biomes` and `terrain` run on `Util.backgroundExecutor()`, a `ForkJoinPool` of `availableProcessors() - 1`; structures, features and the cheap statuses run one at a time on a `ConsecutiveExecutor`; light has its own; `full` is on the main thread. Vanilla parallelizes the two statuses that write only their own chunk. This repository's ADR measurement puts `features` and the Bedrock translation, which vanilla runs serially, at about two thirds of a chunk.

## 2. Where Java's design leaves room

1. Vanilla serializes `features` because features write into neighbors. ADR 0002's patch merge removes that constraint at the cost of a bounded, measured divergence. Every system in the table above either serializes the status or locks areas around it.
2. Among the systems read, neighbor data is either locked (Moonrise's `AreaDependentQueue` and `ReentrantAreaLock`) or copied (Pumpkin's per-task `Cache`). I did not read C2ME's worldgen threading modules, so I make no claim about its approach. A shared-memory arena of immutable, published statuses would give lock-free reads and zero copies.
3. None of the three JVM or Rust systems depends on the tick thread to hand out work: Moonrise and C2ME dispatch from pool threads, and Pumpkin from a dedicated scheduler thread. This repository's pool dispatches from the main thread's event loop, because piscina's queue and `GenerationPool`'s bands live there. Section 4 measures what that costs.

## 3. Priority and isolation in Node

### Experiment: a worker's `os.setPriority` on macOS

```js
// worker calls os.setPriority(0, 10); main then reads os.getPriority(0)
main nice before 0
main nice after worker setPriority(0, 10): 10      // Darwin
```

libuv `uv_os_setpriority` (`src/unix/core.c`) is `setpriority(PRIO_PROCESS, pid, priority)`; the Windows version (`src/win/util.c`) maps the nice value to a priority class and calls `SetPriorityClass` on the process handle. Both address a process. [`setpriority(2)`](https://man7.org/linux/man-pages/man2/setpriority.2.html) states the one exception under BUGS: "under the current Linux/NPTL implementation of POSIX threads, the nice value is a per-thread attribute ... Portable applications should avoid relying on the Linux behavior". Node exposes no thread id for a worker, so even on Linux a worker has no supported way to name itself (`0` would name the calling thread there, which I have not tested).

Consequences:

- A worker cannot lower itself. On macOS and Windows that call lowers the whole server, which is a trap in dev and CI.
- A child process can be lowered portably: `os.setPriority(child.pid, os.constants.priority.PRIORITY_LOW)`, or `nice` and `chrt --idle 0` wrappers on Linux. [`sched(7)`](https://man7.org/linux/man-pages/man7/sched.7.html) describes `SCHED_IDLE` as "lower even than a +19 nice value" and `SCHED_BATCH` as mildly disfavored in wakeup decisions. Both are exactly the policy generation wants and neither is reachable from JavaScript.
- C2ME's native bindings are what a JVM mod gets for free and a Node package does not.

### Containers change the arithmetic

The kernel's [CFS bandwidth control](https://docs.kernel.org/scheduler/sched-bwc.html) documents that a group which uses its quota within a period is throttled until the next period, and exposes `nr_periods`, `nr_throttled` and `throttled_time`. Priority and nice order threads inside a group; they do not stop the group's quota from running out, and when it does the tick thread stops with the workers. A server given `--cpus=2` that runs two generation workers flat out will miss ticks for the remainder of each 100 ms period. I did not find the cgroup v2 `cpu.max` format in the pages I read, so the file layout is unverified here; the v1 behavior is stated in the kernel documentation above, and v2 is described as covered by `cgroup-v2.rst`.

This is the case the adaptive controller in section 6 exists for.

### Tail latency is the right frame

Dean and Barroso's [The Tail at Scale](https://doi.org/10.1145/2408776.2408794) (CACM 56(2), 2013) names background activity as a source of interactive latency spikes and lists three mitigations: throttle the background work, split heavy operations into smaller pieces, and schedule it for low-load periods. Those are the three levers available here. I read secondary summaries of the paper's text, not the paper; the DOI is the primary record.

## 4. Where the dispatcher lives

The pool in `packages/chunkgen/src/GenerationPool.ts` keeps its backlog on the main thread, in per-band queues, and hands a task to piscina when fewer than `capacity` (default workers + 1) are in flight, from a completion callback on the main loop. A worker that finishes while the loop is busy waits for the loop.

### Experiment: main-dispatched against shared-pull

Harness: the script under [Reproduction](#reproduction). Three workers, work totalling 600 ms of spin per arm (ideal 200 ms). Main thread holds the loop for `busy` ms out of every 50 ms, simulating a heavy tick. Arm A has the main thread post one task per worker and the next on each completion; arm B has workers claim task ids from a `SharedArrayBuffer` counter with `Atomics.add`, behind a start gate.

| Task length | Tick busy | Main-dispatched | Shared-pull |
| --- | --- | --- | --- |
| 1 ms | 0 of 50 ms | 206 ms | 201 ms |
| 1 ms | 25 of 50 ms | 400 ms | 201 ms |
| 1 ms | 45 of 50 ms | 1847 ms | 201 ms |
| 10 ms | 0 of 50 ms | 201 ms | 202 ms |
| 10 ms | 25 of 50 ms | 346 ms | 200 ms |
| 10 ms | 45 of 50 ms | 1017 ms | 201 ms |
| 100 ms | any | 200 ms | 200 ms |

The 1 ms rows repeated identically across two runs. The 100 ms row has two tasks per worker, which is too few to show a stall and should not be read as "no effect". What the table does show is the shape: the penalty is the main thread's stall divided by the task length, so it is negligible for the 100-plus millisecond chunk tasks of today and severe for the millisecond-scale tasks that good preemption needs.

This is a microbenchmark of dispatch, not of this repository. It does not measure the real main-thread stall distribution of a live server.

## 5. Candidate architecture

Four pieces. Each is independent of the others and each has a stated price.

### A. A generation host process

The server spawns one child process running the same binary in a generation role (the repository already runs workers from compiled executables; see `singleExecutableWorker.ts`). The child owns the worker pool, the registry bundle in `SharedArrayBuffer`, the climate tables, the terrain tile store and the structure layouts. The server sets the child's OS priority with `os.setPriority(child.pid, ...)` and talks to it over a pipe or socket.

- What it buys: an OS priority class for all generation; a separate V8 heap and GC, so generation garbage never pauses the tick thread; crash and out-of-memory isolation with a restart path; `--max-old-space-size` set independently; and a transport that can be pointed at another machine.
- What it costs: one IPC hop per delivered chunk, about the size of one compressed chunk (the earlier note measured 192 KiB through a pipe-shaped path in 123 microseconds, and a deflated chunk is much smaller); a second copy of per-process state; process lifecycle code. ADR 0002 priced the registry bundle at 75 ms for eight workers against 540 ms from disk. Per process, that is paid once, not per worker, because the host's workers still share it.
- What it does not fix: the quota case in section 3. That needs piece D.
- Fallback: when the host cannot spawn (restricted sandbox, single-file builds that do not allow it), the same pool runs in-process with today's behavior and a lower worker cap. The task interface is the seam.

### B. A work board in shared memory

Replace "main thread dispatches" with "workers pull". A `SharedArrayBuffer` holds:

- one status word per tracked chunk (status index, priority band, claim bit, epoch), claimed by compare-and-exchange, which is the Java `acquireStatusBump` behavior ADR 0002 already modeled with a promise map;
- ready queues per priority band as bounded multi-producer multi-consumer rings, or a small ready bitmap scanned in priority order;
- per-chunk dependency counters, decremented by the worker that finishes a status, which is Pumpkin's DAG in-degree without a scheduler thread;
- a futex word workers sleep on with `Atomics.wait` and the host's coordinator wakes with `Atomics.notify` (`Atomics.waitAsync` exists in this Node for the coordinator side).

The coordinator's only job becomes writing demand (a player moved, so these chunks want these statuses at these bands) and draining completions. Re-prioritization is a word write, the C2ME and Moonrise behavior. Cancellation is clearing a want bit before the claim bit is set.

Price: this is the only piece with real concurrency hazards (memory ordering, queue correctness, torn priority updates). It earns its keep only when tasks are short, so do it together with piece C, not before.

### C. Short tasks, not long ones

Preemption in JavaScript is impossible, so latency under load is bounded by task length. The ladder already has the right seams; the long pole is `features`. Candidates, in order of how cheaply they split:

1. Surface and carvers separate from noise, because each is a different dependency radius.
2. `features` by decoration step. Java's feature seeds are derived per feature from the decoration seed, an index and the step, so the output of step N does not depend on how steps are grouped into tasks. Between steps the region state must outlive the task, which means it lives in shared memory (piece E) or the task stays on one worker.
3. A time-budgeted yield inside a task is not possible in synchronous JavaScript without rewriting the feature code as resumable, which is not proposed.

The target is a quantum near the tick budget (5 to 10 ms) for the work that runs while a player is online, with longer tasks allowed only at the `idle` band, where an arriving `immediate` task waits behind at most one long task per worker.

### D. An adaptive concurrency governor

The host runs `N` workers but permits `k <= N` to be active, parking the rest on the futex. `k` is steered by a measured player-impact signal, not a fixed number:

- tick lateness at the server (time between intended and actual tick start), as the primary signal;
- `nr_throttled` growth from the cgroup's `cpu.stat` when the process is in a quota-limited group, so `k` drops before the quota burns rather than after;
- event loop utilization of the server thread.

Increase `k` slowly while ticks are on time; cut it quickly when they are not (additive increase, multiplicative decrease, the TCP shape). The band rules sit under it: `immediate` work is always admitted, and the governor only throttles `soon` and `idle`.

Without D, A is a priority boost with no feedback and the quota case freezes the server. Without A, D is the only lever on platforms where priority is process-wide, and the host can still be reniced.

### E. A shared arena for proto chunks

Move block data out of per-task transferred buffers into a fixed-slot arena in shared memory:

- a section table per chunk with one word per 16 by 16 by 16 section, holding either a uniform block id or an index into a pool of fixed-size blocks (8 KiB for 4096 entries of `Uint16`);
- global block-state ids derived once from the registry, which is data-driven and therefore identical in every isolate, so no per-chunk palette crosses a thread;
- status completion published with a release store on the chunk's status word, so a neighbor that reads status N sees the data written for status N and nothing newer without further synchronization.

Neighbors read terrain snapshots in place instead of receiving copies, and the main thread or the encoder reads the finished chunk without a transfer. Uniform sections cost one word, which matters because most sections of an overworld column are uniform air, stone or deepslate. I did not measure the uniform-section fraction; treat the memory estimate as a hypothesis to check against the corpus.

Price: slot lifetime. A chunk's blocks may be released only when the chunk and every dependent that reads it have finished, which is the holder retention rule ADR 0002 already states, implemented as reference counts in shared memory. Today's transferable buffers make ownership trivially safe; an arena trades that for zero copies and requires epoch or reference-count discipline.

### What not to build

- Stage-specialized pools (a noise pool, a feature pool). A single pool with typed tasks and priority bands gets better utilization than two pools sized for a ratio that changes with biome and structure density; the benefit of specialization is code locality, and the proposal above already keeps tasks of one type batchable by claiming per type.
- A priority scheme per worker thread. It cannot be expressed portably (section 3).
- Hedged duplicate requests for ordinary chunks. The Tail at Scale technique pays off when the tail is a slow replica; here duplicated work is the thing a two-core server cannot afford. Keep hedging as an option for remote nodes only.

## 6. Scaling out

Every status is a pure function of the seed, the pack data, the position and the frozen outputs below it (ADR 0002, guarantee 1). That makes chunk generation idempotent and content-addressable. Three tiers share one task interface:

1. In-process workers, the fallback.
2. A local generation host, the default.
3. Remote generation hosts over a socket.

Remote placement should be by region with consistent hashing, keyed by seed, dimension and region, so a node's climate tables, tile store and structure layouts stay warm. Two costs are specific to remote work. A node that owns a region needs a halo of its neighbors' terrain to run `features` at the border; a 16 by 16 region with a one-chunk halo recomputes about 26 percent of its terrain (18 squared over 16 squared), so regions should be large. And results should travel as Bedrock-ready, compressed section payloads plus the block entity, entity and heightmap data, with a content hash over seed, pack hash and generator version, so identical requests from different servers can be served from one cache. This is also where a hosting provider's fleet gets its dedupe.

The determinism check ADR 0002 specifies (identical digests across orders and pool sizes) extends naturally: identical digests across in-process, host and remote tiers, and across a run where workers are killed mid-task and priorities are flipped at random. Idempotence is the property that makes a retry safe, so a fuzzed kill-and-retry run belongs in the same corpus.

## 7. Order of work

1. Instrument first, without changing behavior: per-status queue wait and run time per priority band; tick lateness while generation is active; worker event loop utilization. Piece D's signal and the task-length target in piece C both need this, and ADR 0002 already warns that wall-clock numbers taken under load are unreliable.
2. Piece A with today's pool inside it. Behavior is unchanged, the priority class and heap isolation arrive, and the seam for everything else exists.
3. Piece D, because it is the part that protects players on quota-limited hosts, and it needs nothing from B, C or E.
4. Pieces C and B together, driven by the measured task-length distribution.
5. Piece E only if copies or main-thread reads show up in the profile once the above are in.
6. Remote tier last.

## Open questions

- Linux per-thread nice from a worker: whether `os.setPriority(0, n)` inside a worker lowers only that thread on Linux is documented by the man page but untested here, and it would still leave Windows and macOS process-wide.
- The cgroup v2 `cpu.max` and `cpu.stat` layouts were not read from the v2 document; only the v1 bandwidth behavior was confirmed.
- No head-to-head throughput figure for vanilla or Pumpkin was found in the sources searched, so "faster than both" is unproven.
- The shared-pull experiment used spin-wait tasks. A real feature pass has memory behavior and allocation pressure that a spin does not.
- Each process loads its own registry bundle; the per-process cost for a generation host was not measured.

## Reproduction

```sh
# Moonrise, ConcurrentUtil, C2ME and Pumpkin sources used above
gh api "repos/Tuinity/Moonrise/contents/src/main/java/ca/spottedleaf/moonrise/patches/chunk_system/scheduling/ChunkTaskScheduler.java?ref=mc%2F26.3" -H "Accept: application/vnd.github.raw"
gh api "repos/Tuinity/Moonrise/contents/src/main/java/ca/spottedleaf/moonrise/common/util/MoonriseCommon.java?ref=mc%2F26.3" -H "Accept: application/vnd.github.raw"
gh api "repos/Tuinity/Moonrise/contents/src/main/java/ca/spottedleaf/moonrise/patches/chunk_system/player/RegionizedPlayerChunkLoader.java?ref=mc%2F26.3" -H "Accept: application/vnd.github.raw"
gh api "repos/Spottedleaf/ConcurrentUtil/contents/concurrentutil/src/main/java/ca/spottedleaf/concurrentutil/executor/thread/BalancedPrioritisedThreadPool.java" -H "Accept: application/vnd.github.raw"
gh api "repos/RelativityMC/C2ME-fabric/contents/c2me-base/src/main/java/com/ishland/c2me/base/common/scheduler/SchedulingManager.java?ref=dev%2F26.3.0" -H "Accept: application/vnd.github.raw"
gh api "repos/RelativityMC/C2ME-fabric/contents/c2me-base/src/main/java/com/ishland/c2me/base/common/threadpriority/ThreadPriorityPresets.java?ref=dev%2F26.3.0" -H "Accept: application/vnd.github.raw"
gh api "repos/Pumpkin-MC/Pumpkin/contents/crates/pumpkin-world/src/chunk_system/schedule.rs" -H "Accept: application/vnd.github.raw"
gh api "repos/Pumpkin-MC/Pumpkin/contents/crates/pumpkin-world/src/chunk_system/dag.rs" -H "Accept: application/vnd.github.raw"

# libuv's priority implementation
curl -sL https://raw.githubusercontent.com/libuv/libuv/v1.x/src/unix/core.c | grep -n -A12 "uv_os_setpriority"
curl -sL https://raw.githubusercontent.com/libuv/libuv/v1.x/src/win/util.c | grep -n -A30 "uv_os_setpriority"

# Worker priority is process-wide on macOS
node --input-type=module -e "
import os from 'node:os'; import { Worker } from 'node:worker_threads';
new Worker('import os from \"node:os\"; os.setPriority(0, 10);', { eval: true }).on('exit', () => { console.log(os.getPriority(0)); });"
```

The dispatch experiment, saved as `starve.mjs` and run as `TASK_MS=1 node starve.mjs` and `TASK_MS=10 node starve.mjs`:

```js
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';

const TASK_MS = Number(process.env.TASK_MS ?? 1);
const spin = (ms) => { const e = performance.now() + ms; while (performance.now() < e); };

if (!isMainThread) {
  const { mode, sab, total } = workerData;
  const ctl = new Int32Array(sab);
  if (mode === 'push') {
    parentPort.on('message', () => { spin(TASK_MS); parentPort.postMessage(1); });
  } else {
    Atomics.wait(ctl, 2, 0); // start gate
    for (;;) {
      const id = Atomics.add(ctl, 0, 1); // claim a task id; no main-thread involvement
      if (id >= total) break;
      spin(TASK_MS);
      Atomics.add(ctl, 1, 1);
    }
    parentPort.postMessage('exit');
  }
} else {
  const run = async (mode, tickBusyMs) => {
    const WORKERS = 3, TOTAL = Math.round(600 / TASK_MS);
    const sab = new SharedArrayBuffer(16);
    const ctl = new Int32Array(sab);
    const ws = Array.from({ length: WORKERS }, () =>
      new Worker(new URL(import.meta.url), { workerData: { mode, sab, total: TOTAL } }));
    await new Promise((r) => setTimeout(r, 150)); // let the workers boot
    const t0 = performance.now();
    Atomics.store(ctl, 2, 1); Atomics.notify(ctl, 2);
    let done = 0, sent = 0;
    const tick = () => { // a 50 ms tick that holds the loop for tickBusyMs
      spin(tickBusyMs);
      if (done < TOTAL) setTimeout(tick, Math.max(0, 50 - tickBusyMs));
    };
    setTimeout(tick, 0);
    return new Promise((resolve) => {
      const finish = () => { resolve(performance.now() - t0); ws.forEach((w) => w.terminate()); };
      if (mode === 'push') {
        for (const w of ws) {
          w.on('message', () => { done++; if (sent < TOTAL) { sent++; w.postMessage(1); } if (done >= TOTAL) finish(); });
          sent++; w.postMessage(1);
        }
      } else {
        let exited = 0;
        for (const w of ws) w.on('message', () => { if (++exited === WORKERS) { done = TOTAL; finish(); } });
      }
    });
  };
  for (const busy of [0, 25, 45]) {
    const a = await run('push', busy);
    const b = await run('pull', busy);
    console.log(`tick busy ${busy}ms/50ms  main-dispatched ${a.toFixed(0)}ms  shared-pull ${b.toFixed(0)}ms`);
  }
  process.exit(0);
}
```

## Sources

- [Tuinity/Moonrise `mc/26.3`](https://github.com/Tuinity/Moonrise): `ChunkTaskScheduler`, `PriorityHolder`, `MoonriseCommon`, `RegionizedPlayerChunkLoader`.
- [Spottedleaf/ConcurrentUtil](https://github.com/Spottedleaf/ConcurrentUtil): `BalancedPrioritisedThreadPool`, `Priority`.
- [RelativityMC/C2ME-fabric `dev/26.3.0`](https://github.com/RelativityMC/C2ME-fabric): `SchedulingManager`, `GlobalExecutors`, `ThreadPriorityPresets`.
- [Pumpkin-MC/Pumpkin](https://github.com/Pumpkin-MC/Pumpkin): `crates/pumpkin-world/src/chunk_system/`.
- [setpriority(2)](https://man7.org/linux/man-pages/man2/setpriority.2.html) and [sched(7)](https://man7.org/linux/man-pages/man7/sched.7.html).
- [libuv `uv_os_setpriority`](https://github.com/libuv/libuv/blob/v1.x/src/unix/core.c), unix and [Windows](https://github.com/libuv/libuv/blob/v1.x/src/win/util.c).
- [CFS Bandwidth Control](https://docs.kernel.org/scheduler/sched-bwc.html), kernel documentation.
- Dean and Barroso, [The Tail at Scale](https://doi.org/10.1145/2408776.2408794), CACM 56(2), 2013.
- Blumofe and Leiserson, "Scheduling multithreaded computations by work stealing", JACM 46(5), 1999: expected time of serial work over P plus the critical path, space at most P times the serial space. Relevant to piece B's choice of pull-based claiming over a central queue, though a single shared ready structure is expected to suffice at under 16 workers. Read through an abstract and a restatement, not the full text.
