import { describe, expect, it } from 'vitest';

import { findVanillaDatapack } from '../../vectors/javaDatapack';
import { parseDimensionType } from './DimensionType';

/** `dimension_type/the_nether.json` from the 26.3 datapack, verbatim. */
const THE_NETHER = {
    ambient_light: 0.1,
    attributes: {
        'minecraft:gameplay/bed_rule': { can_set_spawn: 'never', can_sleep: 'never', destroy_on_use: true },
        'minecraft:gameplay/can_start_raid': false,
        'minecraft:gameplay/fast_lava': true,
        'minecraft:gameplay/piglins_zombify': false,
        'minecraft:gameplay/respawn_anchor_works': true,
        'minecraft:gameplay/sky_light_level': 4.0,
        'minecraft:gameplay/snow_golem_melts': true,
        'minecraft:gameplay/straw_bed_rule': { can_set_spawn: 'never', can_sleep: 'never', destroy_on_use: true },
        'minecraft:gameplay/water_evaporates': true,
        'minecraft:visual/ambient_light_color': '#302821',
        'minecraft:visual/default_dripstone_particle': { type: 'minecraft:dripping_dripstone_lava' },
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
};

/** The overworld's required fields only, to exercise every default. */
const MINIMAL_OVERWORLD = {
    min_y: -64,
    height: 384,
    logical_height: 384,
    coordinate_scale: 1.0,
    has_skylight: true,
    has_ceiling: false,
    ambient_light: 0.0,
    monster_spawn_light_level: { type: 'minecraft:uniform', min_inclusive: 0, max_inclusive: 7 },
    monster_spawn_block_light_limit: 0,
    infiniburn: '#minecraft:infiniburn_overworld'
};

describe('parseDimensionType', () => {
    it('reads the nether type field for field', () => {
        const nether = parseDimensionType(THE_NETHER, 'the_nether');
        expect(nether).toMatchObject({
            minY: 0,
            height: 256,
            logicalHeight: 128,
            coordinateScale: 8,
            hasSkylight: false,
            hasCeiling: true,
            hasFixedTime: true,
            hasEnderDragonFight: false,
            ambientLight: 0.1,
            monsterSpawnLightLevel: { type: 'constant', value: 7 },
            monsterSpawnBlockLightLimit: 15,
            infiniburn: '#minecraft:infiniburn_nether',
            skybox: 'none',
            cardinalLight: 'nether',
            timelines: ['#minecraft:in_nether']
        });
        expect(nether.defaultClock).toBeUndefined();
        expect(nether.attributes.get('minecraft:gameplay/respawn_anchor_works')).toBe(true);
        expect(nether.attributes.get('minecraft:gameplay/bed_rule')).toEqual({
            can_set_spawn: 'never',
            can_sleep: 'never',
            destroy_on_use: true
        });
        expect(nether.attributes.size).toBe(15);
    });

    it('applies the defaults the wiki documents for absent fields', () => {
        const overworld = parseDimensionType(MINIMAL_OVERWORLD);
        expect(overworld.hasFixedTime).toBe(false);
        expect(overworld.hasEnderDragonFight).toBe(false);
        expect(overworld.skybox).toBe('overworld');
        expect(overworld.cardinalLight).toBe('default');
        expect(overworld.timelines).toEqual([]);
        expect(overworld.attributes.size).toBe(0);
        expect(overworld.defaultClock).toBeUndefined();
        expect(overworld.monsterSpawnLightLevel).toEqual({ type: 'uniform', minInclusive: 0, maxInclusive: 7 });
    });

    it('reads a default clock and a timeline list', () => {
        const end = parseDimensionType({
            ...MINIMAL_OVERWORLD,
            default_clock: 'minecraft:the_end',
            timelines: ['#minecraft:in_end', 'minecraft:custom'],
            skybox: 'end'
        });
        expect(end.defaultClock).toBe('minecraft:the_end');
        expect(end.timelines).toEqual(['#minecraft:in_end', 'minecraft:custom']);
        expect(end.skybox).toBe('end');
    });

    it('names the path of a missing required field', () => {
        const { infiniburn: _, ...withoutInfiniburn } = MINIMAL_OVERWORLD;
        expect(() => parseDimensionType(withoutInfiniburn, 'data/x/dimension_type/y.json')).toThrow(
            'data/x/dimension_type/y.json.infiniburn: expected a string'
        );
    });

    it('rejects vertical bounds Java rejects', () => {
        expect(() => parseDimensionType({ ...MINIMAL_OVERWORLD, min_y: -60 })).toThrow(
            'min_y has to be a multiple of 16'
        );
        expect(() => parseDimensionType({ ...MINIMAL_OVERWORLD, height: 4080 })).toThrow('height has to be between');
        expect(() => parseDimensionType({ ...MINIMAL_OVERWORLD, min_y: 2016, height: 32 })).toThrow(
            'min_y + height has to be at most 2032'
        );
        expect(() => parseDimensionType({ ...MINIMAL_OVERWORLD, logical_height: 400 })).toThrow(
            'logical_height has to be between 0 and 384'
        );
    });

    it('rejects a skybox or cardinal light it does not know', () => {
        expect(() => parseDimensionType({ ...MINIMAL_OVERWORLD, skybox: 'nether' }, 'p')).toThrow(
            'p.skybox: expected one of "overworld", "none", "end", got "nether"'
        );
        expect(() => parseDimensionType({ ...MINIMAL_OVERWORLD, cardinal_light: 'end' }, 'p')).toThrow(
            'p.cardinal_light'
        );
    });
});

const vanilla = findVanillaDatapack();

describe.skipIf(!vanilla)('the real vanilla dimension types', { tags: ['real-data'] }, () => {
    if (!vanilla) return;

    it('parses the four 26.3 types with the heights and scales from the research table', () => {
        const ids = vanilla.listData('dimension_type');
        expect(ids).toEqual(['overworld', 'overworld_caves', 'the_end', 'the_nether']);
        const types = new Map(
            ids.map((id) => [id, parseDimensionType(vanilla.readData(`dimension_type/${id}.json`), id)])
        );

        expect(types.get('overworld')).toMatchObject({
            minY: -64,
            height: 384,
            logicalHeight: 384,
            coordinateScale: 1,
            hasSkylight: true,
            hasCeiling: false,
            hasFixedTime: false,
            skybox: 'overworld',
            cardinalLight: 'default',
            defaultClock: 'minecraft:overworld',
            ambientLight: 0
        });
        expect(types.get('overworld_caves')).toMatchObject({ minY: -64, height: 384, hasCeiling: true });
        expect(types.get('the_nether')).toMatchObject({
            minY: 0,
            height: 256,
            logicalHeight: 128,
            coordinateScale: 8,
            hasSkylight: false,
            hasCeiling: true,
            hasFixedTime: true,
            skybox: 'none',
            cardinalLight: 'nether',
            ambientLight: 0.1
        });
        expect(types.get('the_end')).toMatchObject({
            minY: 0,
            height: 256,
            logicalHeight: 256,
            coordinateScale: 1,
            hasEnderDragonFight: true,
            hasFixedTime: true,
            skybox: 'end',
            defaultClock: 'minecraft:the_end',
            ambientLight: 0.25
        });
        expect(types.get('overworld')?.attributes.get('minecraft:visual/cloud_height')).toBe(192.33);
        expect(types.get('the_nether')?.attributes.get('minecraft:gameplay/piglins_zombify')).toBe(false);
    });
});
