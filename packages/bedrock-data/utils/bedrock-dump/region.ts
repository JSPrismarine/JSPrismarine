/**
 * The region the reference world covers, and the ticking areas it takes to generate it.
 *
 * Phase 4 of [the plan](../../../../docs/plans/data-driven-vanilla.md) exits when "biome,
 * heightmap and terrain-class rows [are] exactly green for the reference region". This file is
 * what "the reference region" means: a fixed seed, a fixed dimension, and a fixed square of
 * chunks at a fixed origin. Change any of them and every row of the golden moves, so a change
 * here is a recapture.
 *
 * The region is split into ticking areas because that is the only way to make a server with no
 * player on it generate chunks. Microsoft documents two limits, both of which the engine
 * enforces with its own error text: a world may hold ten ticking areas, and an area may cover a
 * hundred chunks. Ten squares of ten by ten chunks is therefore the ceiling, and the region sits
 * under it.
 */

/** A square of chunks, by chunk coordinate. */
export interface ReferenceRegion {
    /** Chunk x of the lowest corner. */
    chunkX: number;
    /** Chunk z of the lowest corner. */
    chunkZ: number;
    /** Width in chunks along x. */
    chunksX: number;
    /** Depth in chunks along z. */
    chunksZ: number;
}

/**
 * The seed every reference world is generated with. A string because `server.properties` takes
 * one and `world.seed` reports one; the engine parses a decimal string as a numeric seed.
 */
export const REFERENCE_SEED = '2026102500';

/** The dimension the reference world covers. The Nether and the End are not captured yet. */
export const REFERENCE_DIMENSION = 'overworld';

/** Lowest block y of the Overworld, which the stored heightmap is measured from. */
export const OVERWORLD_FLOOR = -64;

/** Sub chunks an Overworld column holds, from y=-64 to y=320. */
export const OVERWORLD_SUB_CHUNKS = 24;

/** Sub chunk index of the bottom slice of an Overworld column. */
export const OVERWORLD_BOTTOM_SUB_CHUNK = -4;

/** The captured region: 400 chunks at the world origin, 320 by 320 blocks. */
export const REFERENCE_REGION: ReferenceRegion = { chunkX: 0, chunkZ: 0, chunksX: 20, chunksZ: 20 };

/**
 * The sub-square the golden keeps whole arrays for rather than hashes, so that a failing hash
 * has somewhere to be diagnosed from. Sixteen chunks at the region's origin.
 */
export const SAMPLE_REGION: ReferenceRegion = { chunkX: 0, chunkZ: 0, chunksX: 4, chunksZ: 4 };

/** Ticking areas one world may hold, per Microsoft's ticking area command documentation. */
export const MAX_TICKING_AREAS = 10;

/** Chunks one ticking area may cover, per the same documentation. */
export const MAX_CHUNKS_PER_AREA = 100;

/** Longest side a square area can have and stay inside {@link MAX_CHUNKS_PER_AREA}. */
export const MAX_AREA_SIDE = 10;

/**
 * Splits a region into ticking areas that each stay inside the engine's limits.
 *
 * @returns Tiles in row-major order, x fastest.
 * @throws Error when the region needs more areas than one world may hold.
 */
export const tileRegion = (region: ReferenceRegion): ReferenceRegion[] => {
    const tiles: ReferenceRegion[] = [];
    for (let z = 0; z < region.chunksZ; z += MAX_AREA_SIDE) {
        for (let x = 0; x < region.chunksX; x += MAX_AREA_SIDE) {
            tiles.push({
                chunkX: region.chunkX + x,
                chunkZ: region.chunkZ + z,
                chunksX: Math.min(MAX_AREA_SIDE, region.chunksX - x),
                chunksZ: Math.min(MAX_AREA_SIDE, region.chunksZ - z)
            });
        }
    }
    if (tiles.length > MAX_TICKING_AREAS) {
        throw new Error(
            `A ${region.chunksX} by ${region.chunksZ} chunk region needs ${tiles.length} ticking areas, ` +
                `and a world may hold ${MAX_TICKING_AREAS}.`
        );
    }
    return tiles;
};

/** The block coordinates a region's corners sit at, lowest block of the lowest chunk first. */
export const blockBounds = (region: ReferenceRegion): { from: [number, number]; to: [number, number] } => ({
    from: [region.chunkX * 16, region.chunkZ * 16],
    to: [(region.chunkX + region.chunksX) * 16 - 1, (region.chunkZ + region.chunksZ) * 16 - 1]
});

/** Every chunk coordinate in a region, in row-major order with x fastest. */
export const chunksOf = function* (region: ReferenceRegion): Generator<{ x: number; z: number }> {
    for (let z = 0; z < region.chunksZ; z++) {
        for (let x = 0; x < region.chunksX; x++) {
            yield { x: region.chunkX + x, z: region.chunkZ + z };
        }
    }
};

/** Whether a chunk falls inside a region. */
export const contains = (region: ReferenceRegion, x: number, z: number): boolean =>
    x >= region.chunkX &&
    x < region.chunkX + region.chunksX &&
    z >= region.chunkZ &&
    z < region.chunkZ + region.chunksZ;
