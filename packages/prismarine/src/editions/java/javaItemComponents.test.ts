import { describe, expect, it } from 'vitest';

import { javaComponentTextOf, javaItemComponentsOf, shownStackOfJava } from './javaItemComponents';

describe('javaItemComponentsOf', () => {
    it("gives an enchanted book's enchantments as the ones it stores, to apply", () => {
        expect(
            javaItemComponentsOf({
                name: 'minecraft:enchanted_book',
                count: 1,
                enchantments: new Map([['minecraft:mending', 1]])
            })
        ).toEqual({ 'minecraft:stored_enchantments': { 'minecraft:mending': 1 } });
    });

    it("reads the bag's components a slot carries from their JSON, and leaves out values that do not fit", () => {
        expect(
            javaItemComponentsOf({
                name: 'minecraft:paper',
                count: 1,
                components: {
                    'minecraft:item_name': { translate: 'item.loopback.lamp' },
                    'minecraft:custom_model_data': { floats: [2], strings: ['lit'] },
                    'minecraft:use_cooldown': { seconds: 1.5, cooldown_group: 'loopback:lamps' },
                    'minecraft:food': { nutrition: 4, saturation: 2.4 },
                    'minecraft:max_stack_size': 16,
                    'minecraft:unbreakable': {},
                    'minecraft:enchantment_glint_override': true,
                    'minecraft:item_model': 42
                }
            })
        ).toEqual({
            'minecraft:item_name': { translate: 'item.loopback.lamp' },
            'minecraft:custom_model_data': { floats: [2], flags: [], strings: ['lit'], colors: [] },
            'minecraft:use_cooldown': { seconds: 1.5, group: 'loopback:lamps' },
            'minecraft:food': { nutrition: 4, saturation: 2.4, canAlwaysEat: false },
            'minecraft:max_stack_size': 16,
            'minecraft:unbreakable': true,
            'minecraft:enchantment_glint_override': true
        });
    });

    it('gives a plain stack no components', () => {
        expect(javaItemComponentsOf({ name: 'minecraft:stone', count: 64 })).toEqual({});
    });
});

describe('javaComponentTextOf', () => {
    it.each([
        ['plain text', 'Lamp', 'Lamp'],
        ['a text part', { text: 'Lamp' }, 'Lamp'],
        ['a list of text parts', ['Old ', { text: 'Lamp' }], 'Old Lamp'],
        [
            'a translation with arguments',
            { translate: 'item.loopback.named', with: ['Steve', { text: 'Alex' }] },
            { translate: 'item.loopback.named', with: ['Steve', 'Alex'] }
        ],
        ['a score, which this server cannot fill', { score: { name: '@s', objective: 'kills' } }, undefined]
    ])('reads %s', (_, json, text) => {
        expect(javaComponentTextOf(json)).toEqual(text);
    });
});

describe('shownStackOfJava', () => {
    it('reads back every component javaItemComponentsOf writes', () => {
        const stacks = [
            {
                name: 'minecraft:diamond_pickaxe',
                count: 1,
                customName: 'Old Faithful',
                lore: ['Dug the first mine'],
                damage: 120,
                enchantments: new Map([['minecraft:efficiency', 5]]),
                components: {
                    'minecraft:item_name': { translate: 'item.loopback.lamp' },
                    'minecraft:item_model': 'loopback:pick',
                    'minecraft:custom_model_data': { floats: [2], flags: [true], strings: ['lit'], colors: [255] },
                    'minecraft:use_cooldown': { seconds: 1.5, cooldown_group: 'loopback:lamps' },
                    'minecraft:food': { nutrition: 4, saturation: 2.5, can_always_eat: true },
                    'minecraft:max_stack_size': 16,
                    'minecraft:unbreakable': {},
                    'minecraft:enchantment_glint_override': false
                }
            },
            { name: 'minecraft:enchanted_book', count: 1, enchantments: new Map([['minecraft:mending', 1]]) },
            { name: 'minecraft:stone', count: 64 }
        ];
        for (const stack of stacks)
            expect(
                shownStackOfJava(stack.name, { item: 1, count: stack.count, components: javaItemComponentsOf(stack) })
            ).toEqual(stack);
    });

    it('leaves out a name that is a translation, since a stack names itself in plain text', () => {
        expect(
            shownStackOfJava('minecraft:stone', {
                item: 1,
                count: 1,
                components: {
                    'minecraft:custom_name': { translate: 'block.minecraft.stone' },
                    'minecraft:lore': [{ translate: 'x' }, 'y']
                }
            })
        ).toEqual({ name: 'minecraft:stone', count: 1, lore: ['y'] });
    });
});
