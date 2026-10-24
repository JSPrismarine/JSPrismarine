import { describe, expect, it } from 'vitest';

import { PredicateContext } from './context';
import type { PredicateContextOptions } from './context';
import { parseFloatProvider, parseIntProvider, parseLevelBasedValue } from './providers';
import { scriptedRandom } from './random';

const draw = (value: unknown, kind: 'int' | 'float' = 'int', options: PredicateContextOptions = {}): number => {
    const parse = kind === 'int' ? parseIntProvider : parseFloatProvider;
    const { value: provider, diagnostics } = parse(value);
    expect(diagnostics).toEqual([]);
    return provider(new PredicateContext(options));
};

describe('int providers', () => {
    it('reads a bare number as a constant', () => {
        expect(draw(20)).toBe(20);
    });

    it('reads an inline constant object', () => {
        expect(draw({ type: 'minecraft:constant', value: 7 })).toBe(7);
    });

    it('draws uniform from the injected random', () => {
        expect(draw({ type: 'minecraft:uniform', min: 2, max: 5 }, 'int', { random: scriptedRandom([0.75]) })).toBe(5);
    });

    it('counts binomial successes against the injected random', () => {
        expect(
            draw({ type: 'minecraft:binomial', n: 4, p: 0.5 }, 'int', {
                random: scriptedRandom([0.1, 0.9, 0.2, 0.8])
            })
        ).toBe(2);
    });

    it('folds the aggregate types over their inputs', () => {
        expect(draw({ type: 'minecraft:add', inputs: [1, 2, 3] })).toBe(6);
        expect(draw({ type: 'minecraft:mul', inputs: [2, 3, 4] })).toBe(24);
        expect(draw({ type: 'minecraft:min', inputs: [5, 2, 9] })).toBe(2);
        expect(draw({ type: 'minecraft:max', inputs: [5, 2, 9] })).toBe(9);
        expect(draw({ type: 'minecraft:avg', inputs: [1, 2, 4] })).toBe(2);
    });

    it('applies the binary types in left-right order', () => {
        expect(draw({ type: 'minecraft:sub', left: 10, right: 4 })).toBe(6);
        expect(draw({ type: 'minecraft:div', left: 7, right: 2 })).toBe(3);
        expect(draw({ type: 'minecraft:div', left: -7, right: 2 })).toBe(-3);
        expect(draw({ type: 'minecraft:floor_div', left: -7, right: 2 })).toBe(-4);
        expect(draw({ type: 'minecraft:mod', left: -7, right: 3 })).toBe(-1);
        expect(draw({ type: 'minecraft:floor_mod', left: -7, right: 3 })).toBe(2);
    });

    it('applies the unary types', () => {
        expect(draw({ type: 'minecraft:abs', input: -6 })).toBe(6);
        expect(draw({ type: 'minecraft:negate', input: 6 })).toBe(-6);
        expect(draw({ type: 'minecraft:from_float', input: 2.9 })).toBe(2);
    });

    it('raises to a power', () => {
        expect(draw({ type: 'minecraft:pow', base: 2, exponent: 10 })).toBe(1024);
    });

    it('picks a weighted list entry from the injected random', () => {
        const distribution = {
            type: 'minecraft:weighted_list',
            distribution: [
                { data: 1, weight: 30 },
                { data: 0, weight: 70 }
            ]
        };

        expect(draw(distribution, 'int', { random: scriptedRandom([0.1]) })).toBe(1);
        expect(draw(distribution, 'int', { random: scriptedRandom([0.9]) })).toBe(0);
    });

    it('dispatches on the first case whose condition passes', () => {
        const dispatcher = {
            type: 'minecraft:number_dispatcher',
            cases: [{ condition: { type: 'minecraft:killed_by_player' }, value: 1 }],
            default: 9
        };

        expect(draw(dispatcher, 'int', { parameterSet: 'entity', parameters: { last_damage_player: undefined } })).toBe(
            9
        );
        expect(
            draw(dispatcher, 'int', {
                parameterSet: 'entity',
                parameters: { last_damage_player: { type: 'minecraft:player' } }
            })
        ).toBe(1);
    });

    it('picks a branch of a conditional provider', () => {
        const conditional = {
            type: 'minecraft:conditional',
            condition: { type: 'minecraft:killed_by_player' },
            on_true: 1,
            on_false: 2
        };

        expect(draw(conditional, 'int', { parameterSet: 'entity' })).toBe(2);
    });

    it('reads a score through the level view and falls back when there is none', () => {
        const score = {
            type: 'minecraft:score',
            target: { type: 'minecraft:fixed', name: 'holder' },
            score: 'kills',
            fallback: -1
        };

        expect(draw(score, 'int', { level: { score: () => 12 } })).toBe(12);
        expect(draw(score, 'int', { level: { score: () => undefined } })).toBe(-1);
    });

    it('reads a stored number and falls back when the storage has none', () => {
        const storage = {
            type: 'minecraft:storage',
            storage: 'minecraft:counters',
            path: 'mined',
            fallback: 3
        };

        expect(draw(storage, 'int', { level: { storedNumber: () => 40 } })).toBe(40);
        expect(draw(storage, 'int', { level: { storedNumber: () => undefined } })).toBe(3);
    });
});

describe('float providers', () => {
    it('draws uniform from the injected random', () => {
        expect(draw({ type: 'minecraft:uniform', min: 0, max: 4 }, 'float', { random: scriptedRandom([0.25]) })).toBe(
            1
        );
    });

    it('applies the float-only unary types', () => {
        expect(draw({ type: 'minecraft:ceil', input: 1.2 }, 'float')).toBe(2);
        expect(draw({ type: 'minecraft:floor', input: 1.8 }, 'float')).toBe(1);
        expect(draw({ type: 'minecraft:round', input: 1.5 }, 'float')).toBe(2);
        expect(draw({ type: 'minecraft:truncate', input: -1.8 }, 'float')).toBe(-1);
        expect(draw({ type: 'minecraft:sqrt', input: 9 }, 'float')).toBe(3);
        expect(draw({ type: 'minecraft:sin', input: 0 }, 'float')).toBe(0);
        expect(draw({ type: 'minecraft:cos', input: 0 }, 'float')).toBe(1);
        expect(draw({ type: 'minecraft:from_int', input: 5 }, 'float')).toBe(5);
    });

    it('takes the euclidean length of its inputs', () => {
        expect(draw({ type: 'minecraft:length', inputs: [3, 4] }, 'float')).toBe(5);
    });

    it('keeps the fractional part where the int registry would truncate', () => {
        expect(draw({ type: 'minecraft:div', left: 7, right: 2 }, 'float')).toBe(3.5);
    });

    it('scales an enchantment level through a level based value', () => {
        const provider = {
            type: 'minecraft:enchantment_level',
            amount: { type: 'minecraft:linear', base: 1, per_level_above_first: 0.5 }
        };

        expect(draw(provider, 'float', { parameterSet: 'enchanted_item', parameters: { enchantment_level: 3 } })).toBe(
            2
        );
    });

    it('reads an environment attribute through the level view', () => {
        expect(
            draw({ type: 'minecraft:environment_attribute', attribute: 'minecraft:temperature' }, 'float', {
                level: { environmentAttribute: () => 0.8 }
            })
        ).toBe(0.8);
    });
});

describe('level based values', () => {
    const at = (value: unknown, level: number): number => {
        const { value: amount, diagnostics } = parseLevelBasedValue(value);
        expect(diagnostics).toEqual([]);
        return amount(level);
    };

    it('reads a bare number as a constant', () => {
        expect(at(2.5, 4)).toBe(2.5);
    });

    it('scales linearly above the first level', () => {
        expect(at({ type: 'minecraft:linear', base: 1, per_level_above_first: 0.5 }, 5)).toBe(3);
    });

    it('squares the level and adds a constant', () => {
        expect(at({ type: 'minecraft:levels_squared', added: 1 }, 3)).toBe(10);
    });

    it('clamps an inner value', () => {
        expect(
            at({ type: 'minecraft:clamped', value: { type: 'minecraft:levels_squared', added: 0 }, max: 4 }, 5)
        ).toBe(4);
    });

    it('divides one value by another', () => {
        expect(at({ type: 'minecraft:fraction', numerator: 10, denominator: 4 }, 1)).toBe(2.5);
    });

    it('raises one value to another', () => {
        expect(at({ type: 'minecraft:exponent', base: 2, power: 3 }, 1)).toBe(8);
    });

    it('looks the level up and falls back past the end of the table', () => {
        const lookup = { type: 'minecraft:lookup', values: [1, 2], fallback: 99 };

        expect(at(lookup, 2)).toBe(2);
        expect(at(lookup, 3)).toBe(99);
    });
});

describe('provider diagnostics', () => {
    it('reports an unknown type and evaluates to zero', () => {
        const { value, diagnostics } = parseIntProvider({ type: 'minecraft:nonsense' });

        expect(value(new PredicateContext())).toBe(0);
        expect(diagnostics).toEqual([
            { severity: 'error', path: '', message: 'unknown int provider type minecraft:nonsense' }
        ]);
    });

    it('reports a float-only type used in an int field', () => {
        const { diagnostics } = parseIntProvider({ type: 'minecraft:sqrt', input: 9 });

        expect(diagnostics).toEqual([
            { severity: 'error', path: '', message: 'unknown int provider type minecraft:sqrt' }
        ]);
    });
});
