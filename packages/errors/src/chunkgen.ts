import { defineErrors, JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';

/**
 * Raised when a status body asks for a chunk its step did not declare.
 *
 * Java builds a `CrashReport` titled "Exception generating new chunk" and throws
 * `ReportedException` in the same place, from `WorldGenRegion.getChunk`. An undeclared read is a
 * crash on the first chunk rather than a difference on the thousandth, which is the reason the
 * step table is enforced rather than documented.
 */
export abstract class ChunkReadOutOfWindowError extends JSPrismarineError {
    public override name = 'ChunkReadOutOfWindowError';
}

/** The errors `@jsprismarine/chunkgen` throws. */
export const ChunkgenErrors = defineErrors('chunkgen', {
    /**
     * A generation worker asked for a pipeline bundled into the packaged server while running from
     * source. Run the packaged executable, or start generation from source with a pipeline module
     * path.
     */
    EmbeddedPipelineOutsideExecutable: 'Cannot load embedded generation pipeline {asset} outside a single executable',
    /**
     * A task released a chunk it held no reference on, so some task released twice. This is a bug
     * in the generation scheduler; report it with the stack trace.
     */
    ChunkReleasedTooOften: {
        message: 'The chunk at {chunkX}, {chunkZ} has no reference left to release.',
        base: RangeError
    },
    /**
     * The pipeline module bundled into the packaged server does not export
     * `createGenerationPipeline`, so the build is broken. Rebuild the executable.
     */
    EmbeddedPipelineHasNoFactory: '{pipeline} does not export createGenerationPipeline',
    /**
     * The generation worker module was run as a main thread. It only runs inside a worker the
     * generation pool starts.
     */
    WorkerWithoutParentThread: 'The embedded generation worker needs a parent thread',
    /**
     * A chunk was asked of the generation pool after it shut down, which happens while the server
     * stops.
     */
    PoolIsClosed: 'The embedded generation worker pool is closed',
    /**
     * The generation pool shut down while this chunk was waiting or being built, which happens
     * while the server stops.
     */
    PoolWasClosed: 'The embedded generation worker pool was closed',
    /**
     * A generation worker answered a task it was not given. This is a bug in the generation pool;
     * report it with the stack trace.
     */
    WorkerReturnedUnexpectedTask: 'The embedded generation worker returned an unexpected task id',
    /**
     * A task input that names reusable values is not the shape the encoder writes. This is a bug in
     * the generation host protocol.
     */
    InvalidReusableInput: { message: 'An encoded reusable input is a plain object', base: TypeError },
    /**
     * The separate generation process exited before it was ready. Its own output, earlier in the
     * log, says why; a missing world generation cache or too little memory are the usual causes.
     */
    HostExitedDuringStartup: 'The generation host exited during startup',
    /**
     * A generation worker thread exited, often because it ran out of memory. Lower the number of
     * chunk workers, or give Node more memory.
     */
    WorkerExited: 'Generation worker exited with code {code}',
    /**
     * Generation code called `Math.random`, which would make a chunk depend on which worker built
     * it. Draw from the world seed and the chunk position instead.
     */
    MathRandomInGeneration:
        'Math.random is seeded per V8 isolate, so a chunk that used it would depend on which worker built it. Draw from the seed and the position instead.',
    /**
     * A task released a chunk nothing holds, so it released twice or released the wrong chunk. This
     * is a bug in the generation scheduler.
     */
    NoHolderToRelease: { message: 'No holder at {chunkX}, {chunkZ} to release.', base: RangeError },
    /**
     * The generation pyramid was asked for a status it has no step for. Every chunk status has one,
     * so this is a bug.
     */
    PyramidHasNoStep: 'The pyramid has no step to {status}.',
    /**
     * A task's reusable input names a field that does not hold a list. This is a bug in the
     * generation host protocol.
     */
    ReusableSlotNotArray: { message: 'Reusable slot field {field} is not an array', base: TypeError },
    /**
     * A chunk was routed to a generation shard the pool does not have. This is a bug in the sharded
     * pool.
     */
    ShardOutOfRange: { message: 'Shard {shard} is outside this pool.', base: RangeError },
    /**
     * A generation worker started with a thread id the shared statistics buffer has no room for.
     * This is a bug in the pool's worker numbering.
     */
    WorkerHasNoHeapStatsSlot: {
        message: 'Worker {threadId} has no slot in the chunk-worker heap stats buffer',
        base: RangeError
    },
    /**
     * A generation worker started with a thread id the shared startup statistics buffer has no room
     * for. This is a bug in the pool's worker numbering.
     */
    WorkerHasNoStartupStatsSlot: {
        message: 'Worker {threadId} has no slot in the chunk-worker startup stats buffer',
        base: RangeError
    },
    /**
     * The scheduler started a generation status before the one beneath it on the same chunk.
     * Statuses run strictly in order, so this is a scheduler bug.
     */
    ChunkStepOutOfOrder:
        'The chunk at {chunkX}, {chunkZ} cannot start {requested}: it has started {started}, and a chunk climbs the ladder one rung at a time.',
    /**
     * A generation step read a neighboring chunk at a status that chunk has not reached, so the
     * scheduler ran a layer before the layer below it finished.
     */
    ChunkNotReady: 'The chunk at {chunkX}, {chunkZ} was read at {requested} while it holds {reached}.',
    /**
     * A value read as a chunk status is not one of the ten, such as a status saved by a newer
     * version of the server.
     */
    UnknownChunkStatus: '{subject} is not a chunk status. The ten are {statuses}.',
    /**
     * A feature tried to write blocks outside the eight neighbors a features step may reach. A
     * feature that reaches that far is a bug in the feature or in its write radius.
     */
    FeaturePatchOutOfRange: {
        message:
            "A feature pass offered a patch at offset {dx}, {dz}. The eight neighbors are the only legal targets: a write into the chunk's own columns applies immediately, and nothing past radius 1 is inside the write zone of the features step.",
        base: RangeError
    },
    /**
     * A neighbor handed this chunk its feature writes twice, which means its features step ran
     * twice. This is a scheduler bug.
     */
    DuplicateFeaturePatch:
        'The neighbor at {dx}, {dz} has already handed over its feature patch. A chunk runs the features step once, so a second patch from the same chunk means the step ran twice.',
    /**
     * The chunk was not generated because the generation pool had shut down, which happens while
     * the server stops.
     */
    GenerationPoolClosed: 'The generation pool is closed, so the chunk at {chunkX}, {chunkZ} was not built.',
    /**
     * Nothing wanted the chunk any more, such as a player who moved away, so the pool dropped it
     * before building it. Callers treat it as a cancellation.
     */
    GenerationCanceled: 'The chunk at {chunkX}, {chunkZ} was no longer wanted, so it was dropped from the queue.',
    /**
     * The generation step table gives no radius to a status the target needs. The table is
     * malformed; this is a bug in the pyramid's definition.
     */
    MissingGenerationLayer: 'Reaching {target} needs a {status} layer, and the step table gives it no radius.',
    /**
     * A chunk was asked to move back to a status it already passed. Each status runs once, so this
     * is a scheduler bug.
     */
    ChunkStatusRegression: 'A chunk at {from} cannot advance to {to}: a status body runs once and never runs backward.',
    /**
     * The module a generation worker was told to load does not export `createGenerationPipeline`.
     * Point the pool at a pipeline module.
     */
    MissingPipelineFactory:
        '{specifier} does not export createGenerationPipeline, so a worker has no status bodies to run.',
    /**
     * The generation host was sent a reference to an input it no longer holds. The server answers
     * by sending the value itself, so this never reaches the log on its own.
     */
    ReusableMiss: 'The generation host holds no reusable input {key}',
    /**
     * A generation step read a chunk further away than its step allows. Such a read would make
     * generation depend on scheduling order, so it is refused; the step or its window is wrong.
     */
    ChunkReadOutsideWindow: {
        message: 'The {step} step read a chunk at distance {distance}, which is outside its window.',
        base: ChunkReadOutOfWindowError
    },
    /**
     * A generation step read a neighbor at a later status than the step guarantees at that
     * distance. The step or its window is wrong.
     */
    ChunkReadPastGuarantee: {
        message: 'The {step} step asked for {requested} at distance {distance}, where only {allowed} is guaranteed.',
        base: ChunkReadOutOfWindowError
    },
    /**
     * A task reached the generation process before its pool was set up. This is a bug in the
     * generation host's startup order.
     */
    GenerationHostHasNoPool: 'The generation host has no pool',
    /**
     * A generation worker reported a failure but sent no error with it. This is a bug in the
     * worker's error handling.
     */
    EmbeddedWorkerFailedWithoutError: 'The embedded generation worker failed without an error',
    /** A generation worker's task threw. The message, name and stack are the worker's own, carried across the thread boundary. */
    WorkerFailed: '{message}'
});
