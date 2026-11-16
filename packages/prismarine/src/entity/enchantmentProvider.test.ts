import { EnchantmentRegistry, parseEnchantment } from '@jsprismarine/enchantments';
import { describe, expect, it } from 'vitest';

import type { EnchantmentProviderSource } from './enchantmentProvider';
import { enchantFromProvider } from './enchantmentProvider';

/** Java's power: a bow enchantment whose level 1 costs 1 to 16. */
const power = parseEnchantment('minecraft:power', {
    description: 'power',
    supported_items: 'minecraft:bow',
    weight: 10,
    max_level: 5,
    min_cost: { base: 1, per_level_above_first: 10 },
    max_cost: { base: 16, per_level_above_first: 10 },
    anvil_cost: 1,
    slots: ['mainhand']
}).value;

const source = (providers: Readonly<Record<string, unknown>>): EnchantmentProviderSource => ({
    enchantments: new EnchantmentRegistry({
        definitions: [power],
        tags: new Map([['minecraft:on_mob_spawn_equipment', ['minecraft:power']]])
    }),
    provider: (id) => providers[id],
    enchantability: (identifier) => (identifier === 'minecraft:bow' ? 1 : 0)
});

/** A random that draws `value` for every float and the lowest bound for every int. */
const fixed = (value: number) => ({ nextFloat: () => value, nextInt: () => 0 });

const BOW = { identifier: 'minecraft:bow', count: 1 };

describe('enchantFromProvider', () => {
    it("enchants a bow at a cost drawn from min_cost up by Java's regional difficulty", () => {
        const spawn = source({
            'minecraft:mob_spawn_equipment': {
                type: 'minecraft:by_cost_with_difficulty',
                enchantments: '#minecraft:on_mob_spawn_equipment',
                min_cost: 5,
                max_cost_span: 17
            }
        });

        expect(enchantFromProvider(spawn, 'minecraft:mob_spawn_equipment', BOW, fixed(0.5), 0).enchantments).toEqual({
            'minecraft:power': 1
        });
    });

    it('leaves an item no enchantment fits, and an unknown provider, as they were', () => {
        const spawn = source({
            'minecraft:mob_spawn_equipment': {
                type: 'minecraft:by_cost',
                enchantments: '#minecraft:on_mob_spawn_equipment',
                cost: 30
            }
        });
        const stick = { identifier: 'minecraft:stick', count: 1 };

        expect(enchantFromProvider(spawn, 'minecraft:mob_spawn_equipment', stick, fixed(0.5), 1)).toBe(stick);
        expect(enchantFromProvider(spawn, 'minecraft:nothing', BOW, fixed(0.5), 1)).toBe(BOW);
    });

    it('adds the one enchantment a single provider names, keeping a higher level the item has', () => {
        const single = source({
            'minecraft:one': { type: 'minecraft:single', enchantment: 'minecraft:power', level: 2 }
        });

        expect(enchantFromProvider(single, 'minecraft:one', BOW, fixed(0.5), 0).enchantments).toEqual({
            'minecraft:power': 2
        });
        expect(
            enchantFromProvider(
                single,
                'minecraft:one',
                { ...BOW, enchantments: { 'minecraft:power': 4 } },
                fixed(0.5),
                0
            ).enchantments
        ).toEqual({ 'minecraft:power': 4 });
    });
});
