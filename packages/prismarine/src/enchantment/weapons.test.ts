import { describe, expect, it } from 'vitest';

import { buildServerContent } from '../content/ServerContent';
import { definitionOf, definitionsOf } from '../content/ContentOptions';
import type { ServerContent } from '../content/ServerContent';
import { fixtureBlockPalette, fixtureItemDefinitions } from '../content/testing';
import { DamageCause } from '../entity/DamageCause';
import { Item } from '../item/Item';
import { meleeEnchantmentBonus } from './melee';

/**
 * The two components a held item declares: `minecraft:damage` and
 * `minecraft:knockback`, plus the `minecraft:mining_efficiency` attribute
 * Efficiency writes.
 *
 * Every body below is copied verbatim from Java 26.3's
 * `data/minecraft/enchantment/`, so the figures are the real ones: Sharpness
 * is `add` a `linear` of 1.0 with 0.5 per level above the first, Knockback is
 * 1.0 per level, and Efficiency is `levels_squared` with `added: 1.0` on
 * `minecraft:mining_efficiency`.
 */

const MELEE = {
    anvil_cost: 1,
    description: { translate: 'enchantment' },
    max_cost: { base: 21, per_level_above_first: 11 },
    min_cost: { base: 1, per_level_above_first: 11 },
    slots: ['mainhand'],
    supported_items: '#minecraft:enchantable/sharp_weapon',
    weight: 10
};

const enchantmentDefinitions = () =>
    new Map([
        [
            'minecraft:sharpness',
            definitionOf('enchantments', 'minecraft:sharpness', {
                ...MELEE,
                max_level: 5,
                effects: {
                    'minecraft:damage': [
                        {
                            effect: {
                                type: 'minecraft:add',
                                value: { type: 'minecraft:linear', base: 1.0, per_level_above_first: 0.5 }
                            }
                        }
                    ]
                }
            })
        ],
        [
            'minecraft:knockback',
            definitionOf('enchantments', 'minecraft:knockback', {
                ...MELEE,
                max_level: 2,
                effects: {
                    'minecraft:knockback': [
                        {
                            effect: {
                                type: 'minecraft:add',
                                value: { type: 'minecraft:linear', base: 1.0, per_level_above_first: 1.0 }
                            }
                        }
                    ]
                }
            })
        ],
        [
            'minecraft:efficiency',
            definitionOf('enchantments', 'minecraft:efficiency', {
                ...MELEE,
                max_level: 5,
                supported_items: '#minecraft:enchantable/mining',
                effects: {
                    'minecraft:attributes': [
                        {
                            amount: { type: 'minecraft:levels_squared', added: 1.0 },
                            attribute: 'minecraft:mining_efficiency',
                            id: 'minecraft:enchantment.efficiency',
                            operation: 'add_value'
                        }
                    ]
                }
            })
        ]
    ]);

const tagDefinitions = () =>
    new Map([
        [
            'item/minecraft:enchantable/sharp_weapon',
            definitionOf('tags', 'item/minecraft:enchantable/sharp_weapon', { values: ['minecraft:diamond_sword'] })
        ],
        [
            'item/minecraft:enchantable/mining',
            definitionOf('tags', 'item/minecraft:enchantable/mining', { values: ['minecraft:diamond_pickaxe'] })
        ],
        [
            'block/minecraft:mineable/pickaxe',
            definitionOf('tags', 'block/minecraft:mineable/pickaxe', { values: ['minecraft:stone'] })
        ]
    ]);

const content = (): ServerContent =>
    buildServerContent({
        load: () => ({
            definitions: definitionsOf({ enchantments: enchantmentDefinitions(), tags: tagDefinitions() }),
            diagnostics: []
        }),
        blockPalette: fixtureBlockPalette(),
        itemDefinitions: fixtureItemDefinitions()
    });

const victim = {
    getType: () => 'minecraft:zombie',
    getPosition: () => ({ getX: () => 0, getY: () => 64, getZ: () => 0 })
};

const attacker = {
    getType: () => 'minecraft:player',
    getPosition: () => ({ getX: () => 1, getY: () => 64, getZ: () => 0 })
};

const swing = (built: ServerContent | undefined, weapon: Item | undefined, base = 7) =>
    meleeEnchantmentBonus(
        { content: built, weapon, victim, source: { cause: DamageCause.Attack, attacker, projectile: null } },
        base
    );

describe('melee enchantments', () => {
    it('adds nothing for a bare hand', () => {
        expect(swing(content(), undefined)).toEqual({ damage: 0, knockbackLevels: 0 });
    });

    it('adds nothing for an unenchanted weapon', () => {
        expect(swing(content(), new Item({ name: 'minecraft:diamond_sword' }))).toEqual({
            damage: 0,
            knockbackLevels: 0
        });
    });

    it('adds nothing when the server built no content', () => {
        const sword = new Item({ name: 'minecraft:diamond_sword', enchantments: { 'minecraft:sharpness': 5 } });

        expect(swing(undefined, sword)).toEqual({ damage: 0, knockbackLevels: 0 });
    });

    it.each([
        [1, 1],
        [2, 1.5],
        [3, 2],
        [5, 3]
    ])('adds %i point of Sharpness as %f half-hearts', (level, bonus) => {
        const sword = new Item({ name: 'minecraft:diamond_sword', enchantments: { 'minecraft:sharpness': level } });

        expect(swing(content(), sword).damage).toBeCloseTo(bonus);
    });

    it('adds a knockback level per level of Knockback', () => {
        const sword = new Item({ name: 'minecraft:diamond_sword', enchantments: { 'minecraft:knockback': 2 } });

        expect(swing(content(), sword).knockbackLevels).toBe(2);
    });

    it('applies both at once, in the order the enchantment map iterates', () => {
        const sword = new Item({
            name: 'minecraft:diamond_sword',
            enchantments: { 'minecraft:sharpness': 3, 'minecraft:knockback': 1 }
        });

        expect(swing(content(), sword)).toEqual({ damage: 2, knockbackLevels: 1 });
    });
});

describe('mining enchantments', () => {
    const pickaxe = (levels: Record<string, number> = {}) =>
        new Item({ name: 'minecraft:diamond_pickaxe', enchantments: levels, content: content() });

    it('mines at the tool rate with nothing enchanted', () => {
        expect(pickaxe().getMiningSpeed('minecraft:stone')).toBe(8);
    });

    it.each([
        [1, 10],
        [2, 13],
        [3, 18],
        [5, 34]
    ])('adds level squared plus one for Efficiency %i', (level, speed) => {
        expect(pickaxe({ 'minecraft:efficiency': level }).getMiningSpeed('minecraft:stone')).toBeCloseTo(speed);
    });

    it('leaves a wrong tool alone, because Java only adds the attribute above a speed of one', () => {
        const sword = new Item({
            name: 'minecraft:diamond_sword',
            enchantments: { 'minecraft:efficiency': 5 },
            content: content()
        });

        expect(sword.getMiningSpeed('minecraft:stone')).toBe(1);
    });
});
