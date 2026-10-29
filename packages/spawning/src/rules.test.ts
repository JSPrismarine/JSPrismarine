import type { Diagnostic } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';

import { SPAWN_RULE_COMPONENTS, parseSpawnRule } from './rules';

/** Wraps a rule body in the file envelope the pack ships. */
const file = (body: unknown, formatVersion = '1.8.0'): unknown => ({
    format_version: formatVersion,
    'minecraft:spawn_rules': body
});

const parse = (body: unknown, formatVersion?: string) => {
    const diagnostics: Diagnostic[] = [];
    const rule = parseSpawnRule(file(body, formatVersion), {
        pack: 'test',
        path: 'spawn_rules/test.json',
        report: (diagnostic) => diagnostics.push(diagnostic)
    });
    return { rule, diagnostics };
};

describe('the file envelope', () => {
    it('reads the identifier, the pool and the format version', () => {
        const { rule, diagnostics } = parse({
            description: { identifier: 'minecraft:cow', population_control: 'animal' },
            conditions: []
        });

        expect(rule?.identifier).toBe('minecraft:cow');
        expect(rule?.populationControl).toBe('animal');
        expect(rule?.formatVersion).toBe('1.8.0');
        expect(diagnostics).toHaveLength(0);
    });

    it('refuses a file without the spawn rule key', () => {
        const { rule, diagnostics } = parse(undefined);

        expect(rule).toBeUndefined();
        expect(diagnostics[0]?.code).toBe('spawnRule.notASpawnRule');
    });

    it('refuses a rule without an identifier', () => {
        const { rule, diagnostics } = parse({ description: { population_control: 'animal' } });

        expect(rule).toBeUndefined();
        expect(diagnostics[0]?.code).toBe('spawnRule.missingIdentifier');
    });

    it('keeps a rule whose pool is not one of the eight and reports it', () => {
        const { rule, diagnostics } = parse({ description: { identifier: 'a:b', population_control: 'bees' } });

        expect(rule?.populationControl).toBe('bees');
        expect(diagnostics[0]?.code).toBe('spawnRule.unknownPool');
    });

    it('accepts the two pools the documentation says the game files hold and vanilla never uses', () => {
        expect(parse({ description: { identifier: 'a:b', population_control: 'villager' } }).diagnostics).toHaveLength(
            0
        );
        expect(
            parse({ description: { identifier: 'a:b', population_control: 'water_ambient' } }).diagnostics
        ).toHaveLength(0);
    });

    it('accepts the four vanilla rules that carry no conditions', () => {
        const { rule, diagnostics } = parse({
            description: { identifier: 'minecraft:blaze', population_control: 'monster' }
        });

        expect(rule?.conditions).toEqual([]);
        expect(diagnostics).toHaveLength(0);
    });

    it('reports a component the grammar does not name', () => {
        const { rule, diagnostics } = parse({
            description: { identifier: 'a:b' },
            conditions: [{ 'minecraft:spawns_in_orbit': {} }]
        });

        expect(rule?.conditions).toHaveLength(1);
        expect(diagnostics[0]?.code).toBe('spawnRule.unknownComponent');
        expect(diagnostics[0]?.message).toContain('minecraft:spawns_in_orbit');
    });

    it('reports the schema components spawn rules can use', () => {
        expect(SPAWN_RULE_COMPONENTS.length).toBeGreaterThan(0);
        reportProgress(`Spawn rule grammar exposes ${SPAWN_RULE_COMPONENTS.length} components.`);
    });
});

describe('the condition components', () => {
    const condition = (body: Record<string, unknown>) => {
        const { rule, diagnostics } = parse({ description: { identifier: 'a:b' }, conditions: [body] });
        return { condition: rule?.conditions[0], diagnostics };
    };

    it('defaults the weight rarity to zero', () => {
        expect(condition({ 'minecraft:weight': { default: 6 } }).condition?.weight).toEqual({
            default: 6,
            rarity: 0
        });
    });

    it('defaults a condition without a weight to the schema default of one', () => {
        expect(condition({}).condition?.weight).toEqual({ default: 1, rarity: 0 });
    });

    it('parses a bare biome filter array as an implicit all_of', () => {
        const parsed = condition({ 'minecraft:biome_filter': [{ test: 'has_biome_tag', value: 'ocean' }] });

        expect(parsed.condition?.biomeFilter).toEqual({
            kind: 'group',
            combinator: 'all_of',
            filters: [{ kind: 'test', test: 'has_biome_tag', subject: 'self', operator: '==', value: 'ocean' }]
        });
    });

    it('parses the brightness filter with its schema defaults', () => {
        expect(condition({ 'minecraft:brightness_filter': {} }).condition?.brightness).toEqual({
            min: 0,
            max: 15,
            adjustForWeather: false
        });
    });

    it('parses the difficulty filter as the enum', () => {
        expect(
            condition({ 'minecraft:difficulty_filter': { min: 'easy', max: 'hard' } }).condition?.difficulty
        ).toEqual({ min: 'easy', max: 'hard' });
    });

    it('reports a difficulty name the enum does not hold', () => {
        const parsed = condition({ 'minecraft:difficulty_filter': { min: 'brutal' } });

        expect(parsed.diagnostics[0]?.code).toBe('spawnRule.badValue');
        expect(parsed.condition?.difficulty).toEqual({ min: 'peaceful', max: 'hard' });
    });

    it('reads a block filter written as one string, as a list and as named objects', () => {
        expect(condition({ 'minecraft:spawns_on_block_filter': 'minecraft:sand' }).condition?.blocks).toEqual([
            'minecraft:sand'
        ]);
        expect(
            condition({ 'minecraft:spawns_on_block_filter': ['minecraft:sand', { name: 'minecraft:ice' }] }).condition
                ?.blocks
        ).toEqual(['minecraft:sand', 'minecraft:ice']);
    });

    it('reads the herd written as one object and as a list of alternatives', () => {
        expect(condition({ 'minecraft:herd': { min_size: 2, max_size: 4 } }).condition?.herd).toEqual([
            { minSize: 2, maxSize: 4, initialEventCount: 0, eventSkipCount: 0 }
        ]);
        expect(
            condition({ 'minecraft:herd': [{ min_size: 3, max_size: 5, event: 'minecraft:make_white' }] }).condition
                ?.herd
        ).toEqual([{ minSize: 3, maxSize: 5, initialEventCount: 0, eventSkipCount: 0, event: 'minecraft:make_white' }]);
    });

    it('reads the permutations, keeping the entity type with its spawn event', () => {
        const parsed = condition({
            'minecraft:permute_type': [
                { weight: 95 },
                { weight: 5, entity_type: 'minecraft:zombie_villager_v2', min_guaranteed: 1 }
            ]
        });

        expect(parsed.condition?.permutations).toEqual([
            { weight: 95, minGuaranteed: 0 },
            { weight: 5, entityType: 'minecraft:zombie_villager_v2', minGuaranteed: 1 }
        ]);
    });

    it('reads `guaranteed_count`, the name the documentation gives `min_guaranteed`', () => {
        const parsed = condition({ 'minecraft:permute_type': [{ weight: 1, guaranteed_count: 2 }] });

        expect(parsed.condition?.permutations?.[0]?.minGuaranteed).toBe(2);
    });

    it('reads the placement, medium and bubble flags', () => {
        const parsed = condition({
            'minecraft:spawns_on_surface': {},
            'minecraft:spawns_underground': {},
            'minecraft:spawns_underwater': {},
            'minecraft:spawns_lava': {},
            'minecraft:disallow_spawns_in_bubble': {}
        }).condition;

        expect(parsed?.spawnsOnSurface).toBe(true);
        expect(parsed?.spawnsUnderground).toBe(true);
        expect(parsed?.spawnsUnderwater).toBe(true);
        expect(parsed?.spawnsLava).toBe(true);
        expect(parsed?.disallowSpawnsInBubble).toBe(true);
    });

    it('reads the height, distance, world age and density ranges with their defaults', () => {
        const parsed = condition({
            'minecraft:height_filter': { min: 0, max: 64 },
            'minecraft:distance_filter': {},
            'minecraft:world_age_filter': { min: 6000 },
            'minecraft:density_limit': { surface: 5 }
        }).condition;

        expect(parsed?.height).toEqual({ min: 0, max: 64 });
        expect(parsed?.distance).toEqual({ min: 24, max: 128 });
        expect(parsed?.worldAge).toEqual({ min: 6000, max: -1 });
        expect(parsed?.density).toEqual({ surface: 5, underground: -1 });
    });

    it('reads the delay filter, the mob event, the spawn event and the village filter', () => {
        const parsed = condition({
            'minecraft:delay_filter': {
                min: 600,
                max: 660,
                identifier: 'minecraft:pillager_patrol_easy',
                spawn_chance: 20
            },
            'minecraft:mob_event_filter': { event: 'minecraft:pillager_patrols_event' },
            'minecraft:spawn_event': { event: 'change_to_skeleton' },
            'minecraft:player_in_village_filter': { distance: 48, village_border_tolerance: 32 }
        }).condition;

        expect(parsed?.delay).toEqual({
            min: 600,
            max: 660,
            identifier: 'minecraft:pillager_patrol_easy',
            spawnChance: 20
        });
        expect(parsed?.mobEvent).toBe('minecraft:pillager_patrols_event');
        expect(parsed?.spawnEvent).toBe('change_to_skeleton');
        expect(parsed?.playerInVillage).toEqual({ distance: 48, villageBorderTolerance: 32 });
    });

    it('reads the three components the schema declares and vanilla never writes', () => {
        const parsed = condition({
            'minecraft:spawns_above_block_filter': { blocks: 'minecraft:water', distance: 3 },
            'minecraft:is_persistent': {},
            'minecraft:is_experimental': {}
        }).condition;

        expect(parsed?.aboveBlocks).toEqual({ blocks: ['minecraft:water'], distance: 3 });
        expect(parsed?.isPersistent).toBe(true);
        expect(parsed?.isExperimental).toBe(true);
    });
});
