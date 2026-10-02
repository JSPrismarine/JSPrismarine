import CoordinateUtils from '../../CoordinateUtils';
import type Noise from '../Noise';
import { SEA_LEVEL, surfaceHeightAt } from '../TerrainShape';
import type { Structure, StructureOrigin, StructurePlan, TerrainSampler } from '../structure/Structure';
import { StructureCanvas, touchesChunk } from '../structure/Structure';
import VillageStructure from '../structure/VillageStructure';
import type { DecorationContext, Decorator } from './Decorator';

/**
 * How many planned structures to remember.
 *
 * A structure is planned once per chunk it covers - a dozen or so times for a village - and the
 * plan is identical every time, so the first chunk to reach it does the work and the rest read it
 * back. Small on purpose: chunks are generated in roughly spatial order, so only the handful of
 * structures near the current area are ever wanted, and holding more would be holding rubbish.
 */
const PLAN_CACHE_SIZE = 32;

/**
 * Builds villages, and whatever structures come after them, into the chunks they cover.
 *
 * The awkward part of world generation is that a chunk is generated alone: it cannot see its
 * neighbours, may be generated before or after any of them, and has to come out the same either
 * way. A structure larger than a chunk therefore cannot be "placed" by one chunk and continued by
 * the next.
 *
 * So it is not. Every chunk works out for itself which structures reach it - which is arithmetic
 * on the world seed, needing no neighbours - plans each one in full, and draws the whole thing
 * through a canvas that throws away everything outside its own sixteen blocks. Each of the chunks
 * a village covers does the same work and keeps a different slice of it, and the slices fit
 * because they came from the same plan.
 */
export class StructureDecorator implements Decorator {
    public readonly name = 'structure';

    private readonly structures: Structure[];

    /** Keyed by structure, origin and seed - see {@link PLAN_CACHE_SIZE}. */
    private readonly plans = new Map<string, StructurePlan | null>();

    public constructor(structures: Structure[] = [new VillageStructure()]) {
        this.structures = structures;
    }

    public decorate(context: DecorationContext): void {
        const { chunk, chunkX, chunkZ, seed, noise, spawns } = context;

        const terrain = new NoiseTerrainSampler(noise, chunk.getMinY(), chunk.getMaxY());
        const canvas = new StructureCanvas(chunk);

        for (const structure of this.structures) {
            for (const origin of structure.placement.originsNear(chunkX, chunkZ, seed, structure.reach)) {
                const plan = this.planAt(structure, origin, seed, terrain);
                if (!plan || !touchesChunk(plan.bounds, chunkX, chunkZ)) continue;

                plan.draw(canvas, terrain);

                // Only the mobs standing in *this* chunk. Every chunk the village covers draws the
                // whole village, so recording every spawn each time would populate a five-house
                // village with a dozen villagers per house.
                for (const spawn of plan.spawns) {
                    if (
                        CoordinateUtils.fromBlockToChunk(Math.floor(spawn.x)) === chunkX &&
                        CoordinateUtils.fromBlockToChunk(Math.floor(spawn.z)) === chunkZ
                    ) {
                        spawns.push(spawn);
                    }
                }
            }
        }
    }

    /** A structure's plan, made once and then read back by every other chunk it covers. */
    private planAt(
        structure: Structure,
        origin: StructureOrigin,
        seed: number,
        terrain: TerrainSampler
    ): StructurePlan | null {
        const key = `${structure.name}:${seed}:${origin.x}:${origin.z}`;

        const cached = this.plans.get(key);
        if (cached !== undefined) return cached;

        // Seeded from the origin, so the plan is the same whichever chunk asked for it - the one
        // property the whole approach rests on.
        const plan = structure.plan(origin, structure.placement.randomFor(origin, seed), terrain);

        // Oldest out first; `Map` iterates in insertion order, so the first key is the oldest.
        if (this.plans.size >= PLAN_CACHE_SIZE) {
            const oldest = this.plans.keys().next();
            if (!oldest.done) this.plans.delete(oldest.value);
        }
        this.plans.set(key, plan);

        return plan;
    }
}

/**
 * Terrain heights read straight from the noise.
 *
 * Memoised because levelling a village asks for the same columns repeatedly - the footprint of a
 * house is walked once to fill underneath it and again to clear above it, and a road overlaps the
 * buildings beside it - and a height costs sixteen hashes to compute and one lookup to remember.
 */
class NoiseTerrainSampler implements TerrainSampler {
    public readonly seaLevel = SEA_LEVEL;

    private readonly heights = new Map<number, number>();

    public constructor(
        private readonly noise: Noise,
        public readonly floor: number,
        public readonly ceiling: number
    ) {}

    public heightAt(x: number, z: number): number {
        // A structure never reaches far enough for 16 bits per axis to collide.
        const key = ((x & 0xffff) << 16) | (z & 0xffff);

        const cached = this.heights.get(key);
        if (cached !== undefined) return cached;

        const height = surfaceHeightAt(this.noise, x, z, this.floor, this.ceiling);
        this.heights.set(key, height);

        return height;
    }
}

export default StructureDecorator;
