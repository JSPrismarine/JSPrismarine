import type { ChunkStatus } from './ChunkStatus';
import { CHUNK_STATUSES } from './ChunkStatus';
import type { ChunkStep } from './ChunkStep';
import { ChunkStepBuilder } from './ChunkStep';
import { ChunkgenErrors } from '@jsprismarine/errors/chunkgen';

/** Declares one rung: the requirements the jar's builder adds, and the block write radius. */
export type StepDeclaration = (builder: ChunkStepBuilder) => ChunkStepBuilder;

/**
 * The `addRequirement` and `blockStateWriteRadius` calls `ChunkPyramid.GENERATION_PYRAMID` makes,
 * transcribed from the 26.3 server jar in the order the bytecode has them.
 *
 * 26.3 has no `noise_biomes` rung. It climbs it here as a pass-through that declares nothing, so
 * the ladder is one list for both releases. The rung adds no requirement, so every other status's
 * accumulated radius is the jar's.
 *
 * Only `terrain` and `features` set a write radius. Every other step keeps the default of -1,
 * which makes `isWithinWriteZone` false for every position including its own chunk, so those steps
 * cannot write a block through the region at all.
 *
 * One row is not the jar's. Java's `full` declares nothing, because its feature pass has already
 * written through into the neighbor and there is nothing left to collect; ours reads its eight
 * neighbors at `features` to take the patches they recorded for it, so it declares that. The
 * accumulated table does not move: `full` already guaranteed `initialize_light` at distance 1,
 * which is above `features`, so every radius, `RADIUS_AROUND_FULL_CHUNK` and `SAFETY_MARGIN_CHUNKS`
 * read exactly what they read before. What changes is only that the read is now declared, and
 * therefore checked, rather than reaching past the window.
 */
const GENERATION_STEPS: Readonly<Record<ChunkStatus, StepDeclaration>> = {
    empty: (step) => step,
    structure_starts: (step) => step,
    structure_references: (step) => step.addRequirement('structure_starts', 8),
    noise_biomes: (step) => step,
    biomes: (step) => step.addRequirement('structure_starts', 8),
    terrain: (step) =>
        step.addRequirement('structure_starts', 8).addRequirement('biomes', 1).setBlockStateWriteRadius(0),
    features: (step) =>
        step.addRequirement('structure_starts', 8).addRequirement('terrain', 1).setBlockStateWriteRadius(1),
    initialize_light: (step) => step,
    light: (step) => step.addRequirement('initialize_light', 1),
    spawn: (step) => step.addRequirement('biomes', 1),
    full: (step) => step.addRequirement('features', 1)
};

/**
 * A step per status, built in ladder order so each one can close over the windows below it.
 *
 * Java has two of these. This is `GENERATION_PYRAMID`, the one that applies when a chunk has to be
 * generated. `LOADING_PYRAMID`, which applies when every chunk in range is already persisted deep
 * enough to read from disk, is not reproduced here.
 */
export class ChunkPyramid {
    private readonly steps: ReadonlyMap<ChunkStatus, ChunkStep>;

    /** @param declarations - One declaration per status, applied in {@link CHUNK_STATUSES} order. */
    public constructor(declarations: Readonly<Record<ChunkStatus, StepDeclaration>>) {
        const steps = new Map<ChunkStatus, ChunkStep>();
        for (const status of CHUNK_STATUSES) {
            steps.set(status, declarations[status](new ChunkStepBuilder(status, steps)).build());
        }
        this.steps = steps;
    }

    /** The step that takes a chunk from the status below up to this one. */
    public stepTo(status: ChunkStatus): ChunkStep {
        const step = this.steps.get(status);
        // Unreachable while `status` is a `ChunkStatus`: the constructor builds all eleven.
        if (step === undefined) throw new ChunkgenErrors.PyramidHasNoStep({ status });
        return step;
    }

    /**
     * How far a status must have spread around a chunk before that chunk can reach `target`.
     *
     * This is the number the parallel design turns on. For a `full` target it reads 11 for `empty`
     * and `structure_starts`, 3 for `structure_references` and `biomes`, 2 for `terrain`, 1 for
     * `features` and `initialize_light`, and 0 for `light` and `spawn`.
     *
     * @returns The radius in chunks, or -1 when the target does not depend on that status at all.
     */
    public radiusOf(status: ChunkStatus, target: ChunkStatus = 'full'): number {
        return this.stepTo(target).accumulatedDependencies.radiusOf(status);
    }
}

/** The pyramid a chunk climbs when it has to be generated rather than read from disk, as 26.3 has it. */
export const GENERATION_PYRAMID = new ChunkPyramid(GENERATION_STEPS);

/**
 * 26.4's `GENERATION_PYRAMID` calls, transcribed from the 26.4 Snapshot 10 jar.
 *
 * `noise_biomes` reads `empty` out to 8. `biomes` now needs only its eight neighbors at
 * `noise_biomes`, which it upscales from, where 26.3's read `structure_starts` out to 8. `terrain`
 * no longer declares `biomes` at 1, and `spawn` reads `features` at 1 where 26.3's read `biomes`.
 * `full` carries the same deviation as {@link GENERATION_STEPS}.
 */
const NOISE_BIOMES_GENERATION_STEPS: Readonly<Record<ChunkStatus, StepDeclaration>> = {
    empty: (step) => step,
    structure_starts: (step) => step,
    structure_references: (step) => step.addRequirement('structure_starts', 8),
    noise_biomes: (step) => step.addRequirement('empty', 8),
    biomes: (step) => step.addRequirement('noise_biomes', 1),
    terrain: (step) => step.addRequirement('structure_starts', 8).setBlockStateWriteRadius(0),
    features: (step) =>
        step.addRequirement('structure_starts', 8).addRequirement('terrain', 1).setBlockStateWriteRadius(1),
    initialize_light: (step) => step,
    light: (step) => step.addRequirement('initialize_light', 1),
    spawn: (step) => step.addRequirement('features', 1),
    full: (step) => step.addRequirement('features', 1)
};

/** 26.4's generation pyramid, which gives `noise_biomes` a step of its own. */
export const NOISE_BIOMES_GENERATION_PYRAMID = new ChunkPyramid(NOISE_BIOMES_GENERATION_STEPS);

/** 26.4 (data pack format 128) added the `noise_biomes` status and reshaped the pyramid around it. */
export const SINCE_NOISE_BIOMES_STATUS = 128;

/**
 * The generation pyramid of the release a target reads.
 *
 * @param format - The target's data pack format major, or undefined for the default release.
 */
export const generationPyramidFor = (format: number | undefined): ChunkPyramid =>
    format !== undefined && format >= SINCE_NOISE_BIOMES_STATUS ? NOISE_BIOMES_GENERATION_PYRAMID : GENERATION_PYRAMID;

/**
 * The widest ring a chunk reaching `full` drags in, which is 11, so a 23 by 23 neighborhood.
 *
 * Java derives `ChunkLevel.RADIUS_AROUND_FULL_CHUNK` from the same place, and its
 * `MAX_LEVEL = 33 + 11 = 44` follows from it.
 */
export const RADIUS_AROUND_FULL_CHUNK = GENERATION_PYRAMID.stepTo('full').accumulatedDependencies.radius;

/**
 * How far inside the world border generation has to stop, in chunks.
 *
 * Java's `ChunkPyramid.SAFETY_MARGIN_CHUNKS`, `(32 + accumulatedDependencies(full).size() + 1) * 2`,
 * which is 90 and is what `MAX_CHUNK_COORDINATE_VALUE` subtracts from the border. It is quoted here
 * because it is an arithmetic check on the table: a transcription slip anywhere in the pyramid
 * moves the accumulated length and therefore moves this number.
 */
export const SAFETY_MARGIN_CHUNKS = (32 + GENERATION_PYRAMID.stepTo('full').accumulatedDependencies.size + 1) * 2;
