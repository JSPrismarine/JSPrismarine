import { describe, expect, it } from 'vitest';

import { buildServerContent } from '../content/ServerContent';
import { definitionOf, definitionsOf } from '../content/ContentOptions';
import type { ServerContent } from '../content/ServerContent';
import { fixtureBlockPalette, fixtureItemDefinitions } from '../content/testing';
import { Item } from '../item/Item';
import { repairWithExperience } from './mending';

/** Java 26.3's `data/minecraft/enchantment/mending.json`, verbatim, so the test needs no cached jar. */
const MENDING = {
    anvil_cost: 4,
    description: { translate: 'enchantment.minecraft.mending' },
    effects: { 'minecraft:repair_with_xp': [{ effect: { type: 'minecraft:multiply', factor: 2.0 } }] },
    max_cost: { base: 75, per_level_above_first: 25 },
    max_level: 1,
    min_cost: { base: 25, per_level_above_first: 25 },
    slots: ['any'],
    supported_items: '#minecraft:enchantable/durability',
    weight: 2
};

const content = (): ServerContent =>
    buildServerContent({
        load: () => ({
            definitions: definitionsOf({
                enchantments: new Map([
                    ['minecraft:mending', definitionOf('enchantments', 'minecraft:mending', MENDING)]
                ])
            }),
            diagnostics: []
        }),
        blockPalette: fixtureBlockPalette(),
        itemDefinitions: fixtureItemDefinitions()
    });

/** A diamond pickaxe with `spent` durability spent, mended or not. */
const pickaxe = (spent: number, mended = true): Item => {
    const item = new Item({
        name: 'minecraft:diamond_pickaxe',
        ...(mended ? { enchantments: { 'minecraft:mending': 1 } } : {})
    });
    return item.withDurability(item.getMaxDurability() - spent);
};

const first = () => 0;

describe('repairWithExperience', () => {
    it('turns each point into two durability, and keeps the points the repair did not need', () => {
        const { enchantments } = content();
        const held = pickaxe(3);

        const { remaining, repaired } = repairWithExperience(enchantments, { mainhand: held }, 7, first);

        // Three durability costs floor(3 * 7 / 14) = 1 point of the 7.
        expect(repaired.get('mainhand')?.getDurability()).toBe(held.getMaxDurability());
        expect(remaining).toBe(6);
    });

    it('spends every point on a stack with more damage than they repair', () => {
        const { enchantments } = content();
        const held = pickaxe(100);

        const { remaining, repaired } = repairWithExperience(enchantments, { mainhand: held }, 7, first);

        expect(repaired.get('mainhand')?.getDurability()).toBe(held.getDurability() + 14);
        expect(remaining).toBe(0);
    });

    it('moves on to the next damaged stack with what is left', () => {
        const { enchantments } = content();
        const draws: number[] = [];

        const { remaining, repaired } = repairWithExperience(
            enchantments,
            { mainhand: pickaxe(2), offhand: pickaxe(4) },
            10,
            (bound) => {
                draws.push(bound);
                return 0;
            }
        );

        // Both damaged, then only the off hand: 2 durability for 1 point, then 4 for 2.
        expect(draws).toEqual([2, 1]);
        expect(repaired.size).toBe(2);
        expect(remaining).toBe(7);
    });

    it('leaves the points alone without a damaged stack that repairs with experience', () => {
        const { enchantments } = content();

        const { remaining, repaired } = repairWithExperience(
            enchantments,
            { mainhand: pickaxe(5, false), head: pickaxe(0) },
            7,
            first
        );

        expect(remaining).toBe(7);
        expect(repaired.size).toBe(0);
    });
});
