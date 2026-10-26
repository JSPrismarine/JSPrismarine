/**
 * Terrain adaptation: how a structure pushes the land around it before the land exists.
 *
 * Java's `Beardifier` is a density function the noise router reads while a chunk's terrain is
 * sampled. Each structure piece near the chunk adds a contribution, so a village flattens the
 * hillside it stands on and an ancient city hollows the rock around it. Without it a village
 * lands on whatever the noise happened to make and half of it is buried.
 *
 * 29 of the 52 structures ask for it, through the `terrain_adaptation` field: 25 `beard_thin`,
 * 2 `bury`, one `beard_box` and one `encapsulate`.
 *
 * Java also beards the jigsaw junctions, the points where two village pieces meet, at 0.4 of a
 * piece's weight.
 */
import type { BoundingBox, JigsawJunction } from '@jsprismarine/structures';
import type { DensitySampler } from '@jsprismarine/worldgen';

/** The four `terrain_adaptation` values Java registers, plus the `none` every other structure has. */
export type TerrainAdaptation = 'none' | 'bury' | 'beard_thin' | 'beard_box' | 'encapsulate';

/** One structure piece the terrain is adapted around. */
export interface BeardPiece {
    readonly box: BoundingBox;
    /** How far above the piece's floor its ground sits, Java's `getGroundLevelDelta`. */
    readonly groundLevelDelta: number;
    readonly adaptation: TerrainAdaptation;
}

/** A jigsaw junction Java includes as a smaller beard contribution. */
export type BeardJunction = JigsawJunction;

/** How far from a piece the adaptation reaches. */
export const BEARD_RADIUS = 12;

const KERNEL_SIZE = BEARD_RADIUS * 2;

/** Java's `computeBeardContribution`. */
function beardAt(x: number, y: number, z: number): number {
    const horizontal = x * x + z * z;
    const above = y + 0.5;
    const vertical = above * above;
    const falloff = Math.exp(-(vertical / 16 + horizontal / 16));
    return ((-above * fastInverseSqrt(vertical / 2 + horizontal / 2)) / 2) * falloff;
}

/** The two words of a double, for {@link fastInverseSqrt}. */
const bitsView = new DataView(new ArrayBuffer(8));

/**
 * Java's `Mth.fastInverseSqrt`: the Quake trick with one Newton step.
 *
 * Reproduced rather than replaced by `1 / Math.sqrt(x)` because its answer is about four
 * decimal digits accurate, and the kernel it builds decides where the terrain under a village
 * ends up.
 */
const fastInverseSqrt = (value: number): number => {
    bitsView.setFloat64(0, value);
    bitsView.setBigInt64(0, 6910469410427058090n - (bitsView.getBigInt64(0) >> 1n));
    const estimate = bitsView.getFloat64(0);
    return estimate * (1.5 - 0.5 * value * estimate * estimate);
};

/**
 * Java's `BEARD_KERNEL`, a 24 cubed field of contributions built once.
 *
 * The value at an offset is a bell curve in the horizontal distance times a term that is
 * positive below the piece and negative above it, which is what makes the ground rise to the
 * piece's floor and the air above it stay open.
 */
const BEARD_KERNEL = (() => {
    const kernel = new Float64Array(KERNEL_SIZE * KERNEL_SIZE * KERNEL_SIZE);
    for (let y = 0; y < KERNEL_SIZE; y++) {
        for (let z = 0; z < KERNEL_SIZE; z++) {
            for (let x = 0; x < KERNEL_SIZE; x++) {
                kernel[y * KERNEL_SIZE * KERNEL_SIZE + z * KERNEL_SIZE + x] = beardAt(
                    x - BEARD_RADIUS,
                    y - BEARD_RADIUS,
                    z - BEARD_RADIUS
                );
            }
        }
    }
    return kernel;
})();

/** The kernel value at an offset, zero outside its radius. */
const beardContribution = (x: number, y: number, z: number): number => {
    const i = x + BEARD_RADIUS;
    const j = y + BEARD_RADIUS;
    const k = z + BEARD_RADIUS;
    if (i < 0 || i >= KERNEL_SIZE || j < 0 || j >= KERNEL_SIZE || k < 0 || k >= KERNEL_SIZE) return 0;

    return BEARD_KERNEL[j * KERNEL_SIZE * KERNEL_SIZE + k * KERNEL_SIZE + i] ?? 0;
};

/** Java's `getBuryContribution`: full inside six blocks of the piece, nothing past it. */
const buryContribution = (x: number, y: number, z: number): number => {
    const distance = Math.sqrt(x * x + y * y + z * z);
    return distance >= 6 ? 0 : 1 - distance / 6;
};

/**
 * The side of one bucket of the column index {@link createBeardifier} builds, as a power of
 * two so a column's bucket is a shift.
 *
 * Four blocks matches the density stack's horizontal cell size, so one bucket covers a whole
 * cell's worth of columns.
 */
const BUCKET_SHIFT = 2;

const BUCKET_SIZE = 1 << BUCKET_SHIFT;

/**
 * Builds the density contribution for the pieces near one chunk.
 *
 * This sampler is the right operand of the top-level add in the overworld's `final_density`, so
 * it runs on all 98304 samples of a chunk and its per-sample cost is multiplied by that. The
 * pieces are therefore indexed by column: every adaptation's contribution is exactly zero once
 * the column is more than {@link BEARD_RADIUS} from the piece's box in x or in z, so a sample
 * only has to visit the pieces whose reach covers its own bucket. The index preserves the order
 * the pieces were given in, because the sum of several `float` contributions depends on it.
 *
 * @param pieces - Every piece whose box comes within {@link BEARD_RADIUS} of the chunk. Pieces
 *   further away contribute nothing, so filtering before building this is what keeps the per
 *   block cost proportional to what is actually nearby.
 * @param junctions - Junction source positions in Java's structure-piece and connection order.
 * @returns The sampler to install as `SampleContext.beardifier`, or undefined when no structure
 *   reaches the chunk, which is the common case and the one worth not paying for.
 */
export const createBeardifier = (
    pieces: readonly BeardPiece[],
    junctions: readonly BeardJunction[] = []
): DensitySampler | undefined => {
    if (pieces.length === 0 && junctions.length === 0) return undefined;

    const pieceIndex = pieces.length === 0 ? undefined : indexByColumn(pieces.map((piece) => piece.box));
    const junctionIndex =
        junctions.length === 0
            ? undefined
            : indexByColumn(
                  junctions.map((junction) => ({
                      minX: junction.sourceX,
                      maxX: junction.sourceX,
                      minZ: junction.sourceZ,
                      maxZ: junction.sourceZ
                  }))
              );

    return (_context, x, y, z) => {
        let density = 0;

        if (pieceIndex !== undefined) {
            const bucket = bucketAt(pieceIndex, x, z);
            if (bucket !== undefined) {
                const end = pieceIndex.starts[bucket + 1] ?? 0;
                for (let slot = pieceIndex.starts[bucket] ?? 0; slot < end; slot++) {
                    const piece = pieces[pieceIndex.members[slot] ?? 0];
                    if (piece === undefined) continue;

                    const box = piece.box;
                    const dx = Math.max(0, Math.max(box.minX - x, x - box.maxX));
                    const dz = Math.max(0, Math.max(box.minZ - z, z - box.maxZ));
                    const aboveGround = y - (box.minY + piece.groundLevelDelta);

                    switch (piece.adaptation) {
                        case 'none':
                            break;
                        case 'bury':
                            density += buryContribution(dx, aboveGround, dz);
                            break;
                        case 'beard_thin':
                            density += beardContribution(dx, aboveGround, dz) * 0.8;
                            break;
                        case 'beard_box':
                            density +=
                                beardContribution(dx, Math.max(0, Math.max(box.minY - y, y - box.maxY)), dz) * 0.8;
                            break;
                        case 'encapsulate':
                            density +=
                                buryContribution(
                                    dx / 2,
                                    Math.max(0, Math.max(box.minY + 1 - y, y - box.maxY + 1)) / 2,
                                    dz / 2
                                ) * 0.8;
                            break;
                    }
                }
            }
        }

        if (junctionIndex !== undefined) {
            const bucket = bucketAt(junctionIndex, x, z);
            if (bucket !== undefined) {
                const end = junctionIndex.starts[bucket + 1] ?? 0;
                for (let slot = junctionIndex.starts[bucket] ?? 0; slot < end; slot++) {
                    const junction = junctions[junctionIndex.members[slot] ?? 0];
                    if (junction === undefined) continue;

                    density +=
                        beardContribution(x - junction.sourceX, y - junction.sourceGroundY, z - junction.sourceZ) * 0.4;
                }
            }
        }

        return density;
    };
};

/** The column index {@link createBeardifier} reads, in compressed sparse row form. */
interface BeardColumnIndex {
    /** The lowest block x any piece reaches, which is the index's origin. */
    readonly minX: number;
    /** The lowest block z any piece reaches. */
    readonly minZ: number;
    readonly bucketsX: number;
    readonly bucketsZ: number;
    /** Where each bucket's run of members begins, with one extra entry for the end. */
    readonly starts: Int32Array;
    /** The piece indices, each bucket's run ascending so the sum keeps its order. */
    readonly members: Int32Array;
}

/** The horizontal bounds used to put a piece or point into nearby column buckets. */
interface ColumnBounds {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
}

/** Returns the bucket that contains a sample, or undefined when it lies outside the index. */
const bucketAt = (index: BeardColumnIndex, x: number, z: number): number | undefined => {
    const bucketX = (x - index.minX) >> BUCKET_SHIFT;
    const bucketZ = (z - index.minZ) >> BUCKET_SHIFT;
    if (bucketX < 0 || bucketX >= index.bucketsX || bucketZ < 0 || bucketZ >= index.bucketsZ) return undefined;
    return bucketX * index.bucketsZ + bucketZ;
};

/**
 * Buckets piece bounds or junction points by the columns their kernels reach.
 *
 * A piece's reach is its box grown by {@link BEARD_RADIUS} horizontally; a junction's reach is
 * the same radius around its source point. The beard kernel is zero outside that cube, and both
 * `bury` and `encapsulate` fall to zero at a shorter distance than it.
 */
const indexByColumn = (bounds: readonly ColumnBounds[]): BeardColumnIndex => {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const bound of bounds) {
        minX = Math.min(minX, bound.minX - BEARD_RADIUS);
        maxX = Math.max(maxX, bound.maxX + BEARD_RADIUS);
        minZ = Math.min(minZ, bound.minZ - BEARD_RADIUS);
        maxZ = Math.max(maxZ, bound.maxZ + BEARD_RADIUS);
    }

    const originX = Math.floor(minX / BUCKET_SIZE) * BUCKET_SIZE;
    const originZ = Math.floor(minZ / BUCKET_SIZE) * BUCKET_SIZE;
    const bucketsX = ((maxX - originX) >> BUCKET_SHIFT) + 1;
    const bucketsZ = ((maxZ - originZ) >> BUCKET_SHIFT) + 1;

    const starts = new Int32Array(bucketsX * bucketsZ + 1);
    const span = (bound: ColumnBounds): readonly [number, number, number, number] => [
        (bound.minX - BEARD_RADIUS - originX) >> BUCKET_SHIFT,
        (bound.maxX + BEARD_RADIUS - originX) >> BUCKET_SHIFT,
        (bound.minZ - BEARD_RADIUS - originZ) >> BUCKET_SHIFT,
        (bound.maxZ + BEARD_RADIUS - originZ) >> BUCKET_SHIFT
    ];

    for (const bound of bounds) {
        const [firstX, lastX, firstZ, lastZ] = span(bound);
        for (let bucketX = firstX; bucketX <= lastX; bucketX++) {
            for (let bucketZ = firstZ; bucketZ <= lastZ; bucketZ++) {
                const next = bucketX * bucketsZ + bucketZ + 1;
                starts[next] = (starts[next] ?? 0) + 1;
            }
        }
    }
    for (let bucket = 0; bucket < starts.length - 1; bucket++) {
        starts[bucket + 1] = (starts[bucket + 1] ?? 0) + (starts[bucket] ?? 0);
    }

    const cursor = Int32Array.from(starts.subarray(0, starts.length - 1));
    const members = new Int32Array(starts[starts.length - 1] ?? 0);
    for (const [order, bound] of bounds.entries()) {
        const [firstX, lastX, firstZ, lastZ] = span(bound);
        for (let bucketX = firstX; bucketX <= lastX; bucketX++) {
            for (let bucketZ = firstZ; bucketZ <= lastZ; bucketZ++) {
                const bucket = bucketX * bucketsZ + bucketZ;
                const slot = cursor[bucket] ?? 0;
                cursor[bucket] = slot + 1;
                members[slot] = order;
            }
        }
    }

    return { minX: originX, minZ: originZ, bucketsX, bucketsZ, starts, members };
};

/** The adaptation a `worldgen/structure` document asks for. */
export const terrainAdaptationOf = (value: unknown): TerrainAdaptation =>
    value === 'bury' || value === 'beard_thin' || value === 'beard_box' || value === 'encapsulate' ? value : 'none';
