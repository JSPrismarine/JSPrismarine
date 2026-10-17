import type { DecorationContext, Decorator } from './Decorator';
import { heightIndex } from './Decorator';

/** How far the canopy reaches sideways from the trunk. */
const CANOPY_RADIUS = 2;

const MIN_TRUNK = 4;
const MAX_TRUNK = 6;

/** Attempts per chunk; each one may still find nowhere suitable to stand. */
const ATTEMPTS = 6;

/** Fraction of attempts that even try, which is what makes forests patchy rather than even. */
const DENSITY = 0.45;

const SPECIES = [
    { log: 'minecraft:oak_log', leaves: 'minecraft:oak_leaves', weight: 0.8 },
    { log: 'minecraft:birch_log', leaves: 'minecraft:birch_leaves', weight: 0.2 }
] as const;

/**
 * Plants trees on grass.
 *
 * **Trees stay clear of the chunk border.** A canopy reaches two blocks out, and this
 * generator decorates a chunk in isolation with no access to its neighbours - so a tree
 * planted at the edge would have its leaves sliced off at the boundary. Keeping trunks
 * within the inset means no tree is ever cut in half; the cost is a thin strip along each
 * chunk edge where trees never grow, which is invisible in play but real. Growing them
 * across the seam needs a population pass that revisits a chunk once its neighbours exist,
 * which is a larger change to how chunks are loaded.
 */
export class TreeDecorator implements Decorator {
    public readonly name = 'tree';

    public decorate(context: DecorationContext): void {
        const { chunk, random, palette, heights } = context;
        const grass = palette['minecraft:grass_block']!;
        const dirt = palette['minecraft:dirt']!;
        const air = palette['minecraft:air']!;

        for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
            if (!random.chance(DENSITY)) continue;

            // Inset so the whole canopy lands inside this chunk.
            const x = random.nextRange(CANOPY_RADIUS, 15 - CANOPY_RADIUS);
            const z = random.nextRange(CANOPY_RADIUS, 15 - CANOPY_RADIUS);
            const ground = heights[heightIndex(x, z)]!;

            // Only on grass, and not where a cave has since eaten the ground away.
            if (chunk.getBlockRuntimeId(x, ground, z) !== grass) continue;

            const trunkHeight = random.nextRange(MIN_TRUNK, MAX_TRUNK);
            const top = ground + trunkHeight;
            if (top + CANOPY_RADIUS > 250) continue;

            // Refuse to grow through anything, so trees never merge into each other.
            let blocked = false;
            for (let y = ground + 1; y <= top && !blocked; y++) {
                if (chunk.getBlockRuntimeId(x, y, z) !== air) blocked = true;
            }
            if (blocked) continue;

            const species = random.nextFloat() < SPECIES[0].weight ? SPECIES[0] : SPECIES[1];
            const log = palette[species.log];
            const leaves = palette[species.leaves];
            if (log === undefined || leaves === undefined) continue;

            this.plant(context, x, z, ground, trunkHeight, log, leaves, dirt, air);
        }
    }

    private plant(
        { chunk, random }: DecorationContext,
        x: number,
        z: number,
        ground: number,
        trunkHeight: number,
        log: number,
        leaves: number,
        dirt: number,
        air: number
    ): void {
        // Vanilla puts dirt under a tree, which shows when the trunk is broken.
        chunk.setBlockRuntimeId(x, ground, z, dirt);

        const top = ground + trunkHeight;
        for (let y = ground + 1; y <= top; y++) chunk.setBlockRuntimeId(x, y, z, log);

        // Two wide layers around the upper trunk, then a narrow cap: the classic oak shape.
        for (let dy = -2; dy <= 1; dy++) {
            const y = top + dy;
            const radius = dy <= -1 ? CANOPY_RADIUS : 1;

            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    if (dx === 0 && dz === 0 && y <= top) continue; // leave the trunk alone

                    // Round the corners off, and thin them further at random so the canopy
                    // is not a perfect square from above.
                    const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
                    if (corner && (radius > 1 || random.chance(0.5))) continue;

                    if (chunk.getBlockRuntimeId(x + dx, y, z + dz) === air) {
                        chunk.setBlockRuntimeId(x + dx, y, z + dz, leaves);
                    }
                }
            }
        }
    }
}

export default TreeDecorator;
