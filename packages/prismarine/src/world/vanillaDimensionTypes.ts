/**
 * The three `dimension_type` documents Java 26.3 ships, copied verbatim from
 * `data/minecraft/dimension_type/` in the vanilla datapack so `Dimensions` can be built at module
 * load without the Java data cache. `vanillaDimensionTypes.test.ts` compares each copy to the
 * cached datapack when the cache is warm, so a 26.3 bump that changes a type fails that test
 * rather than drifting here unnoticed.
 */
import { parseDimensionType } from '@jsprismarine/worldgen';
import type { DimensionTypeDefinition } from '@jsprismarine/worldgen';

/** `data/minecraft/dimension_type/overworld.json`. */
export const OVERWORLD_DIMENSION_TYPE_JSON = {
    ambient_light: 0.0,
    attributes: {
        'minecraft:audio/ambient_sounds': {
            mood: {
                block_search_extent: 8,
                offset: 2.0,
                sound: 'minecraft:ambient.cave',
                tick_delay: 6000
            }
        },
        'minecraft:audio/background_music': {
            creative: {
                max_delay: 24000,
                min_delay: 12000,
                sound: 'minecraft:music.creative'
            },
            default: {
                max_delay: 24000,
                min_delay: 12000,
                sound: 'minecraft:music.game'
            }
        },
        'minecraft:gameplay/bed_rule': {
            can_set_spawn: 'always',
            can_sleep: 'when_dark',
            error_message: {
                translate: 'block.minecraft.bed.no_sleep'
            }
        },
        'minecraft:gameplay/nether_portal_spawns_piglin': true,
        'minecraft:gameplay/respawn_anchor_works': false,
        'minecraft:gameplay/straw_bed_rule': {
            can_set_spawn: 'never',
            can_sleep: 'when_dark',
            destroy_on_leave: true,
            error_message: {
                translate: 'block.minecraft.bed.no_sleep'
            }
        },
        'minecraft:visual/ambient_light_color': '#0a0a0a',
        'minecraft:visual/cloud_color': '#ccffffff',
        'minecraft:visual/cloud_height': 192.33,
        'minecraft:visual/fog_color': '#c0d8ff',
        'minecraft:visual/sky_color': '#78a7ff'
    },
    coordinate_scale: 1.0,
    default_clock: 'minecraft:overworld',
    has_ceiling: false,
    has_ender_dragon_fight: false,
    has_skylight: true,
    height: 384,
    infiniburn: '#minecraft:infiniburn_overworld',
    logical_height: 384,
    min_y: -64,
    monster_spawn_block_light_limit: 0,
    monster_spawn_light_level: {
        type: 'minecraft:uniform',
        max_inclusive: 7,
        min_inclusive: 0
    },
    timelines: '#minecraft:in_overworld'
} as const;

/** `data/minecraft/dimension_type/the_nether.json`. */
export const THE_NETHER_DIMENSION_TYPE_JSON = {
    ambient_light: 0.1,
    attributes: {
        'minecraft:gameplay/bed_rule': {
            can_set_spawn: 'never',
            can_sleep: 'never',
            destroy_on_use: true
        },
        'minecraft:gameplay/can_start_raid': false,
        'minecraft:gameplay/fast_lava': true,
        'minecraft:gameplay/piglins_zombify': false,
        'minecraft:gameplay/respawn_anchor_works': true,
        'minecraft:gameplay/sky_light_level': 4.0,
        'minecraft:gameplay/snow_golem_melts': true,
        'minecraft:gameplay/straw_bed_rule': {
            can_set_spawn: 'never',
            can_sleep: 'never',
            destroy_on_use: true
        },
        'minecraft:gameplay/water_evaporates': true,
        'minecraft:visual/ambient_light_color': '#302821',
        'minecraft:visual/default_dripstone_particle': {
            type: 'minecraft:dripping_dripstone_lava'
        },
        'minecraft:visual/fog_end_distance': 96.0,
        'minecraft:visual/fog_start_distance': 10.0,
        'minecraft:visual/sky_light_color': '#7a7aff',
        'minecraft:visual/sky_light_factor': 0.0
    },
    cardinal_light: 'nether',
    coordinate_scale: 8.0,
    has_ceiling: true,
    has_ender_dragon_fight: false,
    has_fixed_time: true,
    has_skylight: false,
    height: 256,
    infiniburn: '#minecraft:infiniburn_nether',
    logical_height: 128,
    min_y: 0,
    monster_spawn_block_light_limit: 15,
    monster_spawn_light_level: 7,
    skybox: 'none',
    timelines: '#minecraft:in_nether'
} as const;

/** `data/minecraft/dimension_type/the_end.json`. */
export const THE_END_DIMENSION_TYPE_JSON = {
    ambient_light: 0.25,
    attributes: {
        'minecraft:audio/ambient_sounds': {
            mood: {
                block_search_extent: 8,
                offset: 2.0,
                sound: 'minecraft:ambient.cave',
                tick_delay: 6000
            }
        },
        'minecraft:audio/background_music': {
            default: {
                max_delay: 24000,
                min_delay: 6000,
                replace_current_music: true,
                sound: 'minecraft:music.end'
            }
        },
        'minecraft:gameplay/bed_rule': {
            can_set_spawn: 'never',
            can_sleep: 'never',
            destroy_on_use: true
        },
        'minecraft:gameplay/respawn_anchor_works': false,
        'minecraft:gameplay/straw_bed_rule': {
            can_set_spawn: 'never',
            can_sleep: 'never',
            destroy_on_use: true
        },
        'minecraft:visual/ambient_light_color': '#3f473f',
        'minecraft:visual/fog_color': '#181318',
        'minecraft:visual/sky_color': '#000000',
        'minecraft:visual/sky_light_color': '#ac60cd',
        'minecraft:visual/sky_light_factor': 0.0
    },
    coordinate_scale: 1.0,
    default_clock: 'minecraft:the_end',
    has_ceiling: false,
    has_ender_dragon_fight: true,
    has_fixed_time: true,
    has_skylight: true,
    height: 256,
    infiniburn: '#minecraft:infiniburn_end',
    logical_height: 256,
    min_y: 0,
    monster_spawn_block_light_limit: 0,
    monster_spawn_light_level: 15,
    skybox: 'end',
    timelines: '#minecraft:in_end'
} as const;

/** The embedded documents by Java `dimension_type` id, as the datapack files are named. */
export const VANILLA_DIMENSION_TYPE_JSON = {
    'minecraft:overworld': OVERWORLD_DIMENSION_TYPE_JSON,
    'minecraft:the_nether': THE_NETHER_DIMENSION_TYPE_JSON,
    'minecraft:the_end': THE_END_DIMENSION_TYPE_JSON
} as const;

/** The Java id of one of the three vanilla dimension types. */
export type VanillaDimensionTypeId = keyof typeof VANILLA_DIMENSION_TYPE_JSON;

/** The three vanilla types parsed, keyed by Java id. */
export const VANILLA_DIMENSION_TYPES: Readonly<Record<VanillaDimensionTypeId, DimensionTypeDefinition>> = {
    'minecraft:overworld': parseDimensionType(OVERWORLD_DIMENSION_TYPE_JSON, 'minecraft:overworld'),
    'minecraft:the_nether': parseDimensionType(THE_NETHER_DIMENSION_TYPE_JSON, 'minecraft:the_nether'),
    'minecraft:the_end': parseDimensionType(THE_END_DIMENSION_TYPE_JSON, 'minecraft:the_end')
};
