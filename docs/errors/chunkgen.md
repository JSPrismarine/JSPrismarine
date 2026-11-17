---
title: '@jsprismarine/chunkgen errors'
description: The code, message and meaning of every error @jsprismarine/chunkgen throws.
group: Documents
category: Errors
---

# @jsprismarine/chunkgen errors

These are the errors `@jsprismarine/chunkgen` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.chunkgen -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class                       | What its errors mean                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChunkReadOutOfWindowError` | Raised when a status body asks for a chunk its step did not declare. Java builds a `CrashReport` titled "Exception generating new chunk" and throws `ReportedException` in the same place, from `WorldGenRegion.getChunk`. An undeclared read is a crash on the first chunk rather than a difference on the thousandth, which is the reason the step table is enforced rather than documented. |

## `CHUNKGEN_CHUNK_NOT_READY`

`The chunk at {chunkX}, {chunkZ} was read at {requested} while it holds {reached}.`

Thrown as `ChunkgenErrors.ChunkNotReady`, which extends `Error`.

A generation step read a neighboring chunk at a status that chunk has not reached, so the
scheduler ran a layer before the layer below it finished.

## `CHUNKGEN_CHUNK_READ_OUTSIDE_WINDOW`

`The {step} step read a chunk at distance {distance}, which is outside its window.`

Thrown as `ChunkgenErrors.ChunkReadOutsideWindow`, which extends `ChunkReadOutOfWindowError`.

A generation step read a chunk further away than its step allows. Such a read would make
generation depend on scheduling order, so it is refused; the step or its window is wrong.

## `CHUNKGEN_CHUNK_READ_PAST_GUARANTEE`

`The {step} step asked for {requested} at distance {distance}, where only {allowed} is guaranteed.`

Thrown as `ChunkgenErrors.ChunkReadPastGuarantee`, which extends `ChunkReadOutOfWindowError`.

A generation step read a neighbor at a later status than the step guarantees at that
distance. The step or its window is wrong.

## `CHUNKGEN_CHUNK_RELEASED_TOO_OFTEN`

`The chunk at {chunkX}, {chunkZ} has no reference left to release.`

Thrown as `ChunkgenErrors.ChunkReleasedTooOften`, which extends `RangeError`.

A task released a chunk it held no reference on, so some task released twice. This is a bug
in the generation scheduler; report it with the stack trace.

## `CHUNKGEN_CHUNK_STATUS_REGRESSION`

`A chunk at {from} cannot advance to {to}: a status body runs once and never runs backward.`

Thrown as `ChunkgenErrors.ChunkStatusRegression`, which extends `Error`.

A chunk was asked to move back to a status it already passed. Each status runs once, so this
is a scheduler bug.

## `CHUNKGEN_CHUNK_STEP_OUT_OF_ORDER`

`The chunk at {chunkX}, {chunkZ} cannot start {requested}: it has started {started}, and a chunk climbs the ladder one rung at a time.`

Thrown as `ChunkgenErrors.ChunkStepOutOfOrder`, which extends `Error`.

The scheduler started a generation status before the one beneath it on the same chunk.
Statuses run strictly in order, so this is a scheduler bug.

## `CHUNKGEN_DUPLICATE_FEATURE_PATCH`

`The neighbor at {dx}, {dz} has already handed over its feature patch. A chunk runs the features step once, so a second patch from the same chunk means the step ran twice.`

Thrown as `ChunkgenErrors.DuplicateFeaturePatch`, which extends `Error`.

A neighbor handed this chunk its feature writes twice, which means its features step ran
twice. This is a scheduler bug.

## `CHUNKGEN_EMBEDDED_PIPELINE_HAS_NO_FACTORY`

`{pipeline} does not export createGenerationPipeline`

Thrown as `ChunkgenErrors.EmbeddedPipelineHasNoFactory`, which extends `Error`.

The pipeline module bundled into the packaged server does not export
`createGenerationPipeline`, so the build is broken. Rebuild the executable.

## `CHUNKGEN_EMBEDDED_PIPELINE_OUTSIDE_EXECUTABLE`

`Cannot load embedded generation pipeline {asset} outside a single executable`

Thrown as `ChunkgenErrors.EmbeddedPipelineOutsideExecutable`, which extends `Error`.

A generation worker asked for a pipeline bundled into the packaged server while running from
source. Run the packaged executable, or start generation from source with a pipeline module
path.

## `CHUNKGEN_EMBEDDED_WORKER_FAILED_WITHOUT_ERROR`

`The embedded generation worker failed without an error`

Thrown as `ChunkgenErrors.EmbeddedWorkerFailedWithoutError`, which extends `Error`.

A generation worker reported a failure but sent no error with it. This is a bug in the
worker's error handling.

## `CHUNKGEN_FEATURE_PATCH_OUT_OF_RANGE`

`A feature pass offered a patch at offset {dx}, {dz}. The eight neighbors are the only legal targets: a write into the chunk's own columns applies immediately, and nothing past radius 1 is inside the write zone of the features step.`

Thrown as `ChunkgenErrors.FeaturePatchOutOfRange`, which extends `RangeError`.

A feature tried to write blocks outside the eight neighbors a features step may reach. A
feature that reaches that far is a bug in the feature or in its write radius.

## `CHUNKGEN_GENERATION_CANCELED`

`The chunk at {chunkX}, {chunkZ} was no longer wanted, so it was dropped from the queue.`

Thrown as `ChunkgenErrors.GenerationCanceled`, which extends `Error`.

Nothing wanted the chunk any more, such as a player who moved away, so the pool dropped it
before building it. Callers treat it as a cancellation.

## `CHUNKGEN_GENERATION_HOST_HAS_NO_POOL`

`The generation host has no pool`

Thrown as `ChunkgenErrors.GenerationHostHasNoPool`, which extends `Error`.

A task reached the generation process before its pool was set up. This is a bug in the
generation host's startup order.

## `CHUNKGEN_GENERATION_POOL_CLOSED`

`The generation pool is closed, so the chunk at {chunkX}, {chunkZ} was not built.`

Thrown as `ChunkgenErrors.GenerationPoolClosed`, which extends `Error`.

The chunk was not generated because the generation pool had shut down, which happens while
the server stops.

## `CHUNKGEN_HOST_EXITED_DURING_STARTUP`

`The generation host exited during startup`

Thrown as `ChunkgenErrors.HostExitedDuringStartup`, which extends `Error`.

The separate generation process exited before it was ready. Its own output, earlier in the
log, says why; a missing world generation cache or too little memory are the usual causes.

## `CHUNKGEN_INVALID_REUSABLE_INPUT`

`An encoded reusable input is a plain object`

Thrown as `ChunkgenErrors.InvalidReusableInput`, which extends `TypeError`.

A task input that names reusable values is not the shape the encoder writes. This is a bug in
the generation host protocol.

## `CHUNKGEN_MATH_RANDOM_IN_GENERATION`

`Math.random is seeded per V8 isolate, so a chunk that used it would depend on which worker built it. Draw from the seed and the position instead.`

Thrown as `ChunkgenErrors.MathRandomInGeneration`, which extends `Error`.

Generation code called `Math.random`, which would make a chunk depend on which worker built
it. Draw from the world seed and the chunk position instead.

## `CHUNKGEN_MISSING_GENERATION_LAYER`

`Reaching {target} needs a {status} layer, and the step table gives it no radius.`

Thrown as `ChunkgenErrors.MissingGenerationLayer`, which extends `Error`.

The generation step table gives no radius to a status the target needs. The table is
malformed; this is a bug in the pyramid's definition.

## `CHUNKGEN_MISSING_PIPELINE_FACTORY`

`{specifier} does not export createGenerationPipeline, so a worker has no status bodies to run.`

Thrown as `ChunkgenErrors.MissingPipelineFactory`, which extends `Error`.

The module a generation worker was told to load does not export `createGenerationPipeline`.
Point the pool at a pipeline module.

## `CHUNKGEN_NO_HOLDER_TO_RELEASE`

`No holder at {chunkX}, {chunkZ} to release.`

Thrown as `ChunkgenErrors.NoHolderToRelease`, which extends `RangeError`.

A task released a chunk nothing holds, so it released twice or released the wrong chunk. This
is a bug in the generation scheduler.

## `CHUNKGEN_POOL_IS_CLOSED`

`The embedded generation worker pool is closed`

Thrown as `ChunkgenErrors.PoolIsClosed`, which extends `Error`.

A chunk was asked of the generation pool after it shut down, which happens while the server
stops.

## `CHUNKGEN_POOL_WAS_CLOSED`

`The embedded generation worker pool was closed`

Thrown as `ChunkgenErrors.PoolWasClosed`, which extends `Error`.

The generation pool shut down while this chunk was waiting or being built, which happens
while the server stops.

## `CHUNKGEN_PYRAMID_HAS_NO_STEP`

`The pyramid has no step to {status}.`

Thrown as `ChunkgenErrors.PyramidHasNoStep`, which extends `Error`.

The generation pyramid was asked for a status it has no step for. Every chunk status has one,
so this is a bug.

## `CHUNKGEN_REUSABLE_MISS`

`The generation host holds no reusable input {key}`

Thrown as `ChunkgenErrors.ReusableMiss`, which extends `Error`.

The generation host was sent a reference to an input it no longer holds. The server answers
by sending the value itself, so this never reaches the log on its own.

## `CHUNKGEN_REUSABLE_SLOT_NOT_ARRAY`

`Reusable slot field {field} is not an array`

Thrown as `ChunkgenErrors.ReusableSlotNotArray`, which extends `TypeError`.

A task's reusable input names a field that does not hold a list. This is a bug in the
generation host protocol.

## `CHUNKGEN_SHARD_OUT_OF_RANGE`

`Shard {shard} is outside this pool.`

Thrown as `ChunkgenErrors.ShardOutOfRange`, which extends `RangeError`.

A chunk was routed to a generation shard the pool does not have. This is a bug in the sharded
pool.

## `CHUNKGEN_UNKNOWN_CHUNK_STATUS`

`{subject} is not a chunk status. The ten are {statuses}.`

Thrown as `ChunkgenErrors.UnknownChunkStatus`, which extends `Error`.

A value read as a chunk status is not one of the ten, such as a status saved by a newer
version of the server.

## `CHUNKGEN_WORKER_EXITED`

`Generation worker exited with code {code}`

Thrown as `ChunkgenErrors.WorkerExited`, which extends `Error`.

A generation worker thread exited, often because it ran out of memory. Lower the number of
chunk workers, or give Node more memory.

## `CHUNKGEN_WORKER_FAILED`

`{message}`

Thrown as `ChunkgenErrors.WorkerFailed`, which extends `Error`.

A generation worker's task threw. The message, name and stack are the worker's own, carried across the thread boundary.

## `CHUNKGEN_WORKER_HAS_NO_HEAP_STATS_SLOT`

`Worker {threadId} has no slot in the chunk-worker heap stats buffer`

Thrown as `ChunkgenErrors.WorkerHasNoHeapStatsSlot`, which extends `RangeError`.

A generation worker started with a thread id the shared statistics buffer has no room for.
This is a bug in the pool's worker numbering.

## `CHUNKGEN_WORKER_HAS_NO_STARTUP_STATS_SLOT`

`Worker {threadId} has no slot in the chunk-worker startup stats buffer`

Thrown as `ChunkgenErrors.WorkerHasNoStartupStatsSlot`, which extends `RangeError`.

A generation worker started with a thread id the shared startup statistics buffer has no room
for. This is a bug in the pool's worker numbering.

## `CHUNKGEN_WORKER_RETURNED_UNEXPECTED_TASK`

`The embedded generation worker returned an unexpected task id`

Thrown as `ChunkgenErrors.WorkerReturnedUnexpectedTask`, which extends `Error`.

A generation worker answered a task it was not given. This is a bug in the generation pool;
report it with the stack trace.

## `CHUNKGEN_WORKER_WITHOUT_PARENT_THREAD`

`The embedded generation worker needs a parent thread`

Thrown as `ChunkgenErrors.WorkerWithoutParentThread`, which extends `Error`.

The generation worker module was run as a main thread. It only runs inside a worker the
generation pool starts.
<!-- /fact -->
