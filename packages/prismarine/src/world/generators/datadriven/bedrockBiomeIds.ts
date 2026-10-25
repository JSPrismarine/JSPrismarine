/**
 * What number the Bedrock client calls each biome.
 *
 * The `Data3D` record and the biome half of a chunk payload both carry a numeric biome id,
 * and the client resolves grass color, fog and ambient sound from it. The numbers are Mojang's
 * and are not a registry position, so they cannot be derived from the biome list.
 *
 * Joined from GeyserMC/mappings `biomes.json` at commit 81700ab543c1f4e9f9041f58dac4154ecb0d0c8b,
 * whose Java biome to Bedrock id table is keyed the same way `@jsprismarine/mapping`'s
 * `registries.json` biome table is, against the Bedrock names that table produces. The
 * GeyserMC data is MIT; see `packages/mapping/NOTICE`.
 *
 * This belongs beside the rest of the Java-to-Bedrock seam in `@jsprismarine/mapping`, which
 * today publishes the name correspondence and not the ids.
 */
export const BEDROCK_BIOME_IDS: Readonly<Record<string, number>> = {
    'minecraft:ocean': 0,
    'minecraft:plains': 1,
    'minecraft:desert': 2,
    'minecraft:extreme_hills': 3,
    'minecraft:forest': 4,
    'minecraft:taiga': 5,
    'minecraft:swampland': 6,
    'minecraft:river': 7,
    'minecraft:hell': 8,
    'minecraft:the_end': 9,
    'minecraft:frozen_river': 11,
    'minecraft:ice_plains': 12,
    'minecraft:mushroom_island': 14,
    'minecraft:beach': 16,
    'minecraft:jungle': 21,
    'minecraft:jungle_edge': 23,
    'minecraft:deep_ocean': 24,
    'minecraft:stone_beach': 25,
    'minecraft:cold_beach': 26,
    'minecraft:birch_forest': 27,
    'minecraft:roofed_forest': 29,
    'minecraft:cold_taiga': 30,
    'minecraft:mega_taiga': 32,
    'minecraft:extreme_hills_plus_trees': 34,
    'minecraft:savanna': 35,
    'minecraft:savanna_plateau': 36,
    'minecraft:mesa': 37,
    'minecraft:mesa_plateau_stone': 38,
    'minecraft:warm_ocean': 40,
    'minecraft:lukewarm_ocean': 42,
    'minecraft:deep_lukewarm_ocean': 43,
    'minecraft:cold_ocean': 44,
    'minecraft:deep_cold_ocean': 45,
    'minecraft:frozen_ocean': 46,
    'minecraft:deep_frozen_ocean': 47,
    'minecraft:bamboo_jungle': 48,
    'minecraft:sunflower_plains': 129,
    'minecraft:extreme_hills_mutated': 131,
    'minecraft:flower_forest': 132,
    'minecraft:ice_plains_spikes': 140,
    'minecraft:birch_forest_mutated': 155,
    'minecraft:redwood_taiga_mutated': 160,
    'minecraft:savanna_mutated': 163,
    'minecraft:mesa_bryce': 165,
    'minecraft:soulsand_valley': 178,
    'minecraft:crimson_forest': 179,
    'minecraft:warped_forest': 180,
    'minecraft:basalt_deltas': 181,
    'minecraft:jagged_peaks': 182,
    'minecraft:frozen_peaks': 183,
    'minecraft:snowy_slopes': 184,
    'minecraft:grove': 185,
    'minecraft:meadow': 186,
    'minecraft:lush_caves': 187,
    'minecraft:dripstone_caves': 188,
    'minecraft:stony_peaks': 189,
    'minecraft:deep_dark': 190,
    'minecraft:mangrove_swamp': 191,
    'minecraft:cherry_grove': 192,
    'minecraft:pale_garden': 193,
    'minecraft:sulfur_caves': 194,
    'minecraft:dappled_forest': 195
};
