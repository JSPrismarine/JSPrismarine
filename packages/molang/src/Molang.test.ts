import { describe, expect, expectTypeOf, it } from 'vitest';
import { Molang } from './Molang';
import type { VanillaQueryName } from './queries';
import { VANILLA_QUERIES } from './queries';
import type { MolangScope, MolangValue } from './scope';

const run = (source: string, scope: MolangScope = {}, molang = new Molang()): MolangValue =>
    molang.compile(source).evaluate(scope);

describe('Molang', () => {
    describe('language semantics', () => {
        it('evaluates arithmetic, truthiness and comparisons as floats', () => {
            expect(run('1 + 2 * 3')).toBe(7);
            expect(run('!0.5')).toBe(0);
            expect(run('2 > 1 && 1 >= 1')).toBe(1);
            expect(run('0 || 0')).toBe(0);
        });

        it('returns 0 for division by zero', () => {
            expect(run('5 / 0')).toBe(0);
        });

        it('divides by the absolute value of a dynamic negative divisor before 1.19.60', () => {
            const molang = new Molang();
            const scope: MolangScope = { variables: new Map([['d', -2]]) };
            expect(molang.compile('8 / v.d', { minEngineVersion: [1, 19, 0] }).evaluate(scope)).toBe(4);
            expect(molang.compile('8 / v.d', { minEngineVersion: [1, 19, 60] }).evaluate(scope)).toBe(-4);
            expect(molang.compile('8 / -2', { minEngineVersion: [1, 19, 0] }).evaluate({})).toBe(-4);
        });

        it('compares strings with == and != only', () => {
            expect(run("'east' == 'east'")).toBe(1);
            expect(run("'east' != 'west'")).toBe(1);
            expect(run("'east' == 1")).toBe(0);
        });

        it('evaluates a complex expression to 0 unless a return runs', () => {
            expect(run('v.x = 1;')).toBe(0);
            expect(run('v.x = 1; return v.x;')).toBe(1);
            // The engine quirk bridge-core records: `return 1` without a semicolon is simple
            // parsing-wise but the return still ends the expression with its value.
            expect(run('return 1;')).toBe(1);
        });

        it('runs loops with break, continue and the 1024 cap', () => {
            expect(run('v.x = 0; loop(10, { v.x = v.x + 1; (v.x > 5) ? break; }); return v.x;')).toBe(6);
            expect(run('v.x = 2; loop(10, { return 1; }); return v.x;')).toBe(1);
            expect(run('v.x = 0; loop(100000, { v.x = v.x + 1; }); return v.x;')).toBe(1024);
        });

        it('stores struct members through variable paths', () => {
            expect(run('v.location.x = 3; return v.location.x;')).toBe(3);
        });

        it('keeps temp storage for one evaluation only', () => {
            const molang = new Molang();
            const scope: MolangScope = {};
            expect(molang.compile('t.x = 5; return t.x;').evaluate(scope)).toBe(5);
            expect(molang.compile('t.x').evaluate(scope)).toBe(0);
        });

        it('falls back through ?? only when the name is missing', () => {
            expect(run('v.missing ?? 7')).toBe(7);
            expect(run('v.x = 0; return v.x ?? 7;')).toBe(0);
        });

        it('short-circuits the arrow operator on a missing reference', () => {
            expect(run('context.other->query.max_durability')).toBe(0);
            const other: MolangScope = { item: { maxDurability: () => 250 } };
            const scope: MolangScope = { context: new Map([['other', { kind: 'scope', scope: other }]]) };
            expect(run('context.other->query.max_durability', scope)).toBe(250);
        });
    });

    describe('unknown identifiers', () => {
        it('reports an unknown query at compile time and evaluates it as 0', () => {
            const molang = new Molang();
            const compiled = molang.compile('query.not_a_thing + 3');
            expect(compiled.diagnostics).toEqual([
                { code: 'unknown-query', message: 'query.not_a_thing is not a registered query' }
            ]);
            expect(compiled.evaluate({})).toBe(3);
        });

        it('reports an unknown math function and evaluates it as 0', () => {
            const compiled = new Molang().compile('math.not_a_thing(1) + 2');
            expect(compiled.diagnostics.map((d) => d.code)).toEqual(['unknown-math-function']);
            expect(compiled.evaluate({})).toBe(2);
        });

        it('reads an undefined variable as 0 at run time', () => {
            expect(run('variable.never_set + 1')).toBe(1);
        });

        it('turns a syntax error into a diagnostic and a constant 0', () => {
            const compiled = new Molang().compile('1 + (2 3)');
            expect(compiled.diagnostics.map((d) => d.code)).toEqual(['syntax-error']);
            expect(compiled.evaluate({})).toBe(0);
        });
    });

    describe('compilation cache', () => {
        it('compiles once per (source, version) pair', () => {
            const molang = new Molang();
            const first = molang.compile('1 && 2 || 0', { minEngineVersion: [1, 21, 0] });
            expect(molang.compile('1 && 2 || 0', { minEngineVersion: [1, 21, 0] })).toBe(first);
            expect(molang.compile('1 && 2 || 0', { minEngineVersion: [1, 17, 0] })).not.toBe(first);
            expect(molang.compile('1 && 2 || 0')).not.toBe(first);
        });
    });

    describe('query registry', () => {
        it('registers the 21 vanilla server-side queries', () => {
            expect(Object.keys(VANILLA_QUERIES)).toHaveLength(21);
            expectTypeOf<VanillaQueryName>().toExtend<string>();
            // @ts-expect-error not a vanilla server-side query
            const clientOnly: VanillaQueryName = 'cape_flap_amount';
            void clientOnly;
        });

        it('declares the context each query needs', () => {
            expect(VANILLA_QUERIES.block_state.context).toBe('block');
            expect(VANILLA_QUERIES.heightmap.context).toBe('placement');
            expect(VANILLA_QUERIES.max_durability.context).toBe('item');
            expect(VANILLA_QUERIES.is_baby.context).toBe('entity');
            expect(VANILLA_QUERIES.any_tag.context).toBe('tags');
        });

        it('lets a caller register additional queries', () => {
            const molang = new Molang();
            molang.queries.register('day', { context: 'world', evaluate: (scope) => scope.world?.day?.() ?? 0 });
            expect(molang.compile('query.day').evaluate({ world: { day: () => 12 } })).toBe(12);
        });
    });
});
