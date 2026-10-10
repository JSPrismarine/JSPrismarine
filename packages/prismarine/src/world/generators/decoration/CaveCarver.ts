import type { DecorationContext, Decorator } from './Decorator';
import { heightIndex } from './Decorator';

/** Caves live below this; above it the terrain should stay as the surface pass left it. */
const CAVE_CEILING = 56;

/**
 * How far above the world floor carving may start. The bedrock layer and the one above it are
 * never touched, so the world has no holes in its floor - measured from the floor rather than
 * from y=0, since the Overworld's floor is -64.
 */
const CAVE_FLOOR_CLEARANCE = 2;

/** Wider divisor, longer and smoother tunnels. */
const CAVE_SCALE = 26;

/**
 * Above this the noise counts as solid. Value noise clusters around the middle, so a
 * threshold this far out carves a few per cent of the volume - tunnels, not swiss cheese.
 */
const CAVE_THRESHOLD = 0.62;

/**
 * Two octaves, not the default three.
 *
 * This is the most sampled noise in the generator - once per stone block under every
 * column - and each octave costs eight hashes. The third octave only adds detail finer
 * than a block, which nothing can see, so it was pure cost.
 */
const CAVE_OCTAVES = 2;

/** How far below the surface carving may begin, so caves rarely open onto open ground. */
const SURFACE_CLEARANCE = 5;

/**
 * Hollows tunnels out of the stone with 3D noise.
 *
 * Runs after the ores on purpose: a tunnel cuts straight through a vein, and what is left
 * of the vein shows in the tunnel wall. That is how ore is found in vanilla - the vein is
 * exposed because it continues past the tunnel, not because it is immune to it.
 *
 * Everything in the way is removed, ores and soil included. Carving only stone would leave
 * a vein hanging in mid air once the stone around it went, which is exactly what it looked
 * like. The three exceptions are the bedrock floor, air, and water: cutting into water from
 * below would flood the tunnel, and there is no fluid simulation here to cope with that.
 */
export class CaveCarver implements Decorator {
    public readonly name = 'cave';

    public decorate(context: DecorationContext): void {
        const { chunk, chunkX, chunkZ, noise, palette, heights } = context;
        const air = palette['minecraft:air']!;
        const bedrock = palette['minecraft:bedrock']!;
        const water = palette['minecraft:water']!;

        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                const worldX = chunkX * 16 + x;
                const worldZ = chunkZ * 16 + z;

                const surface = heights[heightIndex(x, z)]!;
                const ceiling = Math.min(CAVE_CEILING, surface - SURFACE_CLEARANCE);

                // Walked a sub chunk at a time. Going through the chunk for each block
                // would look the sub chunk and its storage up ~14000 times per chunk, which
                // costs more than the noise this loop exists to evaluate.
                for (let y = chunk.getMinY() + CAVE_FLOOR_CLEARANCE; y <= ceiling;) {
                    const spanEnd = Math.min(ceiling, ((y >> 4) + 1) * 16 - 1);
                    const subChunk = chunk.getSubChunk(y >> 4);
                    if (!subChunk) {
                        y = spanEnd + 1; // nothing was ever placed here, nothing to carve
                        continue;
                    }

                    for (; y <= spanEnd; y++) {
                        const existing = subChunk.getBlockRuntimeId(x, y & 0xf, z);
                        // Anything solid gives way. Stated as what is spared rather than
                        // what is carved, so a block some future decorator adds is carved
                        // too instead of being left floating.
                        if (existing === air || existing === bedrock || existing === water) continue;

                        const density = noise.fractal3(
                            worldX / CAVE_SCALE,
                            y / CAVE_SCALE,
                            worldZ / CAVE_SCALE,
                            CAVE_OCTAVES
                        );
                        if (density > CAVE_THRESHOLD) subChunk.setBlock(x, y & 0xf, z, air, 0);
                    }
                }
            }
        }
    }
}

export default CaveCarver;
