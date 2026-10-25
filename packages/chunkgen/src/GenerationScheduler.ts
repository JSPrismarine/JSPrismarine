import type { ChunkHolder, ChunkStepBody } from './ChunkHolder';
import { ChunkNotReadyError } from './ChunkHolder';
import type { ChunkHolderMap } from './ChunkHolderMap';
import type { ChunkPyramid } from './ChunkPyramid';
import { GENERATION_PYRAMID } from './ChunkPyramid';
import type { ChunkStatus } from './ChunkStatus';
import { CHUNK_STATUSES, indexOfStatus } from './ChunkStatus';
import type { ChunkStep } from './ChunkStep';
import type { ProtoChunk } from './ProtoChunk';
import type { StepTask, StepTasks } from './StepTasks';
import { StepRegion } from './StepTasks';

/** What a scheduler is built over. */
export interface GenerationSchedulerOptions {
    /** Where holders live and how long they live, shared by every run on this scheduler. */
    readonly holders: ChunkHolderMap;
    /** The status bodies. A status with no entry passes its chunk through. */
    readonly tasks: StepTasks;
    /** Defaults to {@link GENERATION_PYRAMID}, the table a chunk climbs when it must be generated. */
    readonly pyramid?: ChunkPyramid;
}

/**
 * Raised when the step table gives a layer below the target no radius at all.
 *
 * A well-formed pyramid cannot do this, because the target's accumulated dependencies name every
 * status below it. It is here so a transcription slip reports itself rather than appearing as a
 * chunk that skipped a rung.
 */
export class MissingGenerationLayerError extends Error {
    public override name = 'MissingGenerationLayerError';

    public constructor(
        public readonly target: ChunkStatus,
        public readonly status: ChunkStatus
    ) {
        super(`Reaching ${target} needs a ${status} layer, and the step table gives it no radius.`);
    }
}

/**
 * Drives chunks up the ladder, one layer of the neighborhood at a time.
 *
 * Java's `ChunkGenerationTask.runUntilWait`, with one run per call to {@link generate}. To bring a
 * chunk to a status, the neighborhood has to reach that status's dependencies first, so the run
 * walks the ladder from `empty` upward and at each rung applies the step to the square of chunks
 * the accumulated dependency table sizes. Driving one chunk to `terrain` is therefore five layers
 * at radii 9, 9, 1, 1 and 0, and driving one to `full` is ten at 11, 11, 3, 3, 2, 1, 1, 0, 0, 0.
 *
 * Concurrent runs share work rather than duplicate it, because a holder keeps one promise per
 * status and the second run to reach a rung awaits the first run's promise. Nine chunks asked for
 * at once build terrain over the union of their windows, not over nine separate windows: at a
 * `full` target that is 49 terrain bodies rather than 225.
 *
 * The result does not depend on the order runs arrive or how many are outstanding. Every body
 * reads through {@link StepRegion}, which refuses an input the step table did not declare, and
 * nothing re-enters a rung, so a status's inputs are the same set whichever run happened to create
 * its promise.
 *
 * Each run acquires its whole neighborhood before it runs a step and releases it at the end,
 * including when a body throws. A caller that needs the chunk to stay resident afterwards acquires
 * its own reference on the holder first; otherwise the holders are dropped and the returned
 * {@link ProtoChunk} is all that survives.
 */
export class GenerationScheduler {
    private readonly holders: ChunkHolderMap;
    private readonly tasks: StepTasks;
    private readonly pyramid: ChunkPyramid;

    /** @param options - The holder map, the status bodies, and optionally a pyramid to replace the generation one. */
    public constructor(options: GenerationSchedulerOptions) {
        this.holders = options.holders;
        this.tasks = options.tasks;
        this.pyramid = options.pyramid ?? GENERATION_PYRAMID;
    }

    /**
     * The layers a run walks for a target, from `empty` up to the target itself.
     *
     * @returns One entry per status, in ladder order, with the radius in chunks of the square that
     * layer applies its step to.
     */
    public layersFor(target: ChunkStatus): ReadonlyArray<readonly [ChunkStatus, number]> {
        const step = this.pyramid.stepTo(target);
        return CHUNK_STATUSES.slice(0, indexOfStatus(target) + 1).map(
            (status) => [status, step.accumulatedRadiusOf(status)] as const
        );
    }

    /**
     * Brings one chunk to a status, bringing its neighborhood to that status's dependencies first.
     *
     * @returns The chunk at `target`. It is the live chunk the holder owns, so a later run that
     * drives it further changes the same object.
     * @throws MissingGenerationLayerError when the step table leaves a layer below the target
     * without a radius.
     */
    public async generate(chunkX: number, chunkZ: number, target: ChunkStatus): Promise<ProtoChunk> {
        const targetStep = this.pyramid.stepTo(target);
        const held = this.holders.acquireSquare(chunkX, chunkZ, targetStep.accumulatedRadiusOf('empty'));
        try {
            for (const [status, radius] of this.layersFor(target)) {
                if (radius < 0) throw new MissingGenerationLayerError(target, status);
                // One barrier per layer, where Java yields on the first unsettled future and
                // reattaches. Both orders satisfy the same rule, that a layer runs only once the
                // wider layer below it has finished; this one states it in a line.
                await this.runLayer(chunkX, chunkZ, status, radius);
            }
            return this.holderAt(chunkX, chunkZ, target).chunkAt(target);
        } finally {
            this.holders.releaseAll(held);
        }
    }

    /** Applies one status to every chunk in the square of `radius` around the center. */
    private runLayer(centerX: number, centerZ: number, status: ChunkStatus, radius: number): Promise<unknown> {
        const step = this.pyramid.stepTo(status);
        const task = this.tasks[status];
        const layer: Promise<ProtoChunk>[] = [];

        for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const holder = this.holderAt(centerX + dx, centerZ + dz, status);
                layer.push(holder.applyStep(step, this.bodyFor(step, task)));
            }
        }
        return Promise.all(layer);
    }

    /**
     * Wraps a status body so it sees a window-checked region, or passes the chunk through when the
     * status has no body yet.
     */
    private bodyFor(step: ChunkStep, task: StepTask | undefined): ChunkStepBody {
        if (task === undefined) return (chunk) => chunk;
        return (chunk) => task(new StepRegion(step, chunk, this.readNeighbor));
    }

    /** Reads a neighbor the step table has already allowed. An arrow so the region can carry it. */
    private readonly readNeighbor = (chunkX: number, chunkZ: number, status: ChunkStatus): ProtoChunk =>
        this.holderAt(chunkX, chunkZ, status).chunkAt(status);

    private holderAt(chunkX: number, chunkZ: number, status: ChunkStatus): ChunkHolder {
        const holder = this.holders.get(chunkX, chunkZ);
        // Every chunk a run touches is inside the square it acquired up front, so a miss means
        // either a body read past its window or a task released a reference it did not own.
        if (holder === undefined) throw new ChunkNotReadyError(chunkX, chunkZ, status, undefined);
        return holder;
    }
}
