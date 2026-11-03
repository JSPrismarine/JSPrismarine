import { describe, expect, it } from 'vitest';

import { typeFamily } from './components/vanilla';
import { EntityTypes } from './entityTypes';

describe('resolved entity types', () => {
    it('keeps shared component methods callable after adding entity fields', () => {
        const types = new EntityTypes();
        const diagnostics = types.load([
            {
                pack: 'test',
                path: 'entities/creature.json',
                data: {
                    format_version: '1.26.50',
                    'minecraft:entity': {
                        description: { identifier: 'test:creature' },
                        components: { 'minecraft:type_family': { family: ['test_creature'] } }
                    }
                }
            }
        ]);
        const type = types.registry.get('test:creature')!;

        expect(diagnostics).toEqual([]);
        expect(type.params(typeFamily)?.family).toEqual(['test_creature']);
        expect(type.hasComponent('minecraft:type_family')).toBe(true);
    });
});
