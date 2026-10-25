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
 * piece's weight. The assembler does not record them, so a village street flattens its own
 * footprint and not the seam between two of them.
 */
import type { BoundingBox } from '@jsprismarine/structures';
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
 * Builds the density contribution for the pieces near one chunk.
 *
 * @param pieces - Every piece whose box comes within {@link BEARD_RADIUS} of the chunk. Pieces
 *   further away contribute nothing, so filtering before building this is what keeps the per
 *   block cost proportional to what is actually nearby.
 * @returns The sampler to install as `SampleContext.beardifier`, or undefined when no structure
 *   reaches the chunk, which is the common case and the one worth not paying for.
 */
export const createBeardifier = (pieces: readonly BeardPiece[]): DensitySampler | undefined => {
    if (pieces.length === 0) return undefined;

    return (_context, x, y, z) => {
        let density = 0;

        for (const piece of pieces) {
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
                    density += beardContribution(dx, Math.max(0, Math.max(box.minY - y, y - box.maxY)), dz) * 0.8;
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

        return density;
    };
};

/** The adaptation a `worldgen/structure` document asks for. */
export const terrainAdaptationOf = (value: unknown): TerrainAdaptation =>
    value === 'bury' || value === 'beard_thin' || value === 'beard_box' || value === 'encapsulate' ? value : 'none';
