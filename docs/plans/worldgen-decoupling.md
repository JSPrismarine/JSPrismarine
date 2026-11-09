# Decoupling world generation from gameplay

The goal is to generate several chunks per second per core while the server holds 20 ticks per second for ordinary play, with generation running as a background job that players cannot feel. This plan is the first stage of getting there. It covers the machinery around the generator, which is the part that decides whether generation hurts the tick. Making the generator itself cheaper is a second track that this plan only sets up.

The reasoning and the sources are in [worldgen-pool-and-pipeline-architecture.md](../research/worldgen-pool-and-pipeline-architecture.md). The decision this plan builds on is [ADR 0002](../adr/0002-chunk-generation-architecture.md), and the slices there are in [chunk-generation-rewrite.md](chunk-generation-rewrite.md). This file is a draft. Slices 0 and 1 are specified in full because everything after them depends on what they measure, and the later slices are specified to the level that the evidence so far supports.

## Progress

Branch `t3/596e4adc`, 2026-11-09. Measurements and their load averages are in [worldgen-decoupling-baseline.md](../research/worldgen-decoupling-baseline.md). The host decision is [ADR 0005](../adr/0005-generation-host-process.md).

| Slice             | State                                                                                                                                                                                              | Where                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 0 measure         | Done. Pool task stats, tick recorder, completion labels, preload phase in `bench:bot-fleet`. Tick cost of generation is inconclusive: the noise floor on a shared machine is several milliseconds. | `GenerationStats.ts`, `TickRecorder.ts`, `botFleetLoad.bench.ts`               |
| 1 completion path | Partly done. Fluid scan of background chunks is queued. The target (lower main-thread cost per chunk) is not met: translation 3.15 ms and lighting 0.89 ms per chunk stay on the thread.           | `World.ts`, baseline note                                                      |
| 2 host process    | Done, opt-in (`chunk-host: process`). Digests identical across transports.                                                                                                                         | `HostedGenerationPool.ts`, `generationHost.ts`, `createGenerationTransport.ts` |
| 3 governor        | Done and unit tested, runs when `chunk-host` is `process`. Not observed acting in a benchmark, and the quota run in a container was not made.                                                      | `ConcurrencyGovernor.ts`, `GenerationGovernorDriver.ts`                        |
| 4 work board      | Not built, on purpose.                                                                                                                                                                             | [slice 4 decision](worldgen-decoupling-slice4-decision.md)                     |
| 5 throughput      | Pick written: the terrain density graph first, after a profile inside a terrain task.                                                                                                              | [first candidate](worldgen-throughput-first-candidate.md)                      |

### Open items

Each is a known gap, not a surprise. The first block is being worked in the order listed.

1. Fixed: the tick freeze with fleets connected was a priority-blind admission queue whose slots were held by background builds, plus dependency tasks defaulting to `soon`. Counted by `schedulingOrder.test.ts`. The multi-second stalls seen afterwards came from a benchmark bug: the preload requested at `immediate` because urgency was passed as the wrong argument. With it fixed the worst fleet-connected tick was 472 ms in one noisy run. Earlier preload figures in the baseline note are history, not a background preload.

    Method note: judge fixes by counts (tasks started ahead of a player's chunk, calls, queue positions), not wall-clock timings, which a shared machine cannot separate from load.

2. Slice 1: move Bedrock translation and lighting off the server thread, or show why not.
3. The governor limit is not re-applied to a replacement pool, and the benchmark does not report it.
4. Tasks held by a pause bypass it when the host falls back. An invalid `chunk-host` value is silent.
5. `chunk-host` default flips to `process` only after a client-e2e run passes with it.
6. Not verified: host priority on Linux and Windows, the container quota run, a second Ctrl+C during a preload.

### Resuming

```sh
pnpm install
pnpm --filter @jsprismarine/bedrock-data run ensure:worldgen
pnpm --filter @jsprismarine/prismarine run bench:bot-fleet -- --terrain real [--host process] [--preload-control]
node --conditions=jsprismarine:dist benchmarks/runExternal.mjs benchmarks/chunkGeneration.ts <workers> 64 stages|stages-host 8 2 3 shared - local 32 1
```

Run benchmarks on an idle machine and keep the load average beside every figure. The two tests `WorldManager > loads every worlds entry` and `DimensionTravel ... respawn once the credits finish` fail on master as well.

## What "done" means

Three numbers define success. The first two have fixed definitions and the third gets its value from slice 0.

| Measure                              | Definition                                                                                                                       | Target                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Tick cost of generation              | 99th percentile tick duration during a full-speed preload, minus the same figure with generation idle, on one machine in one run | Under 1 ms                                                                                           |
| Main-thread cost per completed chunk | Mean CPU time the server thread spends between a worker returning a chunk and the last player being sent it                      | Set by slice 1, and low enough that the completion slice of a tick fits the chunks that finish in it |
| Chunks per CPU-second                | Chunks completed divided by the summed thread CPU time of all generation workers, at `immediate` and `idle` priority             | At least 3, provisional until slice 0 reports the current figure                                     |

The 3 comes from the stated goal of several chunks per core. ADR 0002's last measurements, taken before the later terrain work and on a loaded host, were 2.3 chunks per second on one thread and 8 per second across six workers, which is about 1.3 per core. Those figures are the reason slice 0 exists.

### Measuring these without a clock

The three targets above are written in milliseconds and chunks per second. [AGENTS.md](../../AGENTS.md#measuring-performance) rules wall-clock figures out as evidence, so each target needs a counted stand-in. Until a slice adopts one, its target is unverified, whatever a timing run says.

| Target | Counted stand-in | Where it lives |
| --- | --- | --- |
| Tick cost of generation | Background tasks that start ahead of a player's chunk, bounded by what the workers already held. Completions run per drain, bounded by the queue's slice. | `schedulingOrder.test.ts`, `ChunkCompletionQueue.test.ts` |
| Main-thread cost per completed chunk | Operations per chunk on the server thread: palette entries translated, sections built, completions queued. | To write for slice 1 |
| Chunks per CPU-second | Worker tasks per chunk by status (about 2.25 `terrain` and 1.56 `features` in the baseline), and tasks that run more than once. | `GenerationStats`, task counts |

The timing figures in [the baseline note](../research/worldgen-decoupling-baseline.md) are diagnostics taken at load averages of 3 to 12 and prove nothing.

## Before any slice

Read the research note above, then ADR 0002 sections "What it measured once it was built" and "What guarantees byte-identical output". The second one defines the parity contract every slice must keep.

The real worldgen data must be on disk for anything that generates chunks. `pnpm --filter @jsprismarine/bedrock-data run ensure:worldgen` fetches it and needs JDK 25 or newer, as the root `AGENTS.md` describes.

Run the benchmarks on an idle machine and record the load average next to every figure. ADR 0002 already records one case where the same chunk read 1064 ms, 8347 ms and 21435 ms under load. A number taken on a busy host is not evidence for or against a slice.

## The checks every slice runs

The four checks from [chunk-generation-rewrite.md](chunk-generation-rewrite.md#the-four-checks-every-slice-runs) (**corpus**, **generator**, **sampler** and **types**) apply unchanged, and none of these slices may change generated blocks. Every digest stays byte-identical. A slice that moves work between threads or processes also proves identical digests across the topologies it adds. This plan adds one more check.

| Label              | Command                                                                                                            | What it holds                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| **tick-isolation** | `pnpm --filter @jsprismarine/prismarine run bench:bot-fleet -- --terrain real` with the preload phase from slice 0 | The tick cost of generation stays under its target |

Run `pnpm run lint` and add a Changeset for every package a slice changes, choosing the bump from [the versioning policy](../guide/versioning.md).

## Slice 0: measure the baseline and the player impact

**What changes.** Nothing about behavior. The server gains the measurements this plan's targets are written in, and the bot fleet benchmark gains a phase that shows generation hurting or not hurting the tick.

**Instrumentation.** For each generation task, record queue wait time and run time by status and by priority band. Record each worker's thread CPU time, which the existing `workerStartupStats` sink in `GenerationPool.ts` already does for a worker's first task and can be extended to every task. Record the server thread's tick lateness, meaning the gap between when a tick was due and when it started, and attribute it to a cause where the profiler can. `ChunkCompletionQueue` already keeps per-label CPU time and queue age, so report those too.

**The benchmark.** `packages/prismarine/benchmarks/botFleetLoad.bench.ts` already runs a seeded bot fleet against a headless server with fixed-tick phases and supports real terrain. Add a preload phase that requests a large view-distance region at once, and run it twice per invocation, once with generation workers at full speed and once with the generation queue paused, so the output is the difference and not two numbers to compare by eye. Keep the existing phases and baseline file unchanged.

**Files.** `packages/chunkgen/src/GenerationPool.ts`, `packages/chunkgen/src/generationWorker.ts`, `packages/prismarine/src/profiling/ServerProfiler.ts`, `packages/prismarine/src/world/ChunkScheduler.ts`, `packages/prismarine/src/world/ChunkCompletionQueue.ts`, `packages/prismarine/benchmarks/botFleetLoad.bench.ts`.

**Depends on.** Nothing.

**Prove it correct.** Two consecutive runs on an idle machine agree on the ordering of the numbers. With the queue paused, the tick-cost difference reads zero within noise. With a deliberately blocking task injected into a worker, the queue wait for the next `immediate` task rises by about the injected time, which shows the wait is measured where it should be.

**Prove no output change.** Instrumentation only. **corpus**, **generator**, **sampler** and **types** unchanged.

**Report.** The current chunks per CPU-second at one, two, four and six workers. The per-status and per-band task duration distribution, because slice 4 is decided by how many tasks run longer than about 10 ms. The tick cost of generation as defined above. The per-label main-thread cost of a completed chunk.

## Slice 1: shrink the completion path

**What changes.** Everything the server thread does after a worker returns a chunk. `ChunkCompletionQueue` already bounds this to a 2 ms slice per tick and its comment says the work includes promotion and lighting. This slice finds what else runs there, measures each piece with slice 0's per-label figures, and moves the largest pieces off the server thread or bounds them.

**Check first.** Read `ChunkCompletionQueue.ts`, `ChunkScheduler.ts` and the code the queue's `defer` callers run, and write down every action taken per completed chunk. The research note lists the candidates, which are Java-to-Bedrock palette translation, promotion, lighting, entity and block entity registration, save serialization and database writes, network encoding and compression, and the side effects of a chunk becoming active. Do not assume the list is complete or that each entry is expensive. Order the work by the measured cost.

**Direction for the moves.** Workers should return wire-ready section payloads, already compressed for the common compression settings, so the server thread wraps and sends them. Lighting is the one entry the code comment names explicitly, and `packages/lighting` is already a separate package, so evaluate running it in a worker against the chunk data the worker already holds. Anything that must stay on the server thread gets a per-chunk cost cap and a place in the completion queue's lanes.

**Files.** `packages/prismarine/src/world/ChunkCompletionQueue.ts`, `packages/prismarine/src/world/ChunkScheduler.ts`, `packages/prismarine/src/world/World.ts`, `packages/prismarine/src/world/generators/datadriven/javaTranslation.ts`, `packages/lighting`.

**Depends on.** Slice 0.

**Prove it correct.** The per-label report from slice 0 shows each moved piece dropping off the server thread and the worker cost rising by less than the saving. A client joining through the **client-e2e** skill sees the same chunks, lighting and block entities as before.

**Prove no output change.** All four checks unchanged, plus a byte comparison of the Bedrock chunk payloads before and after for the corpus chunks.

**Report.** Main-thread cost per completed chunk before and after, per label, and the new tick cost of generation.

## Slice 2: a generation host process

**What changes.** The generation pool moves into a child process that runs the same executable in a generation role. The server sets that process's operating system priority, communicates with it over a pipe, and falls back to today's in-process pool when it cannot spawn a child.

Node cannot lower one worker thread's priority portably. `os.setPriority` is per-process on macOS and Windows, and a worker that calls it lowers the whole server, which the research note reproduces. A process boundary is the portable way to give generation a lower priority, and it also gives generation its own heap and garbage collector and lets a crash or out-of-memory kill restart without taking the server down.

ADR 0002 rejected a separate generation process because it assumed the registry bundle and `SharedArrayBuffer` sharing would be lost. A host that runs its own worker pool keeps both between its workers, so the ADR's reasoning no longer applies to this design. The first commit of this slice is a new ADR that supersedes that paragraph and records what the host costs.

**Shape.** Define one transport interface for submitting a task and receiving a result, with the in-process pool and the host process as the two implementations. The task and result shapes are the ones `GenerationPool.ts` already defines. The server picks the host when it can start one and the configuration allows it. `singleExecutableWorker.ts` already handles compiled executables for workers, and the host role needs the same care.

**Files.** A new ADR under `docs/adr/`, `packages/chunkgen/src/GenerationPool.ts`, a new transport module in `packages/chunkgen/src`, `packages/chunkgen/src/singleExecutableWorker.ts`, `packages/prismarine/src/world/WorldManager.ts` for the lifecycle, and `packages/prismarine/src/Console.ts` and `packages/server/src/Server.ts` so shutdown stops the child.

**Depends on.** Slice 0, so the benefit is measured, and slice 1, so the results crossing the pipe are the small wire-ready payloads.

**Prove it correct.** The digests ADR 0002 specifies (identical across generation orders and pool sizes) are identical across both transports. Killing the host mid-task restarts it and the retried task returns the same bytes. A second Ctrl+C during a preload exits. The host's priority reads as lowered on macOS, Linux and Windows.

**Prove no output change.** All four checks unchanged.

**Report.** Chunks per CPU-second and tick cost of generation with the host against the in-process pool, and the per-chunk cost of the pipe hop.

## Slice 3: an adaptive concurrency governor

**What changes.** The host runs a fixed number of workers but permits only some of them to be active, and a controller adjusts that number from how the server is doing. The inputs are tick lateness, and on Linux the throttle counters in the control group's `cpu.stat` when the process is in a quota-limited group.

The cgroup case matters because a CPU quota is enforced per group. A generator that spends the quota freezes the tick whatever priority it has, so the controller has to back off before the quota runs out, and the throttle counters are what signal that. The research note covers the kernel behavior and notes that the cgroup version 2 file layout has not been checked against the version 2 document yet. Verify it as part of this slice.

**Shape.** Raise the active count slowly while ticks arrive on time and cut it sharply when they do not. `immediate` work is always admitted, so a chunk a player is standing on is never held back, and the controller only restricts `soon` and `idle` work. Park inactive workers on a shared futex word, not by terminating them, so resuming costs no startup.

**Files.** A new governor module in `packages/chunkgen/src`, the host entry from slice 2, `packages/prismarine/src/world/ChunkScheduler.ts` for the tick signal.

**Depends on.** Slice 2.

**Prove it correct.** Unit tests drive the controller with a fake clock through a calm period, a burst of late ticks and a recovery, and assert the active count and the `immediate` exemption. **tick-isolation** is run inside a container with a CPU quota at half the machine and the controller on and off, and the table reports the difference.

**Prove no output change.** All four checks unchanged.

**Report.** Tick cost of generation and chunks per CPU-second with and without the controller, on a host with no quota and on one with a quota.

## Slice 4: short tasks and a shared work board

**Do not start this slice before slice 0 reports.** It is worth doing only if the task duration distribution shows enough tasks longer than about 10 ms that an arriving `immediate` task waits noticeably, or if the tick stalls leave workers idle.

**What changes.** Two linked changes. The first splits long tasks, mostly `features`, into pieces that can be interleaved. Java derives each feature's random seed from the decoration seed, the feature index and the decoration step, so the output does not depend on how steps are grouped into tasks, and the 11 decoration steps are natural split points. State between steps then has to outlive the task, either by keeping the task on one worker or by holding it in shared memory.

The second change is for workers to claim tasks from shared memory instead of waiting for the server thread to hand them out. The research note measures what the current shape costs when tasks are short. With three workers and a tick that holds the thread for 45 ms of every 50, 1 ms tasks took 1847 ms against 201 ms when workers claimed work from a shared counter, and 10 ms tasks took 1017 ms against 201 ms. For tasks of 100 ms or more the effect was not visible in that experiment. The shared board holds per-chunk status words claimed by compare-and-exchange, ready queues per priority band, and dependency counters that the finishing worker decrements.

Prototype the board against the host's pool before committing to it, using the `prototype` skill, because this is the only piece with real concurrency hazards.

**Files.** `packages/chunkgen/src/GenerationPool.ts`, `packages/chunkgen/src/ShardedGenerationPool.ts`, `packages/chunkgen/src/StepTasks.ts`, `packages/chunkgen/src/ChunkHolder.ts`, `packages/chunkgen/src/generationWorker.ts`.

**Depends on.** Slices 0 and 2.

**Prove it correct.** The existing order-independence digests, plus a run that kills workers and flips priorities at random while generating and still produces identical bytes. A stress test hammers the board from many workers and checks that every task runs exactly once.

**Prove no output change.** All four checks unchanged.

**Report.** The task duration distribution before and after, the worst wait of an `immediate` task under a heavy tick, and the throughput change.

## Slice 5: the throughput track

This plan does not specify it, because the evidence is not in yet. Slice 0's profile decides it. ADR 0002 and [worldgen-defects.md](../research/worldgen-defects.md) disagree about whether terrain or the decoration pass and translation dominate, and the terrain work since then may have moved the answer.

The candidates, each of which becomes its own plan once the profile picks it, are a data-oriented feature world that replaces `BlockState` objects and position objects with interned ids and packed integers, a footprint analysis that runs only the features that can affect the requested region, a general range analysis over the density graph, and generated code for the density graph. The decision rule is that the profile's largest remaining cost goes first.

## Out of scope for now

Remote generation hosts are a later stage. The transport interface from slice 2 is the seam they would plug into, and the research note covers placement by region and the border cost. A GPU path is out of scope by request, and nothing here prevents it.

## Risks, worst first

**1. The tick isolation target may not be reachable by scheduling alone.** If slice 1 finds that the server thread's own per-chunk work is large and cannot move, the tick cost of generation has a floor set by chunk throughput. The remedy is a lower admission rate, which trades chunks per second for tick time, and the plan should report that trade honestly instead of hiding it.

**2. Priority behavior differs by platform.** The host's lowered priority is strong on Linux, weaker on macOS and different again on Windows. The controller in slice 3 exists because priority alone is not enough, and the tests have to cover the platforms the project supports.

**3. A child process may not be available.** Some compiled or sandboxed deployments cannot spawn the executable again. The in-process pool stays as a first-class fallback with a lower worker cap, and CI has to run both transports.

**4. The shared work board is the only slice with concurrency bugs.** It is last for that reason, gated on evidence, and prototyped first.

**5. Measurements on a busy machine mislead.** Slice 0 records load average beside every figure and the plan treats any number without it as unusable.
