import { describe, expect, it } from 'vitest';

import { EQUIPMENT_SLOT_GROUPS, costAt, levelsOf, parseEnchantment } from './definition';

/** `enchantment/sharpness.json` of Java 26.3, verbatim. */
const SHARPNESS = {
    anvil_cost: 1,
    description: { translate: 'enchantment.minecraft.sharpness' },
    effects: {
        'minecraft:damage': [
            {
                effect: {
                    type: 'minecraft:add',
                    value: { type: 'minecraft:linear', base: 1.0, per_level_above_first: 0.5 }
                }
            }
        ]
    },
    exclusive_set: '#minecraft:exclusive_set/damage',
    max_cost: { base: 21, per_level_above_first: 11 },
    max_level: 5,
    min_cost: { base: 1, per_level_above_first: 11 },
    primary_items: '#minecraft:enchantable/melee_weapon',
    slots: ['mainhand'],
    supported_items: '#minecraft:enchantable/sharp_weapon',
    weight: 10
};

/** `enchantment/fortune.json` of Java 26.3, which carries no `effects` at all. */
const FORTUNE = {
    anvil_cost: 4,
    description: { translate: 'enchantment.minecraft.fortune' },
    exclusive_set: '#minecraft:exclusive_set/mining',
    max_cost: { base: 65, per_level_above_first: 9 },
    max_level: 3,
    min_cost: { base: 15, per_level_above_first: 9 },
    slots: ['mainhand'],
    supported_items: '#minecraft:enchantable/mining_loot',
    weight: 2
};

const parse = (id: string, json: unknown) => {
    const { value, diagnostics } = parseEnchantment(id, json);
    expect(diagnostics).toEqual([]);
    return value;
};

describe('the enchantment definition model', () => {
    it('reads every field of a complete file', () => {
        const sharpness = parse('minecraft:sharpness', SHARPNESS);

        expect(sharpness.id).toBe('minecraft:sharpness');
        expect(sharpness.description).toEqual({ translate: 'enchantment.minecraft.sharpness' });
        expect(sharpness.weight).toBe(10);
        expect(sharpness.maxLevel).toBe(5);
        expect(sharpness.anvilCost).toBe(1);
        expect(sharpness.slots).toEqual(['mainhand']);
        expect(sharpness.minCost).toEqual({ base: 1, perLevelAboveFirst: 11 });
        expect(sharpness.maxCost).toEqual({ base: 21, perLevelAboveFirst: 11 });
        expect(sharpness.supportedItems.tags).toEqual(['minecraft:enchantable/sharp_weapon']);
        expect(sharpness.primaryItems?.tags).toEqual(['minecraft:enchantable/melee_weapon']);
        expect(sharpness.exclusiveSet.tags).toEqual(['minecraft:exclusive_set/damage']);
        expect([...sharpness.effects.keys()]).toEqual(['damage']);
    });

    it('reads a file with no effects, which fortune is', () => {
        const fortune = parse('minecraft:fortune', FORTUNE);

        expect(fortune.effects.size).toBe(0);
        expect(fortune.primaryItems).toBeUndefined();
        expect(fortune.maxLevel).toBe(3);
    });

    it('normalizes an unqualified id', () => {
        expect(parse('sharpness', SHARPNESS).id).toBe('minecraft:sharpness');
    });

    it('registers the 11 equipment slot groups of 26.3', () => {
        expect(EQUIPMENT_SLOT_GROUPS).toHaveLength(11);
        expect(parse('minecraft:test', { ...SHARPNESS, slots: ['armor', 'offhand'] }).slots).toEqual([
            'armor',
            'offhand'
        ]);
    });
});

describe('the base plus per level cost form', () => {
    it('evaluates base at level one and adds per level above it', () => {
        // sharpness: min_cost 1 + 11 per level, max_cost 21 + 11 per level.
        const sharpness = parse('minecraft:sharpness', SHARPNESS);

        expect(costAt(sharpness.minCost, 1)).toBe(1);
        expect(costAt(sharpness.minCost, 5)).toBe(45);
        expect(costAt(sharpness.maxCost, 1)).toBe(21);
        expect(costAt(sharpness.maxCost, 5)).toBe(65);
    });

    it('accepts a bare number as a cost with no per level part', () => {
        const flat = parse('example:flat', { ...SHARPNESS, min_cost: 30 });
        expect(flat.minCost).toEqual({ base: 30, perLevelAboveFirst: 0 });
    });

    it('lists every level an enchantment offers', () => {
        expect(levelsOf(parse('minecraft:sharpness', SHARPNESS))).toEqual([1, 2, 3, 4, 5]);
        expect(levelsOf(parse('minecraft:fortune', FORTUNE))).toEqual([1, 2, 3]);
    });
});

describe('a malformed enchantment file', () => {
    it('reports every missing required field at once', () => {
        const { diagnostics } = parseEnchantment('example:empty', {});

        expect(diagnostics.map((entry) => entry.message).toSorted()).toEqual([
            'an enchantment needs anvil_cost',
            'an enchantment needs max_cost',
            'an enchantment needs max_level',
            'an enchantment needs min_cost',
            'an enchantment needs slots',
            'an enchantment needs weight'
        ]);
    });

    it('reports an unknown slot group and keeps the rest', () => {
        const { value, diagnostics } = parseEnchantment('example:slots', {
            ...SHARPNESS,
            slots: ['mainhand', 'elytra']
        });

        expect(diagnostics.map((entry) => entry.message)).toEqual(['unknown equipment slot group elytra']);
        expect(value.slots).toEqual(['mainhand']);
    });

    it('reports a body that is not an object', () => {
        const { diagnostics } = parseEnchantment('example:broken', 'sharpness');
        expect(diagnostics[0]?.message).toBe('an enchantment file must be a JSON object');
    });
});
