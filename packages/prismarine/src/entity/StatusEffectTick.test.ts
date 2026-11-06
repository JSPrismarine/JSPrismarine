import { describe, expect, it } from 'vitest';

import { DamageCause } from './DamageCause';
import { effectHealthChange, isInstantEffect } from './StatusEffectTick';

describe('effectHealthChange', () => {
    it('heals four half-hearts a level for instant health, doubling with each level', () => {
        expect(effectHealthChange('minecraft:instant_health', 0, 1, 5, 20)).toEqual({ kind: 'heal', amount: 4 });
        expect(effectHealthChange('minecraft:instant_health', 1, 1, 5, 20)).toEqual({ kind: 'heal', amount: 8 });
        expect(effectHealthChange('minecraft:instant_health', 5, 1, 5, 20)).toEqual({ kind: 'heal', amount: 128 });
    });

    it('hurts six half-hearts a level for instant damage', () => {
        expect(effectHealthChange('minecraft:instant_damage', 0, 1, 20, 20)).toEqual({
            kind: 'damage',
            amount: 6,
            cause: DamageCause.Magic
        });
        expect(effectHealthChange('minecraft:instant_damage', 1, 1, 20, 20)).toMatchObject({ amount: 12 });
    });

    it('regenerates one half-heart every fifty ticks at level one, halving the wait each level', () => {
        const heals = (amplifier: number) =>
            Array.from({ length: 100 }, (_, index) =>
                effectHealthChange('minecraft:regeneration', amplifier, index + 1, 5, 20)
            ).filter(Boolean).length;

        expect(heals(0)).toBe(2);
        expect(heals(1)).toBe(4);
        expect(heals(2)).toBe(8);
        // Past level six the interval shifts to zero and it heals on every tick.
        expect(heals(6)).toBe(100);
    });

    it('does not regenerate at full health', () => {
        expect(effectHealthChange('minecraft:regeneration', 0, 50, 20, 20)).toBeUndefined();
    });

    it('poisons every twenty-five ticks but never below one half-heart', () => {
        expect(effectHealthChange('minecraft:poison', 0, 25, 10, 20)).toEqual({
            kind: 'damage',
            amount: 1,
            cause: DamageCause.Magic
        });
        expect(effectHealthChange('minecraft:poison', 0, 24, 10, 20)).toBeUndefined();
        expect(effectHealthChange('minecraft:poison', 0, 25, 1, 20)).toBeUndefined();
    });

    it('lets fatal poison finish what poison stops short of', () => {
        expect(effectHealthChange('minecraft:fatal_poison', 0, 25, 1, 20)).toMatchObject({ kind: 'damage', amount: 1 });
    });

    it('withers every forty ticks and can kill', () => {
        expect(effectHealthChange('minecraft:wither', 0, 40, 1, 20)).toEqual({
            kind: 'damage',
            amount: 1,
            cause: DamageCause.Wither
        });
        expect(effectHealthChange('minecraft:wither', 0, 39, 1, 20)).toBeUndefined();
        expect(effectHealthChange('minecraft:wither', 1, 20, 10, 20)).toBeDefined();
    });

    it('leaves the effects the client applies alone', () => {
        for (const id of ['minecraft:speed', 'minecraft:jump_boost', 'minecraft:night_vision']) {
            expect(effectHealthChange(id, 0, 1, 5, 20)).toBeUndefined();
        }
    });
});

describe('isInstantEffect', () => {
    it('names the effects that act once', () => {
        expect(
            ['instant_health', 'instant_damage', 'saturation'].map((id) => isInstantEffect(`minecraft:${id}`))
        ).toEqual([true, true, true]);
        expect(isInstantEffect('minecraft:regeneration')).toBe(false);
    });
});
