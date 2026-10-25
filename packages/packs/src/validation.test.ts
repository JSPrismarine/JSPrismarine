import { describe, expect, it } from 'vitest';

import { structuralValidator } from './validation';

const entity = (components: Record<string, unknown>) => ({
    format_version: '1.26.0',
    'minecraft:entity': {
        description: { identifier: 'fixture:thing' },
        components
    }
});

describe('structuralValidator', () => {
    it('accepts a well-formed entity', () => {
        const findings = structuralValidator({
            registry: 'entities',
            path: 'entities/thing.json',
            data: entity({ 'minecraft:health': { value: 10 } })
        });
        expect(findings).toEqual([]);
    });

    it('reports a missing format_version as an error', () => {
        const data = entity({});
        const { format_version: _dropped, ...withoutVersion } = data;
        const findings = structuralValidator({
            registry: 'entities',
            path: 'entities/thing.json',
            data: withoutVersion
        });
        expect(findings).toContainEqual(expect.objectContaining({ code: 'definition.missing-format-version' }));
    });

    it('reports unknown root keys as warnings, so the file still loads', () => {
        const findings = structuralValidator({
            registry: 'entities',
            path: 'entities/thing.json',
            data: { ...entity({}), extra: 1 }
        });
        expect(findings).toEqual([expect.objectContaining({ severity: 'warning', code: 'definition.unknown-key' })]);
    });

    it('reads a null section as an absent one, the way 23 vanilla entities write events', () => {
        // area_effect_cloud.json and 22 more ship `"events": null`.
        const findings = structuralValidator({
            registry: 'entities',
            path: 'entities/thing.json',
            data: { ...entity({}), 'minecraft:entity': { ...entity({})['minecraft:entity'], events: null } }
        });
        expect(findings).toEqual([]);
    });

    it('still reports a section written as something other than an object', () => {
        const findings = structuralValidator({
            registry: 'entities',
            path: 'entities/thing.json',
            data: { ...entity({}), 'minecraft:entity': { ...entity({})['minecraft:entity'], events: 3 } }
        });
        expect(findings).toContainEqual(expect.objectContaining({ severity: 'error', code: 'definition.missing-key' }));
    });

    it('parses every nested filters key, accepting the integer encoding', () => {
        const findings = structuralValidator({
            registry: 'entities',
            path: 'entities/thing.json',
            data: entity({
                'minecraft:despawn': {
                    filters: { AND: [{ test: 'is_family', subject: 1, operator: 0, value: 'mob' }] }
                }
            })
        });
        expect(findings).toEqual([]);
    });

    it('accepts the filter shapes the vanilla entity files write', () => {
        const findings = structuralValidator({
            registry: 'entities',
            path: 'entities/thing.json',
            data: entity({
                // tnt_minecart and mooshroom: two combinators in one group map.
                'minecraft:interact': {
                    interactions: [
                        {
                            on_interact: {
                                filters: {
                                    all_of: [{ test: 'is_family', subject: 'other', value: 'player' }],
                                    any_of: [{ test: 'has_equipment', domain: 'hand', value: 'flint_and_steel' }]
                                }
                            }
                        }
                    ]
                },
                // skeleton: the legacy shorthand that names the test in the key.
                'minecraft:damage_sensor': {
                    triggers: { deals_damage: 'no', on_damage: { filters: { other_with_families: 'lightning' } } }
                },
                // witch: a combinator over one test, and piglin: an integer domain.
                'minecraft:behavior.drink_potion': {
                    potions: [
                        { filters: { none_of: { test: 'has_mob_effect', value: 'water_breathing' } } },
                        { filters: { AND: [{ test: 'has_equipment', subject: 1, operator: 1, domain: 4 }] } }
                    ]
                }
            })
        });
        expect(findings).toEqual([]);
    });

    it('reports a malformed filter as an error', () => {
        const findings = structuralValidator({
            registry: 'entities',
            path: 'entities/thing.json',
            data: entity({ 'minecraft:despawn': { filters: { test: 'is_family', operator: '~' } } })
        });
        expect(findings).toContainEqual(
            expect.objectContaining({ severity: 'error', code: 'definition.invalid-filter' })
        );
    });

    it('requires tiers on a trade table and nothing else', () => {
        expect(structuralValidator({ registry: 'tradeTables', path: 'trading/a.json', data: { tiers: [] } })).toEqual(
            []
        );
        expect(structuralValidator({ registry: 'tradeTables', path: 'trading/a.json', data: {} })).toContainEqual(
            expect.objectContaining({ severity: 'error', code: 'definition.missing-key' })
        );
    });

    it('rejects a non-object file', () => {
        expect(structuralValidator({ registry: 'lootTables', path: 'loot_tables/a.json', data: [1] })).toContainEqual(
            expect.objectContaining({ code: 'definition.not-an-object' })
        );
    });
});
