import { describe, expect, it } from 'vitest';

import { createPackResolver, packJson } from './packs';

const table = { type: 'minecraft:chest', pools: [] };

describe('reading a pack registry entry', () => {
    it('unwraps the record the loader puts around a file', () => {
        expect(packJson({ identifier: 'minecraft:blocks/stone', pack: 'vanilla', path: 'p', data: table })).toBe(table);
    });

    it('takes a bare parsed file as it is', () => {
        expect(packJson(table)).toBe(table);
    });
});

describe('the pack reference resolver', () => {
    const definitions = {
        lootTablesJava: new Map<string, unknown>([['minecraft:chests/igloo', { data: table }]]),
        predicates: new Map<string, unknown>([
            ['minecraft:tool/can_shear', { data: { type: 'minecraft:survives_explosion' } }]
        ]),
        tags: new Map<string, unknown>([
            ['item/minecraft:planks', { data: { values: ['minecraft:oak_planks', 'birch_planks', '#minecraft:more'] } }]
        ])
    };

    it('routes each element registry to the registry the loader filled', () => {
        const resolver = createPackResolver(definitions);

        expect(resolver.element?.('loot_table', 'minecraft:chests/igloo')).toBe(table);
        expect(resolver.element?.('predicate', 'minecraft:tool/can_shear')).toEqual({
            type: 'minecraft:survives_explosion'
        });
    });

    it('answers nothing for an unknown id or a registry the stack has no map for', () => {
        const resolver = createPackResolver(definitions);

        expect(resolver.element?.('loot_table', 'minecraft:chests/missing')).toBeUndefined();
        expect(resolver.element?.('item_modifier', 'minecraft:anything')).toBeUndefined();
        expect(resolver.element?.('advancement', 'minecraft:story/root')).toBeUndefined();
    });

    it('expands a tag, namespacing bare members and keeping nested tags', () => {
        const resolver = createPackResolver(definitions);

        expect(resolver.tag?.('item', 'minecraft:planks')).toEqual([
            'minecraft:oak_planks',
            'minecraft:birch_planks',
            '#minecraft:more'
        ]);
    });

    it('answers nothing for a tag the stack does not have', () => {
        expect(createPackResolver(definitions).tag?.('block', 'minecraft:logs')).toBeUndefined();
    });
});
