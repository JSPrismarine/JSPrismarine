/**
 * Java's below-zero upgrade of a pre-1.18 overworld chunk, applied to a stored Bedrock chunk.
 *
 * The rules are `@jsprismarine/worldgen/blending/belowZeroRetrogen`'s. The new floor comes from a
 * chunk the generator makes at the same position: the generator knows the stored chunk is old, so
 * its terrain under y = 0 is blended toward the old terrain above, as Java's is. This module takes
 * that chunk's blocks under y = 0, decides the biomes there, and turns the old bedrock floor into
 * deepslate.
 *
 * Java's `generateBorderTicks` marks the fluids along the upgraded floor for an update; the world
 * already ticks every fluid that borders air when a chunk enters it, which covers the same water.
 */
import { bedrockBiomeToJava } from '@jsprismarine/mapping';
import type { FloorBlock } from '@jsprismarine/worldgen/blending/belowZeroRetrogen';
import {
    RETAINED_RETROGEN_BIOMES,
    RETROGEN_END_Y,
    RETROGEN_MIN_Y,
    RETROGEN_OLD_BEDROCK_MAX_Y,
    missingBedrockOf
} from '@jsprismarine/worldgen/blending/belowZeroRetrogen';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type Chunk from './Chunk';

const floorOf =
    (chunk: Chunk) =>
    (x: number, z: number): FloorBlock => {
        const name = chunk.getBlock(x, 0, z).name;
        return name === 'minecraft:bedrock' ? 'bedrock' : name === 'minecraft:air' ? 'air' : 'other';
    };

/**
 * Whether a stored pre-1.18 chunk gets a new floor, and which columns stay open under it.
 *
 * @returns The `z * 16 + x` columns with no bedrock at y = 0, or undefined when the chunk is left
 *   as it is.
 */
export const belowZeroRetrogenOf = (chunk: Chunk): ReadonlySet<number> | undefined => missingBedrockOf(floorOf(chunk));

/**
 * Writes the new floor into a stored chunk.
 *
 * @param stored - The pre-1.18 chunk, changed in place.
 * @param generated - The generator's chunk at the same position, made while it knew `stored` was old.
 * @param missingBedrock - What {@link belowZeroRetrogenOf} returned for `stored`.
 */
export const applyBelowZeroRetrogen = (stored: Chunk, generated: Chunk, missingBedrock: ReadonlySet<number>): void => {
    const air = BlockRuntimeIds.getByName('minecraft:air');
    const bedrock = BlockRuntimeIds.getByName('minecraft:bedrock');
    const deepslate = BlockRuntimeIds.getByName('minecraft:deepslate');

    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            // Java's `applyBedrockMask`: a column dug through the old floor stays open below it.
            const open = missingBedrock.has(z * 16 + x);
            for (let y = RETROGEN_MIN_Y; y < RETROGEN_END_Y; y++) {
                for (const layer of [0, 1]) {
                    stored.setBlockRuntimeId(x, y, z, open ? air : generated.getBlockRuntimeId(x, y, z, layer), layer);
                }
            }
            // Java's `replaceOldBedrock`.
            for (let y = 0; y <= RETROGEN_OLD_BEDROCK_MAX_Y; y++) {
                if (stored.getBlockRuntimeId(x, y, z) === bedrock) stored.setBlockRuntimeId(x, y, z, deepslate);
            }
        }
    }

    for (const blockEntity of generated.getBlockEntities()) {
        const position = blockEntity.getPosition();
        const localX = position.getX() & 0xf;
        const localZ = position.getZ() & 0xf;
        if (position.getY() < RETROGEN_END_Y && !missingBedrock.has(localZ * 16 + localX))
            stored.setBlockEntity(blockEntity);
    }

    // Java's `BelowZeroRetrogen.getBiomeResolver`: the cave biomes stay, and every other quart
    // takes the old biome at y = 0.
    for (let quartX = 0; quartX < 4; quartX++) {
        for (let quartZ = 0; quartZ < 4; quartZ++) {
            const oldBiome = stored.getBiome(quartX * 4, 0, quartZ * 4);
            for (let quartY = RETROGEN_MIN_Y >> 2; quartY < RETROGEN_END_Y >> 2; quartY++) {
                const newBiome = generated.getBiome(quartX * 4, quartY * 4, quartZ * 4);
                const java = bedrockBiomeToJava(newBiome);
                const biome = java.kind === 'mapped' && RETAINED_RETROGEN_BIOMES.has(java.java) ? newBiome : oldBiome;
                for (let x = quartX * 4; x < quartX * 4 + 4; x++) {
                    for (let z = quartZ * 4; z < quartZ * 4 + 4; z++) {
                        for (let y = quartY * 4; y < quartY * 4 + 4; y++) stored.setBiome(x, y, z, biome);
                    }
                }
            }
        }
    }
};
