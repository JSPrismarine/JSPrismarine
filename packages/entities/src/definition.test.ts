import { describe, expect, it } from 'vitest';

import { parseEntityDefinition } from './definition';

const parse = (data: unknown) => parseEntityDefinition(data, { pack: 'vanilla', path: 'entities/test.json' });

const minimal = (overrides: Record<string, unknown> = {}) => ({
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'minecraft:test', is_spawnable: true, is_summonable: true },
        ...overrides
    }
});

describe('parseEntityDefinition', () => {
    it('reads the description, components, component groups and events', () => {
        const { definition, diagnostics } = parse(
            minimal({
                components: { 'minecraft:health': { value: 20, max: 20 } },
                component_groups: {
                    'minecraft:zombie_baby': { 'minecraft:is_baby': {}, 'minecraft:scale': { value: 0.5 } }
                },
                events: { 'minecraft:entity_spawned': { add: { component_groups: ['minecraft:zombie_baby'] } } }
            })
        );

        expect(diagnostics).toEqual([]);
        expect(definition?.identifier).toBe('minecraft:test');
        expect(definition?.formatVersion).toEqual([1, 26, 50]);
        expect(definition?.description.isSpawnable).toBe(true);
        expect(definition?.description.isSummonable).toBe(true);
        expect(definition?.components.get('minecraft:health')).toEqual({ value: 20, max: 20 });
        expect([...(definition?.componentGroups.get('minecraft:zombie_baby')?.keys() ?? [])]).toEqual([
            'minecraft:is_baby',
            'minecraft:scale'
        ]);
        expect(definition?.events.get('minecraft:entity_spawned')?.add).toEqual(['minecraft:zombie_baby']);
    });

    it('reads the null events the vanilla pack writes for an entity with none', () => {
        const { definition, diagnostics } = parse(minimal({ events: null }));

        expect(diagnostics).toEqual([]);
        expect(definition?.events.size).toBe(0);
    });

    it('still reports events that are neither an object nor null', () => {
        const { diagnostics } = parse(minimal({ events: ['minecraft:entity_spawned'] }));

        expect(diagnostics).toEqual([
            {
                severity: 'warning',
                code: 'entity.invalid',
                pack: 'vanilla',
                path: 'entities/test.json',
                message: 'minecraft:test: events must be an object'
            }
        ]);
    });

    it('loads a file with an unknown top-level key and reports it', () => {
        const { definition, diagnostics } = parse(minimal({ hypothetical_future_key: {} }));

        expect(definition?.identifier).toBe('minecraft:test');
        expect(diagnostics).toEqual([
            {
                severity: 'warning',
                code: 'entity.unknownKey',
                pack: 'vanilla',
                path: 'entities/test.json',
                message: 'unknown entity key hypothetical_future_key'
            }
        ]);
    });

    it('loads a file with an unknown description key and reports it', () => {
        const { definition, diagnostics } = parse({
            format_version: '1.26.50',
            'minecraft:entity': { description: { identifier: 'minecraft:test', future_flag: true } }
        });

        expect(definition?.identifier).toBe('minecraft:test');
        expect(diagnostics.map((entry) => entry.code)).toEqual(['entity.unknownKey']);
    });

    it('refuses a file with no entity body', () => {
        const { definition, diagnostics } = parse({ format_version: '1.26.50' });

        expect(definition).toBeUndefined();
        expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'entity.invalid' });
    });

    it('refuses a description with no identifier', () => {
        const { definition, diagnostics } = parse({ 'minecraft:entity': { description: {} } });

        expect(definition).toBeUndefined();
        expect(diagnostics[0]?.message).toContain('identifier');
    });

    it('reads the runtime identifier, spawn category and experimental flag', () => {
        const { definition } = parse({
            format_version: '1.26.50',
            'minecraft:entity': {
                description: {
                    identifier: 'minecraft:test',
                    spawn_category: 'monster',
                    is_experimental: true,
                    runtime_identifier: 'minecraft:horse'
                }
            }
        });

        expect(definition?.description.spawnCategory).toBe('monster');
        expect(definition?.description.isExperimental).toBe(true);
        expect(definition?.description.runtimeIdentifier).toBe('minecraft:horse');
    });

    it('reads animations and the scripts that run them', () => {
        const { definition } = parse({
            format_version: '1.26.50',
            'minecraft:entity': {
                description: {
                    identifier: 'minecraft:test',
                    animations: { attack: 'controller.animation.test.attack' },
                    scripts: { animate: ['attack', { attack: 'query.is_baby' }] }
                }
            }
        });

        expect(definition?.description.animations.get('attack')).toBe('controller.animation.test.attack');
        expect(definition?.description.scripts.animate).toEqual(['attack', { attack: 'query.is_baby' }]);
    });

    describe('format_version dispatch', () => {
        it('reports root-level event filters below 1.19.20', () => {
            const { diagnostics } = parse({
                format_version: '1.19.10',
                'minecraft:entity': {
                    description: { identifier: 'minecraft:test' },
                    events: { 'minecraft:gate': { filters: { test: 'is_baby' }, add: { component_groups: ['g'] } } }
                }
            });

            expect(diagnostics.map((entry) => entry.code)).toContain('entity.versionGate');
        });

        it('accepts root-level event filters at 1.19.20', () => {
            const { diagnostics } = parse({
                format_version: '1.19.20',
                'minecraft:entity': {
                    description: { identifier: 'minecraft:test' },
                    events: { 'minecraft:gate': { filters: { test: 'is_baby' }, add: { component_groups: ['g'] } } }
                }
            });

            expect(diagnostics).toEqual([]);
        });

        it('reports play_sound below 1.21.50 and queue_command below 1.20.60', () => {
            const { diagnostics } = parse({
                format_version: '1.20.0',
                'minecraft:entity': {
                    description: { identifier: 'minecraft:test' },
                    events: {
                        'minecraft:noise': { play_sound: { sound: 'mob.cow.say' }, queue_command: { command: 'say' } }
                    }
                }
            });

            const messages = diagnostics.map((entry) => entry.message).join('\n');
            expect(messages).toContain('play_sound');
            expect(messages).toContain('queue_command');
        });

        it('reports entity_version and upgrades below 1.26.20', () => {
            const { diagnostics } = parse({
                format_version: '1.26.10',
                'minecraft:entity': {
                    description: { identifier: 'minecraft:test', entity_version: '1.0.0' },
                    upgrades: {}
                }
            });

            expect(diagnostics.filter((entry) => entry.code === 'entity.versionGate')).toHaveLength(2);
        });
    });
});
