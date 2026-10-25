import type { EntityView, ItemStack } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import type { LootContentOptions } from './content';
import { DYE_COLORS, createLootContext } from './content';
import { parseLootTable, rollLootTable } from './table';

const RECIPES: ReadonlyMap<string, unknown> = new Map<string, unknown>([
    [
        'minecraft:cooked_beef',
        { type: 'minecraft:smelting', ingredient: 'minecraft:beef', result: { id: 'minecraft:cooked_beef' } }
    ],
    [
        'minecraft:charcoal',
        { type: 'minecraft:smelting', ingredient: '#minecraft:logs', result: { id: 'minecraft:charcoal' } }
    ],
    [
        'minecraft:iron_ingot_from_blasting',
        { type: 'minecraft:blasting', ingredient: 'minecraft:raw_iron', result: { id: 'minecraft:iron_ingot' } }
    ]
]);

/** Rolls a one-item table whose entry carries `modifier`, against a wired loot context. */
const rollModified = (
    name: string,
    modifier: unknown,
    content: LootContentOptions = {},
    parameters: Parameters<typeof createLootContext>[0]['parameters'] = { origin: { x: 0, y: 64, z: 0 } }
): { readonly stacks: readonly ItemStack[]; readonly diagnostics: readonly unknown[] } => {
    const parsed = parseLootTable({
        type: 'minecraft:chest',
        pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name, modifier }] }]
    });
    expect(parsed.diagnostics).toEqual([]);

    const context = createLootContext({ parameterSet: 'chest', parameters, content });
    return { stacks: rollLootTable(parsed.value, context), diagnostics: context.diagnostics.entries };
};

describe('smelting results', () => {
    it('answers furnace_smelt from the smelting recipes in the pack stack', () => {
        const { stacks, diagnostics } = rollModified(
            'minecraft:beef',
            { type: 'minecraft:furnace_smelt' },
            {
                recipes: RECIPES
            }
        );

        expect(diagnostics).toEqual([]);
        expect(stacks.map((stack) => stack.id)).toEqual(['minecraft:cooked_beef']);
    });

    it('ignores a recipe of another type', () => {
        const { stacks } = rollModified(
            'minecraft:raw_iron',
            { type: 'minecraft:furnace_smelt' },
            {
                recipes: RECIPES
            }
        );

        expect(stacks.map((stack) => stack.id)).toEqual(['minecraft:raw_iron']);
    });

    it('expands a tagged ingredient through the host', () => {
        const { stacks } = rollModified(
            'minecraft:oak_log',
            { type: 'minecraft:furnace_smelt' },
            {
                recipes: RECIPES,
                itemTag: (tag) => (tag === 'minecraft:logs' ? ['minecraft:oak_log', 'minecraft:birch_log'] : undefined)
            }
        );

        expect(stacks.map((stack) => stack.id)).toEqual(['minecraft:charcoal']);
    });

    it('reports furnace_smelt and keeps the stack when no recipes are bound', () => {
        const { stacks, diagnostics } = rollModified('minecraft:beef', { type: 'minecraft:furnace_smelt' });

        expect(stacks.map((stack) => stack.id)).toEqual(['minecraft:beef']);
        expect(diagnostics).toContainEqual({
            severity: 'warning',
            path: 'pools[0].entries[0].modifier',
            message: 'furnace_smelt is not available on this host'
        });
    });
});

describe('nested entry rolls', () => {
    it('rolls the entries a set_contents modifier carries', () => {
        const { stacks, diagnostics } = rollModified('minecraft:chest', {
            type: 'minecraft:set_contents',
            component: 'minecraft:container',
            entries: [
                { type: 'minecraft:item', name: 'minecraft:bread' },
                {
                    type: 'minecraft:group',
                    children: [
                        { type: 'minecraft:item', name: 'minecraft:apple' },
                        { type: 'minecraft:item', name: 'minecraft:carrot' }
                    ]
                }
            ]
        });

        expect(diagnostics).toEqual([]);
        const contents = stacks[0]?.components.get('minecraft:container');
        expect(Array.isArray(contents) && contents.map((stack: ItemStack) => stack.id)).toEqual([
            'minecraft:bread',
            'minecraft:apple',
            'minecraft:carrot'
        ]);
    });

    it('skips an entry whose condition fails', () => {
        const { stacks } = rollModified('minecraft:chest', {
            type: 'minecraft:set_contents',
            entries: [
                {
                    type: 'minecraft:item',
                    name: 'minecraft:bread',
                    condition: { type: 'minecraft:random_chance', chance: 0 }
                },
                { type: 'minecraft:item', name: 'minecraft:apple' }
            ]
        });

        const contents = stacks[0]?.components.get('minecraft:container');
        expect(Array.isArray(contents) && contents.map((stack: ItemStack) => stack.id)).toEqual(['minecraft:apple']);
    });
});

describe('player profiles', () => {
    it('reads the profile component off the entity', () => {
        const entity: EntityView = {
            type: 'minecraft:player',
            components: new Map<string, unknown>([['minecraft:profile', { name: 'Dinnerbone' }]])
        };

        const { stacks, diagnostics } = rollModified(
            'minecraft:player_head',
            { type: 'minecraft:fill_player_head', entity: 'this' },
            {},
            { origin: { x: 0, y: 64, z: 0 }, this_entity: entity }
        );

        expect(diagnostics).toEqual([]);
        expect(stacks[0]?.components.get('minecraft:profile')).toEqual({ name: 'Dinnerbone' });
    });

    it('lets the host answer instead', () => {
        const entity: EntityView = { type: 'minecraft:player' };

        const { stacks } = rollModified(
            'minecraft:player_head',
            { type: 'minecraft:fill_player_head', entity: 'this' },
            { profiles: () => ({ name: 'Notch' }) },
            { origin: { x: 0, y: 64, z: 0 }, this_entity: entity }
        );

        expect(stacks[0]?.components.get('minecraft:profile')).toEqual({ name: 'Notch' });
    });
});

describe('exploration maps', () => {
    const modifier = {
        type: 'minecraft:exploration_map',
        destination: '#minecraft:on_treasure_maps',
        decoration: 'minecraft:woodland_mansion',
        zoom: 1,
        search_radius: 50
    };

    it('points the map at the structure the locator found', () => {
        let nextId = 7;
        const { stacks, diagnostics } = rollModified('minecraft:map', modifier, {
            structures: () => ({ x: 128, y: 64, z: -256 }),
            mapIds: () => nextId++
        });

        expect(diagnostics).toEqual([]);
        expect(stacks[0]?.components.get('minecraft:map_id')).toBe(7);
        expect(stacks[0]?.components.get('minecraft:map_decorations')).toEqual({
            '+': { type: 'minecraft:woodland_mansion', x: 128, z: -256, rotation: 180 }
        });
    });

    it('leaves the stack alone when the search finds nothing', () => {
        const { stacks } = rollModified('minecraft:map', modifier, { structures: () => undefined });

        expect(stacks[0]?.components.size).toBe(0);
    });
});

describe('the dye table', () => {
    it('holds the 16 Java texture colors in registry order', () => {
        expect(DYE_COLORS).toEqual([
            16383998, 16351261, 13061821, 3847130, 16701501, 8439583, 15961002, 4673362, 10329495, 1481884, 8991416,
            3949738, 8606770, 6192150, 11546150, 1908001
        ]);
    });

    it('offers the table to set_random_dyes', () => {
        const { stacks, diagnostics } = rollModified('minecraft:leather_helmet', {
            type: 'minecraft:set_random_dyes',
            number_of_dyes: 1
        });

        expect(diagnostics).toEqual([]);
        expect(stacks[0]?.components.has('minecraft:dyed_color')).toBe(true);
    });
});
