import { describe, expect, it } from 'vitest';

import { burnTimeOf, flattenItemFacts } from './facts';
import { loadItemTypes } from './itemTypes';
import { FAST_COOKING_CONTEXT } from './numberProvider';

const { registry, types } = loadItemTypes({ strict: true });
const facts = flattenItemFacts(registry);

const idOf = (identifier: string): number => registry.idOf(identifier)!;

describe('the flattened item facts', () => {
    it('covers every item id with a typed array per column', () => {
        expect(facts.maxStackSize.length).toBe(registry.size);
        expect(facts.maxStackSize).toBeInstanceOf(Uint8Array);
        expect(facts.maxDamage).toBeInstanceOf(Uint16Array);
        expect(facts.burnTimeTicks).toBeInstanceOf(Uint16Array);
    });

    it('reads the same numbers the types carry', () => {
        expect(facts.maxStackSize[idOf('minecraft:apple')]).toBe(64);
        expect(facts.maxStackSize[idOf('minecraft:diamond_pickaxe')]).toBe(1);
        expect(facts.maxDamage[idOf('minecraft:diamond_pickaxe')]).toBe(1561);
        expect(facts.maxDamage[idOf('minecraft:apple')]).toBe(0);
        expect(facts.isFood[idOf('minecraft:apple')]).toBe(1);
        expect(facts.isFood[idOf('minecraft:diamond_pickaxe')]).toBe(0);
        expect(facts.isTool[idOf('minecraft:diamond_pickaxe')]).toBe(1);
        expect(facts.isTool[idOf('minecraft:apple')]).toBe(0);
    });

    it('resolves a burn time through its 26.3 provider reference', () => {
        expect(facts.burnTimeTicks[idOf('minecraft:lava_bucket')]).toBe(20000);
        expect(facts.burnTimeTicks[idOf('minecraft:coal')]).toBe(1600);
        expect(facts.burnTimeTicks[idOf('minecraft:apple')]).toBe(0);
    });

    it('resolves a burn time for a smoker when asked for one', () => {
        const coal = types.get('minecraft:coal')!;
        expect(burnTimeOf(coal)).toBe(1600);
        expect(burnTimeOf(coal, FAST_COOKING_CONTEXT)).toBe(800);
    });

    it('agrees with the type for every item, which is what makes the array safe to read', () => {
        for (const [identifier, type] of types) {
            expect(facts.burnTimeTicks[idOf(identifier)]).toBe(burnTimeOf(type));
        }
    });
});
