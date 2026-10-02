import BaseGenerator from '../BaseGenerator';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import Chunk from '../chunk/Chunk';
import Noise from './Noise';
import { SEA_LEVEL, SOIL_DEPTH, isSandy, surfaceHeightAt } from './TerrainShape';
import CaveCarver from './decoration/CaveCarver';
import ChunkRandom from './decoration/ChunkRandom';
import OreDecorator from './decoration/OreDecorator';
import StructureDecorator from './decoration/StructureDecorator';
import TreeDecorator from './decoration/TreeDecorator';
import VegetationDecorator from './decoration/VegetationDecorator';
import type { BlockPalette, Decorator } from './decoration/Decorator';
import { heightIndex } from './decoration/Decorator';

/** Every block the terrain or a decorator may place. Resolved once per chunk. */
const PALETTE_BLOCKS = [
    'minecraft:air',
    'minecraft:bedrock',
    'minecraft:stone',
    'minecraft:dirt',
    'minecraft:grass_block',
    'minecraft:sand',
    'minecraft:water',
    'minecraft:gravel',
    'minecraft:granite',
    'minecraft:diorite',
    'minecraft:andesite',
    'minecraft:coal_ore',
    'minecraft:iron_ore',
    'minecraft:gold_ore',
    'minecraft:redstone_ore',
    'minecraft:lapis_ore',
    'minecraft:diamond_ore',
    'minecraft:emerald_ore',
    'minecraft:oak_log',
    'minecraft:oak_leaves',
    'minecraft:birch_log',
    'minecraft:birch_leaves',
    'minecraft:short_grass',
    'minecraft:dandelion',
    'minecraft:poppy',
    'minecraft:deadbush'
] as const;

/**
 * A rolling overworld: hills, oceans and beaches, with ores, caves, structures, trees and
 * ground cover.
 *
 * Terrain is sampled from world coordinates rather than chunk-local ones, so chunks meet
 * seamlessly however they are generated or in whatever order.
 *
 * Decoration then runs as an ordered list of passes, and the order carries meaning: ores go
 * in before caves so a tunnel exposes them in its walls, structures go in after the caves so
 * a village is not undermined by one, trees come next and refuse to grow into what a village
 * has already built, and vegetation goes last so it can see what everything else left. Each
 * pass draws from a random generator seeded from the world seed and the chunk's own
 * coordinates, which is what makes a chunk come out the same however many times it is
 * generated and whatever its neighbours did.
 */
export default class Overworld extends BaseGenerator {
    /** Walked in order for every chunk; a plugin can extend this list. */
    private readonly decorators: Decorator[] = [
        new OreDecorator(),
        new CaveCarver(),
        new StructureDecorator(),
        new TreeDecorator(),
        new VegetationDecorator()
    ];

    public async generateChunk(cx: number, cz: number, seed = 0): Promise<Chunk> {
        const chunk = new Chunk(cx, cz);
        const noise = new Noise(seed);
        const palette = this.resolvePalette();

        const heights = this.buildTerrain(chunk, cx, cz, noise, palette);

        const context = {
            chunk,
            chunkX: cx,
            chunkZ: cz,
            seed,
            heights,
            noise,
            random: new ChunkRandom(seed, cx, cz),
            palette,
            // Filled in by whichever pass wants a mob to exist where it built something. The
            // generator has no world to add entities to, so it records the intent and the
            // world acts on it when the chunk is first loaded.
            spawns: chunk.getEntitySpawns()
        };

        for (const decorator of this.decorators) {
            decorator.decorate(context);
        }

        return chunk;
    }

    /** Adds a pass, which is how a plugin contributes to how the world looks. */
    public addDecorator(decorator: Decorator): void {
        this.decorators.push(decorator);
    }

    /** Lays down the ground and returns the surface height of every column. */
    private buildTerrain(chunk: Chunk, cx: number, cz: number, noise: Noise, palette: BlockPalette): Int32Array {
        const heights = new Int32Array(256);
        const floor = chunk.getMinY();
        const ceiling = chunk.getMaxY();

        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                const height = surfaceHeightAt(noise, cx * 16 + x, cz * 16 + z, floor, ceiling);
                heights[heightIndex(x, z)] = height;

                // A beach is land that only just clears the water; below it, seabed.
                const sandy = isSandy(height);
                const surface = sandy ? palette['minecraft:sand']! : palette['minecraft:grass_block']!;
                const soil = sandy ? palette['minecraft:sand']! : palette['minecraft:dirt']!;

                // Runs, bottom to top: bedrock floor, stone, soil, the surface block, then
                // water up to sea level if the ground did not reach it.
                chunk.fillColumn(x, z, floor, floor, palette['minecraft:bedrock']!);
                chunk.fillColumn(x, z, floor + 1, height - SOIL_DEPTH, palette['minecraft:stone']!);
                chunk.fillColumn(x, z, Math.max(height - SOIL_DEPTH + 1, floor + 1), height - 1, soil);
                chunk.fillColumn(x, z, height, height, surface);
                chunk.fillColumn(x, z, height + 1, SEA_LEVEL, palette['minecraft:water']!);
            }
        }

        return heights;
    }

    /**
     * Resolves every block the generator can place.
     *
     * A block missing from the catalogue is left out rather than throwing: a decorator that
     * cannot find its block skips itself, so an incomplete catalogue costs some scenery
     * instead of taking world generation down.
     */
    private resolvePalette(): BlockPalette {
        const palette: Record<string, number> = {};

        for (const name of PALETTE_BLOCKS) {
            try {
                palette[name] = BlockRuntimeIds.getByName(name);
            } catch {
                // Left out on purpose; decorators check before using.
            }
        }

        return palette;
    }
}
