import { describe, expect, it } from 'vitest';

import { javaComponentTextOf, javaItemComponentsOf } from './javaItemComponents';

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
