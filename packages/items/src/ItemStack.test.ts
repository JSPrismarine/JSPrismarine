import { describe, expect, it } from 'vitest';

import type { PatchEntry } from './ItemStack';
import { canStack, ItemStack, mergeStacks, patchesEqual, sameItemSameComponents } from './ItemStack';
import { food, maxDamage } from './components/defaults';
import { maxStackSize } from './components/universal';
import { loadItemTypes } from './itemTypes';
import { itemDefinition } from './definitions';

const { registry } = loadItemTypes({
    strict: true,
    definitions: [
        itemDefinition('minecraft:apple', {
            'minecraft:max_stack_size': 64,
            'minecraft:food': { nutrition: 4, saturation: 2.4 },
            'minecraft:rarity': 'common'
        }),
        itemDefinition('minecraft:diamond_pickaxe', {
            'minecraft:max_stack_size': 1,
            'minecraft:max_damage': 1561,
            'minecraft:damage': 0
        })
    ]
});
const { registry: taggedRegistry } = loadItemTypes({
    definitions: [itemDefinition('minecraft:apple', { 'minecraft:max_stack_size': 64 })],
    bedrockTags: { 'test:snacks': ['minecraft:apple'] },
    strict: true
});

const apple = (count = 1) => new ItemStack(registry.holder('minecraft:apple'), count);
const pickaxe = (count = 1) => new ItemStack(registry.holder('minecraft:diamond_pickaxe'), count);

describe('an item stack over its type defaults', () => {
    it('reads a component the type defaults and the patch leaves alone', () => {
        expect(apple().params(food)).toEqual({ nutrition: 4, saturation: 2.4 });
        expect(apple().params(maxStackSize)).toBe(64);
        expect(apple().patch.size).toBe(0);
    });

    it('reads Bedrock tags through the stack type', () => {
        const stack = new ItemStack(taggedRegistry.holder('minecraft:apple'));

        expect(stack.getTags()).toEqual(['test:snacks']);
        expect(stack.hasTag('test:snacks')).toBe(true);
        expect(stack.hasTag('test:other')).toBe(false);
    });

    it('reads the patch before the default', () => {
        const golden = apple().set('minecraft:food', { nutrition: 6, saturation: 12 });
        expect(golden.params(food)).toEqual({ nutrition: 6, saturation: 12 });
        expect(golden.type.params(food)).toEqual({ nutrition: 4, saturation: 2.4 });
    });

    it('represents removing a default, which is the !component marker in Java', () => {
        const inedible = apple().remove('minecraft:food');
        expect(inedible.has('minecraft:food')).toBe(false);
        expect(inedible.get('minecraft:food')).toBeUndefined();
        expect(inedible.patch.get('minecraft:food')).toEqual({ kind: 'remove' });
        expect(inedible.components().has('minecraft:food')).toBe(false);
        expect(inedible.components().get('minecraft:max_stack_size')).toBe(64);
    });

    it('falls back to the default when the patch entry is dropped', () => {
        const stack = apple().remove('minecraft:food');
        stack.reset('minecraft:food');
        expect(stack.params(food)).toEqual({ nutrition: 4, saturation: 2.4 });
        expect(stack.patch.size).toBe(0);
    });

    it('adds a component the type does not have', () => {
        const named = apple().set('minecraft:custom_name', { text: 'Snack' });
        expect(named.has('minecraft:custom_name')).toBe(true);
        expect(named.components().size).toBe(4);
    });

    it('does not alias the patch it was constructed from', () => {
        const source = new Map<string, PatchEntry>([['minecraft:damage', { kind: 'set', value: 5 }]]);
        const stack = new ItemStack(registry.holder('minecraft:diamond_pickaxe'), 1, source);
        source.set('minecraft:damage', { kind: 'set', value: 9 });
        expect(stack.get('minecraft:damage')).toBe(5);
    });

    it('reports its type through the holder, so a reload repoints it', () => {
        const stack = pickaxe();
        expect(stack.identifier).toBe('minecraft:diamond_pickaxe');
        expect(stack.params(maxDamage)).toBe(1561);
        expect(stack.type.flags.isDamageable).toBe(true);
    });
});

describe('component patch equality', () => {
    it('ignores the order entries were added in', () => {
        const left = apple().set('minecraft:damage', 1).set('minecraft:repair_cost', 2);
        const right = apple().set('minecraft:repair_cost', 2).set('minecraft:damage', 1);
        expect(patchesEqual(left.patch, right.patch)).toBe(true);
        expect(sameItemSameComponents(left, right)).toBe(true);
    });

    it('compares values structurally rather than by reference', () => {
        const left = apple().set('minecraft:food', { nutrition: 4, saturation: 2.4 });
        const right = apple().set('minecraft:food', { saturation: 2.4, nutrition: 4 });
        expect(sameItemSameComponents(left, right)).toBe(true);
    });

    it('keeps list order significant', () => {
        const left = apple().set('minecraft:lore', ['a', 'b']);
        const right = apple().set('minecraft:lore', ['b', 'a']);
        expect(sameItemSameComponents(left, right)).toBe(false);
    });

    it('separates a removal from an absent entry', () => {
        expect(sameItemSameComponents(apple().remove('minecraft:food'), apple())).toBe(false);
    });

    it('separates setting a component to its own default from leaving it alone', () => {
        // Java compares the prototype and the patch, not the resolved view;
        // PatchedDataComponentMap.equals in the pinned 26.3 jar does both.
        const explicit = apple().set('minecraft:food', { nutrition: 4, saturation: 2.4 });
        expect(explicit.params(food)).toEqual(apple().params(food));
        expect(sameItemSameComponents(explicit, apple())).toBe(false);
    });

    it('separates two different items whatever their patches hold', () => {
        expect(sameItemSameComponents(apple(), pickaxe())).toBe(false);
    });

    it('treats two empty stacks of one item as equal whatever their patches hold', () => {
        expect(sameItemSameComponents(apple(0).set('minecraft:damage', 3), apple(0))).toBe(true);
    });
});

describe('stacking', () => {
    it('refuses to stack an item whose slot limit is one', () => {
        expect(canStack(pickaxe(), pickaxe())).toBe(false);
    });

    it('stacks two identical stacks up to the slot limit', () => {
        const { merged, remainder } = mergeStacks(apple(60), apple(10));
        expect(merged.count).toBe(64);
        expect(remainder.count).toBe(6);
    });

    it('moves everything when it fits', () => {
        const { merged, remainder } = mergeStacks(apple(1), apple(2));
        expect(merged.count).toBe(3);
        expect(remainder.count).toBe(0);
        expect(remainder.empty).toBe(true);
    });

    it('leaves both stacks alone when the components differ', () => {
        const damaged = apple(10).set('minecraft:damage', 1);
        const { merged, remainder } = mergeStacks(apple(10), damaged);
        expect(merged.count).toBe(10);
        expect(remainder.count).toBe(10);
    });

    it('modifies neither argument', () => {
        const target = apple(60);
        const source = apple(10);
        mergeStacks(target, source);
        expect(target.count).toBe(60);
        expect(source.count).toBe(10);
    });
});
