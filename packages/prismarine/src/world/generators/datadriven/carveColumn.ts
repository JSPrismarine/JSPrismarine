/**
 * Opens one column of a carving mask, Java 26.3's `NoiseBasedChunkGenerator.applyCarvingMask`.
 */
import type { BlockOracle } from '@jsprismarine/features/world/FeatureWorld';
import type { Aquifer } from '@jsprismarine/worldgen/chunk/Aquifer';
import type { SurfacePass } from '@jsprismarine/worldgen/surface/SurfaceSystem';

import type { GenerationRegion } from './GenerationRegion';

/** Java's `#minecraft:uncarvable`, the blocks a carver may not open. Bedrock is its one member. */
const UNCARVABLE = 'minecraft:uncarvable';

/** The two blocks whose removal makes a carver re-run the surface rule under the column. */
const CARVE_RESURFACES_BELOW = new Set(['minecraft:grass_block', 'minecraft:mycelium']);

/** The exact block a carver re-surfaces, which is not the `#minecraft:dirt` tag. */
const DIRT = 'minecraft:dirt';

/** What carving one column reads and writes. */
export interface CarveColumnContext {
    readonly region: Pick<GenerationRegion, 'stateAt' | 'writeName' | 'scheduleFluidTick'>;
    readonly aquifer: Aquifer;
    readonly oracle: Pick<BlockOracle, 'isAir' | 'hasTag' | 'fluid'>;
    readonly surface: Pick<SurfacePass, 'topMaterial'>;
    /**
     * Java 26.3's `Blender.carvingFilter`: where it answers false at a chunk-local position, the
     * carver leaves the block, as `applyCarvingMask` does next to an old chunk.
     */
    readonly filter?: (localX: number, y: number, localZ: number) => boolean;
}

/**
 * Carves one marked column from the top down.
 *
 * Each block takes the aquifer's substance at density zero. A block the aquifer keeps as a
 * barrier, where it answers nothing, stays: Java skips it rather than opening it. A carved block
 * the aquifer asked to update and that holds fluid is marked for post-processing.
 *
 * The column carries a latch down: once the carve has met a grass block or mycelium, every dirt
 * block under a carved block gets the material rule run on it again, and Java sets that latch
 * before it asks the aquifer, so a barrier grass block still sets it. Without the step a cave
 * mouth leaves bare dirt under the sky and `patch_grass_plain` grows short grass on it.
 *
 * Air is skipped. Java writes it too, but the aquifer gives air back for air at density zero, so
 * the write changes nothing and marks nothing; skipping it keeps a carver that reaches `y: 180`
 * from raising the region's column ceiling, which the surface pass reads.
 */
export const carveColumn = (context: CarveColumnContext, x: number, z: number, bottomY: number, topY: number): void => {
    const { region, aquifer, oracle, surface, filter } = context;
    let tookGrass = false;

    for (let y = topY; y >= bottomY; y--) {
        if (filter !== undefined && !filter(x & 15, y, z & 15)) continue;
        const existing = region.stateAt(x, y, z);
        if (oracle.isAir(existing)) continue;
        // Java skips `#minecraft:uncarvable` and nothing else. Water is carved like any other
        // block and the aquifer decides what goes back in its place.
        if (oracle.hasTag(existing, UNCARVABLE)) continue;
        if (CARVE_RESURFACES_BELOW.has(existing.name)) tookGrass = true;

        const substance = aquifer.computeSubstance(x, y, z, 0);
        if (substance === undefined) continue;
        region.writeName(x, y, z, substance);
        if (aquifer.shouldScheduleFluidUpdate() && oracle.fluid(region.stateAt(x, y, z)) !== 'empty') {
            region.scheduleFluidTick(x, y, z);
        }

        if (!tookGrass || region.stateAt(x, y - 1, z).name !== DIRT) continue;

        // Java asks the carved block's own fluid state, which is empty for the air the aquifer
        // hands back above the water table, so reading the write back is the honest test.
        const hasFluid = oracle.fluid(region.stateAt(x, y, z)) !== 'empty';
        const material = surface.topMaterial(x, y - 1, z, hasFluid);
        if (material === undefined) continue;
        region.writeName(x, y - 1, z, material);
        // Java marks the re-surfaced block too when the material it chose holds fluid.
        if (oracle.fluid(region.stateAt(x, y - 1, z)) !== 'empty') region.scheduleFluidTick(x, y - 1, z);
    }
};
