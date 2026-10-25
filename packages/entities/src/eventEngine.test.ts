import { describe, expect, it } from 'vitest';

import type { EventNode } from './events';
import { parseEventNode } from './events';
import type { EventRuntime, SpawnCause } from './eventEngine';
import { determineEvent, spawnEventFor, splitSpawnReference } from './eventEngine';
import type { FilterContext, RandomSource } from './filterContext';
import { DiagnosticCollector } from './diagnostics';
import { PropertyValues, parseProperties } from './properties';

/** A random source that hands out a fixed list and then repeats the last value. */
const scripted = (...values: readonly number[]): RandomSource => {
    let index = 0;
    return { next: () => values[Math.min(index++, values.length - 1)] ?? 0 };
};

const properties = (declared: unknown = {}): PropertyValues =>
    new PropertyValues(parseProperties(declared, 'minecraft:test', 'vanilla', new DiagnosticCollector()));

interface RuntimeOptions {
    events: Record<string, unknown>;
    context?: FilterContext;
    random?: RandomSource;
    values?: PropertyValues;
    evaluate?: (source: string) => number | string | boolean | undefined;
}

const runtime = (options: RuntimeOptions): EventRuntime => {
    const parsed = new Map<string, EventNode>();
    for (const [name, body] of Object.entries(options.events)) {
        parsed.set(
            name,
            parseEventNode(body, (_code, message) => {
                throw new Error(message);
            })
        );
    }
    return {
        event: (name) => parsed.get(name),
        context: options.context ?? { self: {} },
        properties: options.values ?? properties(),
        random: options.random ?? scripted(0),
        evaluate: options.evaluate
    };
};

describe('spawnEventFor', () => {
    it('maps each cause to its built-in event', () => {
        const causes: readonly [SpawnCause, string][] = [
            ['spawned', 'minecraft:entity_spawned'],
            ['born', 'minecraft:entity_born'],
            ['transformed', 'minecraft:entity_transformed'],
            ['primed', 'minecraft:on_prime']
        ];

        for (const [cause, event] of causes) expect(spawnEventFor(cause)).toBe(event);
    });

    it('lets a named event replace the built-in one rather than adding to it', () => {
        expect(spawnEventFor('spawned', 'minecraft:as_adult')).toBe('minecraft:as_adult');
    });
});

describe('splitSpawnReference', () => {
    it('splits the identifier and the event', () => {
        expect(splitSpawnReference('minecraft:drowned<minecraft:as_adult>')).toEqual({
            identifier: 'minecraft:drowned',
            event: 'minecraft:as_adult'
        });
    });

    it('leaves a bare identifier alone', () => {
        expect(splitSpawnReference('minecraft:cow')).toEqual({ identifier: 'minecraft:cow' });
    });
});

describe('determineEvent', () => {
    it('collects the component groups an event adds and removes', () => {
        const effects = determineEvent(
            runtime({
                events: {
                    'minecraft:become_drowned': {
                        add: { component_groups: ['minecraft:drowned'] },
                        remove: { component_groups: ['minecraft:zombie_adult'] }
                    }
                }
            }),
            'minecraft:become_drowned'
        );

        expect(effects.addGroups).toEqual(['minecraft:drowned']);
        expect(effects.removeGroups).toEqual(['minecraft:zombie_adult']);
    });

    it('determines nothing for an event the entity does not declare', () => {
        const effects = determineEvent(runtime({ events: {} }), 'minecraft:absent');

        expect(effects).toMatchObject({ event: 'minecraft:absent', addGroups: [], removeGroups: [] });
    });

    it('runs a sequence in order, including a nested sequence', () => {
        const effects = determineEvent(
            runtime({
                events: {
                    'minecraft:spawn': {
                        sequence: [
                            { add: { component_groups: ['a'] } },
                            { sequence: [{ add: { component_groups: ['b'] } }, { add: { component_groups: ['c'] } }] },
                            { add: { component_groups: ['d'] } }
                        ]
                    }
                }
            }),
            'minecraft:spawn'
        );

        expect(effects.addGroups).toEqual(['a', 'b', 'c', 'd']);
    });

    it('draws one randomize branch against the weights', () => {
        const zombie = {
            'minecraft:entity_spawned': {
                randomize: [
                    { weight: 9500, add: { component_groups: ['adult'] } },
                    { weight: 425, add: { component_groups: ['baby'] } },
                    { weight: 75, add: { component_groups: ['jockey'] } }
                ]
            }
        };

        // 0.0 lands in the first 9500 of 10000, 0.96 in the next 425, 0.999 in the last 75.
        expect(
            determineEvent(runtime({ events: zombie, random: scripted(0) }), 'minecraft:entity_spawned').addGroups
        ).toEqual(['adult']);
        expect(
            determineEvent(runtime({ events: zombie, random: scripted(0.96) }), 'minecraft:entity_spawned').addGroups
        ).toEqual(['baby']);
        expect(
            determineEvent(runtime({ events: zombie, random: scripted(0.999) }), 'minecraft:entity_spawned').addGroups
        ).toEqual(['jockey']);
    });

    it('runs a randomize branch nested inside a sequence', () => {
        const effects = determineEvent(
            runtime({
                events: {
                    'minecraft:entity_spawned': {
                        sequence: [
                            { randomize: [{ weight: 9500, add: { component_groups: ['adult'] } }, { weight: 500 }] },
                            {
                                randomize: [
                                    { weight: 10, add: { component_groups: ['can_break_doors'] } },
                                    { weight: 90 }
                                ]
                            }
                        ]
                    }
                },
                random: scripted(0, 0)
            }),
            'minecraft:entity_spawned'
        );

        expect(effects.addGroups).toEqual(['adult', 'can_break_doors']);
    });

    it('skips a node whose filters do not pass', () => {
        const context: FilterContext = { self: { flag: (name) => (name === 'in_water' ? false : undefined) } };
        const effects = determineEvent(
            runtime({
                events: {
                    'minecraft:check': {
                        sequence: [
                            { filters: { test: 'in_water' }, add: { component_groups: ['wet'] } },
                            {
                                filters: { test: 'in_water', operator: '!=', value: true },
                                add: { component_groups: ['dry'] }
                            }
                        ]
                    }
                },
                context
            }),
            'minecraft:check'
        );

        expect(effects.addGroups).toEqual(['dry']);
    });

    it('takes the first passing branch of first_valid and no other', () => {
        const context: FilterContext = {
            self: { names: (name) => (name === 'has_biome_tag' ? ['cold'] : undefined) }
        };
        const effects = determineEvent(
            runtime({
                events: {
                    'minecraft:climate': {
                        first_valid: [
                            {
                                filters: { test: 'has_biome_tag', value: 'warm' },
                                set_property: { 'test:climate': 'warm' }
                            },
                            {
                                filters: { test: 'has_biome_tag', value: 'cold' },
                                set_property: { 'test:climate': 'cold' }
                            },
                            { set_property: { 'test:climate': 'temperate' } }
                        ]
                    }
                },
                context,
                values: properties({
                    'test:climate': { type: 'enum', default: 'temperate', values: ['temperate', 'warm', 'cold'] }
                })
            }),
            'minecraft:climate'
        );

        expect(effects.propertyWrites).toEqual([{ name: 'test:climate', value: 'cold' }]);
    });

    it('resolves a bare enum member and leaves a real expression to Molang', () => {
        const effects = determineEvent(
            runtime({
                events: {
                    'minecraft:write': {
                        set_property: {
                            'test:state': 'crumbling',
                            'test:ticks': "math.clamp(query.property('test:ticks') + 1, 0, 6)",
                            'test:flag': true
                        }
                    }
                },
                values: properties({
                    'test:state': { type: 'enum', default: 'neutral', values: ['neutral', 'crumbling'] },
                    'test:ticks': { type: 'int', default: 0, range: [0, 6] },
                    'test:flag': { type: 'bool', default: false }
                }),
                evaluate: (source) => (source.startsWith('math.clamp') ? 3 : undefined)
            }),
            'minecraft:write'
        );

        expect(effects.propertyWrites).toEqual([
            { name: 'test:state', value: 'crumbling' },
            { name: 'test:ticks', value: 3 },
            { name: 'test:flag', value: true }
        ]);
    });

    it('reports a set_property value nothing can resolve', () => {
        const effects = determineEvent(
            runtime({
                events: { 'minecraft:write': { set_property: { 'test:ticks': 'query.nonsense' } } },
                values: properties({ 'test:ticks': { type: 'int', default: 0, range: [0, 6] } })
            }),
            'minecraft:write'
        );

        expect(effects.propertyWrites).toEqual([]);
        expect(effects.unhandled[0]).toContain('query.nonsense');
    });

    it('folds a trigger on self into the same result', () => {
        const effects = determineEvent(
            runtime({
                events: {
                    'minecraft:start': { trigger: 'minecraft:finish', add: { component_groups: ['a'] } },
                    'minecraft:finish': { add: { component_groups: ['b'] } }
                }
            }),
            'minecraft:start'
        );

        expect(effects.addGroups).toEqual(['a', 'b']);
        expect(effects.outgoingTriggers).toEqual([]);
    });

    it('leaves a trigger on another target for the caller to route', () => {
        const effects = determineEvent(
            runtime({
                events: { 'minecraft:anger': { trigger: { event: 'minecraft:on_anger', target: 'other' } } }
            }),
            'minecraft:anger'
        );

        expect(effects.outgoingTriggers).toEqual([{ event: 'minecraft:on_anger', target: 'other' }]);
    });

    it('stops a trigger that would loop and reports it', () => {
        const effects = determineEvent(
            runtime({
                events: {
                    'minecraft:a': { trigger: 'minecraft:b' },
                    'minecraft:b': { trigger: 'minecraft:a' }
                }
            }),
            'minecraft:a'
        );

        expect(effects.unhandled[0]).toContain('would loop');
    });

    it('collects an action with its body and its parsed form', () => {
        const effects = determineEvent(
            runtime({ events: { 'minecraft:noise': { play_sound: { sound: 'mob.cow.say' } } } }),
            'minecraft:noise'
        );

        expect(effects.actions).toEqual([
            {
                name: 'play_sound',
                value: { sound: 'mob.cow.say' },
                parsed: { name: 'play_sound', sound: 'mob.cow.say' }
            }
        ]);
    });

    it('leaves an action it does not carry out unparsed', () => {
        const effects = determineEvent(
            runtime({ events: { 'minecraft:odd': { spin_around: { times: 3 } } } }),
            'minecraft:odd'
        );

        expect(effects.actions).toEqual([{ name: 'spin_around', value: { times: 3 }, parsed: undefined }]);
    });
});
