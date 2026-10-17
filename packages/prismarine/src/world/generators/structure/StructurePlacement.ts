import ChunkRandom from '../decoration/ChunkRandom';
import type { StructureOrigin } from './Structure';

/**
 * Where in the world a kind of structure is allowed to start.
 *
 * The world is cut into square regions of `spacing` chunks, and each region gets at most one
 * structure, in a chunk picked from the region's own seed. That is how vanilla does it, and the
 * reason is not aesthetic: it means "is there a village near here" can be answered by arithmetic,
 * without generating or even knowing about a single neighbouring chunk. A chunk works out which
 * regions are close enough to reach it, asks each for its origin, and that is the complete list.
 *
 * `separation` keeps origins off the far edge of their region, so two structures in adjacent
 * regions cannot end up back to back.
 */
export class StructurePlacement {
    private readonly spacing: number;
    private readonly separation: number;
    private readonly salt: number;

    /**
     * @param {object} options - How thinly to spread the structure.
     * @param {number} options.spacing - The side of a region, in chunks: one structure per region.
     * @param {number} options.separation - How much of the region's far edge to keep clear.
     * @param {number} options.salt - Distinguishes structures that share a world seed, so villages
     * and everything added later do not all pick the same chunk of every region.
     */
    public constructor({ spacing, separation, salt }: { spacing: number; separation: number; salt: number }) {
        this.spacing = Math.max(1, spacing);
        this.separation = Math.min(Math.max(0, separation), this.spacing - 1);
        this.salt = salt;
    }

    /** The chunk this region's structure starts in. */
    private originChunk(regionX: number, regionZ: number, seed: number): { cx: number; cz: number } {
        const random = new ChunkRandom(seed, regionX, regionZ, this.salt);
        const span = this.spacing - this.separation;

        return {
            cx: regionX * this.spacing + random.nextInt(span),
            cz: regionZ * this.spacing + random.nextInt(span)
        };
    }

    /**
     * Every origin whose structure could reach the given chunk.
     * @param {number} chunkX - The chunk being generated.
     * @param {number} chunkZ - The chunk being generated.
     * @param {number} seed - The world seed.
     * @param {number} reach - How far the structure may extend from its origin, in blocks.
     * @returns {StructureOrigin[]} Candidate origins, in world block coordinates. Each still has to
     * be offered to the structure, which may refuse the terrain.
     */
    public originsNear(chunkX: number, chunkZ: number, seed: number, reach: number): StructureOrigin[] {
        // One chunk of slack: the origin sits at the middle of its chunk, so a structure reaching
        // `reach` blocks can start a little further out than `reach` alone suggests.
        const reachInChunks = Math.ceil(reach / 16) + 1;

        const fromRegionX = Math.floor((chunkX - reachInChunks) / this.spacing);
        const toRegionX = Math.floor((chunkX + reachInChunks) / this.spacing);
        const fromRegionZ = Math.floor((chunkZ - reachInChunks) / this.spacing);
        const toRegionZ = Math.floor((chunkZ + reachInChunks) / this.spacing);

        const origins: StructureOrigin[] = [];
        for (let regionX = fromRegionX; regionX <= toRegionX; regionX++) {
            for (let regionZ = fromRegionZ; regionZ <= toRegionZ; regionZ++) {
                const { cx, cz } = this.originChunk(regionX, regionZ, seed);
                if (Math.abs(cx - chunkX) > reachInChunks || Math.abs(cz - chunkZ) > reachInChunks) continue;

                // The middle of the chunk, so a structure laid out symmetrically about its origin
                // is not skewed towards one corner of it.
                origins.push({ x: cx * 16 + 8, z: cz * 16 + 8 });
            }
        }

        return origins;
    }

    /** A random generator belonging to one structure, so its plan does not vary by chunk. */
    public randomFor(origin: StructureOrigin, seed: number): ChunkRandom {
        return new ChunkRandom(seed, origin.x, origin.z, this.salt + 1);
    }
}

export default StructurePlacement;
