import { describe, expect, it } from 'vitest';

import { PredicateContext } from './context';
import type { PredicateContextOptions } from './context';
import type { ItemStack } from './item';
import { LOOT_FUNCTION_TYPES, parseItemModifier } from './modifiers';
import { scriptedRandom } from './random';

const stack = (
    id = 'minecraft:stone',
    count = 1,
    components: Iterable<readonly [string, unknown]> = []
): ItemStack => ({
    id,
    count,
    components: new Map(components)
});

const apply = (
    json: unknown,
    input: ItemStack = stack(),
    options: PredicateContextOptions = {}
): ItemStack | undefined => {
    const { value, diagnostics } = parseItemModifier(json);
    expect(diagnostics).toEqual([]);
    return value(input, new PredicateContext(options));
};

const componentOf = (result: ItemStack | undefined, type: string): unknown => result?.components.get(type);

/**
 * Each `ListOperation` mode applied to the current list `['one', 'two',
 * 'three']` with `['x']` as the addition, with the mode members flat beside
 * the modifier's own members the way `ListOperation.codec` dispatches them.
 */
const listOperationCases = [
    ['replace_all', { mode: 'replace_all' }, ['x']],
    ['append', { mode: 'append' }, ['one', 'two', 'three', 'x']],
    ['insert', { mode: 'insert', offset: 1 }, ['one', 'x', 'two', 'three']],
    ['replace_section', { mode: 'replace_section', offset: 1, size: 1 }, ['one', 'x', 'three']]
] as const;

describe('LOOT_FUNCTION_TYPES', () => {
    it('lists the 42 types Java 26.3 registers', () => {
        expect(LOOT_FUNCTION_TYPES).toHaveLength(42);
    });
});

describe('count modifiers', () => {
    it('sets a count and clamps it to the stack size', () => {
        expect(apply({ type: 'minecraft:set_count', count: 5 })?.count).toBe(5);
        expect(apply({ type: 'minecraft:set_count', count: 500 })?.count).toBe(64);
    });

    it('adds to the current count', () => {
        expect(apply({ type: 'minecraft:set_count', count: 2, add: true }, stack('minecraft:stone', 3))?.count).toBe(5);
    });

    it('limits a count to a maximum', () => {
        expect(apply({ type: 'minecraft:limit_count', limit: { max: 9 } }, stack('minecraft:stone', 20))?.count).toBe(
            9
        );
    });

    it('raises a count by the attacker looting level', () => {
        const attacker = {
            type: 'minecraft:player',
            equipment: {
                mainhand: stack('minecraft:sword', 1, [
                    ['minecraft:enchantments', { levels: { 'minecraft:looting': 2 } }]
                ])
            }
        };

        expect(
            apply(
                { type: 'minecraft:enchanted_count_increase', enchantment: 'minecraft:looting', count: 1 },
                stack('minecraft:string', 1),
                { parameterSet: 'entity', parameters: { attacking_entity: attacker } }
            )?.count
        ).toBe(3);
    });

    it('decays a stack by the explosion radius', () => {
        expect(
            apply({ type: 'minecraft:explosion_decay' }, stack('minecraft:stone', 3), {
                parameterSet: 'block',
                parameters: { explosion_radius: 4 },
                random: scriptedRandom([0.1, 0.9, 0.2])
            })?.count
        ).toBe(2);
    });

    it('multiplies a count with the ore_drops formula', () => {
        const tool = stack('minecraft:pickaxe', 1, [
            ['minecraft:enchantments', { levels: { 'minecraft:fortune': 2 } }]
        ]);

        expect(
            apply(
                { type: 'minecraft:apply_bonus', enchantment: 'minecraft:fortune', formula: 'minecraft:ore_drops' },
                stack('minecraft:coal', 1),
                {
                    parameterSet: 'block',
                    parameters: { tool },
                    random: scriptedRandom([0.9])
                }
            )?.count
        ).toBe(3);
    });

    it('adds a uniform bonus count', () => {
        const tool = stack('minecraft:pickaxe', 1, [
            ['minecraft:enchantments', { levels: { 'minecraft:fortune': 2 } }]
        ]);

        expect(
            apply(
                {
                    type: 'minecraft:apply_bonus',
                    enchantment: 'minecraft:fortune',
                    formula: 'minecraft:uniform_bonus_count',
                    parameters: { bonusMultiplier: 1 }
                },
                stack('minecraft:wart', 1),
                { parameterSet: 'block', parameters: { tool }, random: scriptedRandom([0.9]) }
            )?.count
        ).toBe(3);
    });

    it('adds a binomial bonus count', () => {
        const tool = stack('minecraft:pickaxe', 1, [
            ['minecraft:enchantments', { levels: { 'minecraft:fortune': 1 } }]
        ]);

        expect(
            apply(
                {
                    type: 'minecraft:apply_bonus',
                    enchantment: 'minecraft:fortune',
                    formula: 'minecraft:binomial_with_bonus_count',
                    parameters: { extra: 3, probability: 0.5 }
                },
                stack('minecraft:seeds', 1),
                { parameterSet: 'block', parameters: { tool }, random: scriptedRandom([0.1, 0.9, 0.2, 0.8]) }
            )?.count
        ).toBe(3);
    });
});

describe('component modifiers', () => {
    it('replaces the item', () => {
        expect(apply({ type: 'minecraft:set_item', item: 'minecraft:gold_ingot' })?.id).toBe('minecraft:gold_ingot');
    });

    it('sets and adds enchantment levels', () => {
        const once = apply({ type: 'minecraft:set_enchantments', enchantments: { 'minecraft:wind_burst': 1 } });
        expect(componentOf(once, 'minecraft:enchantments')).toEqual({ levels: { 'minecraft:wind_burst': 1 } });

        const twice = apply(
            { type: 'minecraft:set_enchantments', enchantments: { 'minecraft:wind_burst': 2 }, add: true },
            once
        );
        expect(componentOf(twice, 'minecraft:enchantments')).toEqual({ levels: { 'minecraft:wind_burst': 3 } });
    });

    it('writes custom data, components and the ominous bottle amplifier', () => {
        expect(
            componentOf(apply({ type: 'minecraft:set_custom_data', tag: { a: 1 } }), 'minecraft:custom_data')
        ).toEqual({
            a: 1
        });
        expect(
            componentOf(
                apply({ type: 'minecraft:set_components', components: { 'minecraft:trim': { material: 'copper' } } }),
                'minecraft:trim'
            )
        ).toEqual({ material: 'copper' });
        expect(
            componentOf(
                apply({ type: 'minecraft:set_ominous_bottle_amplifier', amplifier: 9 }),
                'minecraft:ominous_bottle_amplifier'
            )
        ).toBe(4);
    });

    it('damages a stack as a fraction of its durability', () => {
        const items = { ...new PredicateContext().items, maxDamage: () => 100 };

        expect(
            componentOf(
                apply({ type: 'minecraft:set_damage', damage: 0.9 }, stack('minecraft:sword'), { items }),
                'minecraft:damage'
            )
        ).toBe(10);
    });

    it('names an item', () => {
        expect(
            componentOf(
                apply({ type: 'minecraft:set_name', name: { translate: 'x' }, target: 'item_name' }),
                'minecraft:item_name'
            )
        ).toEqual({ translate: 'x' });
    });

    it('copies a custom name off the block entity', () => {
        const result = apply({ type: 'minecraft:copy_name', source: 'block_entity' }, stack(), {
            parameterSet: 'block',
            parameters: {
                block_entity: { id: 'minecraft:chest', components: new Map([['minecraft:custom_name', 'Loot']]) }
            }
        });

        expect(componentOf(result, 'minecraft:custom_name')).toBe('Loot');
    });

    it('copies components off the block entity, honoring include', () => {
        const blockEntity = {
            id: 'minecraft:beehive',
            components: new Map<string, unknown>([
                ['minecraft:custom_name', 'Hive'],
                ['minecraft:lock', 'key']
            ])
        };
        const result = apply(
            { type: 'minecraft:copy_components', source: 'block_entity', include: ['minecraft:custom_name'] },
            stack(),
            { parameterSet: 'block', parameters: { block_entity: blockEntity } }
        );

        expect(componentOf(result, 'minecraft:custom_name')).toBe('Hive');
        expect(componentOf(result, 'minecraft:lock')).toBeUndefined();
    });

    it('copies block state properties', () => {
        const result = apply(
            { type: 'minecraft:copy_state', block: 'minecraft:beehive', properties: ['honey_level'] },
            stack(),
            {
                parameterSet: 'block',
                parameters: {
                    block_state: { name: 'minecraft:beehive', properties: { honey_level: '5', facing: 'north' } }
                }
            }
        );

        expect(componentOf(result, 'minecraft:block_state')).toEqual({ honey_level: '5' });
    });

    it('copies nbt paths into custom data', () => {
        const result = apply(
            {
                type: 'minecraft:copy_custom_data',
                source: { type: 'context', target: 'block_entity' },
                ops: [{ source: 'Items.count', target: 'kept', op: 'replace' }]
            },
            stack(),
            {
                parameterSet: 'block',
                parameters: { block_entity: { id: 'minecraft:chest', nbt: { Items: { count: 3 } } } }
            }
        );

        expect(componentOf(result, 'minecraft:custom_data')).toEqual({ kept: 3 });
    });

    it('sets a potion and a loot table', () => {
        expect(
            componentOf(apply({ type: 'minecraft:set_potion', id: 'minecraft:slowness' }), 'minecraft:potion_contents')
        ).toEqual({ potion: 'minecraft:slowness' });
        expect(
            componentOf(
                apply({ type: 'minecraft:set_loot_table', loot_table_id: 'minecraft:chests/igloo_chest', seed: 7 }),
                'minecraft:container_loot'
            )
        ).toEqual({ loot_table: 'minecraft:chests/igloo_chest', seed: 7 });
    });

    it('writes attribute modifiers with rolled amounts', () => {
        const result = apply({
            type: 'minecraft:set_attributes',
            modifiers: [
                {
                    id: 'minecraft:bonus',
                    attribute: 'minecraft:max_health',
                    operation: 'add_value',
                    slot: 'mainhand',
                    amount: 4
                }
            ]
        });

        expect(componentOf(result, 'minecraft:attribute_modifiers')).toEqual([
            { id: 'minecraft:bonus', type: 'minecraft:max_health', operation: 'add_value', slot: 'mainhand', amount: 4 }
        ]);
    });

    it('toggles a tooltip on a component', () => {
        const result = apply({ type: 'minecraft:toggle_tooltips', toggles: { 'minecraft:enchantments': false } });

        expect(componentOf(result, 'minecraft:enchantments')).toEqual({ show_in_tooltip: false });
    });

    it('appends lore with a list operation', () => {
        const once = apply({ type: 'minecraft:set_lore', lore: [{ text: 'one' }] });
        const twice = apply({ type: 'minecraft:set_lore', lore: [{ text: 'two' }], mode: 'append' }, once);

        expect(componentOf(twice, 'minecraft:lore')).toEqual([{ text: 'one' }, { text: 'two' }]);
    });

    it.each(listOperationCases)('runs the %s list operation on lore', (_mode, operation, expected) => {
        const result = apply(
            { type: 'minecraft:set_lore', lore: ['x'], ...operation },
            stack('minecraft:stone', 1, [['minecraft:lore', ['one', 'two', 'three']]])
        );

        expect(componentOf(result, 'minecraft:lore')).toEqual(expected);
    });

    it.each(listOperationCases)('runs the %s list operation on written book pages', (_mode, operation, expected) => {
        const result = apply(
            { type: 'minecraft:set_written_book_pages', pages: ['x'], ...operation },
            stack('minecraft:written_book', 1, [
                ['minecraft:written_book_content', { title: 'Guide', pages: ['one', 'two', 'three'] }]
            ])
        );

        expect(componentOf(result, 'minecraft:written_book_content')).toEqual({ title: 'Guide', pages: expected });
    });

    it.each(listOperationCases)('runs the %s list operation on writable book pages', (_mode, operation, expected) => {
        const result = apply(
            { type: 'minecraft:set_writable_book_pages', pages: ['x'], ...operation },
            stack('minecraft:writable_book', 1, [['minecraft:writable_book_content', ['one', 'two', 'three']]])
        );

        expect(componentOf(result, 'minecraft:writable_book_content')).toEqual(expected);
    });

    it('replaces as many entries as it adds when replace_section carries no size', () => {
        const result = apply(
            { type: 'minecraft:set_lore', lore: ['x', 'y'], mode: 'replace_section', offset: 1 },
            stack('minecraft:stone', 1, [['minecraft:lore', ['one', 'two', 'three']]])
        );

        expect(componentOf(result, 'minecraft:lore')).toEqual(['one', 'x', 'y']);
    });

    it.each(['insert', 'replace_section'])('leaves the list alone when the %s offset is past its end', (mode) => {
        const result = apply(
            { type: 'minecraft:set_lore', lore: ['x'], mode, offset: 4 },
            stack('minecraft:stone', 1, [['minecraft:lore', ['one', 'two', 'three']]])
        );

        expect(componentOf(result, 'minecraft:lore')).toEqual(['one', 'two', 'three']);
    });

    it('writes book covers and pages', () => {
        const covered = apply({ type: 'minecraft:set_book_cover', title: 'Guide', author: 'Steve' });
        const paged = apply({ type: 'minecraft:set_written_book_pages', pages: [{ raw: 'page' }] }, covered);

        expect(componentOf(paged, 'minecraft:written_book_content')).toEqual({
            title: 'Guide',
            author: 'Steve',
            pages: [{ raw: 'page' }]
        });
        expect(
            componentOf(
                apply({ type: 'minecraft:set_writable_book_pages', pages: [{ raw: 'draft' }] }),
                'minecraft:writable_book_content'
            )
        ).toEqual([{ raw: 'draft' }]);
    });

    it('writes fireworks and a firework explosion', () => {
        expect(
            componentOf(
                apply({
                    type: 'minecraft:set_fireworks',
                    explosions: { values: [{ shape: 'star' }], mode: 'replace_all' },
                    flight_duration: 2
                }),
                'minecraft:fireworks'
            )
        ).toEqual({ explosions: [{ shape: 'star' }], flight_duration: 2 });
        expect(
            componentOf(
                apply({ type: 'minecraft:set_firework_explosion', shape: 'burst', trail: true }),
                'minecraft:firework_explosion'
            )
        ).toEqual({ shape: 'burst', trail: true });
    });

    it('runs the fireworks list operation over the explosions it is given', () => {
        const rocket = stack('minecraft:firework_rocket', 1, [
            ['minecraft:fireworks', { flight_duration: 1, explosions: [{ shape: 'star' }] }]
        ]);
        const result = apply(
            { type: 'minecraft:set_fireworks', explosions: { values: [{ shape: 'burst' }], mode: 'append' } },
            rocket
        );

        expect(componentOf(result, 'minecraft:fireworks')).toEqual({
            flight_duration: 1,
            explosions: [{ shape: 'star' }, { shape: 'burst' }]
        });
    });

    it('leaves the explosions alone when only the flight duration is set', () => {
        const rocket = stack('minecraft:firework_rocket', 1, [
            ['minecraft:fireworks', { flight_duration: 1, explosions: [{ shape: 'star' }] }]
        ]);
        const result = apply({ type: 'minecraft:set_fireworks', flight_duration: 3 }, rocket);

        expect(componentOf(result, 'minecraft:fireworks')).toEqual({
            flight_duration: 3,
            explosions: [{ shape: 'star' }]
        });
    });

    it('writes banner patterns and custom model data', () => {
        expect(
            componentOf(
                apply({ type: 'minecraft:set_banner_pattern', patterns: [{ pattern: 'base' }] }),
                'minecraft:banner_patterns'
            )
        ).toEqual([{ pattern: 'base' }]);
        expect(
            componentOf(
                apply({ type: 'minecraft:set_custom_model_data', strings: { values: ['a'] } }),
                'minecraft:custom_model_data'
            )
        ).toEqual({ strings: ['a'] });
    });

    it('picks one stew effect from the injected random', () => {
        const result = apply(
            {
                type: 'minecraft:set_stew_effect',
                effects: [
                    { type: 'minecraft:night_vision', duration: 8 },
                    { type: 'minecraft:jump_boost', duration: 9 }
                ]
            },
            stack(),
            { random: scriptedRandom([0.9]) }
        );

        expect(componentOf(result, 'minecraft:suspicious_stew_effects')).toEqual([
            { id: 'minecraft:jump_boost', duration: 9 }
        ]);
    });
});

describe('control-flow modifiers', () => {
    it('discards the stack', () => {
        expect(apply({ type: 'minecraft:discard' })).toBeUndefined();
    });

    it('runs a sequence in order', () => {
        const result = apply({
            type: 'minecraft:sequence',
            functions: [
                { type: 'minecraft:set_count', count: 4 },
                { type: 'minecraft:set_count', count: 2, add: true }
            ]
        });

        expect(result?.count).toBe(6);
    });

    it('reads a list of modifiers as a sequence', () => {
        const result = apply([
            { type: 'minecraft:set_item', item: 'minecraft:gold_ingot' },
            { type: 'minecraft:set_count', count: 3 }
        ]);

        expect(result).toMatchObject({ id: 'minecraft:gold_ingot', count: 3 });
    });

    it('branches on an item filter', () => {
        const modifier = {
            type: 'minecraft:filtered',
            item_filter: { items: 'minecraft:map' },
            on_fail: { type: 'minecraft:discard' }
        };

        expect(apply(modifier, stack('minecraft:map'))).toBeDefined();
        expect(apply(modifier, stack('minecraft:stone'))).toBeUndefined();
    });

    it('skips a modifier whose condition fails', () => {
        const result = apply(
            { type: 'minecraft:set_count', count: 9, condition: { type: 'minecraft:killed_by_player' } },
            stack('minecraft:stone', 1),
            { parameterSet: 'entity' }
        );

        expect(result?.count).toBe(1);
    });

    it('applies a modifier to each stack in a container component', () => {
        const input = stack('minecraft:chest', 1, [['minecraft:container', [{ id: 'minecraft:stone', count: 1 }]]]);
        const result = apply(
            {
                type: 'minecraft:modify_contents',
                component: 'minecraft:container',
                modifier: { type: 'minecraft:set_count', count: 5 }
            },
            input
        );

        expect(componentOf(result, 'minecraft:container')).toEqual([
            { id: 'minecraft:stone', count: 5, components: {} }
        ]);
    });
});

describe('host-backed modifiers', () => {
    it('smelts through the content view', () => {
        const result = apply({ type: 'minecraft:furnace_smelt' }, stack('minecraft:raw_iron', 2), {
            content: { smeltingResult: () => stack('minecraft:iron_ingot', 1) }
        });

        expect(result?.id).toBe('minecraft:iron_ingot');
    });

    it('multiplies the input count by the count the recipe yields', () => {
        const content = { smeltingResult: () => stack('minecraft:charcoal', 3) };

        expect(apply({ type: 'minecraft:furnace_smelt' }, stack('minecraft:log', 2), { content })?.count).toBe(3);
        expect(
            apply({ type: 'minecraft:furnace_smelt', use_input_count: true }, stack('minecraft:log', 2), { content })
                ?.count
        ).toBe(6);
    });

    it('clamps a smelted count to the stack size', () => {
        const result = apply({ type: 'minecraft:furnace_smelt', use_input_count: true }, stack('minecraft:log', 30), {
            content: { smeltingResult: () => stack('minecraft:charcoal', 3) }
        });

        expect(result?.count).toBe(64);
    });

    it('warns and leaves the stack alone when the host cannot smelt', () => {
        const { value } = parseItemModifier({ type: 'minecraft:furnace_smelt' });
        const context = new PredicateContext();

        expect(value(stack('minecraft:raw_iron'), context)?.id).toBe('minecraft:raw_iron');
        expect(context.diagnostics.entries).toEqual([
            { severity: 'warning', path: '', message: 'furnace_smelt is not available on this host' }
        ]);
    });

    it('enchants through the enchantment view', () => {
        const result = apply({ type: 'minecraft:enchant_with_levels', levels: 30 }, stack('minecraft:book'), {
            enchantments: { selectRandomEnchantments: () => new Map([['minecraft:sharpness', 3]]) }
        });

        expect(componentOf(result, 'minecraft:enchantments')).toEqual({ levels: { 'minecraft:sharpness': 3 } });
    });

    it('picks a random enchantment from the declared options', () => {
        const result = apply(
            { type: 'minecraft:enchant_randomly', options: 'minecraft:soul_speed' },
            stack('minecraft:boots'),
            { enchantments: { maxLevel: () => 3 }, random: scriptedRandom([0, 0.9]) }
        );

        expect(componentOf(result, 'minecraft:enchantments')).toEqual({ levels: { 'minecraft:soul_speed': 3 } });
    });
});

describe('modifier diagnostics', () => {
    it('reports an unknown modifier type', () => {
        const { diagnostics } = parseItemModifier({ type: 'minecraft:set_nonsense' });

        expect(diagnostics).toEqual([
            { severity: 'error', path: '', message: 'unknown item modifier type minecraft:set_nonsense' }
        ]);
    });

    it('resolves an item_modifier reference through the injected resolver', () => {
        const { value, diagnostics } = parseItemModifier('minecraft:double_it', {
            resolver: { element: () => ({ type: 'minecraft:set_count', count: 2, add: true }) }
        });

        expect(diagnostics).toEqual([]);
        expect(value(stack('minecraft:stone', 1), new PredicateContext())?.count).toBe(3);
    });
});
