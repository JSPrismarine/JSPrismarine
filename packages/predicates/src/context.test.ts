import { describe, expect, it } from 'vitest';

import { CONTEXT_PARAMETER_SETS, PredicateContext } from './context';
import { DiagnosticCollector } from './diagnostics';

describe('CONTEXT_PARAMETER_SETS', () => {
    it('declares the 31 context key sets 26.3 registers', () => {
        expect(Object.keys(CONTEXT_PARAMETER_SETS)).toHaveLength(31);
    });

    it('matches the block set Java builds', () => {
        expect(CONTEXT_PARAMETER_SETS.block).toEqual({
            required: ['block_state', 'origin', 'tool'],
            optional: ['this_entity', 'block_entity', 'explosion_radius']
        });
    });
});

describe('PredicateContext.parameter', () => {
    it('returns a parameter the set declares and the caller supplied', () => {
        const context = new PredicateContext({
            parameterSet: 'block',
            parameters: { explosion_radius: 3 }
        });

        expect(context.parameter('explosion_radius', 'survives_explosion')).toBe(3);
        expect(context.diagnostics.entries).toEqual([]);
    });

    it('reports an error when the set does not declare the parameter at all', () => {
        const context = new PredicateContext({ parameterSet: 'chest' });

        expect(context.parameter('damage_source', 'damage_source_properties')).toBeUndefined();
        expect(context.diagnostics.entries).toEqual([
            {
                severity: 'error',
                path: 'damage_source_properties',
                message: 'the chest loot context does not provide damage_source'
            }
        ]);
    });

    it('reports an error when a required parameter is declared but missing', () => {
        const context = new PredicateContext({ parameterSet: 'block' });

        expect(context.parameter('block_state', 'match_block')).toBeUndefined();
        expect(context.diagnostics.entries).toEqual([
            {
                severity: 'error',
                path: 'match_block',
                message: 'required loot context parameter block_state is missing'
            }
        ]);
    });

    it('stays quiet when an optional parameter is absent', () => {
        const context = new PredicateContext({ parameterSet: 'block' });

        expect(context.parameter('explosion_radius', 'survives_explosion')).toBeUndefined();
        expect(context.diagnostics.entries).toEqual([]);
    });
});

describe('PredicateContext.levelWith', () => {
    it('returns the level when the host implemented the member', () => {
        const context = new PredicateContext({ level: { isRaining: () => true } });

        expect(context.levelWith('isRaining', 'weather_check')?.isRaining()).toBe(true);
    });

    it('reports an error when the host left the member out', () => {
        const diagnostics = new DiagnosticCollector();
        const context = new PredicateContext({ level: {}, diagnostics });

        expect(context.levelWith('isRaining', 'weather_check')).toBeUndefined();
        expect(diagnostics.entries).toEqual([
            { severity: 'error', path: 'weather_check', message: 'the level view does not implement isRaining' }
        ]);
    });

    it('reports an error when there is no level at all', () => {
        const context = new PredicateContext({});

        expect(context.levelWith('clockTicks', 'time_check')).toBeUndefined();
        expect(context.diagnostics.entries).toEqual([
            { severity: 'error', path: 'time_check', message: 'no level view is bound to this context' }
        ]);
    });
});
