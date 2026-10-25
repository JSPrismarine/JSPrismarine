import { describe, expect, it } from 'vitest';

import { BLOCK_SCHEMAS, parseBlockDefinition, schemaFor } from './definition';

const source = { pack: 'test', path: 'blocks/test.block.json' };

const file = (formatVersion: string, block: Record<string, unknown>) =>
    parseBlockDefinition({ format_version: formatVersion, 'minecraft:block': block }, source);

describe('format_version dispatch', () => {
    it('takes the newest schema at or below the file version', () => {
        expect(schemaFor([1, 26, 50]).version).toBe('1.26.20');
        expect(schemaFor([1, 19, 40]).version).toBe('1.19.40');
        expect(schemaFor([1, 20, 0]).version).toBe('1.19.40');
        expect(schemaFor([1, 16, 100]).version).toBe('1.16.100');
    });

    it('reads a file older than every known schema with the oldest one', () => {
        expect(schemaFor([1, 10, 0]).version).toBe('1.16.100');
    });

    it('rejects a file with no readable format_version', () => {
        const result = parseBlockDefinition(
            { 'minecraft:block': { description: { identifier: 'test:thing' } } },
            source
        );

        expect(result.document).toBeUndefined();
        expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['block.format-version']);
    });

    it('takes the renamed property components at 1.19.40 and the legacy ones before it', () => {
        expect(BLOCK_SCHEMAS['1.16.100'].withoutComponents).toContain('minecraft:destructible_by_mining');
        expect(BLOCK_SCHEMAS['1.19.40'].withoutComponents).toContain('minecraft:destroy_time');
    });

    it('drops a renamed component an older file could not have had', () => {
        const result = file('1.16.100', {
            description: { identifier: 'test:thing' },
            components: { 'minecraft:destroy_time': 1.5, 'minecraft:destructible_by_mining': { seconds_to_destroy: 2 } }
        });

        expect(result.document?.components.map((entry) => entry.name)).toEqual(['minecraft:destroy_time']);
        expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['block.component-version']);
    });

    it('drops an event component 1.26.20 forbids at the top level', () => {
        const result = file('1.26.50', {
            description: { identifier: 'test:thing' },
            components: { 'minecraft:random_ticking': {}, 'minecraft:loot': 'loot_tables/blocks/thing.json' }
        });

        expect(result.document?.components.map((entry) => entry.name)).toEqual(['minecraft:loot']);
        expect(result.diagnostics[0]?.code).toBe('block.component-forbidden');
    });

    it('drops a component only permutations forbid, from a permutation alone', () => {
        const result = file('1.26.50', {
            description: { identifier: 'test:thing' },
            components: { 'minecraft:support': { shape: 'stair' } },
            permutations: [
                { condition: "query.block_state('age') == 1", components: { 'minecraft:support': { shape: 'fence' } } }
            ]
        });

        expect(result.document?.components.map((entry) => entry.name)).toEqual(['minecraft:support']);
        expect(result.document?.permutations[0]?.components).toEqual([]);
        expect(result.diagnostics[0]?.code).toBe('block.component-forbidden');
    });
});

describe('the block description', () => {
    it('reads the identifier, menu category and the undocumented vanilla data', () => {
        const result = file('1.26.50', {
            description: {
                identifier: 'minecraft:black_concrete_stairs',
                internal_vanilla_data: {
                    block_id: 1469,
                    material: 'solid',
                    block_archetype: { stair_block: { base_block: 'minecraft:black_concrete' } }
                },
                menu_category: { category: 'construction', group: 'minecraft:itemGroup.name.stairs' }
            }
        });

        const description = result.document?.description;
        expect(description?.identifier).toBe('minecraft:black_concrete_stairs');
        expect(description?.menuCategory).toEqual({
            category: 'construction',
            group: 'minecraft:itemGroup.name.stairs',
            hiddenInCommands: false
        });
        expect(description?.internalVanillaData?.blockId).toBe(1469);
        expect(description?.internalVanillaData?.blockArchetype).toBe('stair_block');
        expect(description?.internalVanillaData?.archetypeParameters).toEqual({
            base_block: 'minecraft:black_concrete'
        });
    });

    it('reads states written as an array and as a min/max range', () => {
        const result = file('1.26.50', {
            description: {
                identifier: 'test:thing',
                states: { 'test:color': ['red', 'green'], 'test:age': { values: { min: 0, max: 3 } } }
            }
        });

        expect(result.document?.description.states).toEqual([
            { name: 'test:color', type: 'string', values: ['red', 'green'], defaultValue: 'red' },
            { name: 'test:age', type: 'int', values: [0, 1, 2, 3], defaultValue: 0 }
        ]);
        expect(result.document?.stateModel.names()).toEqual(['test:age', 'test:color']);
        expect(result.document?.stateModel.size).toBe(8);
    });

    it('reports a state with no readable values and keeps the rest', () => {
        const result = file('1.26.50', {
            description: { identifier: 'test:thing', states: { 'test:bad': {}, 'test:ok': [1, 2] } }
        });

        expect(result.document?.stateModel.names()).toEqual(['test:ok']);
        expect(result.diagnostics[0]?.code).toBe('block.state-invalid');
    });

    it('reads a trait and the states it enables', () => {
        const result = file('1.26.50', {
            description: {
                identifier: 'test:thing',
                traits: {
                    'minecraft:placement_direction': {
                        enabled_states: ['minecraft:cardinal_direction'],
                        y_rotation_offset: 180
                    }
                }
            }
        });

        expect(result.document?.description.traits).toEqual([
            {
                name: 'minecraft:placement_direction',
                enabledStates: ['minecraft:cardinal_direction'],
                parameters: { y_rotation_offset: 180 }
            }
        ]);
    });

    it('reports traits a file too old to have them declares', () => {
        const result = file('1.19.40', {
            description: {
                identifier: 'test:thing',
                traits: { 'minecraft:placement_direction': { enabled_states: [] } }
            }
        });

        expect(result.document?.description.traits).toEqual([]);
        expect(result.diagnostics[0]?.code).toBe('block.traits-unsupported');
    });
});

describe('a malformed file', () => {
    it('reports a file with no minecraft:block object', () => {
        const result = parseBlockDefinition({ format_version: '1.26.50' }, source);

        expect(result.document).toBeUndefined();
        expect(result.diagnostics[0]?.code).toBe('block.malformed');
    });

    it('reports a permutation with no condition and keeps the others', () => {
        const result = file('1.26.50', {
            description: { identifier: 'test:thing' },
            permutations: [{ components: {} }, { condition: '1', components: { 'minecraft:loot': 'a.json' } }]
        });

        expect(result.document?.permutations).toHaveLength(1);
        expect(result.diagnostics[0]?.code).toBe('block.permutation-invalid');
    });
});
