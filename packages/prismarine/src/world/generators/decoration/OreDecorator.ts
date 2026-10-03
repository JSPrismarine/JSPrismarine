import type { DecorationContext, Decorator } from './Decorator';
import { heightIndex } from './Decorator';

/**
 * One kind of vein: what it is, how deep it lives, how big and how many per chunk.
 *
 * `aboveFloor` is measured from the world floor rather than from y=0, so the bands sit the same
 * distance above bedrock whatever the dimension's floor is - the Overworld's moved to -64.
 * `maxY` stays absolute, because the ceiling of a band is about how far below the surface it is
 * and the surface did not move.
 */
interface OreVein {
    block: string;
    aboveFloor: number;
    maxY: number;
    size: number;
    perChunk: number;
}

/**
 * Roughly vanilla distribution: common ores shallow and plentiful, valuable ones deep and
 * scarce. The stone variants are in the same list because they are placed the same way -
 * a blob replacing stone - just far larger and with no depth preference.
 */
const VEINS: readonly OreVein[] = [
    { block: 'minecraft:gravel', aboveFloor: 1, maxY: 100, size: 33, perChunk: 8 },
    { block: 'minecraft:granite', aboveFloor: 1, maxY: 80, size: 33, perChunk: 10 },
    { block: 'minecraft:diorite', aboveFloor: 1, maxY: 80, size: 33, perChunk: 10 },
    { block: 'minecraft:andesite', aboveFloor: 1, maxY: 80, size: 33, perChunk: 10 },
    { block: 'minecraft:dirt', aboveFloor: 1, maxY: 100, size: 33, perChunk: 10 },
    { block: 'minecraft:coal_ore', aboveFloor: 5, maxY: 100, size: 17, perChunk: 20 },
    { block: 'minecraft:iron_ore', aboveFloor: 5, maxY: 64, size: 9, perChunk: 20 },
    { block: 'minecraft:gold_ore', aboveFloor: 5, maxY: 32, size: 9, perChunk: 2 },
    { block: 'minecraft:redstone_ore', aboveFloor: 1, maxY: 16, size: 8, perChunk: 8 },
    { block: 'minecraft:lapis_ore', aboveFloor: 1, maxY: 32, size: 7, perChunk: 1 },
    { block: 'minecraft:diamond_ore', aboveFloor: 1, maxY: 16, size: 8, perChunk: 1 },
    { block: 'minecraft:emerald_ore', aboveFloor: 5, maxY: 32, size: 5, perChunk: 1 }
];

/**
 * Scatters ore and stone-variant blobs through the stone.
 *
 * Each vein grows as a short random walk from a starting point, which gives the ragged,
 * clustered shape ore has in vanilla rather than the neat spheres a radius test would.
 * Blobs only ever replace stone, so they cannot eat the surface, the bedrock floor, or
 * each other's more valuable contents.
 */
export class OreDecorator implements Decorator {
    public readonly name = 'ore';

    public decorate(context: DecorationContext): void {
        const { chunk, random, palette, heights } = context;
        const stone = palette['minecraft:stone']!;

        for (const vein of VEINS) {
            const block = palette[vein.block];
            if (block === undefined) continue; // not in the palette this world uses

            const veinFloor = chunk.getMinY() + vein.aboveFloor;

            for (let attempt = 0; attempt < vein.perChunk; attempt++) {
                let x = random.nextInt(16);
                let z = random.nextInt(16);
                // Never above the ground: a vein started in the open air would grow nowhere.
                const ceiling = Math.min(vein.maxY, heights[heightIndex(x, z)]! - 1);
                if (ceiling <= veinFloor) continue;

                let y = random.nextRange(veinFloor, ceiling);

                for (let step = 0; step < vein.size; step++) {
                    if (chunk.getBlockRuntimeId(x, y, z) === stone) {
                        chunk.setBlockRuntimeId(x, y, z, block);
                    }

                    // Wander one block in some direction, staying inside the chunk so the
                    // vein never silently spills into a neighbour that may already exist.
                    x = Math.min(15, Math.max(0, x + random.nextRange(-1, 1)));
                    z = Math.min(15, Math.max(0, z + random.nextRange(-1, 1)));
                    y = Math.min(ceiling, Math.max(veinFloor, y + random.nextRange(-1, 1)));
                }
            }
        }
    }
}

export default OreDecorator;
