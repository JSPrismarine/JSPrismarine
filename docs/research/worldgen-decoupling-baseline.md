# World generation baseline, measured for the decoupling plan

> **Read this first.** Every millisecond and chunks-per-second figure in this note is a wall-clock diagnostic taken on a shared machine. Per [AGENTS.md](../../AGENTS.md#measuring-performance) none of them is evidence that a change is faster, that a target is met, or that it is not. Statements below that a target was "met" or "not met" rest on such figures and should be disregarded. The counted results (task counts per chunk, tasks started ahead of a player's chunk, digests, test outcomes) stand.

Measured 2026-11-09 on an Apple M1 Pro (8 cores: 6 performance, 2 efficiency) with Node v26.12.1, for slice 0 of [worldgen-decoupling.md](../plans/worldgen-decoupling.md). Every figure carries the load average from `uptime` taken at the start of its run. The machine is shared with other sessions, and every run here had a load average between 3 and 5 while it ran, so treat the figures as indicative. Nothing here was estimated.

## Chunks per CPU-second

`bench:chunks` with the `stages` arm, which is the pool the server runs: 64 chunks in a 8 by 8 block, seed 1234, one warmup and three samples, shared climate tables. Chunks per CPU-second is chunks completed over the summed worker thread CPU time of all tasks, including each worker's first task, which builds its pipeline.

| Workers | Chunks per second (p50 run) | Chunks per CPU-second, three runs | Load average at start |
| ------- | --------------------------- | --------------------------------- | --------------------- |
| 1       | 11.0                        | 12.25, 12.24, 12.22               | 4.77                  |
| 2       | 18.8                        | 10.69, 10.66, 10.74               | 3.90                  |
| 4       | 23.7                        | 6.99, 6.91, 7.08                  | 3.55                  |
| 6       | 25.3                        | 5.70, 5.81, 5.36                  | 4.14                  |

The provisional target of 3 chunks per CPU-second is met at every worker count, and the one-worker figure is far above ADR 0002's old 2.3 chunks per second on one thread. The useful finding is the trend: CPU cost per chunk grows as workers are added. A `features` task averages 8.5 ms of CPU with one worker and 33.5 ms with six, and a `terrain` task goes from 29 ms to 49 to 64 ms. Wall time per task grows the same way. Six workers on this machine share six performance cores with a load average of about four, so part of this is other sessions, and part is memory and cache contention between isolates. The table does not separate them.

## Task durations (worker wall time)

From the same runs. Shares are of tasks longer than 10 ms.

| Workers | Status and band         | Tasks | Mean wall | Max wall | Longer than 10 ms |
| ------- | ----------------------- | ----- | --------- | -------- | ----------------- |
| 1       | `terrain`, `immediate`  | 192   | 29.3 ms   | 35 ms    | 100%              |
| 1       | `terrain`, `soon`       | 240   | 30.9 ms   | 158 ms   | 100%              |
| 1       | `features`, `immediate` | 192   | 8.5 ms    | 31 ms    | 11%               |
| 1       | `features`, `soon`      | 108   | 9.8 ms    | 36 ms    | 20%               |
| 6       | `terrain`, `immediate`  | 192   | 55.8 ms   | 165 ms   | 100%              |
| 6       | `terrain`, `soon`       | 240   | 74.4 ms   | 430 ms   | 100%              |
| 6       | `features`, `immediate` | 192   | 36.5 ms   | 160 ms   | 100%              |
| 6       | `features`, `soon`      | 108   | 29.7 ms   | 103 ms   | 100%              |

The server's real path runs only `terrain` and `features` as pool tasks. Every `terrain` task is longer than 10 ms at any worker count. `features` is short with one worker and long with six.

## Tick cost of generation

`bench:bot-fleet -- --terrain real`, with the preload phase: a 17 by 17 region requested at `idle` all at once, 200 ticks per arm, six workers (the default), once with the region's tasks held back and once at full speed. Both arms use the same server. The bot fleets have disconnected by then; see the note on the stall below.

| Run                             | Load average at arm start | Tick p99, held back | Tick p99, full speed | Difference | Lateness p99, held back | Lateness p99, full speed | Chunks loaded |
| ------------------------------- | ------------------------- | ------------------- | -------------------- | ---------- | ----------------------- | ------------------------ | ------------- |
| 1                               | 3.04                      | 14.16 ms            | 8.58 ms              | -5.57 ms   | 85 ms                   | 393 ms                   | 289           |
| 2                               | 3.00                      | 7.69 ms             | 15.16 ms             | +7.48 ms   | 75 ms                   | 322 ms                   | 289           |
| Control, held back in both arms | 5.02                      | 12.24 ms            | 9.29 ms              | -2.94 ms   | 83 ms                   | 268 ms                   | 0             |

What the table says:

- The 99th percentile of the tick's own duration swings by about 6 ms in either direction between runs, and the control run, which does no generation, swings by 3 ms. The noise floor on this machine is several times the 1 ms target, so **the target cannot be confirmed or refuted with these runs**. The mean tick duration was lower with generation running in both runs (3.6 ms to 2.0 ms and 3.1 ms to 2.0 ms), which says the tick's own work does not grow.
- Lateness, the gap between a tick's due time and its start, is where generation shows. It rose from about 80 ms to 320 to 390 ms at the 99th percentile. The control run also reached 268 ms with no generation, so the same caveat applies, but the full-speed arm was highest in both runs. The tick's own work did not grow, so the delay is time the event loop spent on something else between ticks. The likely candidates are receiving and deserializing worker results and garbage collection, and the run does not say which.
- With the queue held back in both arms, the difference read -2.94 ms for tick duration, not zero. That is the noise, and the plan's "reads zero within noise" check is met only in the sense that the noise is as large as any effect seen here.

Main-thread cost per completed chunk, from the completion queue's labels: `worker-result` 0.473 ms and 0.459 ms per chunk in the two runs. The preload calls the generator directly, so the registration, lighting, fluid and entity labels are absent; the join phase exercises those.

## The queue wait is measured where it happens

`GenerationPool.test.ts` blocks a one-worker pool for 300 ms with a spinning task and asks for an `immediate` task behind it. The recorded backlog wait lands between 240 and 480 ms. The pool records the worker's own wall and CPU time per task beside the backlog wait.

## What did not work, and the cause

The preload froze the tick every time while the bot fleets were connected. The tick stood in `World.entityUpdates` on a `Player` whose `getBlock` awaited a chunk, with nothing outstanding in the generation pool. The cause was in the generator, not the pool:

- `GenerationQueue`, the admission queue of depth equal to the worker count, was strictly first in, first out and ignored urgency. A player's `immediate` chunk waited behind every earlier `idle` or `soon` request.
- Its slots could be held by background builds. The benchmark's pause held their pool tasks, so no slot ever freed and the player's chunk was never admitted. Diagnosed from a dump of the queue: six in flight, 289 queued, the pool holding 50 paused tasks.
- A chunk's neighbor terrain and feature tasks were requested at `soon` unless someone had asked for that neighbor, so even an admitted `immediate` chunk waited behind unrelated `soon` work.

Fixed: the queue admits by urgency and promotes, `immediate` requests are admitted past the depth, dependency tasks inherit the best band among the chunks that read them, and the governor leaves one worker free. The pool's `pause` and `resume` are removed, and the preload's idle arm now asks for nothing.

These are checked by **counts, not timings**, in `schedulingOrder.test.ts`: how many background tasks start between a player's request and the start of its last task. With inherited bands and the depth bypass it is bounded by what the workers already held (at most 7 with 6 workers). Without inheritance it is 143, set by the admission depth (six builds of 25 tiles), and without the bypass it is larger again. Those numbers do not move with machine load.

**A mistake in the benchmark, found late.** `generateChunk`'s fourth parameter is `config` and urgency is the fifth. The preload phase passed its urgency as the fourth, so every preload request was `immediate`, not `idle` as this note says. Every preload figure above this section (tick cost, lateness, the host comparison, and the fleet-connected stalls of 2.5 to 6 s) measured a flood of `immediate` requests competing with the bots' chunks. They are kept as history and should not be read as a background preload. The fix is in the benchmark, and the ordering fixes above are still right: the counts do not depend on it.

**After both fixes**, one fleet-connected run with a real `idle` preload (load average 12 to 15, so indicative only): the worst tick was 472 ms, against 2.5 to 6.2 s before. Mean tick 25.7 ms with nothing requested and 58.0 ms with the region requested, p99 184 ms and 220 ms. The mean is raised by CPU contention on a loaded machine. The 1 ms target is neither met nor testable here.

## Reproduction

```sh
pnpm --filter @jsprismarine/prismarine run bench:bot-fleet -- --terrain real
pnpm --filter @jsprismarine/prismarine run bench:bot-fleet -- --terrain real --preload-control
node --conditions=jsprismarine:dist benchmarks/runExternal.mjs benchmarks/chunkGeneration.ts <workers> 64 stages 8 2 3 shared - local 32 1
```

## Slice 1: what the server thread does for each completed chunk

Read from `DataDrivenGenerator.pooledChunk`, `deferChunkCompletion`, `World.readChunkInto` and `ChunkCompletionQueue`. For a chunk a worker has finished, the server thread runs these in order. Costs are from the join phase of `bench:bot-fleet -- --terrain real --no-preload`: 165 chunks, all `immediate` because players were waiting on them, load average 4.9 to 6.4 (second run; the first, with 164 chunks, read within 3% of it).

| Label                 | What runs                                                                                                            | Per chunk | Moves off the thread?                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `worker-result`       | Adopt the worker's region, then translate Java block states to Bedrock runtime ids and build the `Chunk` (`toChunk`) | 3.15 ms   | The largest piece. The mapping tables live on this thread, so it needs the wire-ready worker payload the plan describes. Not done. |
| `chunk-lighting`      | `systems.onChunkLoaded`, light initialization                                                                        | 0.89 ms   | Candidate for a worker; `packages/lighting` is separate. Not done.                                                                 |
| `chunk-register`      | `packBlockStorage`, the chunk map, player reference counts, portal index, entity-cache invalidation                  | 0.70 ms   | Must stay: it publishes the chunk.                                                                                                 |
| `chunk-fluids`        | Scan for fluid that borders air and schedule its ticks                                                               | 0.61 ms   | Needs no worker; it can wait. See below.                                                                                           |
| `chunk-entities/wall` | Register stored and generated entities, wall time                                                                    | 0.04 ms   | Cheap.                                                                                                                             |

The five add up to about 5.4 ms of server thread per chunk. Also on the thread and not in the table: receiving each worker result, which is deserialization plus a promise reaction on the event loop, and the network encode and send. Slice 0 saw lateness rise by about 250 ms at the 99th percentile during a 289-chunk preload while the tick's own work did not grow, which points at that receive path, but the labels do not cover it.

Per-chunk `worker-result` cost read 0.46 ms in the preload and 3.15 ms in the join phase. The join phase starts cold, so the mean carries first-use costs for tables and JIT. The preload number is closer to warm cost, and the table above likely overstates steady state. This is not resolved.

**What changed.** The fluid scan of a background chunk (`soon` or `idle`) now waits in the completion queue's lanes, behind lighting, instead of running as part of the load. A chunk a player is waiting on still runs it in place. A test covers both. Output is unchanged: `bench:chunks` with six workers on the `stages` arm produced the identical output digest before and after (`37b61888…bf1a`).

**What did not change, and the acceptance result.** The plan asks for each moved piece to drop off the server thread and the main-thread cost per completed chunk to fall. In the measured scenario it did not: every chunk was `immediate`, so the fluid scan still ran in place at 0.61 ms, and the 165-chunk totals before and after agree within noise (fluids 0.62 and 0.61 ms; `worker-result` 3.23 and 3.15 ms). The deferral bounds the burst a background preload adds, which I did not measure. The two largest pieces, translation and lighting, stay on the thread because moving them is a redesign of what a worker returns and what runs where, and I did not get to it. No client-e2e run was made for this change. Slice 1's target is therefore **not met**.

## Slice 2: the generation host process

`chunk-host: process` runs the stage workers in a forked generation host at a lowered priority. The default stays `in-process`, for the reasons under "Deviations" below.

**Identical output across transports.** `bench:chunks` with six workers, 64 chunks, seed 1234, the real pipeline and registries: the `stages` arm (threads in the server process) and the `stages-host` arm (workers in the host) both produced output digest `37b61888638f…`. The same digest as before slice 1's change. The unit tests also compare bytes through both transports over a grid of chunks in two different orders.

**Throughput and server CPU.** Same command, three samples each, load average at start 2.5 for threads and 5.3 for the host, so the comparison is confounded by load.

| Arm               | Chunks per second (p50 run) | Chunks per worker CPU-second | Server process CPU per 64-chunk run |
| ----------------- | --------------------------- | ---------------------------- | ----------------------------------- |
| `stages`, threads | 25.5                        | 5.64, 5.78, 5.66             | 17.5 to 18.1 s, workers included    |
| `stages-host`     | 23.7                        | 6.10, 5.64, 5.64             | 0.83 to 0.93 s                      |

The server process's CPU falls from about 18 s to under 1 s because the workers moved out of it. The 0.9 s that remains is receiving results, translating them and the harness, about 14 ms per chunk. The 7% lower throughput with the host is inside what the load difference could explain.

**Cost of the pipe hop.** A one-worker pool returning a buffer of the given size, 300 tasks after 20 warmup tasks, load average 6.1:

| Payload | In process, wall per task | Host, wall per task | Host, server CPU per task |
| ------- | ------------------------- | ------------------- | ------------------------- |
| 1 KiB   | 0.047 ms                  | 0.095 ms            | 0.027 ms                  |
| 192 KiB | 0.101 ms                  | 0.287 ms            | 0.215 ms                  |
| 1 MiB   | 0.235 ms                  | 0.792 ms            | 0.702 ms                  |

At the size of a column the hop adds about 0.19 ms of wall time and about 0.2 ms of server CPU per task. The in-process CPU column is not comparable because it includes the worker thread's work.

**Tick cost of generation with the host**, same preload as above, two runs on separate builds (the second with the governor driver running):

| Run                  | Load average at arm start | Tick p99 difference | Lateness p99 held back | Lateness p99 full speed |
| -------------------- | ------------------------- | ------------------- | ---------------------- | ----------------------- |
| Host                 | 3.99                      | -1.64 ms            | 92 ms                  | 253 ms                  |
| Host, governor wired | 4.53                      | -2.37 ms            | 67 ms                  | 256 ms                  |
| Threads              | 3.41                      | -1.57 ms            | 75 ms                  | 299 ms                  |

These do not separate the host from threads. Lateness rose by about 160 to 225 ms in each. A lowered priority on a machine with six performance cores for six workers, a main thread and some other sessions does not change what delays the event loop here, which is work on the main thread and not competition for a core.

**Checked.**

- The host's priority reads as lowered on macOS: `os.getPriority(pid)` is above zero in the test and the server's own stays at zero.
- A host killed with SIGKILL in the middle of a 400 ms task is replaced and the task returns the same bytes.
- A host entry that exits at startup falls back to the in-process pool and reports why.
- `destroy` leaves no process behind (`process.kill(pid, 0)` throws).
- `cancel` drops a waiting task with the `GenerationCanceledError` class intact, and a held task is dropped without asking the host.

**Not checked.** The host's priority on Linux and Windows. A second Ctrl+C during a preload exiting: the host ignores SIGINT and exits when its channel closes, but I did not run it. A client joining through the client-e2e skill with `chunk-host: process`. A compiled single-file executable, which cannot start the host role yet and keeps the in-process pool.

**Deviations from the plan.** `chunk-host` defaults to `in-process` where the plan has the server pick the host when it can, because nothing here ran an end-to-end client against it. The host runs the stage pool, which is the path the server uses, and not the sharded whole-chunk pool. The `workerHeapStats` and `workerStartupStats` benchmark buffers are shared memory and do not reach the host.

## Slice 3: the concurrency governor

`ConcurrencyGovernor` starts at half the workers, rises by one after each calm second, and halves when a tick starts more than 25 ms late or the control group was throttled since the last reading, with a two second hold-off before it rises again. `immediate` tasks never count against it. `GenerationGovernorDriver` feeds it every tick from the tick recorder and reads the throttle counter once a second. The server runs it when `chunk-host` is `process`.

**Checked.** Unit tests drive the controller and the driver with a fake clock through a calm period, a burst of late ticks and a recovery, assert the active count, and assert that the pool never limits `immediate` tasks or holds them. The parsers have tests for both layouts.

**The control group layout, read from the kernel documentation on 2026-11-09.** In the [cgroup v2 document](https://docs.kernel.org/admin-guide/cgroup-v2.html), `cpu.stat` is a flat keyed file of `KEY VALUE` lines whose durations are in microseconds. It always has `usage_usec`, `user_usec` and `system_usec`, and with the controller enabled also `nr_periods`, `nr_throttled`, `throttled_usec`, `nr_bursts` and `burst_usec`. Those five are non-hierarchical: they count throttling from the group's own limit and not from an ancestor's, and `cpu.stat.local` has the throttling a group's runqueues actually saw. `cpu.max` is `$MAX $PERIOD`, `max` for no limit, default `max 100000`. A process's version 2 group is the `0::$PATH` line of `/proc/$PID/cgroup`. The [bandwidth control document](https://docs.kernel.org/scheduler/sched-bwc.html) gives the version 1 `cpu.stat` fields `nr_periods`, `nr_throttled` and `throttled_time`, in nanoseconds. The sampler reads `nr_throttled` for both.

**Could not verify.** Anything on Linux: this machine runs macOS, so the sampler returned nothing and the throttle path ran only against fake files. The documented ancestor caveat means a process inside a nested group whose ancestor holds the quota would not see its counter rise, and the code does not read `cpu.stat.local` or walk up to the ancestor. The tick-isolation run in a container with a quota at half the machine was not made: the Docker daemon was not running. With the governor wired I could not see it act in the preload run, because the benchmark does not report the limit; the preload ran all 289 chunks in every arm.
