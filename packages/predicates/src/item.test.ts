import { describe, expect, it } from 'vitest';

import { defaultItemStackOps, enchantmentLevelFromComponent } from './item';

describe('defaultItemStackOps', () => {
    it('leaves the original stack alone when a component is set', () => {
        const stack = defaultItemStackOps.create('minecraft:diamond_sword', 1);
        const enchanted = defaultItemStackOps.withComponent(stack, 'minecraft:damage', 4);

        expect(stack.components.size).toBe(0);
        expect(defaultItemStackOps.component(enchanted, 'minecraft:damage')).toBe(4);
    });

    it('removes a component when the value is undefined', () => {
        const stack = defaultItemStackOps.withComponent(
            defaultItemStackOps.create('minecraft:stone', 1),
            'minecraft:damage',
            4
        );

        expect(defaultItemStackOps.withComponent(stack, 'minecraft:damage', undefined).components.size).toBe(0);
    });
});

describe('enchantmentLevelFromComponent', () => {
    it('reads the levels wrapper Java writes', () => {
        const stack = {
            id: 'minecraft:diamond_pickaxe',
            count: 1,
            components: new Map([['minecraft:enchantments', { levels: { 'minecraft:fortune': 3 } }]])
        };

        expect(enchantmentLevelFromComponent(stack, 'minecraft:fortune')).toBe(3);
    });

    it('reads a bare identifier to level map', () => {
        const stack = {
            id: 'minecraft:shears',
            count: 1,
            components: new Map([['minecraft:enchantments', { 'minecraft:silk_touch': 1 }]])
        };

        expect(enchantmentLevelFromComponent(stack, 'minecraft:silk_touch')).toBe(1);
    });

    it('returns zero when the component is missing', () => {
        expect(
            enchantmentLevelFromComponent(
                { id: 'minecraft:stone', count: 1, components: new Map() },
                'minecraft:fortune'
            )
        ).toBe(0);
    });
});
