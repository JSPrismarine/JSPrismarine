import { describe, expect, it } from 'vitest';

import { breaksAFall, isUnderwater } from './Environment';

describe('breaksAFall', () => {
    it('catches anything that lands in a liquid', () => {
        // A bucket of water at the bottom of a drop is the standard way down.
        expect(breaksAFall('minecraft:water')).toBe(true);
        expect(breaksAFall('minecraft:flowing_water')).toBe(true);
        expect(breaksAFall('minecraft:lava')).toBe(true);
    });

    it('catches anything in the climbing family, not only the three that were listed', () => {
        expect(breaksAFall('minecraft:ladder')).toBe(true);
        expect(breaksAFall('minecraft:vine')).toBe(true);
        expect(breaksAFall('minecraft:scaffolding')).toBe(true);

        // None of these was in the hand-written set, and all of them are things an entity is
        // holding on to rather than falling past.
        expect(breaksAFall('minecraft:chain')).toBe(true);
        expect(breaksAFall('minecraft:twisting_vines')).toBe(true);
        expect(breaksAFall('minecraft:weeping_vines')).toBe(true);
        expect(breaksAFall('minecraft:glow_lichen')).toBe(true);
        expect(breaksAFall('minecraft:hanging_roots')).toBe(true);
    });

    it('catches a cobweb, which the old list spelled wrong', () => {
        // The set named `minecraft:cobweb`, which is not a palette identifier, so nothing ever
        // matched it and every fall into a web hurt.
        expect(breaksAFall('minecraft:web')).toBe(true);
    });

    it('catches the blocks Java softens a landing with', () => {
        expect(breaksAFall('minecraft:slime')).toBe(true);
        expect(breaksAFall('minecraft:honey_block')).toBe(true);
        expect(breaksAFall('minecraft:hay_block')).toBe(true);
        expect(breaksAFall('minecraft:powder_snow')).toBe(true);
        expect(breaksAFall('minecraft:bed')).toBe(true);
        expect(breaksAFall('minecraft:sweet_berry_bush')).toBe(true);
    });

    it('does not catch an ordinary floor', () => {
        expect(breaksAFall('minecraft:stone')).toBe(false);
        expect(breaksAFall('minecraft:grass_block')).toBe(false);
        expect(breaksAFall('minecraft:oak_leaves')).toBe(false);
        expect(breaksAFall('minecraft:air')).toBe(false);
    });
});

describe('isUnderwater', () => {
    it('is water, still or flowing', () => {
        expect(isUnderwater('minecraft:water')).toBe(true);
        expect(isUnderwater('minecraft:flowing_water')).toBe(true);
    });

    it('is not lava, which burns rather than drowns', () => {
        expect(isUnderwater('minecraft:lava')).toBe(false);
        expect(isUnderwater('minecraft:flowing_lava')).toBe(false);
        expect(isUnderwater('minecraft:air')).toBe(false);
    });
});
