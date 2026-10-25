import type { ChunkStatus } from './ChunkStatus';
import { isOrAfter, isOrBefore, maxStatus, parentOfStatus } from './ChunkStatus';

/**
 * The status each neighbor is guaranteed to have reached, indexed by Chebyshev distance from the
 * chunk being worked on.
 *
 * This is Java's `ChunkDependencies`. It is monotonically non-increasing in distance, and its
 * length is the number of rings the window covers, so distance `size` and beyond is outside the
 * window entirely rather than at a low status.
 */
export class ChunkDependencies {
    /** @param byDistance - Entry `d` is the status guaranteed at Chebyshev distance `d`. */
    public constructor(public readonly byDistance: readonly ChunkStatus[]) {}

    /** The status guaranteed at a distance, or undefined when the distance is outside the window. */
    public at(distance: number): ChunkStatus | undefined {
        return this.byDistance[distance];
    }

    /** The number of rings the window covers, counting the chunk itself as one. */
    public get size(): number {
        return this.byDistance.length;
    }

    /** The outermost distance the window reaches, or -1 when the window is empty. */
    public get radius(): number {
        return this.byDistance.length - 1;
    }

    /**
     * The radius out to which every chunk is guaranteed to be at `status` or above.
     *
     * Java's `ChunkDependencies.getRadiusOf`. Inverting the `full` step's accumulated dependencies
     * through it is what sizes each layer of the scheduler: the answer for `terrain` is 2, so a
     * chunk cannot become `full` until a 5 by 5 neighborhood has terrain.
     *
     * @returns The outermost such distance, or -1 when no distance reaches that status.
     */
    public radiusOf(status: ChunkStatus): number {
        for (let distance = this.radius; distance >= 0; distance--) {
            const guaranteed = this.byDistance[distance];
            if (guaranteed !== undefined && isOrAfter(guaranteed, status)) return distance;
        }
        return -1;
    }
}

/**
 * Raised when a status body asks for a chunk its step did not declare.
 *
 * Java builds a `CrashReport` titled "Exception generating new chunk" and throws
 * `ReportedException` in the same place, from `WorldGenRegion.getChunk`. An undeclared read is a
 * crash on the first chunk rather than a difference on the thousandth, which is the reason the
 * step table is enforced rather than documented.
 */
export class ChunkReadOutOfWindowError extends Error {
    public override name = 'ChunkReadOutOfWindowError';

    public constructor(
        /** The status whose body was running when the read happened. */
        public readonly step: ChunkStatus,
        /** Chebyshev distance from the chunk being worked on to the chunk that was asked for. */
        public readonly distance: number,
        /** The status the body asked for. */
        public readonly requested: ChunkStatus,
        /** The highest status that distance is guaranteed to hold, or undefined when out of range. */
        public readonly allowed: ChunkStatus | undefined
    ) {
        super(
            allowed === undefined
                ? `The ${step} step read a chunk at distance ${distance}, which is outside its window.`
                : `The ${step} step asked for ${requested} at distance ${distance}, ` +
                      `where only ${allowed} is guaranteed.`
        );
    }
}

/** One rung of the pyramid: what the status may read, and how far it may write blocks. */
export class ChunkStep {
    public constructor(
        /** The status a chunk reaches once this step has run. */
        public readonly targetStatus: ChunkStatus,
        /** What the running body may read, enforced by {@link ChunkStep.requireReadable}. */
        public readonly directDependencies: ChunkDependencies,
        /** The transitive closure, which is what the scheduler sizes each layer from. */
        public readonly accumulatedDependencies: ChunkDependencies,
        /**
         * How far from its own chunk the step may write blocks, in chunks.
         *
         * -1 for every step but two, and -1 excludes even the chunk itself, so those steps cannot
         * write a block through the region at all. `terrain` is 0 and `features` is 1.
         */
        public readonly blockStateWriteRadius: number
    ) {}

    /**
     * Whether the step may write blocks into the chunk at this offset from its own.
     *
     * Java's `WorldGenRegion.isWithinWriteZone`. At the default radius of -1 this is false
     * everywhere, including `(0, 0)`.
     */
    public canWriteBlocksAt(dx: number, dz: number): boolean {
        return Math.abs(dx) <= this.blockStateWriteRadius && Math.abs(dz) <= this.blockStateWriteRadius;
    }

    /** The highest status the chunk at this offset holds, or undefined when it is out of the window. */
    public readableStatusAt(dx: number, dz: number): ChunkStatus | undefined {
        return this.directDependencies.at(Math.max(Math.abs(dx), Math.abs(dz)));
    }

    /**
     * Checks a read against the declared window and returns the status that read is good for.
     *
     * @param dx - Chunk offset on x from the chunk this step is running on.
     * @param dz - Chunk offset on z from the chunk this step is running on.
     * @param requested - The status the body needs that neighbor to have reached.
     * @returns The status that neighbor is guaranteed to be at, which is at or above `requested`.
     * @throws ChunkReadOutOfWindowError when the offset is outside the window, or when the
     * requested status is above what the window guarantees at that distance.
     */
    public requireReadable(dx: number, dz: number, requested: ChunkStatus): ChunkStatus {
        const distance = Math.max(Math.abs(dx), Math.abs(dz));
        const allowed = this.directDependencies.at(distance);
        if (allowed === undefined || !isOrBefore(requested, allowed)) {
            throw new ChunkReadOutOfWindowError(this.targetStatus, distance, requested, allowed);
        }
        return allowed;
    }
}

/**
 * Builds one step the way `ChunkPyramid`'s static initializer does, so the table stays a
 * transcription of the jar rather than a derivation.
 */
export class ChunkStepBuilder {
    private readonly directByRadius: ChunkStatus[];
    private writeRadius = -1;

    /**
     * @param targetStatus - The status the built step produces.
     * @param stepsBelow - The already-built steps, keyed by their target status. The builder reads
     * the parent's accumulated dependencies out of it, so the pyramid has to build in ladder order.
     */
    public constructor(
        public readonly targetStatus: ChunkStatus,
        private readonly stepsBelow: ReadonlyMap<ChunkStatus, ChunkStep> = new Map()
    ) {
        const parent = parentOfStatus(targetStatus);
        this.directByRadius = parent === undefined ? [] : [parent];
    }

    /**
     * Widens the window to `radius` rings and requires `status` through all of them.
     *
     * Java's `ChunkStep.Builder.addRequirement`: entries past the current end take `status`, and
     * entries that already exist take the higher of the two. The parent status seeded at distance
     * 0 takes part in that merge, which is why `spawn` reads `light` at distance 0 after being
     * told to require only `biomes` out to 1.
     */
    public addRequirement(status: ChunkStatus, radius: number): this {
        for (let distance = this.directByRadius.length; distance <= radius; distance++) {
            this.directByRadius.push(status);
        }
        for (let distance = 0; distance <= radius; distance++) {
            const existing = this.directByRadius[distance];
            if (existing !== undefined) this.directByRadius[distance] = maxStatus(existing, status);
        }
        return this;
    }

    /** Sets how far the step may write blocks. Only `terrain` (0) and `features` (1) set it. */
    public setBlockStateWriteRadius(radius: number): this {
        this.writeRadius = radius;
        return this;
    }

    /** Closes the direct dependencies over the steps below and returns the finished step. */
    public build(): ChunkStep {
        const direct = new ChunkDependencies([...this.directByRadius]);
        return new ChunkStep(this.targetStatus, direct, this.accumulate(direct), this.writeRadius);
    }

    /**
     * Expands the direct dependencies into the transitive closure Java's
     * `buildAccumulatedDependencies` produces.
     *
     * Reading a neighbor at distance `near` at status `s` means that neighbor has already run
     * every step up to `s`, so its own window applies too. A chunk `near + inner` rings out from
     * the center sits `inner` rings out from that neighbor, and the requirement reaching furthest
     * up the ladder wins. The neighbor's own entry is the status itself rather than its parent,
     * because it has to have run the step and not merely be ready to.
     */
    private accumulate(direct: ChunkDependencies): ChunkDependencies {
        const accumulated: ChunkStatus[] = [];
        const require = (distance: number, status: ChunkStatus): void => {
            const existing = accumulated[distance];
            accumulated[distance] = existing === undefined ? status : maxStatus(existing, status);
        };

        for (let near = 0; near < direct.size; near++) {
            const guaranteed = direct.at(near);
            if (guaranteed === undefined) continue;
            require(near, guaranteed);

            const window = this.stepsBelow.get(guaranteed)?.accumulatedDependencies;
            if (window === undefined) continue;
            for (let inner = 1; inner < window.size; inner++) {
                const status = window.at(inner);
                if (status !== undefined) require(near + inner, status);
            }
        }

        // Each pass writes a contiguous run starting at `near`, and `near` advances by one, so the
        // array never has a hole.
        return new ChunkDependencies(accumulated);
    }
}
