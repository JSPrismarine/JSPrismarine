import { parseFilter } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

import type { FilterContext, FilterEntityView, FilterItemView } from './filterContext';
import { IMPLEMENTED_FILTER_TESTS, evaluateFilter, hasFilterTest, parseEntityFilter } from './filters';

/**
 * The 107 tests the generated `Entities.html` of bedrock-samples v1.26.50.4
 * lists under Filters. The docs repository's `FilterList.md` counts 108; the
 * extra name is not in the generated list and no vanilla file uses it.
 */
const DOCUMENTED_TESTS: readonly string[] = [
    'actor_has_item_with_enchantment_in_slot',
    'actor_health',
    'all_slots_empty',
    'any_slot_empty',
    'bool_property',
    'clock_time',
    'distance_to_nearest_player',
    'enum_property',
    'float_property',
    'has_ability',
    'has_biome_tag',
    'has_component',
    'has_container_open',
    'has_damage',
    'has_damaged_equipment',
    'has_equipment',
    'has_equipment_tag',
    'has_item_with_component',
    'has_mob_effect',
    'has_nametag',
    'has_property',
    'has_ranged_weapon',
    'has_same_equipment_in_slot_as',
    'has_silk_touch',
    'has_tag',
    'has_target',
    'has_trade_supply',
    'home_distance',
    'hourly_clock_time',
    'in_block',
    'in_caravan',
    'in_clouds',
    'in_contact_with_water',
    'in_lava',
    'in_nether',
    'in_overworld',
    'in_water',
    'in_water_or_rain',
    'inactivity_timer',
    'int_property',
    'is_altitude',
    'is_avoiding_mobs',
    'is_baby',
    'is_biome',
    'is_block',
    'is_bound_to_creaking_heart',
    'is_brightness',
    'is_climbing',
    'is_color',
    'is_controlling_passenger_family',
    'is_daytime',
    'is_difficulty',
    'is_family',
    'is_game_rule',
    'is_humid',
    'is_immobile',
    'is_in_same_vehicle',
    'is_in_village',
    'is_leashed',
    'is_leashed_to',
    'is_mark_variant',
    'is_missing_health',
    'is_moving',
    'is_navigating',
    'is_owner',
    'is_panicking',
    'is_persistent',
    'is_raider',
    'is_riding',
    'is_riding_self',
    'is_sitting',
    'is_skin_id',
    'is_sleeping',
    'is_sneak_held',
    'is_sneaking',
    'is_snow_covered',
    'is_sprinting',
    'is_tamed',
    'is_target',
    'is_temperature_type',
    'is_temperature_value',
    'is_underground',
    'is_underwater',
    'is_variant',
    'is_vehicle_family',
    'is_visible',
    'is_waterlogged',
    'is_weather',
    'light_level',
    'moon_intensity',
    'moon_phase',
    'on_fire',
    'on_ground',
    'on_hot_block',
    'on_ladder',
    'owner_distance',
    'random_chance',
    'redstone_strength_at_position',
    'rider_count',
    'surface_mob',
    'taking_fire_damage',
    'target_distance',
    'trusts',
    'was_last_hurt_by',
    'weather',
    'weather_at_position',
    'y_rotation'
];

const evaluate = (filter: unknown, context: FilterContext): boolean => evaluateFilter(parseFilter(filter), context);

const item = (identifier: string, extra: Partial<FilterItemView> = {}): FilterItemView => ({
    identifier: () => identifier,
    ...extra
});

describe('the documented test list', () => {
    it('implements every test the generated documentation lists', () => {
        const missing = DOCUMENTED_TESTS.filter((name) => !hasFilterTest(name));

        expect(missing).toEqual([]);
        expect(DOCUMENTED_TESTS).toHaveLength(107);
    });

    it('implements nothing the documentation does not list', () => {
        expect(IMPLEMENTED_FILTER_TESTS.filter((name) => !DOCUMENTED_TESTS.includes(name))).toEqual([]);
    });
});

describe('evaluateFilter', () => {
    const zombie: FilterEntityView = {
        names: (name) => (name === 'is_family' ? ['zombie', 'undead', 'monster', 'mob'] : undefined),
        flag: (name) => (name === 'in_water' ? true : name === 'is_baby' ? false : undefined),
        measure: (name) => (name === 'actor_health' ? 12 : undefined),
        hasComponent: (name) => name === 'minecraft:is_baby',
        property: (name) => (name === 'minecraft:state' ? 'hostile' : undefined)
    };
    const context: FilterContext = { self: zombie, other: { names: () => ['player'] } };

    it('reads the default subject and the default operator', () => {
        expect(evaluate({ test: 'is_family', value: 'undead' }, context)).toBe(true);
        expect(evaluate({ test: 'is_family', value: 'player' }, context)).toBe(false);
    });

    it('reads the named subject', () => {
        expect(evaluate({ test: 'is_family', subject: 'other', value: 'player' }, context)).toBe(true);
    });

    it('reads the integer subject the 1.26 serializer writes', () => {
        expect(evaluate({ test: 'is_family', subject: 1, value: 'player' }, context)).toBe(true);
    });

    it('reads the integer operator the 1.26 serializer writes', () => {
        expect(evaluate({ test: 'is_family', subject: 1, operator: 1, value: 'zombie' }, context)).toBe(true);
        expect(evaluate({ test: 'is_family', subject: 1, operator: 0, value: 'zombie' }, context)).toBe(false);
    });

    it('reads every operator alias', () => {
        for (const operator of ['==', '=', 'equals']) {
            expect(evaluate({ test: 'actor_health', operator, value: 12 }, context)).toBe(true);
        }
        for (const operator of ['!=', '<>', 'not']) {
            expect(evaluate({ test: 'actor_health', operator, value: 12 }, context)).toBe(false);
        }
        expect(evaluate({ test: 'actor_health', operator: '>', value: 11 }, context)).toBe(true);
        expect(evaluate({ test: 'actor_health', operator: '>=', value: 12 }, context)).toBe(true);
        expect(evaluate({ test: 'actor_health', operator: '<', value: 12 }, context)).toBe(false);
        expect(evaluate({ test: 'actor_health', operator: '<=', value: 12 }, context)).toBe(true);
    });

    it('compares a boolean test against true when the file writes no value', () => {
        expect(evaluate({ test: 'in_water' }, context)).toBe(true);
        expect(evaluate({ test: 'in_water', operator: '!=' }, context)).toBe(false);
        expect(evaluate({ test: 'is_baby' }, context)).toBe(false);
    });

    it('evaluates all_of, any_of and none_of with the schema aliases', () => {
        const all = { all_of: [{ test: 'in_water' }, { test: 'is_family', value: 'undead' }] };
        expect(evaluate(all, context)).toBe(true);
        expect(evaluate({ AND: all.all_of }, context)).toBe(true);
        expect(evaluate({ any_of: [{ test: 'is_baby' }, { test: 'in_water' }] }, context)).toBe(true);
        expect(evaluate({ OR: [{ test: 'is_baby' }] }, context)).toBe(false);
        expect(evaluate({ none_of: [{ test: 'is_baby' }] }, context)).toBe(true);
    });

    it('reads the two shapes vanilla writes outside the published grammar', () => {
        // The villager's become_zombie sensor writes two combinators side by
        // side; the skeleton's lightning_immune group writes the legacy
        // shorthand. Both parse in @jsprismarine/packs.
        const sideBySide = { all_of: [{ test: 'in_water' }], any_of: [{ test: 'is_baby' }, { test: 'in_water' }] };
        expect(evaluateFilter(parseEntityFilter(sideBySide), context)).toBe(true);
        expect(evaluateFilter(parseEntityFilter({ other_with_families: 'player' }), context)).toBe(true);
        expect(evaluateFilter(parseEntityFilter({ other_with_families: ['zombie', 'player'] }), context)).toBe(true);
    });

    it('reads a bare array as an implicit all_of', () => {
        expect(evaluate([{ test: 'in_water' }, { test: 'is_family', value: 'mob' }], context)).toBe(true);
    });

    it('nests groups four deep, which is the deepest vanilla writes', () => {
        const nested = {
            all_of: [{ any_of: [{ none_of: [{ all_of: [{ test: 'is_baby' }] }] }] }]
        };

        expect(evaluate(nested, context)).toBe(true);
    });

    it('evaluates to false and reports when the context has no such subject', () => {
        const unanswered: string[] = [];
        evaluateFilter(parseFilter({ test: 'is_family', subject: 'target', value: 'player' }), context, {
            onUnanswered: (test, reason) => unanswered.push(`${test.test}:${reason}`)
        });

        expect(unanswered).toEqual(['is_family:missingSubject']);
    });

    it('evaluates to false and reports when no view answers the fact', () => {
        const unanswered: string[] = [];
        evaluateFilter(parseFilter({ test: 'is_sitting' }), context, {
            onUnanswered: (test, reason) => unanswered.push(`${test.test}:${reason}`)
        });

        expect(unanswered).toEqual(['is_sitting:missingFact']);
    });

    describe('per test type', () => {
        it('reads a property through its domain', () => {
            expect(evaluate({ test: 'enum_property', domain: 'minecraft:state', value: 'hostile' }, context)).toBe(
                true
            );
            expect(
                evaluate(
                    { test: 'enum_property', domain: 'minecraft:state', operator: 'not', value: 'hostile' },
                    context
                )
            ).toBe(false);
        });

        it("reads the cow's bucket interaction: a family and an equipment slot", () => {
            const player: FilterEntityView = {
                names: (name) => (name === 'is_family' ? ['player'] : undefined),
                equipment: (slot) => (slot === 'hand' ? item('minecraft:bucket', { data: () => 0 }) : undefined)
            };
            const filter = {
                all_of: [
                    { test: 'is_family', subject: 'other', value: 'player' },
                    { test: 'has_equipment', subject: 'other', domain: 'hand', value: 'bucket:0' }
                ]
            };

            expect(evaluate(filter, { self: {}, other: player })).toBe(true);
            expect(
                evaluate(
                    { ...filter, all_of: [filter.all_of[1]!] },
                    { self: {}, other: { ...player, equipment: () => undefined } }
                )
            ).toBe(false);
        });

        it('reads has_component, which the vindicator writes with operator 1', () => {
            expect(evaluate({ test: 'has_component', operator: 1, value: 'minecraft:is_baby' }, context)).toBe(false);
            expect(evaluate({ test: 'has_component', operator: 1, value: 'minecraft:angry' }, context)).toBe(true);
        });

        it('reads world time, difficulty, weather and game rules', () => {
            const world: FilterContext = {
                self: {},
                world: {
                    timeOfDay: () => 13500,
                    difficulty: () => 'hard',
                    weather: () => 'thunder',
                    gameRule: (name) => (name === 'tntexplodes' ? true : undefined),
                    dimension: () => 'minecraft:nether'
                }
            };

            expect(evaluate({ test: 'is_daytime' }, world)).toBe(false);
            expect(evaluate({ test: 'hourly_clock_time', operator: '>=', value: 13000 }, world)).toBe(true);
            expect(evaluate({ test: 'is_difficulty', value: 'hard' }, world)).toBe(true);
            expect(evaluate({ test: 'weather', value: 'thunder' }, world)).toBe(true);
            expect(evaluate({ test: 'is_game_rule', domain: 'tntexplodes' }, world)).toBe(true);
            expect(evaluate({ test: 'in_nether' }, world)).toBe(true);
            expect(evaluate({ test: 'in_overworld' }, world)).toBe(false);
        });

        it('reads a block through the block view', () => {
            const block: FilterContext = {
                self: {},
                block: { identifier: () => 'minecraft:water', waterlogged: () => true }
            };

            expect(evaluate({ test: 'is_block', subject: 'block', value: 'water' }, block)).toBe(true);
            expect(evaluate({ test: 'is_waterlogged', subject: 'block' }, block)).toBe(true);
        });

        it('reads the relations that compare two subjects', () => {
            const owner: FilterEntityView = { id: () => 'owner' };
            const pet: FilterContext = {
                self: { id: () => 'pet', owner: () => owner },
                other: owner,
                player: { id: () => 'stranger' }
            };

            expect(evaluate({ test: 'is_owner', subject: 'other' }, pet)).toBe(true);
            expect(evaluate({ test: 'is_owner', subject: 'player' }, pet)).toBe(false);
        });

        it('draws random_chance against the context random source', () => {
            const rolls = [0.0, 0.9];
            let index = 0;
            const chance: FilterContext = { self: {}, random: { next: () => rolls[index++] ?? 0 } };

            expect(evaluate({ test: 'random_chance', value: 10 }, chance)).toBe(true);
            expect(evaluate({ test: 'random_chance', value: 10 }, chance)).toBe(false);
        });

        it('reads a slot fill for all_slots_empty and any_slot_empty', () => {
            const carrier: FilterContext = {
                self: {},
                other: { slotFill: () => ({ filled: 1, capacity: 4 }) }
            };

            expect(evaluate({ test: 'all_slots_empty', subject: 'other', domain: 'inventory' }, carrier)).toBe(false);
            expect(evaluate({ test: 'any_slot_empty', subject: 'other', domain: 'inventory' }, carrier)).toBe(true);
        });

        it('reads an enchantment in a slot', () => {
            const armed: FilterContext = {
                self: {},
                other: {
                    equipment: () =>
                        item('minecraft:diamond_sword', { enchantment: (name) => (name === 'sharpness' ? 3 : 0) })
                }
            };

            expect(
                evaluate(
                    {
                        test: 'actor_has_item_with_enchantment_in_slot',
                        subject: 'other',
                        domain: 'hand',
                        value: 'sharpness'
                    },
                    armed
                )
            ).toBe(true);
        });
    });
});
