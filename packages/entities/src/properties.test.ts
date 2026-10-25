import { describe, expect, it } from 'vitest';

import { DiagnosticCollector } from './diagnostics';
import type { PropertyDefinition } from './properties';
import { PropertyValues, coerce, parseProperties } from './properties';

const parse = (properties: unknown) => {
    const collector = new DiagnosticCollector();
    const parsed = parseProperties(properties, 'minecraft:test', 'vanilla', collector);
    return { parsed, diagnostics: collector.diagnostics };
};

describe('parseProperties', () => {
    it('reads the four types with their ranges and value lists', () => {
        const { parsed, diagnostics } = parse({
            'minecraft:creaking_swaying_ticks': { client_sync: true, default: 0, range: [0, 6], type: 'int' },
            'minecraft:creaking_state': {
                client_sync: true,
                default: 'neutral',
                type: 'enum',
                values: ['neutral', 'crumbling']
            },
            'minecraft:is_waxed': { default: false, type: 'bool' },
            'minecraft:speed': { default: 0.5, type: 'float', range: [0, 1] }
        });

        expect(diagnostics).toEqual([]);
        expect(parsed.get('minecraft:creaking_swaying_ticks')).toMatchObject({
            type: 'int',
            range: [0, 6],
            clientSync: true,
            default: { kind: 'literal', value: 0 }
        });
        expect(parsed.get('minecraft:creaking_state')?.values).toEqual(['neutral', 'crumbling']);
        expect(parsed.get('minecraft:is_waxed')?.clientSync).toBe(false);
        expect(parsed.get('minecraft:speed')?.type).toBe('float');
    });

    it("reads the bee's Molang default as an expression rather than a literal", () => {
        const { parsed } = parse({
            'minecraft:has_nectar': {
                type: 'bool',
                client_sync: true,
                default: "query.had_component_group('has_nectar')"
            }
        });

        expect(parsed.get('minecraft:has_nectar')?.default).toEqual({
            kind: 'molang',
            source: "query.had_component_group('has_nectar')"
        });
    });

    it('keeps an enum default as a literal member name', () => {
        const { parsed } = parse({
            'minecraft:variant': { type: 'enum', default: 'coral', values: ['default', 'coral'] }
        });

        expect(parsed.get('minecraft:variant')?.default).toEqual({ kind: 'literal', value: 'coral' });
    });

    it('drops a property with no known type and keeps the rest', () => {
        const { parsed, diagnostics } = parse({
            'minecraft:bad': { type: 'vector', default: 0 },
            'minecraft:good': { type: 'bool', default: true }
        });

        expect([...parsed.keys()]).toEqual(['minecraft:good']);
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.code).toBe('property.invalid');
    });

    it('reports an enum member that does not start with a letter', () => {
        const { diagnostics } = parse({
            'minecraft:bad': { type: 'enum', default: '1st', values: ['1st'] }
        });

        expect(diagnostics.map((entry) => entry.message).join(' ')).toContain('must start with a letter');
    });

    it('reports more than 32 properties', () => {
        const properties = Object.fromEntries(
            Array.from({ length: 33 }, (_, index) => [`test:p${index}`, { type: 'bool', default: false }])
        );

        const { parsed, diagnostics } = parse(properties);

        expect(parsed.size).toBe(33);
        expect(diagnostics.some((entry) => entry.message.includes('over the documented 32'))).toBe(true);
    });
});

describe('coerce', () => {
    const int: PropertyDefinition = {
        name: 'test:int',
        type: 'int',
        default: { kind: 'literal', value: 0 },
        clientSync: false,
        range: [0, 6]
    };

    it('clamps an int into its range and rounds a fraction', () => {
        expect(coerce(int, 9)).toBe(6);
        expect(coerce(int, -4)).toBe(0);
        expect(coerce(int, 2.6)).toBe(3);
    });

    it('leaves a value alone when the property declares no range', () => {
        expect(coerce({ ...int, range: undefined }, 900)).toBe(900);
    });

    it('rejects an enum member the property does not declare', () => {
        const state: PropertyDefinition = {
            name: 'test:state',
            type: 'enum',
            default: { kind: 'literal', value: 'a' },
            clientSync: false,
            values: ['a', 'b']
        };

        expect(coerce(state, 'b')).toBe('b');
        expect(coerce(state, 'c')).toBeUndefined();
    });
});

describe('PropertyValues', () => {
    const { parsed } = parse({
        'minecraft:ticks': { type: 'int', default: 2, range: [0, 6] },
        'minecraft:state': { type: 'enum', default: 'neutral', values: ['neutral', 'crumbling'] },
        'minecraft:has_nectar': { type: 'bool', default: "query.had_component_group('has_nectar')" }
    });

    it('starts every property at its declared default', () => {
        const values = new PropertyValues(parsed);

        expect(values.get('minecraft:ticks')).toBe(2);
        expect(values.get('minecraft:state')).toBe('neutral');
    });

    it('resolves a Molang default through the supplied evaluator', () => {
        const values = new PropertyValues(parsed, (definition) =>
            definition.name === 'minecraft:has_nectar' ? true : undefined
        );

        expect(values.get('minecraft:has_nectar')).toBe(true);
    });

    it('falls back to the type zero value when a Molang default does not resolve', () => {
        const values = new PropertyValues(parsed);

        expect(values.get('minecraft:has_nectar')).toBe(false);
    });

    it('clamps a write and reports the stored value', () => {
        const values = new PropertyValues(parsed);

        expect(values.set('minecraft:ticks', 11)).toBe(6);
        expect(values.get('minecraft:ticks')).toBe(6);
    });

    it('writes nothing for an undeclared property or an out-of-domain enum member', () => {
        const values = new PropertyValues(parsed);

        expect(values.set('minecraft:absent', 1)).toBeUndefined();
        expect(values.set('minecraft:state', 'melted')).toBeUndefined();
        expect(values.get('minecraft:state')).toBe('neutral');
    });
});
