# World generation baseline, measured for the decoupling plan

Measured 2026-11-09 on an Apple M1 Pro (8 cores: 6 performance, 2 efficiency) with Node v26.12.1, for slice 0 of [worldgen-decoupling.md](../plans/worldgen-decoupling.md). Every figure carries the load average from `uptime` taken at the start of its run. The machine is shared with other sessions, and every run here had a load average between 3 and 5 while it ran, so treat the figures as indicative. Nothing here was estimated.

## Chunks per CPU-second

`bench:chunks` with the `stages` arm, which is the pool the server runs: 64 chunks in a 8 by 8 block, seed 1234, one warmup and three samples, shared climate tables. Chunks per CPU-second is chunks completed over the summed worker thread CPU time of all tasks, including each worker's first task, which builds its pipeline.

| Workers | Chunks per second (p50 run) | Chunks per CPU-second, three runs | Load average at start |
| --- | --- | --- | --- |
| 1 | 11.0 | 12.25, 12.24, 12.22 | 4.77 |
| 2 | 18.8 | 10.69, 10.66, 10.74 | 3.90 |
| 4 | 23.7 | 6.99, 6.91, 7.08 | 3.55 |
| 6 | 25.3 | 5.70, 5.81, 5.36 | 4.14 |

The provisional target of 3 chunks per CPU-second is met at every worker count, and the one-worker figure is far above ADR 0002's old 2.3 chunks per second on one thread. The useful finding is the trend: CPU cost per chunk grows as workers are added. A `features` task averages 8.5 ms of CPU with one worker and 33.5 ms with six, and a `terrain` task goes from 29 ms to 49 to 64 ms. Wall time per task grows the same way. Six workers on this machine share six performance cores with a load average of about four, so part of this is other sessions, and part is memory and cache contention between isolates. The table does not separate them.

## Task durations (worker wall time)

From the same runs. Shares are of tasks longer than 10 ms.

| Workers | Status and band | Tasks | Mean wall | Max wall | Longer than 10 ms |
| --- | --- | --- | --- | --- | --- |
| 1 | `terrain`, `immediate` | 192 | 29.3 ms | 35 ms | 100% |
| 1 | `terrain`, `soon` | 240 | 30.9 ms | 158 ms | 100% |
| 1 | `features`, `immediate` | 192 | 8.5 ms | 31 ms | 11% |
| 1 | `features`, `soon` | 108 | 9.8 ms | 36 ms | 20% |
| 6 | `terrain`, `immediate` | 192 | 55.8 ms | 165 ms | 100% |
| 6 | `terrain`, `soon` | 240 | 74.4 ms | 430 ms | 100% |
| 6 | `features`, `immediate` | 192 | 36.5 ms | 160 ms | 100% |
| 6 | `features`, `soon` | 108 | 29.7 ms | 103 ms | 100% |

The server's real path runs only `terrain` and `features` as pool tasks. Every `terrain` task is longer than 10 ms at any worker count. `features` is short with one worker and long with six.

## Tick cost of generation

`bench:bot-fleet -- --terrain real`, with the preload phase: a 17 by 17 region requested at `idle` all at once, 200 ticks per arm, six workers (the default), once with the region's tasks held back and once at full speed. Both arms use the same server. The bot fleets have disconnected by then; see the note on the stall below.

| Run | Load average at arm start | Tick p99, held back | Tick p99, full speed | Difference | Lateness p99, held back | Lateness p99, full speed | Chunks loaded |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 3.04 | 14.16 ms | 8.58 ms | -5.57 ms | 85 ms | 393 ms | 289 |
| 2 | 3.00 | 7.69 ms | 15.16 ms | +7.48 ms | 75 ms | 322 ms | 289 |
| Control, held back in both arms | 5.02 | 12.24 ms | 9.29 ms | -2.94 ms | 83 ms | 268 ms | 0 |

What the table says:

- The 99th percentile of the tick's own duration swings by about 6 ms in either direction between runs, and the control run, which does no generation, swings by 3 ms. The noise floor on this machine is several times the 1 ms target, so **the target cannot be confirmed or refuted with these runs**. The mean tick duration was lower with generation running in both runs (3.6 ms to 2.0 ms and 3.1 ms to 2.0 ms), which says the tick's own work does not grow.
- Lateness, the gap between a tick's due time and its start, is where generation shows. It rose from about 80 ms to 320 to 390 ms at the 99th percentile. The control run also reached 268 ms with no generation, so the same caveat applies, but the full-speed arm was highest in both runs. The tick's own work did not grow, so the delay is time the event loop spent on something else between ticks. The likely candidates are receiving and deserializing worker results and garbage collection, and the run does not say which.
- With the queue held back in both arms, the difference read -2.94 ms for tick duration, not zero. That is the noise, and the plan's "reads zero within noise" check is met only in the sense that the noise is as large as any effect seen here.

Main-thread cost per completed chunk, from the completion queue's labels: `worker-result` 0.473 ms and 0.459 ms per chunk in the two runs. The preload calls the generator directly, so the registration, lighting, fluid and entity labels are absent; the join phase exercises those.

## The queue wait is measured where it happens

`GenerationPool.test.ts` blocks a one-worker pool for 300 ms with a spinning task and asks for an `immediate` task behind it. The recorded backlog wait lands between 240 and 480 ms. The pool records the worker's own wall and CPU time per task beside the backlog wait.

## What did not work

Running the preload while the bot fleets were still connected froze the tick every time I tried it, in about ten runs with the pause held on a band, held on a region, and not held at all. In the three runs where I recorded it, the server thread was stopped inside `World.entityUpdates` on a `Player` with nothing outstanding in the generation pool, and stayed there until the benchmark was killed. The pool owed it nothing, so the awaited promise is not one the pool owes. One suspect is a chunk completion deferred to the next tick's drain while the tick itself awaits it, which cannot finish. That is not confirmed, and I did not test master for the same stall, so I cannot say whether the preload exposes an existing bug or the instrumentation causes one. The benchmark therefore stops the fleets before the preload unless `--preload-with-fleet` is passed. The pause takes a rule over tasks, and the benchmark holds only its own region, because a band hold would also hold tasks the bots' chunks depend on.

## Reproduction

```sh
pnpm --filter @jsprismarine/prismarine run bench:bot-fleet -- --terrain real
pnpm --filter @jsprismarine/prismarine run bench:bot-fleet -- --terrain real --preload-control
node --conditions=jsprismarine:dist benchmarks/runExternal.mjs benchmarks/chunkGeneration.ts <workers> 64 stages 8 2 3 shared - local 32 1
```

## Slice 1: what the server thread does for each completed chunk

Read from `DataDrivenGenerator.pooledChunk`, `deferChunkCompletion`, `World.readChunkInto` and `ChunkCompletionQueue`. For a chunk a worker has finished, the server thread runs these in order. Costs are from the join phase of `bench:bot-fleet -- --terrain real --no-preload`: 165 chunks, all `immediate` because players were waiting on them, load average 4.9 to 6.4 (second run; the first, with 164 chunks, read within 3% of it).

| Label | What runs | Per chunk | Moves off the thread? |
| --- | --- | --- | --- |
| `worker-result` | Adopt the worker's region, then translate Java block states to Bedrock runtime ids and build the `Chunk` (`toChunk`) | 3.15 ms | The largest piece. The mapping tables live on this thread, so it needs the wire-ready worker payload the plan describes. Not done. |
| `chunk-lighting` | `systems.onChunkLoaded`, light initialization | 0.89 ms | Candidate for a worker; `packages/lighting` is separate. Not done. |
| `chunk-register` | `packBlockStorage`, the chunk map, player reference counts, portal index, entity-cache invalidation | 0.70 ms | Must stay: it publishes the chunk. |
| `chunk-fluids` | Scan for fluid that borders air and schedule its ticks | 0.61 ms | Needs no worker; it can wait. See below. |
| `chunk-entities/wall` | Register stored and generated entities, wall time | 0.04 ms | Cheap. |

The five add up to about 5.4 ms of server thread per chunk. Also on the thread and not in the table: receiving each worker result, which is deserialization plus a promise reaction on the event loop, and the network encode and send. Slice 0 saw lateness rise by about 250 ms at the 99th percentile during a 289-chunk preload while the tick's own work did not grow, which points at that receive path, but the labels do not cover it.

Per-chunk `worker-result` cost read 0.46 ms in the preload and 3.15 ms in the join phase. The join phase starts cold, so the mean carries first-use costs for tables and JIT. The preload number is closer to warm cost, and the table above likely overstates steady state. This is not resolved.

**What changed.** The fluid scan of a background chunk (`soon` or `idle`) now waits in the completion queue's lanes, behind lighting, instead of running as part of the load. A chunk a player is waiting on still runs it in place. A test covers both. Output is unchanged: `bench:chunks` with six workers on the `stages` arm produced the identical output digest before and after (`37b61888…bf1a`).

**What did not change, and the acceptance result.** The plan asks for each moved piece to drop off the server thread and the main-thread cost per completed chunk to fall. In the measured scenario it did not: every chunk was `immediate`, so the fluid scan still ran in place at 0.61 ms, and the 165-chunk totals before and after agree within noise (fluids 0.62 and 0.61 ms; `worker-result` 3.23 and 3.15 ms). The deferral bounds the burst a background preload adds, which I did not measure. The two largest pieces, translation and lighting, stay on the thread because moving them is a redesign of what a worker returns and what runs where, and I did not get to it. No client-e2e run was made for this change. Slice 1's target is therefore **not met**.
