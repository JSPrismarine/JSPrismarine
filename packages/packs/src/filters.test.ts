import { describe, expect, it } from 'vitest';

import { FilterParseError, parseFilter } from './filters';

describe('parseFilter', () => {
    it('parses the string form with defaults filled in', () => {
        expect(parseFilter({ test: 'is_family', value: 'zombie' })).toEqual({
            kind: 'test',
            test: 'is_family',
            subject: 'self',
            operator: '==',
            value: 'zombie'
        });
    });

    it('parses explicit string subject, operator and domain', () => {
        expect(
            parseFilter({ test: 'has_equipment', subject: 'other', operator: 'not', domain: 'hand', value: 'shield' })
        ).toEqual({
            kind: 'test',
            test: 'has_equipment',
            subject: 'other',
            operator: '!=',
            domain: 'hand',
            value: 'shield'
        });
    });

    it('parses the integer subject and operator encoding the 1.26 serializer writes', () => {
        // The vindicator writes operator 1 where the text form is != and subject 1 for other.
        expect(parseFilter({ test: 'has_component', subject: 1, operator: 1, value: 'minecraft:is_baby' })).toEqual({
            kind: 'test',
            test: 'has_component',
            subject: 'other',
            operator: '!=',
            value: 'minecraft:is_baby'
        });
        expect(parseFilter({ test: 'is_family', subject: 0, operator: 0, value: 'mob' })).toMatchObject({
            subject: 'self',
            operator: '=='
        });
    });

    it('normalizes operator aliases', () => {
        for (const [alias, canonical] of [
            ['=', '=='],
            ['equals', '=='],
            ['<>', '!='],
            ['not', '!='],
            ['>=', '>=']
        ]) {
            expect(parseFilter({ test: 'is_variant', operator: alias, value: 1 })).toMatchObject({
                operator: canonical
            });
        }
    });

    it('parses groups and the AND, OR, NOT, all and any aliases', () => {
        const nested = parseFilter({
            AND: [{ test: 'is_family', value: 'mob' }, { OR: [{ test: 'is_baby' }, { NOT: [{ test: 'is_sheared' }] }] }]
        });
        expect(nested).toMatchObject({
            kind: 'group',
            combinator: 'all_of',
            filters: [
                { kind: 'test', test: 'is_family' },
                {
                    kind: 'group',
                    combinator: 'any_of',
                    filters: [{ test: 'is_baby' }, { combinator: 'none_of', filters: [{ test: 'is_sheared' }] }]
                }
            ]
        });
        expect(parseFilter({ all: [{ test: 'is_baby' }] })).toMatchObject({ combinator: 'all_of' });
        expect(parseFilter({ any: [{ test: 'is_baby' }] })).toMatchObject({ combinator: 'any_of' });
    });

    it('treats a bare array as an implicit all_of', () => {
        expect(parseFilter([{ test: 'is_baby' }])).toMatchObject({ kind: 'group', combinator: 'all_of' });
    });

    it('ands the clauses of a group map that writes several combinators', () => {
        // The tnt_minecart's interact filter: a player holding either igniter.
        expect(
            parseFilter({
                all_of: [{ test: 'is_family', subject: 'other', value: 'player' }],
                any_of: [
                    { test: 'has_equipment', subject: 'other', domain: 'hand', value: 'fireball:0' },
                    { test: 'has_equipment', subject: 'other', domain: 'hand', value: 'flint_and_steel' }
                ]
            })
        ).toMatchObject({
            kind: 'group',
            combinator: 'all_of',
            filters: [
                { kind: 'group', combinator: 'all_of', filters: [{ test: 'is_family' }] },
                {
                    kind: 'group',
                    combinator: 'any_of',
                    filters: [{ value: 'fireball:0' }, { value: 'flint_and_steel' }]
                }
            ]
        });
    });

    it('lets a combinator hold one test instead of an array', () => {
        // The witch's drink_potion filters write `none_of` over a single test.
        expect(parseFilter({ none_of: { test: 'has_mob_effect', value: 'water_breathing' } })).toMatchObject({
            kind: 'group',
            combinator: 'none_of',
            filters: [{ kind: 'test', test: 'has_mob_effect', value: 'water_breathing' }]
        });
    });

    it('keeps the integer domain the 1.26 serializer writes', () => {
        // The piglin's gold-armor filters write the equipment slot as an int.
        expect(
            parseFilter({ test: 'has_equipment', subject: 1, operator: 1, domain: 4, value: 'minecraft:golden_helmet' })
        ).toMatchObject({ domain: 4, subject: 'other', operator: '!=' });
    });

    it('expands the legacy shorthand where the key names the test', () => {
        // The skeleton's `minecraft:lightning_immune` damage sensor.
        expect(parseFilter({ other_with_families: 'lightning' })).toEqual({
            kind: 'test',
            test: 'is_family',
            subject: 'other',
            operator: '==',
            value: 'lightning'
        });
        expect(parseFilter({ other_with_families: ['lightning', 'mob'] })).toMatchObject({
            kind: 'group',
            combinator: 'any_of',
            filters: [{ value: 'lightning' }, { value: 'mob' }]
        });
    });

    it('rejects unknown subjects, operators and malformed groups', () => {
        expect(() => parseFilter({ test: 'is_baby', subject: 99 })).toThrow(FilterParseError);
        expect(() => parseFilter({ test: 'is_baby', subject: 'enemy' })).toThrow(FilterParseError);
        expect(() => parseFilter({ test: 'is_baby', operator: 7 })).toThrow(FilterParseError);
        expect(() => parseFilter({ test: 'is_baby', operator: '~' })).toThrow(FilterParseError);
        expect(() => parseFilter({ all_of: [], extra: 1 })).toThrow(/extra/);
        expect(() => parseFilter({ all_of: {} })).toThrow(FilterParseError);
        expect(() => parseFilter({ value: 1 })).toThrow(FilterParseError);
        expect(() => parseFilter({ unknown_shorthand: 'x', also: 'y' })).toThrow(FilterParseError);
        expect(() => parseFilter('is_baby')).toThrow(FilterParseError);
    });
});
