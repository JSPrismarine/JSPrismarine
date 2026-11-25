/**
 * A chunk column of the world as a Java Edition client is sent it.
 *
 * The world keeps Bedrock block states and biomes, which the server's edition translations turn
 * into the ids a Java client names them by. Light comes from the world's light engine when the
 * caller gives one, and is otherwise worked out from each column's height.
 */
import type { JavaChunkSection, JavaSectionKinds } from '@jsprismarine/protocol/java/chunk/levelChunk';
import { encodeSections, JavaHeightmapType } from '@jsprismarine/protocol/java/chunk/levelChunk';
import { biomesKind, blockStatesKind, packHeightmap } from '@jsprismarine/protocol/java/chunk/palettedContainer';
import { BLOCK_STATES } from '@jsprismarine/protocol/java/versions/26.3/blockStates';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type Chunk from '../../world/chunk/Chunk';
import { isWaterIdentifier } from '../../entity/data/navigationView';
import type { EditionTranslation } from './editionTranslation';
import { JAVA_BIOMES, javaBiomeTranslation, javaBlockTranslation, javaWaterloggedOf } from './editionTranslation';

const JAVA_AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

/** The registry sizes a section's containers are written against. */
export const JAVA_SECTION_KINDS: JavaSectionKinds = {
    blocks: blockStatesKind(BLOCK_STATES.size),
    biomes: biomesKind(JAVA_BIOMES.length)
};

/**
 * The world's light, at world positions. Without one, sky light is worked out from each column's
 * height and there is no block light.
 */
export interface JavaChunkLight {
    sky(x: number, y: number, z: number): number;
    block(x: number, y: number, z: number): number;
}

/** A section lit 15 throughout, shared, since the sky above the ground is the same everywhere. */
const FULL_LIGHT = Buffer.alloc(2048, 0xff);

/** A section's light as Java packs it: two blocks a byte, the even index in the low nibble, y slowest. */
const nibbles = (level: (index: number) => number): Buffer => {
    const array = Buffer.alloc(2048);
    for (let i = 0; i < 4096; i++) array[i >> 1] = array[i >> 1]! | (level(i) << ((i & 1) * 4));
    return array;
};

/**
 * The masks and arrays for each section's light. Light sections run one below the world to one
 * above it, so the world's own are 1 to the section count. A dark section is listed as empty and
 * carries no array, as vanilla sends it; the one below the world is empty, and the one above is
 * left out.
 */
const lightMasks = (
    sky: readonly (Buffer | undefined)[],
    block: readonly (Buffer | undefined)[]
): Pick<JavaChunkColumn, 'skyMask' | 'blockMask' | 'emptySkyMask' | 'emptyBlockMask' | 'skyLight' | 'blockLight'> => {
    const split = (arrays: readonly (Buffer | undefined)[]) => {
        const mask: number[] = [];
        const empty: number[] = [0];
        const lit: Buffer[] = [];
        arrays.forEach((array, section) => {
            if (array === undefined) empty.push(section + 1);
            else {
                mask.push(section + 1);
                lit.push(array);
            }
        });
        return { mask, empty, lit };
    };
    const skyLayer = split(sky);
    const blockLayer = split(block);
    return {
        skyMask: skyLayer.mask,
        blockMask: blockLayer.mask,
        emptySkyMask: skyLayer.empty,
        emptyBlockMask: blockLayer.empty,
        skyLight: skyLayer.lit,
        blockLight: blockLayer.lit
    };
};

/** The fields of a `Chunk Data and Update Light` packet. */
export interface JavaChunkColumn {
    x: number;
    z: number;
    heightmaps: { type: number; data: bigint[] }[];
    data: Buffer;
    blockEntities: [];
    skyMask: number[];
    blockMask: number[];
    emptySkyMask: number[];
    emptyBlockMask: number[];
    skyLight: Buffer[];
    blockLight: Buffer[];
}

/** Translates the world's chunks for Java clients, through the server's block and biome translations. */
export class JavaChunkTranslator {
    /** Whether each Java state id is air, and whether it holds a fluid, which a section counts. */
    private readonly facts = new Map<number, { readonly air: boolean; readonly fluid: boolean }>();

    /**
     * @param blocks - Bedrock runtime ids to Java state ids.
     * @param biomes - Bedrock biome ids to Java biome ids.
     */
    public constructor(
        private readonly blocks: EditionTranslation<number, number> = javaBlockTranslation(),
        private readonly biomes: EditionTranslation<number, number> = javaBiomeTranslation()
    ) {}

    private factsOf(javaId: number): { readonly air: boolean; readonly fluid: boolean } {
        const known = this.facts.get(javaId);
        if (known !== undefined) return known;
        const state = BLOCK_STATES.stateOf(javaId);
        const facts = {
            air: state === undefined || JAVA_AIR.has(state.name),
            fluid:
                state?.name === 'minecraft:water' ||
                state?.name === 'minecraft:lava' ||
                state?.properties['waterlogged'] === 'true'
        };
        this.facts.set(javaId, facts);
        return facts;
    }

    /**
     * One section's light from a light source, or undefined when every block of it is dark.
     * @param level - The light at a world position.
     */
    private lightOf(
        level: (x: number, y: number, z: number) => number,
        worldX: number,
        baseY: number,
        worldZ: number
    ): Buffer | undefined {
        let lit = false;
        const array = nibbles((i) => {
            const value = level(worldX + (i & 15), baseY + (i >> 8), worldZ + ((i >> 4) & 15));
            if (value !== 0) lit = true;
            return value;
        });
        return lit ? array : undefined;
    }

    /**
     * One column as a Java client is sent it.
     * @param chunk - The world's chunk.
     * @param light - The world's light, or none to work sky light out from the ground.
     * @returns The packet's fields.
     */
    public columnOf(
        chunk: Pick<Chunk, 'getX' | 'getZ' | 'getSubChunk' | 'getBiome' | 'heightmap' | 'getDimension'>,
        light?: JavaChunkLight
    ): JavaChunkColumn {
        const dimension = chunk.getDimension();
        // A Java client is configured with the Java dimension, which can be taller than the one the
        // world keeps (the Nether's 256 where Bedrock has 128); what the world lacks is air.
        const { minY, height } = dimension.java;
        const count = height / 16;
        const kept = { from: dimension.minY >> 4, to: (dimension.minY + dimension.height) >> 4 };
        // Measured from the floor of the world the chunk keeps, which is Java's too in the overworld.
        const bedrockHeights = chunk.heightmap();
        // Java indexes a heightmap and every array x fastest, then z; Bedrock's heightmap is z fastest.
        const heights = Array.from({ length: 256 }, (_, i) => bedrockHeights[(i & 15) * 16 + (i >> 4)] ?? 0);

        const air = BlockRuntimeIds.getByName('minecraft:air');
        const worldX = chunk.getX() * 16;
        const worldZ = chunk.getZ() * 16;
        const highest = minY + Math.max(0, ...heights);
        // Every light source is a block, and light falls off by one a block, so no block light
        // reaches past 15 above the highest block; those sections are dark without a read.
        const blockLightOf = (baseY: number): Buffer | undefined =>
            light === undefined || baseY > highest + 15 ? undefined : this.lightOf(light.block, worldX, baseY, worldZ);
        /** Each section's sky and block light, undefined where the section is dark. */
        const sky: (Buffer | undefined)[] = [];
        const block: (Buffer | undefined)[] = [];
        const sections: JavaChunkSection[] = [];
        for (let section = 0; section < count; section++) {
            const baseY = minY + section * 16;
            const sub = baseY >> 4 >= kept.from && baseY >> 4 < kept.to ? chunk.getSubChunk(baseY >> 4) : null;
            const blocks = new Array<number>(4096);
            let blockCount = 0;
            let fluidCount = 0;
            // Only a section with a second storage layer can hold a waterlogged block.
            const liquids = sub !== null && sub.getStorages().length > 1;
            for (let i = 0; i < 4096; i++) {
                const x = i & 15;
                const y = i >> 8;
                const z = (i >> 4) & 15;
                const main = this.blocks.toJava(sub === null ? air : sub.getBlockRuntimeId(x, y, z));
                const id =
                    liquids && isWaterIdentifier(BlockRuntimeIds.getState(sub.getBlockRuntimeId(x, y, z, 1))?.name)
                        ? javaWaterloggedOf(main)
                        : main;
                blocks[i] = id;
                const facts = this.factsOf(id);
                if (!facts.air) blockCount += 1;
                if (facts.fluid) fluidCount += 1;
            }
            const biomes = Array.from({ length: 64 }, (_, i) => {
                // Above the world the chunk keeps, the top of it stands in.
                const y = Math.min(baseY + (i >> 4) * 4, dimension.minY + dimension.height - 1);
                return this.biomes.toJava(chunk.getBiome((i & 3) * 4, y, ((i >> 2) & 3) * 4));
            });
            sections.push({ blockCount, fluidCount, blocks, biomes });

            // Above every column's highest block, the sky is all there is.
            if (baseY >= highest) {
                sky.push(FULL_LIGHT);
                block.push(blockLightOf(baseY));
                continue;
            }
            sky.push(
                light === undefined
                    ? nibbles((i) => (baseY + (i >> 8) >= minY + (heights[i & 255] ?? 0) ? 15 : 0))
                    : this.lightOf(light.sky, worldX, baseY, worldZ)
            );
            block.push(blockLightOf(baseY));
        }

        const heightmap = packHeightmap(heights, height);
        return {
            x: chunk.getX(),
            z: chunk.getZ(),
            heightmaps: [
                { type: JavaHeightmapType.MotionBlocking, data: heightmap },
                { type: JavaHeightmapType.MotionBlockingNoLeaves, data: heightmap },
                { type: JavaHeightmapType.WorldSurface, data: heightmap }
            ],
            data: encodeSections(sections, JAVA_SECTION_KINDS),
            blockEntities: [],
            // Light sections run one below the world to one above: the world's own are 1 to count.
            ...lightMasks(sky, block)
        };
    }
}
