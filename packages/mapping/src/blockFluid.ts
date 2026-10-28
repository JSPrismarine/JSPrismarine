import type { JavaBlockState } from './blockMapping';

/** A Java block state's fluid kind. */
export type JavaBlockFluidKind = 'empty' | 'water' | 'lava';

/** Blocks whose fluid state is water without a `waterlogged` property. */
const WATER_BLOCKS = new Set([
    'minecraft:water',
    'minecraft:bubble_column',
    'minecraft:kelp',
    'minecraft:kelp_plant',
    'minecraft:seagrass',
    'minecraft:tall_seagrass'
]);

/**
 * Reads the Java fluid state carried by one block state.
 *
 * @param state - The Java block identifier and its complete property set.
 * @returns `water`, `lava`, or `empty`, matching Java 26.3's block fluid state.
 */
export const javaBlockFluidKindOf = (state: JavaBlockState): JavaBlockFluidKind => {
    if (state.name === 'minecraft:lava') return 'lava';
    if (WATER_BLOCKS.has(state.name) || state.properties['waterlogged'] === 'true') return 'water';
    return 'empty';
};
