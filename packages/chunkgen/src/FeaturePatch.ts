/**
 * The eight neighbors a feature pass can reach, in the order their writes are merged.
 *
 * `(dx, dz)` ascending with `dx` fastest, which is row major from the northwest corner. The order
 * is the reason a chunk border is a function of the seed and the position: two features from
 * different chunks that land on the same block always resolve the same way, whichever chunk was
 * asked for first and however many were in flight.
 *
 * Java has no such order. Its feature pass writes straight into the live neighbor through a
 * `WorldGenRegion`, so which of two overlapping features wins depends on which chunk reached
 * `features` first, which depends on scheduling. ADR 0002 takes the deviation deliberately and
 * names its one cost: a feature that reads a block before placing sees the neighbor's terrain and
 * not the neighbor's features, so two features can occupy the same space where Java would have
 * refused the second.
 */
export const FEATURE_PATCH_ORDER = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1]
] as const satisfies readonly (readonly [number, number])[];

/** One of the eight offsets in {@link FEATURE_PATCH_ORDER}. */
export type FeaturePatchOffset = (typeof FEATURE_PATCH_ORDER)[number];

/**
 * Raised when a feature pass offers a patch to a chunk it is not allowed to write into.
 *
 * `features` has a block write radius of 1, so the only legal targets are the eight neighbors. Its
 * own chunk is not one of them: a feature's writes into its own chunk apply as they happen, the way
 * Java's do, so that features inside a chunk still see each other. A patch aimed at `(0, 0)` means
 * the caller routed a write that should have landed immediately, and a patch from further out means
 * a feature reached past the write radius the step table gives it.
 */
export class FeaturePatchOutOfRangeError extends RangeError {
    public override name = 'FeaturePatchOutOfRangeError';

    public constructor(
        public readonly dx: number,
        public readonly dz: number
    ) {
        super(
            `A feature pass offered a patch at offset ${dx}, ${dz}. The eight neighbors are the ` +
                `only legal targets: a write into the chunk's own columns applies immediately, and ` +
                `nothing past radius 1 is inside the write zone of the features step.`
        );
    }
}

/** Raised when two feature passes of the same neighbor both offer this chunk a patch. */
export class DuplicateFeaturePatchError extends Error {
    public override name = 'DuplicateFeaturePatchError';

    public constructor(
        public readonly dx: number,
        public readonly dz: number
    ) {
        super(
            `The neighbor at ${dx}, ${dz} has already handed over its feature patch. A chunk runs ` +
                `the features step once, so a second patch from the same chunk means the step ran twice.`
        );
    }
}

/**
 * The feature writes a chunk's eight neighbors owe it, kept until the chunk is finished.
 *
 * This is the half of the patch merge that decides the answer, and the only thing it decides is
 * order. A feature pass that reaches across a border records what it wrote rather than writing it,
 * and the patch waits here until the target chunk is promoted. The target then applies its own
 * post-`features` state first and these eight after it, in {@link FEATURE_PATCH_ORDER}, which is
 * what makes a tree rooted in one chunk come out whole in the next.
 *
 * Storing by source offset rather than appending to a list is the mechanism, not an implementation
 * detail. A list would record arrival order, and arrival order is what the scheduler chooses.
 *
 * @typeParam TPatch - What a patch is, which this class never looks inside. The server's patch
 * carries Java block states with properties; a worker's would carry palette indices.
 */
export class InboundFeaturePatches<TPatch> {
    private readonly bySource = new Map<string, TPatch>();

    /** How many of the eight neighbors have handed theirs over. */
    public get size(): number {
        return this.bySource.size;
    }

    /** Whether a neighbor at this offset has handed one over. */
    public has(dx: number, dz: number): boolean {
        return this.bySource.has(keyOf(dx, dz));
    }

    /**
     * Takes the patch a neighbor's feature pass wrote into this chunk.
     *
     * @param dx - Chunk offset on x from this chunk to the neighbor that wrote it.
     * @param dz - Chunk offset on z.
     * @throws FeaturePatchOutOfRangeError when the offset is not one of the eight neighbors.
     * @throws DuplicateFeaturePatchError when that neighbor already handed one over, which means
     * its `features` body ran twice.
     */
    public receive(dx: number, dz: number, patch: TPatch): void {
        const key = keyOf(dx, dz);
        if (!OFFSET_KEYS.has(key)) throw new FeaturePatchOutOfRangeError(dx, dz);
        if (this.bySource.has(key)) throw new DuplicateFeaturePatchError(dx, dz);
        this.bySource.set(key, patch);
    }

    /**
     * The patches to apply, in {@link FEATURE_PATCH_ORDER}.
     *
     * @returns One entry per neighbor that wrote something, skipping those that wrote nothing. The
     * order is positional, so it is the same list whatever order the patches arrived in.
     */
    public inMergeOrder(): readonly TPatch[] {
        const merged: TPatch[] = [];
        for (const [dx, dz] of FEATURE_PATCH_ORDER) {
            const patch = this.bySource.get(keyOf(dx, dz));
            if (patch !== undefined) merged.push(patch);
        }
        return merged;
    }
}

const keyOf = (dx: number, dz: number): string => `${dx},${dz}`;

/** The eight legal offsets as keys, so `receive` can reject anything else by lookup. */
const OFFSET_KEYS = new Set(FEATURE_PATCH_ORDER.map(([dx, dz]) => keyOf(dx, dz)));
